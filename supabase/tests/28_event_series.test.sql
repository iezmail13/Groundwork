-- Repeating events (D112): each occurrence is its own row sharing a series_id.
-- Members of another organization see none of a series and can't delete it;
-- staff delete only the occurrences they created; a series can't be joined
-- from another organization.
begin;
\ir fixtures.inc
select plan(10);

select has_column('public', 'events', 'series_id', 'events have a series_id');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.events (organization_id, title, starts_at, ends_at, series_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Friday club', '2026-11-06 16:00+00', '2026-11-06 18:00+00', 'cccccccc-5555-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Friday club', '2026-11-13 16:00+00', '2026-11-13 18:00+00', 'cccccccc-5555-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Friday club', '2026-11-20 16:00+00', '2026-11-20 18:00+00', 'cccccccc-5555-0000-0000-000000000001') $$,
  'a member creates a series in one statement');
select is((select count(*)::int from public.events where series_id = 'cccccccc-5555-0000-0000-000000000001'), 3, 'and sees every occurrence');

-- another organization
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.events where series_id = 'cccccccc-5555-0000-0000-000000000001'), 0, 'another organization sees none of it');
select is(tests.affected($q$ delete from public.events where series_id = 'cccccccc-5555-0000-0000-000000000001' $q$), 0, 'and deletes none of it');
select is(tests.affected($q$ update public.events set title = 'Mine now' where series_id = 'cccccccc-5555-0000-0000-000000000001' $q$), 0, 'nor changes it');
select throws_ok($$ insert into public.events (organization_id, title, starts_at, ends_at, series_id) values
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Sneaky', now(), now(), 'cccccccc-5555-0000-0000-000000000001') $$,
  '42501', null, 'nor joins it from its own organization');

-- the owner adds one to the same series; staff can't delete what they didn't create
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.events (organization_id, title, starts_at, ends_at, series_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Friday club', '2026-11-27 16:00+00', '2026-11-27 18:00+00', 'cccccccc-5555-0000-0000-000000000001') $$,
  'the owner adds an occurrence');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ delete from public.events where series_id = 'cccccccc-5555-0000-0000-000000000001' $q$), 3,
  'staff deleting the series remove only their own occurrences');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.events where series_id = 'cccccccc-5555-0000-0000-000000000001'), 1, 'the owner''s stays');

select * from finish();
rollback;
