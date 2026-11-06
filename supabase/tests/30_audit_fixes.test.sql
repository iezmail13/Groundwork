-- Security audit fixes (D113): activity never names a task the reader can't
-- see; completion and attendance times are the database's; memberships come
-- only from creating an org or accepting an invitation; share links are made
-- only through create_report_share(); deleting a program takes its documents
-- and calendar items with it and checks first; stored documents follow their
-- row; rosters respect org ranks; a spending decision is final; definer
-- helpers answer only within the caller's organizations.
begin;
\ir fixtures.inc
select plan(38);

select set_config('storage.allow_delete_query', 'true', true);

-- the token is 64 hex characters; only its SHA-256 is stored
create function tests.hash(token text) returns text language sql as $$ select encode(sha256(convert_to(token, 'UTF8')), 'hex') $$;
grant execute on function tests.hash(text) to authenticated;

-- Org A also has Max (manager), Ada (admin) and Sam (staff, on no program).
-- Ada and Max are on A's program: Ada as its admin, Max as staff.
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
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000c', 'staff');

-- 1. Activity about tasks someone can't see ---------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
insert into public.tasks (id, organization_id, project_id, title, created_by) values
  ('aaaaaaaa-4444-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Look into a complaint about Mia', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-4444-0000-0000-0000000000d3', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Order snacks', 'a0000000-0000-0000-0000-00000000000a');
update public.tasks set hidden = true where id = 'aaaaaaaa-4444-0000-0000-0000000000d1';
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
insert into public.tasks (id, organization_id, title, created_by) values
  ('aaaaaaaa-4444-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000000', 'Plan next year''s cuts', 'a0000000-0000-0000-0000-00000000000c');
insert into public.task_shares (organization_id, task_id, membership_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000d2', 'aaaaaaaa-1111-0000-0000-00000000000a');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000d1'), 0,
  'a task hidden after it was made doesn''t show in the activity of people who can''t see it');
select is((select count(*)::int from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000d2'), 0,
  'nor does work narrowed to a share list');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
delete from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000d2';
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
delete from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000d3';
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000d2'), 0,
  'and it stays out once that work is deleted');
select ok((select count(*)::int from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000d3') >= 2,
  'while deleted open work keeps its history for everyone on the program');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select ok((select count(*)::int from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000d2') >= 2,
  'and owners still see all of it');

-- 2. When work was finished -------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
insert into public.tasks (id, organization_id, project_id, title, created_by, status, completed_at) values
  ('aaaaaaaa-4444-0000-0000-0000000000d4', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Already done',
   'a0000000-0000-0000-0000-00000000000b', 'done', '2020-01-01');
select is((select completed_at from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000d4'), now(),
  'finished work gets the real moment, not one someone picks');
update public.tasks set completed_at = '2020-01-01' where id = 'aaaaaaaa-4444-0000-0000-0000000000d4';
select is((select completed_at from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000d4'), now(),
  'and it can''t be back-dated later');

-- 3. Memberships ----------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into public.memberships (organization_id, user_id, role)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'staff') $$,
  '42501', null, 'not even an owner adds someone without an invitation');
select is((select count(*)::int from public.profiles where id = 'c0000000-0000-0000-0000-00000000000c'), 0,
  'so nobody can reach a stranger''s profile that way');

-- 4. Report share links ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok(format($$ select public.create_report_share('aaaaaaaa-0000-0000-0000-000000000000', 'progress', 'Mislabelled',
  '{"template":"attendance","sections":[]}', %L, 7) $$, tests.hash(repeat('m', 64))),
  '22023', null, 'a snapshot must be the kind of report it says it is');
select lives_ok(format($$ select public.create_report_share('aaaaaaaa-0000-0000-0000-000000000000', 'progress', 'Progress',
  '{"template":"progress","organization":"Payroll Department","sections":[]}', %L, 30) $$, tests.hash(repeat('p', 64))),
  'staff share a progress report');
select is((select expires_at - created_at from public.report_shares where token_hash = tests.hash(repeat('p', 64))), interval '30 days',
  'it starts now and lasts as long as asked');
select is((select snapshot ->> 'organization' from public.report_shares where token_hash = tests.hash(repeat('p', 64))), 'Org A',
  'and carries the organization''s real name');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.report_shares), 0, 'managers don''t read other people''s shared snapshots');
