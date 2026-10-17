-- Invitations grant projects within the inviter's reach and the invited
-- role's ceiling; pending invitees can be assigned work on those projects;
-- only a verified email can see or accept an invitation; removing someone
-- (or leaving) reassigns or flags their open work and keeps their history.
begin;
\ir fixtures.inc
select plan(45);

-- Max (manager) leads A's private project; Sam (staff) is on both projects.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now()),
  ('d0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new@a.test', '{}', now(), now(), now());
-- an account whose email nobody has confirmed
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('d0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unverified@a.test', '{}', now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'Private project', 'a0000000-0000-0000-0000-00000000000c');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000e', 'staff'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000e', 'staff');
insert into public.tasks (id, organization_id, project_id, title, created_by, status) values
  ('aaaaaaaa-4444-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'Private task', 'a0000000-0000-0000-0000-00000000000c', 'todo'),
  ('aaaaaaaa-4444-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sam open in A', 'a0000000-0000-0000-0000-00000000000e', 'todo'),
  ('aaaaaaaa-4444-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'Sam open in private', 'a0000000-0000-0000-0000-00000000000e', 'in_progress'),
  ('aaaaaaaa-4444-0000-0000-0000000000e3', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sam done', 'a0000000-0000-0000-0000-00000000000e', 'done');
-- Sam claimed his three
insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by)
select 'aaaaaaaa-0000-0000-0000-000000000000', id, 'aaaaaaaa-1111-0000-0000-00000000000e', 'claimed', 'a0000000-0000-0000-0000-00000000000e'
from public.tasks where id in ('aaaaaaaa-4444-0000-0000-0000000000e1', 'aaaaaaaa-4444-0000-0000-0000000000e2', 'aaaaaaaa-4444-0000-0000-0000000000e3');

-- Invitation grants -----------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select lives_ok($$ insert into public.invitations (id, organization_id, email, name, role, token, invited_by) values
  ('aaaaaaaa-2222-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'new@a.test', 'Nia New', 'staff', 'token-new', 'a0000000-0000-0000-0000-00000000000c') $$,
  'a manager invites someone by name');
select lives_ok($$ insert into public.invitation_projects (organization_id, invitation_id, project_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-0000000000a1', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'staff') $$,
  'and grants a project they lead');
select throws_ok($$ insert into public.invitation_projects (organization_id, invitation_id, project_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-0000000000a1', 'aaaaaaaa-3333-0000-0000-000000000000', 'staff') $$,
  '42501', null, 'but not a project they are not on');
select throws_ok($$ update public.invitation_projects set role = 'lead' where invitation_id = 'aaaaaaaa-2222-0000-0000-0000000000a1' $$,
  'P0001', 'The invited role doesn''t allow that project role', 'a grant cannot exceed the invited role''s ceiling');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.invitation_projects), 0, 'staff cannot see invitation grants');
select throws_ok($$ insert into public.invitation_projects (organization_id, invitation_id, project_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-0000000000a1', 'aaaaaaaa-3333-0000-0000-000000000000', 'staff') $$,
  '42501', null, 'staff cannot add grants');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.invitation_projects where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'B cannot read A''s grants');
select throws_ok($$ insert into public.invitation_projects (organization_id, invitation_id, project_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-0000000000a1', 'aaaaaaaa-3333-0000-0000-000000000000', 'staff') $$,
  '42501', null, 'B cannot add grants to A''s invitations');
select is(tests.affected($q$ update public.invitation_projects set role = 'staff' where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'B cannot change A''s grants');
select is(tests.affected($q$ delete from public.invitation_projects where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'B cannot delete A''s grants');

-- Pending invitees as assignees ----------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select lives_ok($$ select public.appoint_to_task('aaaaaaaa-4444-0000-0000-0000000000a2', null, 'aaaaaaaa-2222-0000-0000-0000000000a1') $$, 'a pending invitee can be assigned work on a granted project');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.appoint_to_task('aaaaaaaa-4444-0000-0000-000000000000', null, 'aaaaaaaa-2222-0000-0000-0000000000a1') $$, 'P0001', 'That invitation doesn''t include this project', 'but not on a project the invitation doesn''t grant');
select throws_ok($$ select public.appoint_to_task('aaaaaaaa-4444-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000a', 'aaaaaaaa-2222-0000-0000-0000000000a1') $$, '22023', null, 'an appointment names one person, member or invitee');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select array_agg(name) from public.pending_invitees('aaaaaaaa-0000-0000-0000-000000000000')), array['Nia New'], 'people on the project see the invitee''s name');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.pending_invitees('aaaaaaaa-0000-0000-0000-000000000000')), 0, 'people off the project don''t');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.pending_invitees('aaaaaaaa-0000-0000-0000-000000000000')), 0, 'nor does another organization');

