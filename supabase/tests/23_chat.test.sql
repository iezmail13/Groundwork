-- Chat (D106): every read goes through can_view_channel(). A program's
-- channel is for the people on it plus owners; the organization channel for
-- every member; a direct message for its two people only, with no owner
-- exception. History starts at the person's original join date. Messages
-- notify through D103, and muting a conversation stops that without hiding
-- unread counts.
begin;
\ir fixtures.inc
select plan(60);

-- Org A also has Sam (staff, on no program) and Ada (staff, joins the program later).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Later"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'staff');
delete from public.notifications;

create function tests.org_channel(org uuid) returns uuid language sql security definer as $$
  select id from public.chat_channels where organization_id = org and kind = 'org' $$;
create function tests.project_channel(project uuid) returns uuid language sql security definer as $$
  select id from public.chat_channels where project_id = project $$;
create function tests.notes(uid uuid, kind text) returns int language sql security definer as $$
  select count(*)::int from public.notifications where recipient_id = uid and type::text = kind $$;
create function tests.notes_about(uid uuid, subject uuid) returns int language sql security definer as $$
  select count(*)::int from public.notifications where recipient_id = uid and subject_id = subject $$;
grant execute on all functions in schema tests to authenticated;

-- Channels are made for you --------------------------------------------------------------------
select isnt(tests.org_channel('aaaaaaaa-0000-0000-0000-000000000000'), null, 'every organization has its channel');
select isnt(tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000'), null, 'every program has its channel');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000f2', 'aaaaaaaa-0000-0000-0000-000000000000', 'New program', 'a0000000-0000-0000-0000-00000000000a');
select isnt(tests.project_channel('aaaaaaaa-3333-0000-0000-0000000000f2'), null, 'a new program gets its channel straight away');
select throws_ok($$ insert into public.chat_channels (organization_id, kind) values ('aaaaaaaa-0000-0000-0000-000000000000', 'org') $$,
  '42501', null, 'nobody makes channels by hand');

-- Mia, on the program, talks in all three kinds ------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok(format($$ insert into public.chat_messages (organization_id, channel_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', %L, 'Program news') $$, tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000')),
  'people on a program post in its channel');