select lives_ok(format($$ select public.create_report_share('aaaaaaaa-0000-0000-0000-000000000000', 'costs', 'Costs',
  '{"template":"costs","sections":[]}', %L, 7) $$, tests.hash(repeat('k', 64))), 'a manager shares costs');
select tests.as_anon();
select is((select count(*)::int from public.shared_report(repeat('k', 64))), 1, 'which opens');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
update public.memberships set role = 'staff' where id = 'aaaaaaaa-1111-0000-0000-00000000000c';
select tests.as_anon();
select is((select count(*)::int from public.shared_report(repeat('k', 64))), 0,
  'until its creator may no longer see costs');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
update public.memberships set role = 'manager' where id = 'aaaaaaaa-1111-0000-0000-00000000000c';

-- 5. Deleting a program ---------------------------------------------------------------------
reset role;
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000d5', 'aaaaaaaa-0000-0000-0000-000000000000', 'Closing down', 'a0000000-0000-0000-0000-00000000000a');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000d5', 'aaaaaaaa-1111-0000-0000-00000000000c', 'lead');
insert into public.documents (id, organization_id, project_id, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('aaaaaaaa-6666-0000-0000-0000000000d5', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000d5', 'roster.csv',
   'aaaaaaaa-0000-0000-0000-000000000000/d5-roster.csv', 'text/csv', 10, 'a0000000-0000-0000-0000-00000000000d');
insert into public.events (id, organization_id, project_id, title, starts_at, ends_at, created_by) values
  ('aaaaaaaa-5555-0000-0000-0000000000d5', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000d5', 'Last session',
   now(), now() + interval '1 hour', 'a0000000-0000-0000-0000-00000000000d');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(public.can_delete_project('aaaaaaaa-3333-0000-0000-0000000000d5'), false,
  'a lead outranked by the program''s creator can''t delete it');
select throws_ok($$ select public.release_program_files('aaaaaaaa-3333-0000-0000-0000000000d5') $$, '42501', null,
  'so its participant files are never released for a delete that will be refused');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(public.can_delete_project('aaaaaaaa-3333-0000-0000-0000000000d5'), true, 'its creator can');
delete from public.projects where id = 'aaaaaaaa-3333-0000-0000-0000000000d5';
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.documents where id = 'aaaaaaaa-6666-0000-0000-0000000000d5')
  + (select count(*)::int from public.events where id = 'aaaaaaaa-5555-0000-0000-0000000000d5'), 0,
  'and its documents and calendar items go with it rather than becoming everyone''s');
reset role;
select is((select count(*)::int from public.documents where id = 'aaaaaaaa-6666-0000-0000-0000000000d5'), 0, 'they''re gone, not moved');

-- 6. Stored documents follow their row -------------------------------------------------------
reset role;
insert into storage.objects (bucket_id, name, owner_id) values
  ('documents', 'aaaaaaaa-0000-0000-0000-000000000000/d6-left-behind.pdf', 'a0000000-0000-0000-0000-00000000000a'),
  ('documents', 'aaaaaaaa-0000-0000-0000-000000000000/d6-mia.pdf', 'a0000000-0000-0000-0000-00000000000b');