-- Only a verified email sees and accepts invitations --------------------------------------
reset role;
insert into public.invitations (organization_id, email, role, token, invited_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'unverified@a.test', 'staff', 'token-unverified', 'a0000000-0000-0000-0000-00000000000a');
select tests.as_user('d0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.my_pending_invitations()), 0, 'an unverified email sees no pending invitations');
select throws_ok($$ select public.accept_invitation('token-unverified') $$, '42501', 'Confirm your email address before accepting this invitation', 'and cannot accept one');

select tests.as_user('d0000000-0000-0000-0000-00000000000a');
select is(
  (select row(organization_name, role, invited_by_name, project_names, preset_key)::text from public.my_pending_invitations()),
  row('Org A', 'staff'::public.member_role, 'Max Manager', array['Private project'], 'nonprofit')::text,
  'a verified invitee sees their pending invitation, who sent it and its projects'
);
select is(public.accept_invitation('token-new'), 'org-a', 'and can accept it');
select is((select count(*)::int from public.projects), 1, 'they see only the granted project');
select is((select role::text from public.project_members where membership_id = public.my_membership_id('aaaaaaaa-0000-0000-0000-000000000000')), 'staff', 'with the granted role');
select is(
  (select membership_id from public.task_assignees where task_id = 'aaaaaaaa-4444-0000-0000-0000000000a2'),
  public.my_membership_id('aaaaaaaa-0000-0000-0000-000000000000'),
  'work assigned while pending is now theirs'
);
select is((select count(*)::int from public.my_pending_invitations()), 0, 'and the invitation is no longer pending');
select is((select full_name from public.profiles where id = 'd0000000-0000-0000-0000-00000000000a'), 'Nia New', 'a nameless account takes the name they were invited under');

-- Declining ------------------------------------------------------------------------------
reset role;
insert into public.invitations (id, organization_id, email, role, token, invited_by) values
  ('aaaaaaaa-2222-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000000', 'oscar@c.test', 'staff', 'token-decline', 'a0000000-0000-0000-0000-00000000000a');
insert into public.invitation_projects (organization_id, invitation_id, project_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-0000000000d1', 'aaaaaaaa-3333-0000-0000-000000000000');
delete from public.task_assignees where task_id = 'aaaaaaaa-4444-0000-0000-000000000000';
insert into public.task_assignees (organization_id, task_id, invitation_id, kind, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-0000000000d1', 'appointed', 'a0000000-0000-0000-0000-00000000000a');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.decline_invitation('token-decline') $$, '42501', null, 'someone else cannot decline your invitation');
select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select lives_ok($$ select public.decline_invitation('token-decline') $$, 'the invitee can decline');
reset role;
select is((select count(*)::int from public.invitations where token = 'token-decline'), 0, 'which removes the invitation');
select is(
  (select row((select count(*)::int from public.task_assignees a where a.task_id = t.id), needs_assignee)::text from public.tasks t where id = 'aaaaaaaa-4444-0000-0000-000000000000'),
  row(0, true)::text,
  'and flags the work that was waiting for them'
);

-- Withdrawing a granted project frees the invitee's work there -------------------------------
insert into public.invitations (id, organization_id, email, role, token, invited_by) values
  ('aaaaaaaa-2222-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000000', 'later@a.test', 'staff', 'token-later', 'a0000000-0000-0000-0000-00000000000a');
insert into public.invitation_projects (organization_id, invitation_id, project_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-0000000000d2', 'aaaaaaaa-3333-0000-0000-000000000000');
insert into public.task_assignees (organization_id, task_id, invitation_id, kind, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-0000000000d2', 'appointed', 'a0000000-0000-0000-0000-00000000000a');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ delete from public.invitation_projects where invitation_id = 'aaaaaaaa-2222-0000-0000-0000000000d2' $q$), 1, 'an owner withdraws the project from an invitation');
select is((select needs_assignee from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000000'), true, 'and the invitee''s work there is flagged');

-- Removing someone: reassign or flag ------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.remove_member('aaaaaaaa-1111-0000-0000-00000000000e', null) $$, '42501', null, 'staff cannot remove someone else');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.remove_member('aaaaaaaa-1111-0000-0000-00000000000e', null) $$, 'P0002', null, 'another organization cannot remove anyone');

-- Sam made an edit, so the log has an entry by him
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
update public.tasks set title = 'Sam open in A (edited)' where id = 'aaaaaaaa-4444-0000-0000-0000000000e1';

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(
  public.remove_member('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-1111-0000-0000-00000000000b'),
  '{"flagged": 1, "reassigned": 1}'::jsonb,
  'a manager removes staff, handing their open work to someone'
);
reset role;
select is((select membership_id from public.task_assignees where task_id = 'aaaaaaaa-4444-0000-0000-0000000000e1'), 'aaaaaaaa-1111-0000-0000-00000000000b'::uuid, 'work on a project the heir is on goes to the heir');
select is(
  (select row((select count(*)::int from public.task_assignees a where a.task_id = t.id), needs_assignee)::text from public.tasks t where id = 'aaaaaaaa-4444-0000-0000-0000000000e2'),
  row(0, true)::text,
  'work on a project the heir can''t see is flagged instead'
);
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000e3'), 1, 'finished work stays');
select is((select count(*)::int from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000e'), 0, 'and they are no longer a member');
select is(
  (select metadata ->> 'actor_name' from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000e1' and action = 'updated' and metadata ->> 'actor_name' = 'Sam Staff' limit 1),
  'Sam Staff',
  'their activity keeps their name'
);

-- Leaving, and the last owner ---------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(public.remove_member('aaaaaaaa-1111-0000-0000-00000000000b', null), '{"flagged": 1, "reassigned": 0}'::jsonb, 'staff can leave, flagging their open work');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
reset role;
insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000e1', 'aaaaaaaa-1111-0000-0000-00000000000a', 'claimed', 'a0000000-0000-0000-0000-00000000000a');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.remove_member('aaaaaaaa-1111-0000-0000-00000000000a', 'aaaaaaaa-1111-0000-0000-00000000000c') $$, 'P0001', 'An organization must keep at least one owner', 'the last owner cannot leave');
select is((select membership_id from public.task_assignees where task_id = 'aaaaaaaa-4444-0000-0000-0000000000e1'), 'aaaaaaaa-1111-0000-0000-00000000000a'::uuid, 'and nothing was reassigned');
select throws_ok($$ select public.remove_member('aaaaaaaa-1111-0000-0000-00000000000c', 'bbbbbbbb-1111-0000-0000-00000000000a') $$, '22023', null, 'work cannot be handed to someone in another organization');

select tests.as_anon();
select throws_ok($$ select public.remove_member('aaaaaaaa-1111-0000-0000-00000000000c', null) $$, '42501', null, 'anon cannot remove members');
select throws_ok($$ select * from public.my_pending_invitations() $$, '42501', null, 'anon cannot list invitations');

select * from finish();
rollback;
