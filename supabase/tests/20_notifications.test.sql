-- Notifications (D103): only meaningful events, never to the person who acted,
-- only to people who can see what it's about, respecting mutes; recipients
-- read and mark only their own; and the activity log is append-only.
begin;
\ir fixtures.inc
select plan(36);

-- Org A also has Max (manager, leads A's program), Ada (admin, project admin
-- there) and Sam (staff, on no program). Mia is project staff on A's program.
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
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin');
insert into public.tasks (id, organization_id, project_id, title, created_by, kind, due_date) values
  ('aaaaaaaa-4444-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Appointed work', 'a0000000-0000-0000-0000-00000000000a', 'appointed', current_date + 1),
  ('aaaaaaaa-4444-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Open work', 'a0000000-0000-0000-0000-00000000000a', 'general', current_date - 2),
  ('aaaaaaaa-4444-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia made this', 'a0000000-0000-0000-0000-00000000000b', 'general', null),
  ('aaaaaaaa-4444-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia personal', 'a0000000-0000-0000-0000-00000000000b', 'personal', null),
  ('aaaaaaaa-4444-0000-0000-0000000000a5', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'More appointed work', 'a0000000-0000-0000-0000-00000000000a', 'appointed', null);

-- Being given work ---------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select public.appoint_to_task('aaaaaaaa-4444-0000-0000-0000000000a1', 'aaaaaaaa-1111-0000-0000-00000000000b');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(
  (select array_agg(type::text) from public.notifications),
  array['assigned'],
  'someone given work is told'
);
select is((select actor_id from public.notifications), 'a0000000-0000-0000-0000-00000000000c'::uuid, 'with who gave it');

-- Claiming ------------------------------------------------------------------------------------
select public.claim_task('aaaaaaaa-4444-0000-0000-0000000000a2');
select public.claim_task('aaaaaaaa-4444-0000-0000-0000000000a3');
select is((select count(*)::int from public.notifications), 1, 'claiming your own work tells you nothing');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(
  (select array_agg(type::text) from public.notifications),
  array['claimed'],
  'the creator is told when someone claims their work'
);

-- Finishing -----------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select public.set_task_done('aaaaaaaa-4444-0000-0000-0000000000a1', true);
select is((select count(*)::int from public.notifications where type = 'completed'), 0, 'whoever finished it isn''t told');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.notifications where type = 'completed' and subject_id = 'aaaaaaaa-4444-0000-0000-0000000000a1'), 1, 'its creator is told');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.notifications where type = 'completed' and subject_id = 'aaaaaaaa-4444-0000-0000-0000000000a1'), 1, 'and so is the program''s lead');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.notifications), 0, 'a project admin who isn''t lead is not');

-- someone's personal work: its leads aren't told
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select public.claim_task('aaaaaaaa-4444-0000-0000-0000000000a4');
select public.set_task_done('aaaaaaaa-4444-0000-0000-0000000000a4', true);
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.notifications where subject_id = 'aaaaaaaa-4444-0000-0000-0000000000a4'), 0, 'personal work finishing tells nobody');

-- the creator has since lost access: no notification about something they can't see
reset role;
delete from public.project_members where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b';
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select public.set_task_done('aaaaaaaa-4444-0000-0000-0000000000a3', true);
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(
  (select count(*)::int from public.notifications where subject_id = 'aaaaaaaa-4444-0000-0000-0000000000a3'),
  0,
  'a creator who can no longer see the work isn''t told about it'
);
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(
  (select count(*)::int from public.notifications where subject_id = 'aaaaaaaa-4444-0000-0000-0000000000a3'),
  0,
  'and a lead who finished it isn''t told either'
);
reset role;
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000b', 'staff');

-- Due tomorrow and overdue ----------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select public.set_task_done('aaaaaaaa-4444-0000-0000-0000000000a1', false);
-- leaving the program released her open claim; she takes it back
select public.claim_task('aaaaaaaa-4444-0000-0000-0000000000a2');
select public.queue_my_due_notifications('aaaaaaaa-0000-0000-0000-000000000000', current_date);
select public.queue_my_due_notifications('aaaaaaaa-0000-0000-0000-000000000000', current_date);
select is(
  (select array_agg(type::text order by type::text) from public.notifications where type in ('due_soon', 'overdue')),
  array['due_soon', 'overdue'],
  'work due tomorrow and overdue work notify once each, however often it''s checked'
);
select public.queue_my_due_notifications('aaaaaaaa-0000-0000-0000-000000000000', current_date + 30);
select is((select count(*)::int from public.notifications where type in ('due_soon', 'overdue')), 2, 'a date far from today is ignored');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select public.queue_my_due_notifications('aaaaaaaa-0000-0000-0000-000000000000', current_date);
select is((select count(*)::int from public.notifications), 0, 'nobody is told about work that isn''t theirs');