insert into public.documents (id, organization_id, project_id, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('aaaaaaaa-6666-0000-0000-0000000000d6', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'mia.pdf',
   'aaaaaaaa-0000-0000-0000-000000000000/d6-mia.pdf', 'application/pdf', 10, 'a0000000-0000-0000-0000-00000000000b');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/d6-left-behind.pdf'), 0,
  'a stored file with no document isn''t readable by the organization');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/d6-left-behind.pdf'), 1,
  'only by whoever uploaded it');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(tests.affected($q$ delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/d6-mia.pdf' $q$), 0,
  'someone not on the program can''t delete a program document''s file');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is(tests.affected($q$ delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/d6-mia.pdf' $q$), 1,
  'whoever may delete the document may delete its file');
select is(tests.affected($q$ delete from public.documents where id = 'aaaaaaaa-6666-0000-0000-0000000000d6' $q$), 1, 'and then the document');

-- 7. Program rosters respect org ranks --------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is(tests.affected($q$ delete from public.project_members where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000c'
  and project_id = 'aaaaaaaa-3333-0000-0000-000000000000' $q$), 0, 'a program admin can''t take off someone who outranks them in the org');
select is(tests.affected($q$ update public.project_members set role = 'admin' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000c'
  and project_id = 'aaaaaaaa-3333-0000-0000-000000000000' $q$), 0, 'or change their role');
select is(tests.affected($q$ delete from public.project_members where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b'
  and project_id = 'aaaaaaaa-3333-0000-0000-000000000000' $q$), 1, 'but can take off staff');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ delete from public.project_members where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000c'
  and project_id = 'aaaaaaaa-3333-0000-0000-000000000000' $q$), 1, 'and anyone can leave');

-- 8. A spending decision is final -------------------------------------------------------------
reset role;
insert into public.funds (id, organization_id, name, total_cents, project_id) values
  ('aaaaaaaa-7777-0000-0000-0000000000d8', 'aaaaaaaa-0000-0000-0000-000000000000', 'Grant', 100000, 'aaaaaaaa-3333-0000-0000-000000000000');
insert into public.spending_entries (id, organization_id, fund_id, project_id, amount_cents, category, spent_on, submitted_by) values
  ('aaaaaaaa-8888-0000-0000-0000000000d8', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-0000000000d8',
   'aaaaaaaa-3333-0000-0000-000000000000', 5000, 'Supplies', current_date, 'a0000000-0000-0000-0000-00000000000e');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(public.decide_spending('aaaaaaaa-8888-0000-0000-0000000000d8', false)::text, 'rejected', 'an owner rejects spending');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.decide_spending('aaaaaaaa-8888-0000-0000-0000000000d8', true) $$, '42501', null,
  'and a manager can''t overturn it');

-- 9. Attendance records who took it and when --------------------------------------------------
reset role;
update public.projects set tracks_participants = true where id = 'aaaaaaaa-3333-0000-0000-000000000000';
insert into public.events (id, organization_id, project_id, title, starts_at, ends_at, created_by) values
  ('aaaaaaaa-5555-0000-0000-0000000000d9', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Session',
   now(), now() + interval '1 hour', 'a0000000-0000-0000-0000-00000000000a');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select public.add_participant('aaaaaaaa-3333-0000-0000-000000000000', 'Pat Participant');
insert into public.attendance (organization_id, event_id, participant_id, status, recorded_by, recorded_at)
select organization_id, 'aaaaaaaa-5555-0000-0000-0000000000d9', id, 'present', auth.uid(), '2020-01-01' from public.participants;
select is((select recorded_at from public.attendance), now(), 'a mark records when it was really taken');
update public.attendance set status = 'absent', recorded_by = 'a0000000-0000-0000-0000-00000000000a', recorded_at = '2020-01-01';
select results_eq($$ select recorded_by, recorded_at from public.attendance $$,
  $$ values ('a0000000-0000-0000-0000-00000000000d'::uuid, now()) $$, 'and changing it can''t pin it on someone else or back-date it');

-- 10. Helpers answer only within the caller's organizations ----------------------------------
select tests.as_user('b0000000-0000-0000-0000-00000000000b');
select is(public.mentions_in('<@a0000000-0000-0000-0000-00000000000b>', 'aaaaaaaa-0000-0000-0000-000000000000'), '{}'::uuid[],
  'mentions don''t confirm who belongs to another organization');
select is(public.fund_pays_for('aaaaaaaa-7777-0000-0000-0000000000d8', 'aaaaaaaa-3333-0000-0000-000000000000'), false,
  'nor which program another organization''s fund pays for');
select throws_ok($$ select public.task_creator_rank('aaaaaaaa-4444-0000-0000-000000000000') $$, '42501', null,
  'and a task''s creator rank isn''t open to anyone to ask');

select * from finish();
rollback;
