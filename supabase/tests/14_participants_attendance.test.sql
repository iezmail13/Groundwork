-- Participants and attendance: only project admins and leads of a program that
-- tracks participants (and owners) see or change them; organizations never see
-- each other's; archived participants can't be checked in; permanent deletion
-- is for owners and managers and keeps anonymised attendance so counts hold.
begin;
\ir fixtures.inc
select plan(49);

-- Org A also has Ada (admin, project admin on A's program) and Max (manager,
-- not on it). Mia is project staff there. A's program tracks participants.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin');
update public.projects set tracks_participants = true
where id in ('aaaaaaaa-3333-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000');
-- a second program in A that doesn't track participants
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000f0', 'aaaaaaaa-0000-0000-0000-000000000000', 'No roster', 'a0000000-0000-0000-0000-00000000000a');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000f0', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin');
-- sessions: two on A's program, one on the untracked program, one in B
insert into public.events (id, organization_id, project_id, title, starts_at, ends_at, created_by) values
  ('aaaaaaaa-5555-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Session 1', now(), now() + interval '1 hour', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-5555-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Session 2', now() + interval '1 day', now() + interval '1 day 1 hour', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-5555-0000-0000-0000000000f0', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000f0', 'Untracked', now(), now() + interval '1 hour', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-5555-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000', 'B session', now(), now() + interval '1 hour', 'b0000000-0000-0000-0000-00000000000a');

-- Adding people ------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select lives_ok($$ select public.add_participant('aaaaaaaa-3333-0000-0000-000000000000', 'Pat Participant') $$, 'a project admin adds a participant to their program');
select is((select count(*)::int from public.participants), 1, 'and sees them');
select is((select count(*)::int from public.participant_programs), 1, 'enrolled in that program');
select throws_ok($$ select public.add_participant('aaaaaaaa-3333-0000-0000-0000000000f0', 'Nope') $$, '42501', null, 'not to a program that doesn''t track participants');
select throws_ok($$ insert into public.participants (organization_id, name) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Direct') $$, '42501', null, 'participants are only created through add_participant()');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.add_participant('bbbbbbbb-3333-0000-0000-000000000000', 'Bo Participant') $$, 'B''s owner adds one of their own');
select throws_ok($$ select public.add_participant('aaaaaaaa-3333-0000-0000-000000000000', 'Sneaky') $$, '42501', null, 'but not to A''s program');

-- Who sees them ------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.participants), 0, 'project staff see no participants');
select is((select count(*)::int from public.participant_programs), 0, 'or enrollments');
select throws_ok($$ select public.add_participant('aaaaaaaa-3333-0000-0000-000000000000', 'Mia adds') $$, '42501', null, 'and can''t add any');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.participants), 0, 'a manager who isn''t on the program sees none');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.participants), 1, 'an owner sees their organization''s participants');
select is((select name from public.participants), 'Pat Participant', 'and only their organization''s');

-- Attendance --------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select lives_ok($$ insert into public.attendance (organization_id, event_id, participant_id, status, note)
  select organization_id, 'aaaaaaaa-5555-0000-0000-0000000000c1', id, 'present', 'Arrived with a friend' from public.participants $$,
  'a project admin checks someone in');
select is((select count(*)::int from public.attendance), 1, 'and sees the mark');
select is(tests.affected($q$ update public.attendance set status = 'late' $q$), 1, 'and can correct it');
select throws_ok($$ insert into public.attendance (organization_id, event_id, participant_id, status)
  select organization_id, 'aaaaaaaa-5555-0000-0000-0000000000f0', id, 'present' from public.participants $$,
  '42501', null, 'not at a session of a program they aren''t enrolled in');
select throws_ok($$ insert into public.attendance (organization_id, event_id, participant_id, status)
  select organization_id, 'aaaaaaaa-5555-0000-0000-0000000000c1', id, 'absent' from public.participants $$,
  '23505', null, 'one mark per participant per session');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.attendance), 0, 'project staff see no attendance');
