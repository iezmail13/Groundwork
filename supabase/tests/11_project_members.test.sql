-- Project membership is the visibility gate. Someone not on a project gets
-- zero rows for it, its tasks, calendar items, files, stored objects and
-- activity; owners see everything. Project roles are capped by the org role,
-- and each project role can only manage the ones below it.
begin;
\ir fixtures.inc
select plan(74);

select set_config('storage.allow_delete_query', 'true', true);

-- Org A also has Max (manager), Ada and Una (admins) and Sam (staff), on no project yet.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'una@a.test', '{"full_name":"Una Admin"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff'),
  ('aaaaaaaa-1111-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000f', 'admin');

-- A second, private project in A that only Alice (its creator) is on, with
-- one of everything attached.
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'Private project', 'a0000000-0000-0000-0000-00000000000a');
insert into public.tasks (id, organization_id, project_id, title, created_by) values
  ('aaaaaaaa-4444-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'Secret task', 'a0000000-0000-0000-0000-00000000000a');
insert into public.events (id, organization_id, project_id, title, starts_at, ends_at, created_by) values
  ('aaaaaaaa-5555-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'Secret meeting', now(), now(), 'a0000000-0000-0000-0000-00000000000a');
insert into public.documents (id, organization_id, project_id, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('aaaaaaaa-6666-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'secret.pdf', 'aaaaaaaa-0000-0000-0000-000000000000/a2-secret.pdf', 'application/pdf', 10, 'a0000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name, owner_id) values
  ('documents', 'aaaaaaaa-0000-0000-0000-000000000000/a2-secret.pdf', 'a0000000-0000-0000-0000-00000000000a');

select is(
  (select role::text from public.project_members where project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2'),
  'lead',
  'a project''s creator joins it as lead'
);

-- Leak paths: off the project means zero rows ---------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.projects), 0, 'staff on no project see no projects');
select is((select count(*)::int from public.tasks), 0, 'and no tasks');
select is((select count(*)::int from public.events where project_id is not null), 0, 'and no project calendar items');
select is((select count(*)::int from public.events where project_id is null), 1, 'but still see organization-wide calendar items');
select is((select count(*)::int from public.documents where project_id is not null), 0, 'and no project files');
select is((select count(*)::int from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/a2-secret.pdf'), 0, 'and no stored project file');
select is((select count(*)::int from public.activity_log where metadata ->> 'project_id' is not null), 0, 'and no project activity');
select is((select count(*)::int from public.project_members), 0, 'and no project rosters');
select ok(not public.can_view_task('aaaaaaaa-4444-0000-0000-0000000000a2'), 'can_view_task is false off the project');
select is((select count(*)::int from public.recent_projects('aaaaaaaa-0000-0000-0000-000000000000')), 0, 'recent projects lists none');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select array_agg(name) from public.projects), array['A project'], 'Mia sees only the project she is on');
select is((select count(*)::int from public.tasks where project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2'), 0, 'zero rows for the other project''s tasks');
select is((select count(*)::int from public.tasks where title = 'Secret task'), 0, 'not even by title');
select is((select count(*)::int from public.events where id = 'aaaaaaaa-5555-0000-0000-0000000000a2'), 0, 'zero rows for its calendar items');
select is((select count(*)::int from public.documents where id = 'aaaaaaaa-6666-0000-0000-0000000000a2'), 0, 'zero rows for its files');
select is((select count(*)::int from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/a2-secret.pdf'), 0, 'zero rows for its stored file');
select is((select count(*)::int from public.activity_log where metadata ->> 'project_id' = 'aaaaaaaa-3333-0000-0000-0000000000a2'), 0, 'zero rows for its activity');
select is((select count(*)::int from public.activity_log where metadata ->> 'label' = 'Secret task'), 0, 'its activity doesn''t leak a title');
select is(tests.affected($q$ update public.tasks set title = 'x' where id = 'aaaaaaaa-4444-0000-0000-0000000000a2' $q$), 0, 'cannot edit its tasks');
select is(tests.affected($q$ delete from public.events where id = 'aaaaaaaa-5555-0000-0000-0000000000a2' $q$), 0, 'cannot delete its calendar items');
select is(tests.affected($q$ delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/a2-secret.pdf' $q$), 0, 'cannot delete its stored file');
select throws_ok($$ insert into public.tasks (organization_id, project_id, title) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'sneak') $$, '42501', null, 'cannot add tasks to it');
select throws_ok($$ insert into public.project_members (organization_id, project_id, membership_id) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000b') $$, '42501', null, 'cannot add herself to it');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.projects), 2, 'an owner sees every project without being added');
select is((select count(*)::int from public.tasks), 2, 'and every task');
select is((select count(*)::int from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/a2-secret.pdf'), 1, 'and every stored file');

-- Cross-organization isolation for the roster ------------------------------------
select is((select count(*)::int from public.project_members where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B''s rosters');
select throws_ok($$ insert into public.project_members (organization_id, project_id, membership_id) values ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000b') $$, null, null, 'A cannot add anyone to B''s projects');
select throws_ok($$ insert into public.project_members (organization_id, project_id, membership_id) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'bbbbbbbb-1111-0000-0000-00000000000b') $$, '23503', null, 'B''s people cannot be put on A''s projects');
select is(tests.affected($q$ update public.project_members set role = 'staff' where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000' $q$), 0, 'A cannot change B''s rosters');
select is(tests.affected($q$ delete from public.project_members where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000' $q$), 0, 'A cannot delete from B''s rosters');

-- The org role is a ceiling ------------------------------------------------------
select throws_ok($$ insert into public.project_members (organization_id, project_id, membership_id, role) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000e', 'lead') $$, 'P0001', 'Their organization role doesn''t allow that project role', 'staff cannot be made lead');
select throws_ok($$ insert into public.project_members (organization_id, project_id, membership_id, role) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000d', 'lead') $$, 'P0001', null, 'an org admin cannot be made lead');
select lives_ok($$ insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000c', 'lead'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin') $$,
  'an owner puts a manager on as lead and an admin on as project admin');

-- A project admin manages staff only ------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.tasks where project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2'), 1, 'joining a project shows its tasks at once');
select lives_ok($$ insert into public.project_members (organization_id, project_id, membership_id, role) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000e', 'staff') $$, 'a project admin can add staff');
select throws_ok($$ insert into public.project_members (organization_id, project_id, membership_id, role) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000f', 'admin') $$, '42501', null, 'a project admin cannot add another admin');
select is(tests.affected($q$ update public.project_members set role = 'staff' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000c' and project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 0, 'a project admin cannot change the lead');
select is(tests.affected($q$ update public.projects set description = 'Edited by Ada' where id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 1, 'a project admin can edit the project');
select is(tests.affected($q$ delete from public.projects where id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 0, 'a project admin cannot delete the project');
select is(tests.affected($q$ delete from public.events where id = 'aaaaaaaa-5555-0000-0000-0000000000a2' $q$), 1, 'a project admin can delete anyone''s item in the project');

-- Project staff manage nobody, but can leave ------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select throws_ok($$ insert into public.project_members (organization_id, project_id, membership_id, role) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000b', 'staff') $$, '42501', null, 'project staff cannot add anyone');
select is(tests.affected($q$ update public.projects set name = 'x' where id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 0, 'project staff cannot edit the project');
select lives_ok($$ insert into public.tasks (organization_id, project_id, title) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'Sam task') $$, 'project staff can add tasks');
select is(tests.affected($q$ delete from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000a2' $q$), 0, 'project staff cannot delete someone else''s task');

-- A lead manages everyone on their project --------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ update public.project_members set role = 'staff' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000d' and project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 1, 'a lead can re-level a project admin');
select is(tests.affected($q$ update public.project_members set role = 'admin' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000d' and project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 1, 'and back');
select is((select count(*)::int from public.projects), 1, 'a manager sees only the projects they are on');

-- Assignees must be on the project ----------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.tasks set assignee_membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b' where id = 'aaaaaaaa-4444-0000-0000-0000000000a2' $$, 'P0001', 'That person isn''t on this project', 'a task cannot be assigned to someone off its project');
select lives_ok($$ update public.tasks set assignee_membership_id = 'aaaaaaaa-1111-0000-0000-00000000000e' where id = 'aaaaaaaa-4444-0000-0000-0000000000a2' $$, 'a task can be assigned to someone on its project');
select lives_ok($$ update public.tasks set assignee_membership_id = 'aaaaaaaa-1111-0000-0000-00000000000a' where title = 'Sam task' $$, 'owners can be assigned anywhere');

-- Leaving a project frees open work there ----------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(tests.affected($q$ delete from public.project_members where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000e' and project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 1, 'staff can take themselves off a project');
select is((select count(*)::int from public.tasks where project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2'), 0, 'and stop seeing it at once');
reset role;
select is(
  (select row(assignee_membership_id, needs_assignee)::text from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000a2'),
  row(null::uuid, true)::text,
  'their open task there is unassigned and flagged'
);
update public.tasks set assignee_membership_id = 'aaaaaaaa-1111-0000-0000-00000000000c' where id = 'aaaaaaaa-4444-0000-0000-0000000000a2';
select is((select needs_assignee from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000a2'), false, 'reassigning clears the flag');

-- A demotion lowers project roles above the new ceiling -----------------------------------
update public.memberships set role = 'staff' where id = 'aaaaaaaa-1111-0000-0000-00000000000c';
select is((select role::text from public.project_members where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000c'), 'staff', 'a manager demoted to staff stops leading');
update public.memberships set role = 'manager' where id = 'aaaaaaaa-1111-0000-0000-00000000000c';

-- Managers manage content only on projects they are on -------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select ok(public.can_manage_project_content('aaaaaaaa-3333-0000-0000-0000000000a2'), 'a manager on a project as staff can still manage its items');
select ok(not public.can_grant_project_role('aaaaaaaa-3333-0000-0000-0000000000a2', 'staff'), 'but cannot manage its roster without leading it');
select ok(not public.can_manage_project_content('aaaaaaaa-3333-0000-0000-000000000000'), 'and has no say over a project they are not on');

-- Archived projects are read-only ------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.projects set status = 'archived' where id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 1, 'an owner archives the project');
select throws_ok($$ update public.projects set name = 'Renamed' where id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $$, 'P0001', null, 'an archived project''s details are read-only');
select throws_ok($$ insert into public.tasks (organization_id, project_id, title) values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000a2', 'late') $$, '42501', null, 'no new tasks in an archived project');
select is(tests.affected($q$ update public.tasks set title = 'x' where project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 0, 'its tasks are read-only');
select is(tests.affected($q$ delete from public.documents where id = 'aaaaaaaa-6666-0000-0000-0000000000a2' $q$), 0, 'its files cannot be deleted');
select is((select count(*)::int from public.tasks where project_id = 'aaaaaaaa-3333-0000-0000-0000000000a2'), 2, 'but stay visible');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.projects where status = 'archived'), 1, 'members still see an archived project');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.projects set status = 'active' where id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 1, 'restoring it is allowed');

-- Project creation and deletion ------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select lives_ok($$ insert into public.projects (id, organization_id, name) values ('aaaaaaaa-3333-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'Ada project') $$, 'an org admin can create a project');
select is((select role::text from public.project_members where project_id = 'aaaaaaaa-3333-0000-0000-0000000000a3'), 'admin', 'and joins it as project admin, their ceiling');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ update public.project_members set role = 'lead' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000c' $q$), 0, 'a manager cannot promote themselves to lead');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.project_members set role = 'lead' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000c' $q$), 1, 'an owner can make a manager lead');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ delete from public.projects where id = 'aaaaaaaa-3333-0000-0000-0000000000a2' $q$), 1, 'a lead can delete their project');

select tests.as_anon();
select throws_ok($$ select public.can_view_project('aaaaaaaa-3333-0000-0000-000000000000') $$, '42501', null, 'anon cannot call can_view_project');

select * from finish();
rollback;
