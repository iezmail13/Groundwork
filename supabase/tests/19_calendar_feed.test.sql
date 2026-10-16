-- The private calendar feed (D57, D102): one secret URL per person, holding
-- only open work assigned to them and calendar items on their programs,
-- filtered by the same visibility rules as the app. Only the token's digest
-- is stored and nobody can read it; revoking or replacing the token stops the
-- old URL at once.
begin;
\ir fixtures.inc
select plan(21);

-- Org A also has Sam (staff, on A's program). Q is a second program Mia isn't on.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000000', 'Q project', 'a0000000-0000-0000-0000-00000000000a');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000e', 'staff');

insert into public.tasks (id, organization_id, project_id, title, created_by, kind, hidden, due_date) values
  ('aaaaaaaa-4444-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia: print the forms', 'a0000000-0000-0000-0000-00000000000a', 'appointed', false, current_date + 3),
  ('aaaaaaaa-4444-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia: finished already', 'a0000000-0000-0000-0000-00000000000a', 'appointed', false, current_date + 3),
  ('aaaaaaaa-4444-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia: no due date', 'a0000000-0000-0000-0000-00000000000a', 'appointed', false, null),
  ('aaaaaaaa-4444-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sam: hidden', 'a0000000-0000-0000-0000-00000000000a', 'appointed', true, current_date + 3),
  ('aaaaaaaa-4444-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sam: personal', 'a0000000-0000-0000-0000-00000000000e', 'personal', false, current_date + 3),
  ('aaaaaaaa-4444-0000-0000-0000000000b3', 'aaaaaaaa-0000-0000-0000-000000000000', null, 'Alice: personal', 'a0000000-0000-0000-0000-00000000000a', 'personal', false, current_date + 3);
insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000a1', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000a3', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000b1', 'aaaaaaaa-1111-0000-0000-00000000000e', 'appointed', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000b2', 'aaaaaaaa-1111-0000-0000-00000000000e', 'claimed', 'a0000000-0000-0000-0000-00000000000e'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000b3', 'aaaaaaaa-1111-0000-0000-00000000000a', 'claimed', 'a0000000-0000-0000-0000-00000000000a');
update public.tasks set status = 'done' where id = 'aaaaaaaa-4444-0000-0000-0000000000a2';

insert into public.events (id, organization_id, project_id, title, starts_at, ends_at, created_by) values
  ('aaaaaaaa-5555-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Program session', now() + interval '1 day', now() + interval '1 day 1 hour', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-5555-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000f1', 'Q session', now() + interval '1 day', now() + interval '1 day 1 hour', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-5555-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Two years out', now() + interval '2 years', now() + interval '2 years 1 hour', 'a0000000-0000-0000-0000-00000000000a');

-- Turning it on ------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
create temporary table feed_tokens (who text primary key, token text) on commit drop;
grant all on feed_tokens to authenticated, anon;
insert into feed_tokens values ('mia', public.regenerate_calendar_feed());
select matches((select token from feed_tokens where who = 'mia'), '^[A-Za-z0-9_-]{43}$', 'turning the feed on returns a 43-character token');
select isnt((select calendar_feed_created_at from public.profiles where id = 'a0000000-0000-0000-0000-00000000000b'), null, 'the profile shows the feed is on');
select throws_ok($$ select calendar_feed_token_hash from public.profiles $$, '42501', null, 'nobody can read the stored digest, not even its owner');
select throws_ok($$ update public.profiles set calendar_feed_token_hash = repeat('0', 64) where id = 'a0000000-0000-0000-0000-00000000000b' $$, '42501', null, 'or set it directly');

-- What it holds ------------------------------------------------------------------------------
select tests.as_anon();
select is(
  (select array_agg(title order by title) from public.calendar_feed((select token from feed_tokens where who = 'mia'))),
  array['Mia: print the forms', 'Program session'],
  'the feed holds open, dated work assigned to her and items on her programs, nothing else'
);
select is(
  (select count(*)::int from public.calendar_feed((select token from feed_tokens where who = 'mia')) where title like 'Sam:%' or title like 'Alice:%'),
  0,
  'someone else''s hidden or personal task never appears'
);
select is(
  (select due_date from public.calendar_feed((select token from feed_tokens where who = 'mia')) where item_type = 'task'),
  current_date + 3,
  'work carries its due date'
);
select is((select count(*)::int from public.calendar_feed('not-a-real-token')), 0, 'a malformed token returns nothing');
select is((select count(*)::int from public.calendar_feed(repeat('A', 43))), 0, 'an unknown token returns nothing');
select throws_ok($$ select public.regenerate_calendar_feed() $$, '42501', null, 'feeds can''t be turned on without signing in');

-- An owner's feed is still only their own work, though they can see more
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
insert into feed_tokens values ('alice', public.regenerate_calendar_feed());
select tests.as_anon();
select is(
  (select array_agg(title order by title) from public.calendar_feed((select token from feed_tokens where who = 'alice'))),
  array['Alice: personal', 'Program session', 'Q session'],
  'an owner''s feed holds their own work and their programs'' items, not everything they can see'
);

-- Leaving a program takes its items out of the feed
reset role;
delete from public.project_members where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b' and project_id = 'aaaaaaaa-3333-0000-0000-000000000000';
select tests.as_anon();
select is(
  (select count(*)::int from public.calendar_feed((select token from feed_tokens where who = 'mia')) where title = 'Program session'),
  0,
  'after leaving a program its items leave the feed'
);
select is(
  (select count(*)::int from public.calendar_feed((select token from feed_tokens where who = 'mia')) where title = 'Mia: print the forms'),
  0,
  'and so does work on it she can no longer see'
);

-- Replacing and revoking ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
insert into feed_tokens values ('sam', public.regenerate_calendar_feed());
insert into feed_tokens values ('sam-new', public.regenerate_calendar_feed());
select tests.as_anon();
select is((select count(*)::int from public.calendar_feed((select token from feed_tokens where who = 'sam'))), 0, 'making a new feed stops the old URL at once');
select isnt((select count(*)::int from public.calendar_feed((select token from feed_tokens where who = 'sam-new'))), 0, 'and the new one works');
select is(
  (select array_agg(title order by title) from public.calendar_feed((select token from feed_tokens where who = 'sam-new'))),
  array['Program session', 'Sam: hidden', 'Sam: personal'],
  'his own hidden and personal work appears in his own feed'
);

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select lives_ok($$ select public.revoke_calendar_feed() $$, 'turning the feed off');
select is((select calendar_feed_created_at from public.profiles where id = 'a0000000-0000-0000-0000-00000000000e'), null, 'shows it as off');
select tests.as_anon();
select is((select count(*)::int from public.calendar_feed((select token from feed_tokens where who = 'sam-new'))), 0, 'a revoked token returns nothing');
select throws_ok($$ select public.revoke_calendar_feed() $$, '42501', null, 'feeds can''t be turned off without signing in');

-- a feed answers as its owner only while gathering rows
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select count(*) from public.calendar_feed((select token from feed_tokens where who = 'alice'));
select is(auth.uid(), 'b0000000-0000-0000-0000-00000000000a'::uuid, 'reading a feed leaves the caller''s own identity in place');

select * from finish();
rollback;
