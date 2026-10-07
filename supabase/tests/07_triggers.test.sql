-- Behaviour the app relies on: activity logging, completed_at, document
-- search and the recent-projects feed.
begin;
\ir fixtures.inc
select plan(10);

select tests.as_user('a0000000-0000-0000-0000-00000000000b');

insert into public.tasks (id, organization_id, project_id, title)
values ('aaaaaaaa-4444-0000-0000-0000000000ff', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Write the newsletter');

select is(
  (select action || ':' || actor_membership_id::text from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000ff'),
  'created:aaaaaaaa-1111-0000-0000-00000000000b',
  'creating a task logs who did it'
);

update public.tasks set position = 42 where id = 'aaaaaaaa-4444-0000-0000-0000000000ff';
select is((select count(*)::int from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000ff'), 1, 'reordering alone is not logged');

update public.tasks set status = 'done' where id = 'aaaaaaaa-4444-0000-0000-0000000000ff';
select isnt((select completed_at from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000ff'), null, 'completing a task stamps completed_at');
select is((select action from public.activity_log where entity_id = 'aaaaaaaa-4444-0000-0000-0000000000ff' order by created_at desc, action limit 1), 'completed', 'completing a task is logged');

update public.tasks set status = 'todo' where id = 'aaaaaaaa-4444-0000-0000-0000000000ff';
select is((select completed_at from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000ff'), null, 'reopening clears completed_at');

select is((select id from public.recent_projects('aaaaaaaa-0000-0000-0000-000000000000') limit 1), 'aaaaaaaa-3333-0000-0000-000000000000'::uuid, 'recent_projects follows activity');

select is((select count(*)::int from public.documents where search @@ to_tsquery('simple', 'plan:*')), 1, 'documents are searchable by part of the name');
select is((select count(*)::int from public.documents where search @@ to_tsquery('simple', 'plans')), 1, 'documents are searchable by tag');

select throws_ok($$ insert into public.documents (organization_id, name, storage_path, mime_type, size_bytes, tags) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 'aaaaaaaa-0000-0000-0000-000000000000/x', 'text/plain', 1, '{Upper}') $$, '23514', null, 'tags are stored lowercase');
select throws_ok($$ insert into public.documents (organization_id, name, storage_path, mime_type, size_bytes) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 'aaaaaaaa-0000-0000-0000-000000000000/y', 'text/plain', 30000000) $$, '23514', null, 'documents over 25 MB are rejected');

select * from finish();
rollback;
