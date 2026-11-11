-- Member profiles and online status (D104): people edit only their own
-- profile and photo; photos are visible only inside their organization; a
-- profile's lists follow the viewer's own access, so two viewers of different
-- rank see different work on the same profile; muting a person and Do not
-- disturb both stop notifications; presence channels admit only members.
begin;
\ir fixtures.inc
select plan(31);

select set_config('storage.allow_delete_query', 'true', true);

-- Org A also has Max (manager, leads A's program), Ada (admin, project admin
-- there) and Sam (staff, on no program). Q is a second program only Ada is on.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000000', 'Q project', 'a0000000-0000-0000-0000-00000000000a');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000c', 'lead'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000f1', 'aaaaaaaa-1111-0000-0000-00000000000b', 'staff');
insert into public.tasks (id, organization_id, project_id, title, created_by, kind, hidden) values
  ('aaaaaaaa-4444-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia on P', 'a0000000-0000-0000-0000-00000000000a', 'appointed', false),
  ('aaaaaaaa-4444-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-0000000000f1', 'Mia on Q', 'a0000000-0000-0000-0000-00000000000a', 'appointed', false),
  ('aaaaaaaa-4444-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia, hidden', 'a0000000-0000-0000-0000-00000000000a', 'appointed', true),
  ('aaaaaaaa-4444-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'More for Mia', 'a0000000-0000-0000-0000-00000000000a', 'appointed', false),
  ('aaaaaaaa-4444-0000-0000-0000000000a5', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Even more for Mia', 'a0000000-0000-0000-0000-00000000000a', 'appointed', false);
insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000a1', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000a2', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed', 'a0000000-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000a3', 'aaaaaaaa-1111-0000-0000-00000000000b', 'appointed', 'a0000000-0000-0000-0000-00000000000a');
delete from public.notifications;

-- Editing your own profile -------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.profiles set title = 'Volunteer coordinator', bio = 'Tuesdays and Thursdays.' where id = auth.uid() $q$), 1, 'people edit their own title and bio');
select is(tests.affected($q$ update public.profiles set title = 'Hacked' where id = 'a0000000-0000-0000-0000-00000000000a' $q$), 0, 'but nobody else''s');
select throws_ok($$ update public.profiles set email = 'new@a.test' where id = auth.uid() $$, '42501', null, 'their email comes from sign-in and can''t be edited');
select throws_ok($$ update public.memberships set photo_path = null where user_id = auth.uid() $$, '42501', null, 'photos are set only through set_my_photo()');
select is(tests.affected($q$ update public.profiles set presence_mode = 'dnd' where id = auth.uid() $q$), 1, 'people set their own Do not disturb');
select is(tests.affected($q$ update public.profiles set presence_mode = 'auto' where id = auth.uid() $q$), 1, 'and turn it off');

-- Photos -------------------------------------------------------------------------------------------
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('profile-photos',
  'aaaaaaaa-0000-0000-0000-000000000000/profiles/a0000000-0000-0000-0000-00000000000b/11111111-1111-4111-8111-111111111111.png', 'a0000000-0000-0000-0000-00000000000b') $$,
  'people upload a photo into their own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('profile-photos',
  'aaaaaaaa-0000-0000-0000-000000000000/profiles/a0000000-0000-0000-0000-00000000000a/22222222-2222-4222-8222-222222222222.png', 'a0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'but not into someone else''s');
select throws_ok($$ select public.set_my_photo('aaaaaaaa-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000000/profiles/a0000000-0000-0000-0000-00000000000b/33333333-3333-4333-8333-333333333333.png') $$,
  'P0001', null, 'a photo must be uploaded before it''s set');
select is(public.set_my_photo('aaaaaaaa-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000000/profiles/a0000000-0000-0000-0000-00000000000b/11111111-1111-4111-8111-111111111111.png'),
  null, 'setting the first photo replaces nothing');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('profile-photos',
  'aaaaaaaa-0000-0000-0000-000000000000/profiles/a0000000-0000-0000-0000-00000000000b/44444444-4444-4444-8444-444444444444.webp', 'a0000000-0000-0000-0000-00000000000b') $$,
  'uploading a new one');
