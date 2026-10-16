-- The task model (D89, D100): who can see a task (every leak case returns no
-- rows), claiming and its limit, appointed people unable to leave, several
-- assignees, both completion rules, share lists, hiding, personal and
-- org-level tasks, and organizations never touching each other's assignees
-- or shares.
begin;
\ir fixtures.inc
select plan(61);

-- Org A: Alice (owner), Olga (owner), Max (manager), Ada (admin), Mia, Sam and Tia (staff).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tia@a.test', '{"full_name":"Tia Staff"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'olga@a.test', '{"full_name":"Olga Owner"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff'),
  ('aaaaaaaa-1111-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000f', 'staff'),
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'owner');

-- Project P (the fixtures' A project): Max leads, Ada is a project admin, Mia and Sam are staff.
-- Project Q: only Tia (and the owners).
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000000', 'Q project', 'a0000000-0000-0000-0000-00000000000a');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000c', 'lead'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000e', 'staff'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000f1', 'aaaaaaaa-1111-0000-0000-00000000000f', 'staff');

insert into public.tasks (id, organization_id, project_id, title, created_by, kind, hidden, claim_limit, completion) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Open, two spots', 'a0000000-0000-0000-0000-00000000000c', 'general', false, 2, 'any'),
  ('aaaaaaaa-4444-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Hidden, for Sam', 'a0000000-0000-0000-0000-00000000000c', 'appointed', true, null, 'any'),
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia personal', 'a0000000-0000-0000-0000-00000000000b', 'personal', false, null, 'any'),
  ('aaaaaaaa-4444-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000000', null, 'Max personal', 'a0000000-0000-0000-0000-00000000000c', 'personal', false, null, 'any'),
  ('aaaaaaaa-4444-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000000', null, 'Olga personal', 'a0000000-0000-0000-0000-000000000001', 'personal', false, null, 'any'),
  ('aaaaaaaa-4444-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000000', null, 'Org-level, narrowed', 'a0000000-0000-0000-0000-00000000000c', 'general', false, null, 'any'),
  ('aaaaaaaa-4444-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000000', null, 'Org-level, open', 'a0000000-0000-0000-0000-00000000000c', 'general', false, null, 'any'),
  ('aaaaaaaa-4444-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000f1', 'Q task', 'a0000000-0000-0000-0000-00000000000a', 'general', false, null, 'any'),
  ('aaaaaaaa-4444-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Everyone finishes', 'a0000000-0000-0000-0000-00000000000c', 'appointed', false, null, 'all');
insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-00000000000e', 'appointed', 'a0000000-0000-0000-0000-00000000000c'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-00000000000b', 'claimed', 'a0000000-0000-0000-0000-00000000000b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000009', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed', 'a0000000-0000-0000-0000-00000000000c'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000009', 'aaaaaaaa-1111-0000-0000-00000000000e', 'appointed', 'a0000000-0000-0000-0000-00000000000c');
insert into public.task_shares (organization_id, task_id, membership_id, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000006', 'aaaaaaaa-1111-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000c');

-- Leak cases: each returns no rows -------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000002'), 0, 'a collaborator can''t see a hidden task');
select is((select count(*)::int from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-000000000002'), 0, 'or its activity');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000004'), 0, 'a lower rank can''t see a superior''s personal task');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000006'), 0, 'a member outside the share list can''t see a narrowed org-level task');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000007'), 1, 'but sees an org-level task nobody narrowed');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000003'), 0, 'a collaborator of the same rank can''t see someone else''s personal task, even on a shared project');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000008'), 0, 'someone off a project can''t see its tasks');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000002'), 1, 'the assignee sees the hidden task');

select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000002'), 1, 'someone ranked above an assignee sees the hidden task');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000003'), 1, 'someone ranked above the creator sees their personal task');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000004'), 0, 'an admin can''t see a manager''s personal task');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000006'), 1, 'someone on the share list sees the narrowed task');

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000005'), 0, 'a manager can''t see an owner''s personal task');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000005'), 1, 'owners see each other''s personal tasks');

select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.tasks where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'someone outside the organization sees none of its tasks');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.tasks where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'nor does another organization''s owner');

