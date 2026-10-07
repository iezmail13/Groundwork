-- A member can read and write only their own dashboard layout, even within
-- their own organization; admins get no special access.
begin;
\ir fixtures.inc
select plan(9);

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select array_agg(id) from public.dashboard_layouts), array['aaaaaaaa-7777-0000-0000-00000000000b'::uuid], 'a member sees only their own layout');
select is(tests.affected($q$ update public.dashboard_layouts set layout = '{"widgets":[{"id":"overdue"}]}' where id = 'aaaaaaaa-7777-0000-0000-00000000000b' $q$), 1, 'a member can update their own layout');
select is(tests.affected($q$ update public.dashboard_layouts set layout = '{}' where id = 'aaaaaaaa-7777-0000-0000-00000000000a' $q$), 0, 'a member cannot update a colleague''s layout');
select is(tests.affected($q$ delete from public.dashboard_layouts where id = 'aaaaaaaa-7777-0000-0000-00000000000a' $q$), 0, 'a member cannot delete a colleague''s layout');
select throws_ok($$ insert into public.dashboard_layouts (organization_id, membership_id, layout) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000a', '{}') $$, '42501', null, 'a member cannot create a layout for a colleague');
select throws_ok($$ update public.dashboard_layouts set membership_id = 'aaaaaaaa-1111-0000-0000-00000000000a' where id = 'aaaaaaaa-7777-0000-0000-00000000000b' $$, '42501', null, 'a layout cannot be reassigned');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.dashboard_layouts), 1, 'an admin sees only their own layout too');
select is(tests.affected($q$ update public.dashboard_layouts set layout = '{}' where id = 'aaaaaaaa-7777-0000-0000-00000000000b' $q$), 0, 'an admin cannot update a member''s layout');

reset role;
select is((select layout from public.dashboard_layouts where id = 'aaaaaaaa-7777-0000-0000-00000000000a'), '{"widgets":[]}'::jsonb, 'the admin''s layout is unchanged');

select * from finish();
rollback;
