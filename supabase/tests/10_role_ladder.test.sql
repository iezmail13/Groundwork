-- The ranked role ladder: owner (4) > manager (3) > admin (2) > staff (1).
-- has_permission() reads the rank live; nobody grants a role above their own
-- or changes someone ranked at or above them, except owners; the last owner
-- is kept; ownership can be handed over; can_view_task() never leaks a task
-- to someone outside its organization.
begin;
\ir fixtures.inc
select plan(64);

-- Org A also has Max (manager), Ada (admin) and Sam (staff).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now()),
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now());

insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');

insert into public.events (id, organization_id, title, starts_at, ends_at, created_by) values
  ('aaaaaaaa-5555-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000000', 'Sam event', now(), now(), 'a0000000-0000-0000-0000-00000000000e'),
  ('aaaaaaaa-5555-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-000000000000', 'Sam event 2', now(), now(), 'a0000000-0000-0000-0000-00000000000e');

-- Ranks ------------------------------------------------------------------------
select is(public.role_rank('owner'), 4, 'owner ranks 4');
select is(public.role_rank('manager'), 3, 'manager ranks 3');
select is(public.role_rank('admin'), 2, 'admin ranks 2');
select is(public.role_rank('staff'), 1, 'staff ranks 1');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select ok(public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'owner'), 'an owner has owner permission');
select ok(not public.has_permission('bbbbbbbb-0000-0000-0000-000000000000', 'staff'), 'an owner of A has no permission in B');

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select ok(public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'manager'), 'a manager has manager permission');
select ok(public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'staff'), 'permission runs down the ladder');
select ok(not public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'owner'), 'a manager lacks owner permission');

select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select ok(public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'admin'), 'an admin has admin permission');
select ok(not public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'manager'), 'an admin lacks manager permission');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select ok(public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'staff'), 'staff have staff permission');
select ok(not public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'admin'), 'staff lack admin permission');

select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is(public.my_rank('aaaaaaaa-0000-0000-0000-000000000000'), 0, 'a non-member ranks 0');
select ok(not public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'staff'), 'a non-member has no permission');

select tests.as_anon();
select throws_ok($$ select public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'staff') $$, '42501', null, 'anon cannot call has_permission');

