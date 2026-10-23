-- Task comments, discussion boards and task-change notifications (D106).
-- Comments follow can_view_task(); threads follow can_view_discussion();
-- another organization sees nothing; people edit and delete only their own;
-- the task's people hear about comments and changes, but never about their
-- own actions, and a run of changes notifies once until it's read.
begin;
\ir fixtures.inc
select plan(46);

-- Org A also has Sam (staff, on no program). A task on A's program is made by
-- Alice and given to Mia.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');
insert into public.tasks (id, organization_id, project_id, title, created_by, kind) values
  ('aaaaaaaa-4444-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Paint the hall', 'a0000000-0000-0000-0000-00000000000a', 'appointed');
insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000c1', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed', 'a0000000-0000-0000-0000-00000000000a');
delete from public.notifications;

create function tests.notes(uid uuid, kind text) returns int language sql security definer as $$
  select count(*)::int from public.notifications where recipient_id = uid and type::text = kind $$;
grant execute on all functions in schema tests to authenticated;

-- Task comments -----------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.task_comments (organization_id, task_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000c1', 'Which colour, <@a0000000-0000-0000-0000-00000000000a>?') $$,
  'someone on the work comments on it');
select is((select mentions from public.task_comments), array['a0000000-0000-0000-0000-00000000000a']::uuid[], 'mentions come from the text');
select is(tests.notes('a0000000-0000-0000-0000-00000000000a', 'mention'), 1, 'the person mentioned hears about it');
select is(tests.notes('a0000000-0000-0000-0000-00000000000a', 'task_comment'), 0, 'once, as a mention');
select is(tests.notes('a0000000-0000-0000-0000-00000000000b', 'task_comment'), 0, 'and nobody hears about their own comment');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.task_comments (organization_id, task_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000c1', 'Green, please.') $$, 'the owner replies');
select is(tests.notes('a0000000-0000-0000-0000-00000000000b', 'task_comment'), 1, 'and the person on the work hears about it');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.task_comments), 0, 'someone who can''t see the work reads none of its comments');
select throws_ok($$ insert into public.task_comments (organization_id, task_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000c1', 'Me too') $$, '42501', null, 'and can''t comment');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.task_comments), 0, 'another organization reads none');
select throws_ok($$ insert into public.task_comments (organization_id, task_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000c1', 'Hi') $$, '42501', null, 'writes none');
select is(tests.affected($q$ update public.task_comments set body = 'Changed' $q$), 0, 'edits none');
select is(tests.affected($q$ delete from public.task_comments $q$), 0, 'and deletes none');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.task_comments set body = 'Hacked' where body like 'Which colour%' $q$), 0,
  'even an owner can''t edit someone else''s comment');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.task_comments set body = 'Which colour?' where body like 'Which colour%' $q$), 1, 'authors edit their own');
select isnt((select edited_at from public.task_comments where body = 'Which colour?'), null, 'which marks it edited');
select is((select mentions from public.task_comments where body = 'Which colour?'), '{}'::uuid[], 'and keeps mentions in step');
select throws_ok($$ update public.task_comments set edited_at = null $$, '42501', null, 'the edit mark can''t be forged');
select is(tests.affected($q$ update public.task_comments set deleted_at = now() where body = 'Which colour?' $q$), 1, 'authors delete their own');
select is((select body from public.task_comments where deleted_at is not null), '', 'which empties it');
select throws_ok($$ update public.task_comments set body = 'Back' where deleted_at is not null $$, '42501', null, 'for good');
select is(tests.affected($q$ delete from public.task_comments $q$), 0, 'rows are never removed');

