-- Members create and edit work but cannot do admin actions; admins can; the
-- last admin can never be removed or demoted; create_organization works.
begin;
\ir fixtures.inc
select plan(36);

-- Mia is a plain member of A ---------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');

select is((select count(*)::int from public.projects), 1, 'member sees the org''s projects');
select is((select count(*)::int from public.profiles), 2, 'member sees co-member profiles only');
select lives_ok($$ insert into public.projects (organization_id, name) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Mia project') $$, 'member can create a project');
select is(tests.affected($q$ update public.tasks set status = 'in_progress' where id = 'aaaaaaaa-4444-0000-0000-000000000000' $q$), 1, 'member can edit any task');
select lives_ok($$ insert into public.events (organization_id, title, starts_at, ends_at) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Mia event', now(), now()) $$, 'member can create an event');
select is(tests.affected($q$ update public.documents set pinned = true where id = 'aaaaaaaa-6666-0000-0000-000000000000' $q$), 1, 'member can pin a document');

select is(tests.affected($q$ update public.organizations set name = 'Mia Org' $q$), 0, 'member cannot rename the organization');
select is(tests.affected($q$ update public.organizations set preset_key = 'tutoring' $q$), 0, 'member cannot change the preset');
select is(tests.affected($q$ update public.organizations set theme = '{"mode":"dark"}' $q$), 0, 'member cannot change the theme');
select is(tests.affected($q$ delete from public.organizations $q$), 0, 'member cannot delete the organization');
select is(tests.affected($q$ update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-00000000000b' $q$), 0, 'member cannot promote themselves');
select is(tests.affected($q$ delete from public.memberships where user_id = 'a0000000-0000-0000-0000-00000000000a' $q$), 0, 'member cannot remove another member');
select throws_ok($$ insert into public.memberships (organization_id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c') $$, '42501', null, 'member cannot add members');
select is((select count(*)::int from public.invitations), 0, 'member cannot see invitations or their tokens');
select throws_ok($$ insert into public.invitations (organization_id, email) values ('aaaaaaaa-0000-0000-0000-000000000000', 'friend@a.test') $$, '42501', null, 'member cannot invite');
select is(tests.affected($q$ delete from public.invitations $q$), 0, 'member cannot revoke invitations');
select is(tests.affected($q$ delete from public.projects where id = 'aaaaaaaa-3333-0000-0000-000000000000' $q$), 0, 'member cannot delete someone else''s project');
select is(tests.affected($q$ delete from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000000' $q$), 0, 'member cannot delete someone else''s task');
select is(tests.affected($q$ delete from public.events where id = 'aaaaaaaa-5555-0000-0000-000000000000' $q$), 0, 'member cannot delete someone else''s event');
select is(tests.affected($q$ delete from public.documents where id = 'aaaaaaaa-6666-0000-0000-000000000000' $q$), 0, 'member cannot delete someone else''s document');
select is(tests.affected($q$ delete from public.activity_log $q$), 0, 'member cannot delete activity');
select is(tests.affected($q$ delete from public.projects where name = 'Mia project' $q$), 1, 'member can delete their own project');
select throws_ok($$ update public.projects set created_by = 'a0000000-0000-0000-0000-00000000000b' where id = 'aaaaaaaa-3333-0000-0000-000000000000' $$, '42501', null, 'created_by cannot be rewritten');

-- Alice is the only admin of A --------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');

select is(tests.affected($q$ update public.organizations set name = 'Org A renamed' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 1, 'admin can rename the organization');
select is(tests.affected($q$ delete from public.events where title = 'Mia event' $q$), 1, 'admin can delete anyone''s event');
select is((select count(*)::int from public.invitations), 1, 'admin sees invitations');
select throws_ok($$ update public.memberships set role = 'member' where id = 'aaaaaaaa-1111-0000-0000-00000000000a' $$, 'P0001', 'An organization must keep at least one admin', 'the last admin cannot be demoted');
select throws_ok($$ delete from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000a' $$, 'P0001', 'An organization must keep at least one admin', 'the last admin cannot be removed');
select is(tests.affected($q$ update public.memberships set role = 'admin' where id = 'aaaaaaaa-1111-0000-0000-00000000000b' $q$), 1, 'admin can promote a member');
select is(tests.affected($q$ update public.memberships set role = 'member' where id = 'aaaaaaaa-1111-0000-0000-00000000000a' $q$), 1, 'an admin can step down once another admin exists');

-- Mia is now the only admin and cannot leave
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ delete from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000b' $$, 'P0001', 'An organization must keep at least one admin', 'the last admin cannot leave');

-- create_organization ----------------------------------------------------------
select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is((select slug from public.create_organization('Org A', 'tutoring')), 'org-a-2', 'create_organization picks a free slug');
select is((select role::text from public.memberships m join public.organizations o on o.id = m.organization_id where o.slug = 'org-a-2'), 'admin', 'the creator becomes admin');
select is((select count(*)::int from public.tasks t join public.organizations o on o.id = t.organization_id where o.slug = 'org-a-2'), 3, 'starter content from the preset is created');
select throws_ok($$ select public.create_organization('Bad', 'no-such-preset') $$, '22023', null, 'unknown presets are rejected');

select tests.as_anon();
select throws_ok($$ select public.create_organization('Anon org', 'business') $$, '42501', null, 'anonymous users cannot create organizations');

select * from finish();
rollback;