select is(tests.affected($q$ update public.attendance set status = 'absent' $q$), 0, 'can''t change it');
select is(tests.affected($q$ delete from public.attendance $q$), 0, 'or delete it');
select throws_ok($$ insert into public.attendance (organization_id, event_id, participant_id, status)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-5555-0000-0000-0000000000c2', (select id from public.participants limit 1), 'present') $$,
  '42501', null, 'or take it');
select is(tests.affected($q$ update public.participants set notes = 'Mia' $q$), 0, 'or edit a participant');
select is(tests.affected($q$ update public.participants set archived_at = now() $q$), 0, 'or archive one');
select is(tests.affected($q$ delete from public.participants $q$), 0, 'or delete one');

-- Other organizations ------------------------------------------------------------------
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.participants), 1, 'B''s owner sees only B''s participant');
select is((select count(*)::int from public.attendance), 0, 'and none of A''s attendance');
select is((select count(*)::int from public.participant_programs where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'or enrollments');
select throws_ok($$ insert into public.attendance (organization_id, event_id, participant_id, status)
  select 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-5555-0000-0000-0000000000c2', id, 'present' from public.participants $$,
  null, null, 'B can''t mark its participant at A''s session');
select throws_ok($$ insert into public.participant_programs (organization_id, participant_id, project_id)
  select 'bbbbbbbb-0000-0000-0000-000000000000', id, 'aaaaaaaa-3333-0000-0000-000000000000' from public.participants $$,
  null, null, 'or enroll it in A''s program');
select is(tests.affected($q$ update public.participants set notes = 'Bob' where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'or edit A''s participants');
select is(tests.affected($q$ delete from public.participants where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'or delete them');
select is((select count(*)::int from public.activity_log where entity_type = 'participant' and organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'or see their activity');

-- Editing and archiving ------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is(tests.affected($q$ update public.participants set care_notes = 'Peanut allergy', emergency_contact = 'Sam, 555-0100' $q$), 1, 'a project admin edits a participant''s details');
select is(
  (select metadata -> 'fields' from public.activity_log where entity_type = 'participant' and action = 'updated'),
  '["care_notes", "emergency_contact"]'::jsonb,
  'the edit is logged by field name, without the values');
select is(tests.affected($q$ update public.participants set archived_at = now() $q$), 1, 'and archives them');
select throws_ok($$ insert into public.attendance (organization_id, event_id, participant_id, status)
  select organization_id, 'aaaaaaaa-5555-0000-0000-0000000000c2', id, 'present' from public.participants $$,
  '42501', null, 'an archived participant can''t be checked in');
select is((select count(*)::int from public.attendance), 1, 'their attendance history stays');
select is(tests.affected($q$ update public.participants set archived_at = null $q$), 1, 'and they can be restored');
select is(tests.affected($q$ delete from public.participants $q$), 0, 'a project admin can''t delete permanently');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.activity_log where entity_type = 'participant'), 0, 'project staff don''t see participant activity');

-- Permanent deletion -----------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ delete from public.participants where name = 'Pat Participant' $q$), 1, 'an owner deletes a participant permanently');
select is((select count(*)::int from public.attendance where event_id = 'aaaaaaaa-5555-0000-0000-0000000000c1'), 1, 'the session still counts their mark');
select is((select participant_id from public.attendance where event_id = 'aaaaaaaa-5555-0000-0000-0000000000c1'), null, 'anonymised');
select is((select note from public.attendance where event_id = 'aaaaaaaa-5555-0000-0000-0000000000c1'), null, 'with its note erased');
select is((select status::text from public.attendance where event_id = 'aaaaaaaa-5555-0000-0000-0000000000c1'), 'late', 'and its status kept');
reset role;
select is(
  (select count(*)::int from public.activity_log where entity_type = 'participant' and metadata::text like '%Pat Participant%'),
  0, 'no activity entry keeps their name');
select is(
  (select count(*)::int from public.activity_log where entity_type = 'participant' and action = 'deleted' and organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'),
  1, 'the deletion itself is recorded');

select tests.as_anon();
select throws_ok($$ select public.can_view_participant('aaaaaaaa-0000-0000-0000-000000000000') $$, '42501', null, 'anon cannot call can_view_participant');

select * from finish();
rollback;
