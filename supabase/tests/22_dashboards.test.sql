-- Dashboards (D105): the attendance marks stay in order; changes send a
-- signal that names only the program (never what changed); only people who
-- can see a program may listen for its signals; nobody can fake a signal.
begin;
\ir fixtures.inc
select plan(17);

-- Org A also has Max (manager) and Sam (staff, on no program).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');

-- Attendance marks -----------------------------------------------------------------------------
select is((select low_attendance_percent from public.organizations where id = 'aaaaaaaa-0000-0000-0000-000000000000'), 50::smallint, 'the low mark starts at 50');
select is((select high_attendance_percent from public.organizations where id = 'aaaaaaaa-0000-0000-0000-000000000000'), 80::smallint, 'and the high mark at 80');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ update public.organizations set low_attendance_percent = 60, high_attendance_percent = 90 where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 1, 'a manager changes them');
select throws_ok($$ update public.organizations set low_attendance_percent = 90, high_attendance_percent = 90 where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$, '23514', null, 'the low mark must be below the high one');
select throws_ok($$ update public.organizations set low_attendance_percent = -1 where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$, '23514', null, 'and not below 0');
select throws_ok($$ update public.organizations set high_attendance_percent = 101 where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$, '23514', null, 'nor the high one above 100');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(tests.affected($q$ update public.organizations set low_attendance_percent = 10 where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'staff can''t change them');

-- Change signals ---------------------------------------------------------------------------------
reset role;
delete from realtime.messages where topic like 'project:%' or topic like 'org:%';
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
update public.tasks set title = 'A task, renamed' where id = 'aaaaaaaa-4444-0000-0000-000000000000';
insert into public.tasks (id, organization_id, project_id, title, created_by, kind) values
  ('aaaaaaaa-4444-0000-0000-0000000000a9', 'aaaaaaaa-0000-0000-0000-000000000000', null, 'Org-level work', 'a0000000-0000-0000-0000-00000000000a', 'general');
reset role;
select is(
  (select array_agg(distinct topic order by topic) from realtime.messages where extension = 'broadcast' and (topic like 'project:%' or topic like 'org:%')),
  array['org:aaaaaaaa-0000-0000-0000-000000000000:changes', 'project:aaaaaaaa-3333-0000-0000-000000000000:changes'],
  'changing work signals its program, or the organization for work outside any program'
);
select is(
  -- Realtime adds its own message id
  (select array_agg(distinct (payload - 'id')::text) from realtime.messages where topic = 'project:aaaaaaaa-3333-0000-0000-000000000000:changes'),
  array['{"project_id": "aaaaaaaa-3333-0000-0000-000000000000"}'],
  'a signal names the program and nothing else'
);
select is(
  (select count(*)::int from realtime.messages where (topic like 'project:%' or topic like 'org:%') and payload::text like '%renamed%'),
  0,
  'never what changed'
);

-- Who may listen ------------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select ok(public.can_use_realtime_topic('project:aaaaaaaa-3333-0000-0000-000000000000:changes'), 'someone on a program listens for its changes');
select ok(public.can_use_realtime_topic('org:aaaaaaaa-0000-0000-0000-000000000000:changes'), 'members listen for changes outside any program');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select ok(not public.can_use_realtime_topic('project:aaaaaaaa-3333-0000-0000-000000000000:changes'), 'someone off the program can''t');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select ok(
  not public.can_use_realtime_topic('org:aaaaaaaa-0000-0000-0000-000000000000:changes')
    and not public.can_use_realtime_topic('project:aaaaaaaa-3333-0000-0000-000000000000:changes'),
  'nor can another organization'
);

-- Nobody fakes a signal ------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select set_config('realtime.topic', 'project:aaaaaaaa-3333-0000-0000-000000000000:changes', true);
select throws_ok($$ insert into realtime.messages (topic, extension, event, payload, private) values
  ('project:aaaaaaaa-3333-0000-0000-000000000000:changes', 'broadcast', 'changed', '{}', true) $$,
  '42501', null, 'not even an owner can send a change signal by hand');
select set_config('realtime.topic', 'org:aaaaaaaa-0000-0000-0000-000000000000:presence', true);
select lives_ok($$ insert into realtime.messages (topic, extension, event, payload, private) values
  ('org:aaaaaaaa-0000-0000-0000-000000000000:presence', 'presence', 'track', '{}', true) $$,
  'while announcing presence still works');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into realtime.messages (topic, extension, event, payload, private) values
  ('org:aaaaaaaa-0000-0000-0000-000000000000:presence', 'presence', 'track', '{}', true) $$,
  '42501', null, 'but not in another organization');

select * from finish();
rollback;
