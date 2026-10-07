-- Invitations can only be accepted by the invited email, before expiry, once.
begin;
\ir fixtures.inc
select plan(12);

-- Mia (member of A) tries to use B's invitation, which was sent to Oscar.
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.accept_invitation('token-b') $$, '42501', 'This invitation was sent to a different email address', 'the wrong user cannot accept');
select is((select count(*)::int from public.memberships where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'and gains no access to B');
select throws_ok($$ select public.accept_invitation('no-such-token') $$, 'P0002', 'This invitation does not exist', 'unknown tokens are rejected');

select tests.as_anon();
select throws_ok($$ select public.accept_invitation('token-b') $$, '42501', null, 'anonymous users cannot accept');
select is((select organization_name from public.get_invitation('token-b')), 'Org B', 'the invite page can preview an invitation by token');
select is((select count(*)::int from public.get_invitation('nope')), 0, 'no preview without a valid token');

-- Oscar accepts the invitation meant for him.
select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is(public.accept_invitation('token-b'), 'org-b', 'the invited user can accept');
select is((select role::text from public.memberships where user_id = 'c0000000-0000-0000-0000-00000000000c'), 'member', 'with the invited role');
select is(public.accept_invitation('token-b'), 'org-b', 'accepting twice is harmless for the same user');
select is((select count(*)::int from public.projects), 1, 'and can now see B''s projects');

-- Expired invitations are refused.
reset role;
insert into public.invitations (organization_id, email, token, invited_by, expires_at)
values ('aaaaaaaa-0000-0000-0000-000000000000', 'oscar@c.test', 'token-old', 'a0000000-0000-0000-0000-00000000000a', now() - interval '1 day');
select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.accept_invitation('token-old') $$, 'P0001', 'This invitation has expired', 'expired invitations cannot be accepted');

-- A used invitation cannot be replayed by someone else.
reset role;
update auth.users set email = 'oscar-two@c.test' where id = 'b0000000-0000-0000-0000-00000000000b';
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.accept_invitation('token-b') $$, '42501', null, 'a used invitation cannot be replayed by another user');

select * from finish();
rollback;