-- Task changes ------------------------------------------------------------------------------------
reset role;
delete from public.notifications;
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
update public.tasks set due_date = current_date + 3 where id = 'aaaaaaaa-4444-0000-0000-0000000000c1';
select is(tests.notes('a0000000-0000-0000-0000-00000000000b', 'task_changed'), 1, 'changing work tells the person on it');
select is(tests.notes('a0000000-0000-0000-0000-00000000000a', 'task_changed'), 0, 'but not whoever changed it');
update public.tasks set priority = 'high' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1';
select is(tests.notes('a0000000-0000-0000-0000-00000000000b', 'task_changed'), 1, 'a run of changes notifies once until it''s read');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
update public.notifications set read_at = now() where type = 'task_changed';
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
update public.tasks set title = 'Paint the main hall' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1';
select is(tests.notes('a0000000-0000-0000-0000-00000000000b', 'task_changed'), 2, 'after reading it, the next change notifies again');
update public.tasks set description = 'Two coats.' where id = 'aaaaaaaa-4444-0000-0000-0000000000c1';
select is(tests.notes('a0000000-0000-0000-0000-00000000000b', 'task_changed'), 2, 'a description edit isn''t worth a notification');
select is(tests.notes('a0000000-0000-0000-0000-00000000000e', 'task_changed'), 0, 'and nobody off the work hears anything');

-- Discussions -------------------------------------------------------------------------------------
reset role;
delete from public.notifications;
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.discussions (id, organization_id, project_id, title, body)
  values ('aaaaaaaa-6666-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Spring plans', 'Ideas welcome.') $$,
  'people start a thread on a program they can see');
select is(tests.notes('a0000000-0000-0000-0000-00000000000b', 'discussion'), 1, 'which tells the people on it');
select lives_ok($$ insert into public.discussions (id, organization_id, title, body)
  values ('aaaaaaaa-6666-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000000', 'Welcome', 'Say hello, <@a0000000-0000-0000-0000-00000000000e>.') $$,
  'and on the organization''s board');
select is(tests.notes('a0000000-0000-0000-0000-00000000000e', 'mention'), 1, 'a mention in a thread notifies');
select lives_ok($$ insert into public.discussions (organization_id, title, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'Read back', 'Hello.') returning id $$,
  'a new thread can be read back as it''s written');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.discussions), 2, 'someone off a program sees only the organization''s threads');
select throws_ok($$ insert into public.discussion_replies (organization_id, discussion_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-6666-0000-0000-0000000000d1', 'Me too') $$, '42501', null,
  'and can''t reply to a program''s thread');
select throws_ok($$ insert into public.discussions (organization_id, project_id, title, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sneaky', 'Hi') $$, '42501', null,
  'or start one there');
select lives_ok($$ insert into public.discussion_replies (organization_id, discussion_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-6666-0000-0000-0000000000d2', 'Hello!') $$, 'but replies on the organization''s board');
select is(tests.notes('a0000000-0000-0000-0000-00000000000a', 'discussion'), 1, 'which tells the thread''s author');
select is(tests.affected($q$ delete from public.discussions $q$), 0, 'and can''t remove someone else''s thread');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.discussions), 0, 'another organization sees no threads');
select is((select count(*)::int from public.discussion_replies), 0, 'or replies');
select throws_ok($$ insert into public.discussions (organization_id, title, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'Hi', 'From B') $$, '42501', null, 'and can''t post on its board');
select is(tests.affected($q$ update public.discussions set title = 'Changed' $q$), 0, 'or edit its threads');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.discussions set title = 'Mine now' $q$), 0, 'people edit only their own threads');
reset role;
-- the org role is the project role's ceiling, so she's an admin in both
update public.memberships set role = 'admin' where id = 'aaaaaaaa-1111-0000-0000-00000000000b';
update public.project_members set role = 'admin' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b';
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ delete from public.discussions where id = 'aaaaaaaa-6666-0000-0000-0000000000d1' $q$), 1,
  'a program admin removes a thread on their program');
select is(tests.affected($q$ delete from public.discussions where id = 'aaaaaaaa-6666-0000-0000-0000000000d2' $q$), 0,
  'but not one on the organization''s board');

select * from finish();
rollback;