select lives_ok(format($$ insert into public.chat_messages (organization_id, channel_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', %L, 'Hello everyone') $$, tests.org_channel('aaaaaaaa-0000-0000-0000-000000000000')),
  'everyone posts in the organization channel');
select isnt(public.open_direct_channel('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e'), null,
  'anyone opens a direct conversation with a colleague');
select is(public.open_direct_channel('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e'),
  (select id from public.chat_channels where kind = 'direct'), 'opening it again finds the same one');
create temporary table dm as select id from public.chat_channels where kind = 'direct';
grant select on dm to authenticated;
select lives_ok($$ insert into public.chat_messages (organization_id, channel_id, body)
  select 'aaaaaaaa-0000-0000-0000-000000000000', id, 'Just between us' from dm $$, 'and writes in it');
select throws_ok($$ select public.open_direct_channel('aaaaaaaa-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'but not with someone from another organization');
select throws_ok($$ select public.open_direct_channel('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000b') $$,
  '22023', null, 'or with themselves');
select is(tests.notes('a0000000-0000-0000-0000-00000000000e', 'direct_message'), 1, 'a direct message notifies the other person');
select lives_ok($$ insert into public.chat_messages (organization_id, channel_id, body)
  select 'aaaaaaaa-0000-0000-0000-000000000000', id, 'And another thing' from dm $$, 'a second message');
select is(tests.notes('a0000000-0000-0000-0000-00000000000e', 'direct_message'), 1, 'notifies only once until they open the conversation');
select is(tests.notes_about('a0000000-0000-0000-0000-00000000000a', tests.org_channel('aaaaaaaa-0000-0000-0000-000000000000')), 1, 'the organization channel told the owner once');
select is(tests.notes('a0000000-0000-0000-0000-00000000000a', 'direct_message'), 0, 'and nothing about a conversation she isn''t in');

-- Sam isn't on the program -------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.chat_messages where channel_id = tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000')), 0,
  'someone not on a program gets no rows from its channel');
select is((select count(*)::int from public.chat_channels where project_id = 'aaaaaaaa-3333-0000-0000-000000000000'), 0, 'or the channel itself');
select throws_ok(format($$ insert into public.chat_messages (organization_id, channel_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', %L, 'Let me in') $$, tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000')),
  '42501', null, 'and can''t post there');
select is((select count(*)::int from public.chat_messages where channel_id = (select id from dm)), 2, 'he reads his direct messages');
select is((select count(*)::int from public.chat_messages where channel_id = tests.org_channel('aaaaaaaa-0000-0000-0000-000000000000')), 1,
  'and the organization channel');
select is((select count(*)::int from public.project_first_joins where project_id = 'aaaaaaaa-3333-0000-0000-000000000000'), 0,
  'and sees no one''s join dates there');
select is((select count(*)::int from public.chat_channel_people(tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000'))), 0,
  'or who is in it');
select throws_ok(format($$ insert into public.chat_reads (organization_id, channel_id) values ('aaaaaaaa-0000-0000-0000-000000000000', %L) $$,
  tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000')), '42501', null, 'and can''t mark it read');
select ok(public.can_use_realtime_topic('chat:' || (select id from dm) || ':typing'), 'he joins typing for his conversation');
select ok(not public.can_use_realtime_topic('chat:' || tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000') || ':typing'),
  'but not for the program''s');
select ok(public.can_use_realtime_topic('user:a0000000-0000-0000-0000-00000000000e:chat'), 'he hears his own chat signals');
select ok(not public.can_use_realtime_topic('user:a0000000-0000-0000-0000-00000000000b:chat'), 'and nobody else''s');

-- Opening the conversation lets the next message notify again
select lives_ok($$ select public.mark_channel_read(id) from dm $$, 'opening a conversation marks it read');
select is((select count(*)::int from public.notifications where read_at is null and subject_id = (select id from dm)), 0, 'which reads its notification too');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
insert into public.chat_messages (organization_id, channel_id, body)
  select 'aaaaaaaa-0000-0000-0000-000000000000', id, 'Are you there?' from dm;
select is(tests.notes('a0000000-0000-0000-0000-00000000000e', 'direct_message'), 2, 'so the next message notifies again');

-- The owner can't read a direct message -------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.chat_messages where channel_id = (select id from dm)), 0,
  'an owner who isn''t in a direct conversation gets no rows from it');
select is((select count(*)::int from public.chat_channels where kind = 'direct'), 0, 'or the conversation itself');
select throws_ok($$ insert into public.chat_messages (organization_id, channel_id, body)
  select 'aaaaaaaa-0000-0000-0000-000000000000', id, 'Owner here' from dm $$, '42501', null, 'and can''t write in it');
select ok(not public.can_use_realtime_topic('chat:' || (select id from dm) || ':messages'), 'or listen to it');
select is((select count(*)::int from public.chat_messages where channel_id = tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000')), 1,
  'but she reads every program''s channel');
select is((select count(*)::int from public.chat_channel_people(tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000'))), 2,
  'whose people are those on it plus owners');

-- Another organization sees nothing -----------------------------------------------------------------
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.chat_messages where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0,
  'another organization''s owner reads none of its messages');
select is((select count(*)::int from public.chat_channels where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'or channels');
select throws_ok(format($$ insert into public.chat_messages (organization_id, channel_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', %L, 'Hi from B') $$, tests.org_channel('aaaaaaaa-0000-0000-0000-000000000000')),
  '42501', null, 'can''t post there');
select is(tests.affected($q$ update public.chat_messages set body = 'Changed' $q$), 0, 'can''t edit its messages');
select is(tests.affected($q$ update public.chat_reads set last_read_at = now() $q$), 0, 'or anyone''s read marks');

-- Editing and deleting --------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(tests.affected($q$ update public.chat_messages set body = 'Rewritten' where body = 'Hello everyone' $q$), 0,
  'nobody edits someone else''s message');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.chat_messages set body = 'Hello, everyone!' where body = 'Hello everyone' $q$), 1,
  'senders edit their own');
select isnt((select edited_at from public.chat_messages where body = 'Hello, everyone!'), null, 'which marks it edited');
select throws_ok($$ update public.chat_messages set edited_at = null $$, '42501', null, 'the edit mark can''t be forged');
select is(tests.affected($q$ update public.chat_messages set deleted_at = now() where body = 'Hello, everyone!' $q$), 1, 'senders delete their own');
select is((select body from public.chat_messages where deleted_at is not null), '', 'which empties its text');
select throws_ok($$ update public.chat_messages set body = 'Back again' where deleted_at is not null $$, '42501', null,
  'and a deleted message stays deleted');
select is(tests.affected($q$ delete from public.chat_messages $q$), 0, 'rows are never removed');

-- Mentions ----------------------------------------------------------------------------------------------
insert into public.chat_messages (organization_id, channel_id, body)
values ('aaaaaaaa-0000-0000-0000-000000000000', tests.org_channel('aaaaaaaa-0000-0000-0000-000000000000'),
  'Thanks <@a0000000-0000-0000-0000-00000000000e> and <@b0000000-0000-0000-0000-00000000000a>');
select is((select mentions from public.chat_messages where body like 'Thanks%'), array['a0000000-0000-0000-0000-00000000000e']::uuid[],
  'mentions come from the text, and only reach the organization''s people');
select is(tests.notes('a0000000-0000-0000-0000-00000000000e', 'mention'), 1, 'a mention notifies the person mentioned');
insert into public.chat_messages (organization_id, channel_id, body)
values ('aaaaaaaa-0000-0000-0000-000000000000', tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000'),
  'Ask <@a0000000-0000-0000-0000-00000000000e> later');
select is(tests.notes('a0000000-0000-0000-0000-00000000000e', 'mention'), 1, 'but not about a channel they can''t see');

-- Muting a conversation ----------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select lives_ok(format($$ insert into public.notification_mutes (organization_id, muted_channel_id)
  values ('aaaaaaaa-0000-0000-0000-000000000000', %L) $$, tests.org_channel('aaaaaaaa-0000-0000-0000-000000000000')),
  'people mute a conversation from its header');
select throws_ok(format($$ insert into public.notification_mutes (organization_id, muted_channel_id)
  values ('aaaaaaaa-0000-0000-0000-000000000000', %L) $$, tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000')),
  '42501', null, 'but only one they can see');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
insert into public.chat_messages (organization_id, channel_id, body)
values ('aaaaaaaa-0000-0000-0000-000000000000', tests.org_channel('aaaaaaaa-0000-0000-0000-000000000000'),
  'One more for <@a0000000-0000-0000-0000-00000000000e>');
select is(tests.notes('a0000000-0000-0000-0000-00000000000e', 'mention'), 1, 'a muted conversation sends no notification, even a mention');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select results_eq(
  $$ select kind::text, muted, unread > 0 from public.my_chat_channels('aaaaaaaa-0000-0000-0000-000000000000') order by kind $$,
  $$ values ('direct', false, true), ('org', true, true) $$,
  'his list has the organization channel and his conversation, and unread counts still work while muted');

-- History starts at the original join date ------------------------------------------------------------------
reset role;
update public.project_first_joins set joined_at = now() - interval '10 days'
  where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b';
insert into public.chat_messages (organization_id, channel_id, sender_id, body, created_at)
values ('aaaaaaaa-0000-0000-0000-000000000000', tests.project_channel('aaaaaaaa-3333-0000-0000-000000000000'),
  'a0000000-0000-0000-0000-00000000000b', 'From last week', now() - interval '7 days');
insert into public.project_members (organization_id, project_id, membership_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'staff');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.chat_messages where body = 'From last week'), 0, 'someone who joins later doesn''t see what came before');
select is((select count(*)::int from public.chat_messages where body = 'Program news'), 1, 'but sees what came after');
reset role;
update public.project_first_joins set joined_at = now() - interval '8 days' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000d';
delete from public.project_members where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000d';
insert into public.project_members (organization_id, project_id, membership_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'staff');
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.chat_messages where body = 'From last week'), 1,
  'leaving and coming back keeps the original join date');

select * from finish();
rollback;
