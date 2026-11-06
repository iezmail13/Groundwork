-- Changing "this and later times" of a repeating event (D118). The later times
-- are replaced by a new pattern in one go, as the caller: earlier times stay,
-- another organization can't touch it, nothing changes when some of those
-- times belong to someone the caller can't override, and attendance already
-- taken is never wiped out.
begin;
\ir fixtures.inc
select plan(13);

select has_function('public', 'reschedule_event_series', array['uuid', 'jsonb'], 'reschedule_event_series exists');

-- Mia (staff, org A) has a Monday series: four weeks from Nov 2
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
insert into public.events (id, organization_id, title, starts_at, ends_at, series_id) values
  ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Club', '2026-11-02 21:00+00', '2026-11-02 22:00+00', 'aaaaaaaa-7777-0000-0000-0000000000ff'),
  ('aaaaaaaa-7777-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Club', '2026-11-09 21:00+00', '2026-11-09 22:00+00', 'aaaaaaaa-7777-0000-0000-0000000000ff'),
  ('aaaaaaaa-7777-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000000', 'Club', '2026-11-16 21:00+00', '2026-11-16 22:00+00', 'aaaaaaaa-7777-0000-0000-0000000000ff'),
  ('aaaaaaaa-7777-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000000', 'Club', '2026-11-23 21:00+00', '2026-11-23 22:00+00', 'aaaaaaaa-7777-0000-0000-0000000000ff');

create temporary table moved_to (occurrences jsonb) on commit drop;
grant all on moved_to to authenticated, anon;
insert into moved_to values ('[
  {"title": "Club (Wednesdays)", "all_day": false, "starts_at": "2026-11-11 21:00+00", "ends_at": "2026-11-11 22:00+00"},
  {"title": "Club (Wednesdays)", "all_day": false, "starts_at": "2026-11-18 21:00+00", "ends_at": "2026-11-18 22:00+00"}
]'::jsonb);

-- another organization can't see it, so can't change it
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.reschedule_event_series('aaaaaaaa-7777-0000-0000-000000000002', (select occurrences from moved_to)) $$,
  'P0002', null, 'another organization can''t reschedule it');
select tests.as_anon();
select throws_ok($$ select public.reschedule_event_series('aaaaaaaa-7777-0000-0000-000000000002', (select occurrences from moved_to)) $$,
  '42501', null, 'nor can someone signed out');

-- an occurrence the owner made can't be removed by staff: nothing changes
reset role;
insert into public.events (id, organization_id, title, starts_at, ends_at, series_id, created_by) values
  ('aaaaaaaa-7777-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000000', 'Club', '2026-11-30 21:00+00', '2026-11-30 22:00+00', 'aaaaaaaa-7777-0000-0000-0000000000ff', 'a0000000-0000-0000-0000-00000000000a');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.reschedule_event_series('aaaaaaaa-7777-0000-0000-000000000002', (select occurrences from moved_to)) $$,
  '42501', null, 'staff can''t replace times someone above them made');
select is((select count(*)::int from public.events where series_id = 'aaaaaaaa-7777-0000-0000-0000000000ff'), 5, 'and nothing was changed');
reset role;
delete from public.events where id = 'aaaaaaaa-7777-0000-0000-000000000005';

-- attendance taken at a later time blocks it, even for someone who can't read attendance
insert into public.attendance (id, organization_id, event_id, participant_id, status) values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-000000000003', null, 'present');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.reschedule_event_series('aaaaaaaa-7777-0000-0000-000000000002', (select occurrences from moved_to)) $$,
  'P0001', null, 'times with attendance taken can''t be replaced');
reset role;
select is((select count(*)::int from public.attendance where id = 'aaaaaaaa-8888-0000-0000-000000000001'), 1, 'and the attendance is still there');
delete from public.attendance where id = 'aaaaaaaa-8888-0000-0000-000000000001';

-- the creator moves this and later times to Wednesdays
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.reschedule_event_series('aaaaaaaa-7777-0000-0000-000000000002', '[]'::jsonb) $$,
  '22023', null, 'it needs at least one time');
select is(public.reschedule_event_series('aaaaaaaa-7777-0000-0000-000000000002', (select occurrences from moved_to)), 2, 'replacing the later times returns how many were added');
select is(
  (select array_agg(title || ' ' || to_char(starts_at at time zone 'UTC', 'MM-DD') order by starts_at) from public.events where series_id = 'aaaaaaaa-7777-0000-0000-0000000000ff'),
  array['Club 11-02', 'Club (Wednesdays) 11-11', 'Club (Wednesdays) 11-18'],
  'the earlier time stays, and the new times join the same series'
);
select is((select count(*)::int from public.events where id in ('aaaaaaaa-7777-0000-0000-000000000002', 'aaaaaaaa-7777-0000-0000-000000000003', 'aaaaaaaa-7777-0000-0000-000000000004')), 0, 'the old later times are gone');

-- one that isn't repeating
insert into public.events (id, organization_id, title, starts_at, ends_at) values
  ('aaaaaaaa-7777-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000000', 'One-off', '2026-11-04 21:00+00', '2026-11-04 22:00+00');
select throws_ok($$ select public.reschedule_event_series('aaaaaaaa-7777-0000-0000-000000000009', (select occurrences from moved_to)) $$,
  'P0002', null, 'an event that doesn''t repeat has no later times to change');

-- the attendance check answers nothing about another organization's series
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is(public.series_has_attendance_from('aaaaaaaa-7777-0000-0000-0000000000ff', '2026-01-01'), false, 'the attendance check says nothing about another organization');

select * from finish();
rollback;