-- A manager: settings and members below their rank ---------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ update public.organizations set name = 'Org A by Max' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 1, 'a manager can change organization settings');
select is(tests.affected($q$ delete from public.organizations where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'a manager cannot delete the organization');
select is((select count(*)::int from public.invitations), 1, 'a manager sees invitations');
select lives_ok($$ insert into public.invitations (organization_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000000', 'helper@a.test', 'admin', 'a0000000-0000-0000-0000-00000000000c') $$, 'a manager can invite an admin');
select throws_ok($$ insert into public.invitations (organization_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000000', 'peer@a.test', 'manager', 'a0000000-0000-0000-0000-00000000000c') $$, '42501', null, 'a manager cannot invite a manager');
select throws_ok($$ insert into public.invitations (organization_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000000', 'boss@a.test', 'owner', 'a0000000-0000-0000-0000-00000000000c') $$, '42501', null, 'a manager cannot invite an owner');
select throws_ok($$ update public.invitations set role = 'owner' where email = 'helper@a.test' $$, '42501', null, 'a manager cannot raise an invitation above their rank');
select is(tests.affected($q$ update public.memberships set role = 'admin' where id = 'aaaaaaaa-1111-0000-0000-00000000000e' $q$), 1, 'a manager can promote staff to admin');
select throws_ok($$ update public.memberships set role = 'manager' where id = 'aaaaaaaa-1111-0000-0000-00000000000e' $$, '42501', null, 'a manager cannot promote anyone to manager');
select is(tests.affected($q$ update public.memberships set role = 'staff' where id = 'aaaaaaaa-1111-0000-0000-00000000000a' $q$), 0, 'a manager cannot demote an owner');
select is(tests.affected($q$ update public.memberships set role = 'staff' where id = 'aaaaaaaa-1111-0000-0000-00000000000c' $q$), 0, 'a manager cannot change their own role');
select is(tests.affected($q$ delete from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000a' $q$), 0, 'a manager cannot remove an owner');
select is(tests.affected($q$ update public.memberships set role = 'staff' where id = 'aaaaaaaa-1111-0000-0000-00000000000e' $q$), 1, 'a manager can demote an admin back to staff');
select is(tests.affected($q$ delete from public.events where id = 'aaaaaaaa-5555-0000-0000-0000000000e1' $q$), 1, 'a manager can delete anyone''s event');
select is(tests.affected($q$ delete from public.activity_log $q$), 0, 'a manager cannot delete activity');

-- An admin: no organization-level powers yet --------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is(tests.affected($q$ update public.organizations set name = 'Org A by Ada' $q$), 0, 'an admin cannot change organization settings');
select is((select count(*)::int from public.invitations), 0, 'an admin cannot see invitations');
select throws_ok($$ insert into public.invitations (organization_id, email, role, invited_by) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x@a.test', 'staff', 'a0000000-0000-0000-0000-00000000000d') $$, '42501', null, 'an admin cannot invite');
select is(tests.affected($q$ update public.memberships set role = 'admin' where id = 'aaaaaaaa-1111-0000-0000-00000000000e' $q$), 0, 'an admin cannot change roles');
select is(tests.affected($q$ delete from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000e' $q$), 0, 'an admin cannot remove staff');
select is(tests.affected($q$ delete from public.events where id = 'aaaaaaaa-5555-0000-0000-0000000000e2' $q$), 0, 'an admin cannot delete someone else''s event');

-- Promotions and demotions apply on the next query ---------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.memberships set role = 'manager' where id = 'aaaaaaaa-1111-0000-0000-00000000000d' $q$), 1, 'an owner promotes Ada to manager');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select ok(public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'manager'), 'the promotion takes effect at once');
select is(tests.affected($q$ update public.organizations set name = 'Org A by Ada' $q$), 1, 'and the new manager can change settings');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.memberships set role = 'staff' where id = 'aaaaaaaa-1111-0000-0000-00000000000d' $q$), 1, 'an owner demotes Ada to staff');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select ok(not public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'admin'), 'the demotion takes effect at once');
select is(tests.affected($q$ update public.organizations set name = 'Org A again' $q$), 0, 'and staff can no longer change settings');

-- The last owner -------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.memberships set role = 'manager' where id = 'aaaaaaaa-1111-0000-0000-00000000000a' $$, 'P0001', 'An organization must keep at least one owner', 'the last owner cannot step down');
select throws_ok($$ delete from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000a' $$, 'P0001', 'An organization must keep at least one owner', 'the last owner cannot leave');

-- Ownership transfer -----------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.transfer_ownership('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000c') $$, '42501', 'Only an owner can transfer ownership', 'a manager cannot take ownership');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.transfer_ownership('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000b') $$, '42501', 'Only an owner can transfer ownership', 'an owner of B cannot transfer A');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.transfer_ownership('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-00000000000b') $$, 'P0002', 'That person is not in this organization', 'ownership cannot go to someone in another organization');
select throws_ok($$ select public.transfer_ownership('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000a') $$, '22023', 'You already own this organization', 'ownership cannot go to yourself');
select lives_ok($$ select public.transfer_ownership('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000c') $$, 'an owner can hand ownership to a manager');
select is((select role::text from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000c'), 'owner', 'the new owner is an owner');
select is((select role::text from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000a'), 'manager', 'the old owner steps down to manager');
select is((select count(*)::int from public.memberships where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' and role = 'owner'), 1, 'the organization still has exactly one owner');
select ok(not public.has_permission('aaaaaaaa-0000-0000-0000-000000000000', 'owner'), 'the old owner loses owner permission at once');
select throws_ok($$ select public.transfer_ownership('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000b') $$, '42501', 'Only an owner can transfer ownership', 'the old owner cannot transfer again');
select is(tests.affected($q$ update public.memberships set role = 'staff' where id = 'aaaaaaaa-1111-0000-0000-00000000000c' $q$), 0, 'the old owner cannot demote the new owner');

select tests.as_anon();
select throws_ok($$ select public.transfer_ownership('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000a') $$, '42501', null, 'anon cannot transfer ownership');

-- can_view_task: the single source of task visibility ---------------------------
select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.tasks), 0, 'someone outside every organization sees zero tasks');
select ok(not public.can_view_task('aaaaaaaa-4444-0000-0000-000000000000'), 'can_view_task is false for an outsider');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select ok(public.can_view_task('aaaaaaaa-4444-0000-0000-000000000000'), 'can_view_task is true inside the organization');
select ok(not public.can_view_task('bbbbbbbb-4444-0000-0000-000000000000'), 'can_view_task is false for another organization''s task');
select is((select count(*)::int from public.tasks where id = 'bbbbbbbb-4444-0000-0000-000000000000'), 0, 'another organization''s task returns zero rows');
select ok(not public.can_view_task('00000000-0000-0000-0000-000000000000'), 'can_view_task is false for a task that does not exist');

select tests.as_anon();
select throws_ok($$ select public.can_view_task('aaaaaaaa-4444-0000-0000-000000000000') $$, '42501', null, 'anon cannot call can_view_task');

select * from finish();
rollback;