-- Claiming and its limit -----------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select lives_ok($$ select public.claim_task('aaaaaaaa-4444-0000-0000-000000000001') $$, 'Sam claims an open task');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.claim_task('aaaaaaaa-4444-0000-0000-000000000001') $$, 'so does Mia');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select throws_ok($$ select public.claim_task('aaaaaaaa-4444-0000-0000-000000000001') $$, 'P0001', 'Every spot on this task is taken', 'a third can''t claim past the limit of two');
select is((select status::text from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000001'), 'in_progress', 'claimed work is in progress');
select throws_ok($$ select public.claim_task('aaaaaaaa-4444-0000-0000-000000000002') $$, 'P0001', 'Only open tasks can be claimed', 'an appointed task can''t be claimed');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select lives_ok($$ select public.unclaim_task('aaaaaaaa-4444-0000-0000-000000000001') $$, 'Sam unclaims');
select is((select count(*)::int from public.task_assignees where task_id = 'aaaaaaaa-4444-0000-0000-000000000001'), 1, 'only himself');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.unclaim_task('aaaaaaaa-4444-0000-0000-000000000001') $$, 'Mia unclaims too');
select is(
  (select row(status, needs_assignee)::text from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000001'),
  row('todo'::public.task_status, false)::text,
  'with nobody left it goes back to To do, not flagged'
);

-- Appointing: superiors only, and appointed people can't leave ---------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select throws_ok($$ select public.unclaim_task('aaaaaaaa-4444-0000-0000-000000000002') $$, '42501', null, 'an appointed assignee can''t take themselves off');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.appoint_to_task('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-00000000000e') $$, '42501', null, 'staff can''t appoint someone of their own rank');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select lives_ok($$ select public.appoint_to_task('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-00000000000e') $$, 'an admin appoints staff onto an open task');
select is((select kind::text from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000001'), 'general', 'which stays open to claims');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.claim_task('aaaaaaaa-4444-0000-0000-000000000001') $$, 'others can still claim the open spot');
select is((select count(*)::int from public.task_assignees where task_id = 'aaaaaaaa-4444-0000-0000-000000000001'), 2, 'a task can have several assignees');
select throws_ok($$ select public.remove_task_assignee('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-00000000000e') $$, '42501', null, 'a fellow assignee can''t take an appointed person off');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select lives_ok($$ select public.remove_task_assignee('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-00000000000e') $$, 'someone ranked above the appointer can');
select throws_ok($$ select public.appoint_to_task('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-00000000000e') $$, 'P0001', null, 'nobody is appointed to someone''s personal task');

-- Completion: any and all ----------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(public.set_task_done('aaaaaaaa-4444-0000-0000-000000000009', true)::text, 'in_progress', 'with "all", one person''s part leaves the task in progress');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select throws_ok($$ update public.tasks set status = 'done' where id = 'aaaaaaaa-4444-0000-0000-000000000009' $$, 'P0001', null, 'and it can''t be forced done around the parts');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(public.set_task_done('aaaaaaaa-4444-0000-0000-000000000009', true)::text, 'done', 'it''s done when everyone has finished');
select is(public.set_task_done('aaaaaaaa-4444-0000-0000-000000000009', false)::text, 'in_progress', 'undoing one part reopens it');
select isnt((select done_at from public.task_assignees where task_id = 'aaaaaaaa-4444-0000-0000-000000000009' and membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b'), null, 'while the others'' parts stay done');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(public.set_task_done('aaaaaaaa-4444-0000-0000-000000000001', true)::text, 'done', 'with "any", one tick finishes it');

-- Share lists ------------------------------------------------------------------------------
select throws_ok($$ insert into public.task_shares (organization_id, task_id, membership_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000006', 'aaaaaaaa-1111-0000-0000-00000000000b') $$,
  '42501', null, 'someone who isn''t the creator or above them can''t share a task');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select lives_ok($$ insert into public.task_shares (organization_id, task_id, membership_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000006', 'aaaaaaaa-1111-0000-0000-00000000000b') $$,
  'the creator shares it with Mia');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000006'), 1, 'who can now see it');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ delete from public.task_shares where task_id = 'aaaaaaaa-4444-0000-0000-000000000006' and membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b' $q$), 1, 'and takes her off again');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000006'), 0, 'so she can''t');

-- Organizations never touch each other's assignees or shares -------------------------------
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.task_assignees where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'B sees none of A''s assignees');
select is((select count(*)::int from public.task_shares where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'or shares');
select throws_ok($$ insert into public.task_shares (organization_id, task_id, membership_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000007', 'aaaaaaaa-1111-0000-0000-00000000000b') $$,
  '42501', null, 'B can''t share A''s tasks');
select is(tests.affected($q$ update public.task_assignees set done_at = now() where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'B can''t change A''s assignees');
select is(tests.affected($q$ delete from public.task_assignees where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'or remove them');
select is(tests.affected($q$ delete from public.task_shares where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'or A''s shares');
select throws_ok($$ select public.claim_task('aaaaaaaa-4444-0000-0000-000000000007') $$, 'P0002', null, 'or claim A''s tasks');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into public.task_assignees (organization_id, task_id, membership_id, kind) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-000000000007', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed') $$,
  '42501', null, 'even an owner changes assignees only through the functions that check the rules');

-- Hiding, personal and org-level tasks ---------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ insert into public.tasks (organization_id, project_id, title, hidden) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sneaky', true) $$,
  '42501', null, 'staff can''t hide a task');
select throws_ok($$ insert into public.tasks (organization_id, project_id, title, kind) values
  ('aaaaaaaa-0000-0000-0000-000000000000', null, 'Org-wide', 'general') $$,
  '42501', null, 'staff can''t create org-level work');
select lives_ok($$ insert into public.tasks (id, organization_id, project_id, title, kind) values
  ('aaaaaaaa-4444-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-000000000000', null, 'My own list', 'personal') $$,
  'but can make a personal task outside any project');
select throws_ok($$ update public.tasks set kind = 'general' where id = 'aaaaaaaa-4444-0000-0000-0000000000b1' $$,
  '42501', null, 'which stays personal');
select lives_ok($$ select public.claim_task('aaaaaaaa-4444-0000-0000-0000000000b1') $$, 'the creator puts themselves on their personal task');
select is((select status::text from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000b1'), 'in_progress', 'which is then in progress');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select throws_ok($$ select public.claim_task('aaaaaaaa-4444-0000-0000-000000000003') $$, 'P0001', null, 'nobody else can claim someone''s personal task, even if they can see it');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ update public.tasks set hidden = true where id = 'aaaaaaaa-4444-0000-0000-000000000007' $q$), 1, 'a manager can hide a task');

select * from finish();
rollback;