select is(public.set_my_photo('aaaaaaaa-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-000000000000/profiles/a0000000-0000-0000-0000-00000000000b/44444444-4444-4444-8444-444444444444.webp'),
  'aaaaaaaa-0000-0000-0000-000000000000/profiles/a0000000-0000-0000-0000-00000000000b/11111111-1111-4111-8111-111111111111.png',
  'replacing a photo hands back the old one to delete');
select is(tests.affected($q$ delete from storage.objects where bucket_id = 'profile-photos' and name like '%/11111111-%' $q$), 1, 'and its owner deletes it');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos'), 1, 'colleagues in the organization see the photo');
select is(tests.affected($q$ delete from storage.objects where bucket_id = 'profile-photos' $q$), 0, 'but can''t remove it');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos'), 0, 'another organization can''t see it');
select throws_ok($$ select public.set_my_photo('aaaaaaaa-0000-0000-0000-000000000000', null) $$, '42501', null, 'or set photos there');

-- A profile's work follows the viewer --------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(
  (select array_agg(t.title order by t.title) from public.task_assignees a join public.tasks t on t.id = a.task_id where a.membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b'),
  array['Mia on P', 'Mia, hidden'],
  'the program''s lead sees Mia''s work on their program, hidden included, but not on a program they''re off'
);
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(
  (select count(*)::int from public.task_assignees a where a.membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b'),
  0,
  'a colleague on neither program sees none of it on the same profile'
);
select is(
  (select count(*)::int from public.project_members pm where pm.membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b'),
  0,
  'nor which programs she''s on'
);
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.task_assignees a where a.membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b'),
  3,
  'an owner sees all of it'
);

-- Muting a person, and Do not disturb ----------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.notification_mutes (organization_id, muted_user_id) values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c') $$,
  'muting a colleague');
select throws_ok($$ insert into public.notification_mutes (organization_id, muted_user_id) values ('aaaaaaaa-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'only people in the organization can be muted');
select throws_ok($$ insert into public.notification_mutes (organization_id, muted_user_id) values ('aaaaaaaa-0000-0000-0000-000000000000', auth.uid()) $$,
  '23514', null, 'and not yourself');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select public.appoint_to_task('aaaaaaaa-4444-0000-0000-0000000000a4', 'aaaaaaaa-1111-0000-0000-00000000000b');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.notifications), 0, 'a muted person''s actions don''t notify');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
update public.profiles set presence_mode = 'dnd' where id = auth.uid();
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select public.appoint_to_task('aaaaaaaa-4444-0000-0000-0000000000a5', 'aaaaaaaa-1111-0000-0000-00000000000b');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.notifications), 0, 'Do not disturb mutes everything');
update public.profiles set presence_mode = 'auto' where id = auth.uid();
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select public.remove_task_assignee('aaaaaaaa-4444-0000-0000-0000000000a5', 'aaaaaaaa-1111-0000-0000-00000000000b');
select public.appoint_to_task('aaaaaaaa-4444-0000-0000-0000000000a5', 'aaaaaaaa-1111-0000-0000-00000000000b');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.notifications where actor_id = 'a0000000-0000-0000-0000-00000000000a'), 1, 'while someone not muted still notifies once it''s off');

-- Presence channels ------------------------------------------------------------------------------------
select ok(public.can_use_realtime_topic('org:aaaaaaaa-0000-0000-0000-000000000000:presence'), 'members join their organization''s presence channel');
select ok(not public.can_use_realtime_topic('org:bbbbbbbb-0000-0000-0000-000000000000:presence'), 'not another organization''s');
select ok(not public.can_use_realtime_topic('org:not-a-uuid:presence') and not public.can_use_realtime_topic('anything'), 'and nothing else');
select tests.as_anon();
select throws_ok($$ select public.can_use_realtime_topic('org:aaaaaaaa-0000-0000-0000-000000000000:presence') $$, '42501', null, 'signed-out visitors can''t use presence at all');

select * from finish();
rollback;
