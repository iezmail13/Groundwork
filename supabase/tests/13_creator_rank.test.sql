-- What a higher rank created, a lower rank can't change or delete. The
-- creator, equal ranks and higher ranks can; a task's assignee may still move
-- it and mark it done. The creator's role is stamped by the database and kept
-- after they're demoted or leave. Bookkeeping by the app's own functions and
-- foreign-key cascades is unaffected.
begin;
\ir fixtures.inc
select plan(36);

-- Org A also has Max (manager), Ada (admin) and Sam (staff), all on A's project.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000c', 'lead'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000e', 'staff');

-- The creator's role is stamped, not chosen --------------------------------------------
select is((select created_by_role::text from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000000'), 'owner', 'a task records its creator''s role');
select is((select created_by_role::text from public.events where id = 'aaaaaaaa-5555-0000-0000-000000000000'), 'owner', 'so does a calendar item');
select is((select created_by_role::text from public.documents where id = 'aaaaaaaa-6666-0000-0000-000000000000'), 'owner', 'and a document, from its uploader');
select is((select created_by_role::text from public.projects where id = 'aaaaaaaa-3333-0000-0000-000000000000'), 'owner', 'and a project');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select lives_ok($$ insert into public.tasks (id, organization_id, project_id, title, created_by_role) values
  ('aaaaaaaa-4444-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sam task', 'owner') $$,
  'staff add a task, claiming to be an owner');
select is((select created_by_role::text from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000e1'), 'staff', 'the claim is ignored: the role comes from the membership');
select throws_ok($$ update public.tasks set created_by_role = 'owner' where id = 'aaaaaaaa-4444-0000-0000-0000000000e1' $$, '42501', null, 'and it can''t be changed later');

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select lives_ok($$ insert into public.tasks (id, organization_id, project_id, title) values
  ('aaaaaaaa-4444-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Max task') $$,
  'a manager adds a task');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select lives_ok($$ insert into public.tasks (id, organization_id, project_id, title) values
  ('aaaaaaaa-4444-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Ada task') $$,
  'an admin adds a task');

-- Lower ranks are blocked ----------------------------------------------------------------
-- Ada (admin) is a project admin, so without this rule she could edit anything here.
select throws_ok($$ update public.tasks set title = 'Renamed by Ada' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1' $$,
  '42501', 'Someone ranked above you created this, so you can''t change it', 'an admin cannot rename a manager''s task');
select throws_ok($$ update public.tasks set description = 'Ada was here' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1' $$,
  '42501', null, 'or change any of its details');
select throws_ok($$ update public.tasks set status = 'done' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1' $$,
  '42501', null, 'or its status, when it isn''t hers');
select throws_ok($$ update public.events set title = 'Ada event' where id = 'aaaaaaaa-5555-0000-0000-000000000000' $$,
  '42501', null, 'an admin cannot edit an owner''s calendar item');
select throws_ok($$ update public.documents set name = 'ada.pdf' where id = 'aaaaaaaa-6666-0000-0000-000000000000' $$,
  '42501', null, 'or an owner''s document');
select throws_ok($$ update public.projects set description = 'Ada' where id = 'aaaaaaaa-3333-0000-0000-000000000000' $$,
  '42501', null, 'or an owner''s project, even as its project admin');
select is((select title from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000c1'), 'Max task', 'nothing changed');

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select throws_ok($$ delete from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000000' $$,
  '42501', null, 'a manager cannot delete an owner''s task');
select throws_ok($$ delete from public.events where id = 'aaaaaaaa-5555-0000-0000-000000000000' $$,
  '42501', null, 'or an owner''s calendar item');

-- Equal and higher ranks, and the creator, are allowed ------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.tasks set title = 'Renamed by Mia' where id = 'aaaaaaaa-4444-0000-0000-0000000000e1' $q$), 1, 'staff can edit another staff member''s task');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ update public.tasks set title = 'Renamed by Max' where id = 'aaaaaaaa-4444-0000-0000-0000000000d1' $q$), 1, 'a manager can edit an admin''s task');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.tasks set title = 'Renamed by Alice' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1' $q$), 1, 'an owner can edit a manager''s task');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is(tests.affected($q$ update public.tasks set title = 'Ada again' where id = 'aaaaaaaa-4444-0000-0000-0000000000d1' $q$), 1, 'the creator can edit their own task');

-- The rule holds after the creator is demoted or leaves --------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.memberships set role = 'staff' where id = 'aaaaaaaa-1111-0000-0000-00000000000c' $q$), 1, 'Max is demoted to staff');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ update public.tasks set title = 'Still mine' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1' $q$), 1, 'a demoted creator can still edit what they made');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select throws_ok($$ update public.tasks set title = 'Ada' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1' $$,
  '42501', null, 'and it stays protected at the rank they had when they made it');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.remove_member('aaaaaaaa-1111-0000-0000-00000000000c') $$, 'Max leaves the organization');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select throws_ok($$ update public.tasks set title = 'Ada' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1' $$,
  '42501', null, 'it stays protected after the creator leaves');

-- The assignee may move their task and mark it done --------------------------------------------
reset role;
update public.tasks set assignee_membership_id = 'aaaaaaaa-1111-0000-0000-00000000000e' where id = 'aaaaaaaa-4444-0000-0000-000000000000';
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(tests.affected($q$ update public.tasks set status = 'done' where id = 'aaaaaaaa-4444-0000-0000-000000000000' $q$), 1, 'the assignee can mark an owner''s task done');
select is(tests.affected($q$ update public.tasks set position = 1 where id = 'aaaaaaaa-4444-0000-0000-000000000000' $q$), 1, 'and move it on the board');
select throws_ok($$ update public.tasks set title = 'Sam renamed it' where id = 'aaaaaaaa-4444-0000-0000-000000000000' $$,
  '42501', null, 'but not rename it');
select throws_ok($$ update public.tasks set assignee_membership_id = null where id = 'aaaaaaaa-4444-0000-0000-000000000000' $$,
  '42501', null, 'or hand it off');
select is(tests.affected($q$ update public.tasks set title = 'A task', status = 'done' where id = 'aaaaaaaa-4444-0000-0000-000000000000' $q$), 1, 'saving without changing anything is fine');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ update public.tasks set status = 'todo' where id = 'aaaaaaaa-4444-0000-0000-000000000000' $$,
  '42501', null, 'someone else of the same low rank still can''t move it');

-- Cascades still work ---------------------------------------------------------------------
-- Sam, staff, leaves while assigned the owner's task: the cascade that
-- unassigns it isn't Sam editing the task, so it isn't blocked.
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(tests.affected($q$ delete from public.memberships where id = 'aaaaaaaa-1111-0000-0000-00000000000e' $q$), 1, 'staff can leave while assigned an owner''s task');
reset role;
select is((select assignee_membership_id from public.tasks where id = 'aaaaaaaa-4444-0000-0000-000000000000'), null, 'and the task is unassigned by the cascade');

-- The helper is for signed-in people only -------------------------------------------------
select tests.as_anon();
select throws_ok($$ select public.outranked_by_creator('aaaaaaaa-0000-0000-0000-000000000000', null, 'owner') $$, '42501', null, 'anon cannot call outranked_by_creator');

select * from finish();
rollback;