-- Mutes ------------------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.notification_mutes (organization_id, type) values ('aaaaaaaa-0000-0000-0000-000000000000', 'assigned') $$, 'muting a kind of notification');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select public.appoint_to_task('aaaaaaaa-4444-0000-0000-0000000000a5', 'aaaaaaaa-1111-0000-0000-00000000000b');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.notifications where subject_id = 'aaaaaaaa-4444-0000-0000-0000000000a5'), 0, 'a muted kind isn''t sent');
select throws_ok($$ insert into public.notification_mutes (organization_id, user_id, type) values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'claimed') $$,
  '42501', null, 'nobody can mute notifications for someone else');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.notification_mutes), 0, 'or see their mutes');

-- An invitation accepted ---------------------------------------------------------------------------
reset role;
insert into public.invitations (id, organization_id, email, role, token, invited_by) values
  ('aaaaaaaa-2222-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000000', 'oscar@c.test', 'staff', 'token-oscar-a', 'a0000000-0000-0000-0000-00000000000c');
select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select public.accept_invitation('token-oscar-a');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(
  (select actor_id from public.notifications where type = 'invitation_accepted'),
  'c0000000-0000-0000-0000-00000000000c'::uuid,
  'whoever sent an invitation is told when it''s accepted'
);

-- Attendance falling below the mark --------------------------------------------------------------
reset role;
update public.projects set tracks_participants = true where id = 'aaaaaaaa-3333-0000-0000-000000000000';
insert into public.participants (id, organization_id, name) values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Pat Participant');
insert into public.participant_programs (organization_id, participant_id, project_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000');
insert into public.events (id, organization_id, project_id, title, starts_at, ends_at, created_by)
select ('aaaaaaaa-5555-0000-0000-00000000000' || n)::uuid, 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000',
  'Session ' || n, now() - (n || ' days')::interval, now() - (n || ' days')::interval + interval '1 hour', 'a0000000-0000-0000-0000-00000000000a'
from generate_series(1, 6) n;
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
insert into public.attendance (organization_id, event_id, participant_id, status, recorded_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-8888-0000-0000-000000000001', 'present', 'a0000000-0000-0000-0000-00000000000d'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-5555-0000-0000-000000000002', 'aaaaaaaa-8888-0000-0000-000000000001', 'absent', 'a0000000-0000-0000-0000-00000000000d');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.notifications where type = 'low_attendance'), 0, 'nothing before three counted sessions');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
insert into public.attendance (organization_id, event_id, participant_id, status, recorded_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-5555-0000-0000-000000000003', 'aaaaaaaa-8888-0000-0000-000000000001', 'absent', 'a0000000-0000-0000-0000-00000000000d');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(
  (select (data ->> 'rate')::int from public.notifications where type = 'low_attendance'),
  33,
  'an owner is told when attendance falls below the mark, with the rate'
);
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.notifications where type = 'low_attendance'), 1, 'and so is the program''s lead');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.notifications where type = 'low_attendance'), 0, 'but not the admin who took the attendance');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.notifications where type = 'low_attendance'), 0, 'and never project staff, who can''t see participants');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
insert into public.attendance (organization_id, event_id, participant_id, status, recorded_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-5555-0000-0000-000000000004', 'aaaaaaaa-8888-0000-0000-000000000001', 'absent', 'a0000000-0000-0000-0000-00000000000d');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.notifications where type = 'low_attendance'), 1, 'staying below doesn''t notify again');

-- Reading and marking ------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select ok((select count(*) from public.notifications) > 0, 'people see their own notifications');
select is((select count(*)::int from public.notifications where recipient_id <> auth.uid()), 0, 'and nobody else''s');
select is(tests.affected($q$ update public.notifications set read_at = now() $q$), (select count(*)::int from public.notifications), 'they mark their own read');
select throws_ok($$ update public.notifications set type = 'overdue' $$, '42501', null, 'but can change nothing else');
select throws_ok($$ insert into public.notifications (organization_id, recipient_id, type, subject_type, subject_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'assigned', 'task', 'aaaaaaaa-4444-0000-0000-0000000000a1') $$,
  '42501', null, 'nobody writes notifications directly');
select is(tests.affected($q$ delete from public.notifications $q$), 0, 'or deletes them');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.notifications set read_at = now() where recipient_id = 'a0000000-0000-0000-0000-00000000000b' $q$), 0, 'an owner can''t mark someone else''s');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.notifications where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'another organization sees none');

-- The activity log is append-only -------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into public.activity_log (organization_id, actor_membership_id, entity_type, entity_id, action)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000a', 'task', gen_random_uuid(), 'completed') $$,
  '42501', null, 'nobody can write an activity entry by hand, even about themselves');
select is(tests.affected($q$ delete from public.activity_log $q$), 0, 'and not even an owner can delete one');
select ok((select count(*) from public.activity_log) > 0, 'while the logging itself carries on');

select * from finish();
rollback;
