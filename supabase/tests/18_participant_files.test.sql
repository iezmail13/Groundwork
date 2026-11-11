-- Participant files (D56, D102): only the people who see a participant see
-- their files; uploads and deletions belong to the file's program; every
-- upload, view, download and deletion is recorded, and only owners and the
-- program's leads read that record; storage serves a file only after a view
-- or download is recorded; organizations never see each other's.
begin;
\ir fixtures.inc
select plan(43);

-- storage blocks raw SQL deletes unless this is set; the policies still apply
select set_config('storage.allow_delete_query', 'true', true);

-- Org A also has Ada (admin, project admin on A's program) and Max (manager,
-- the program's lead). Mia is project staff there. Both programs track
-- participants.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000c', 'lead'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin');
update public.projects set tracks_participants = true
where id in ('aaaaaaaa-3333-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000');
insert into public.participants (id, organization_id, name) values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Pat Participant'),
  ('bbbbbbbb-8888-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Bo Participant');
insert into public.participant_programs (organization_id, participant_id, project_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-8888-0000-0000-000000000001', 'bbbbbbbb-3333-0000-0000-000000000000');
-- B already has a file on Bo
insert into storage.objects (bucket_id, name, owner_id) values
  ('participant-files', 'bbbbbbbb-0000-0000-0000-000000000000/bbbbbbbb-3333-0000-0000-000000000000/bbbbbbbb-8888-0000-0000-000000000001/11111111-1111-4111-8111-111111111111', 'b0000000-0000-0000-0000-00000000000a');
insert into public.participant_files (id, organization_id, participant_id, project_id, kind, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('bbbbbbbb-9999-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-8888-0000-0000-000000000001', 'bbbbbbbb-3333-0000-0000-000000000000', 'waiver', 'Bo waiver.pdf',
   'bbbbbbbb-0000-0000-0000-000000000000/bbbbbbbb-3333-0000-0000-000000000000/bbbbbbbb-8888-0000-0000-000000000001/11111111-1111-4111-8111-111111111111', 'application/pdf', 10, 'b0000000-0000-0000-0000-00000000000a');

select is((select file_size_limit from storage.buckets where id = 'participant-files'), 26214400::bigint, 'the bucket allows 25 MB');
select is((select public from storage.buckets where id = 'participant-files'), false, 'the bucket is private');
select is(
  (select allowed_mime_types from storage.buckets where id = 'participant-files'),
  (select allowed_mime_types from storage.buckets where id = 'documents'),
  'it allows the same file types as documents'
);

-- Uploading --------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('participant-files',
  'aaaaaaaa-0000-0000-0000-000000000000/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/22222222-2222-4222-8222-222222222222', 'a0000000-0000-0000-0000-00000000000d') $$,
  'a project admin uploads into their program''s folder for an enrolled participant');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('participant-files',
  'aaaaaaaa-0000-0000-0000-000000000000/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/waiver.pdf', 'a0000000-0000-0000-0000-00000000000d') $$,
  '42501', null, 'paths must end in a generated id, never a file name');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('participant-files',
  'aaaaaaaa-0000-0000-0000-000000000000/bbbbbbbb-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/33333333-3333-4333-8333-333333333333', 'a0000000-0000-0000-0000-00000000000d') $$,
  '42501', null, 'a program from another organization can''t be named in the path');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('participant-files',
  'not-a-uuid/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/33333333-3333-4333-8333-333333333333', 'a0000000-0000-0000-0000-00000000000d') $$,
  '42501', null, 'malformed paths are rejected');
select lives_ok($$ insert into public.participant_files (id, organization_id, participant_id, project_id, kind, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('aaaaaaaa-9999-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000', 'medical', 'Pat medical form.pdf',
   'aaaaaaaa-0000-0000-0000-000000000000/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/22222222-2222-4222-8222-222222222222', 'application/pdf', 1234, 'a0000000-0000-0000-0000-00000000000d') $$,
  'and records it as a file');
select is((select count(*)::int from public.participant_files), 1, 'a project admin sees their program''s participant files, and not another organization''s');
select is((select count(*)::int from public.participant_file_events), 0, 'a project admin can''t read the access record');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'participant-files'),
  0,
  'once recorded, even the uploader can''t read the stored file without recording a view'
);
select throws_ok($$ insert into public.participant_file_events (organization_id, file_id, storage_path, file_kind, action) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-9999-0000-0000-000000000001', 'x', 'other', 'viewed') $$,
  '42501', null, 'nobody writes the access record directly');
select is(tests.affected($q$ update public.participant_files set name = 'Renamed' $q$), 0, 'files are never edited');

-- Opening ----------------------------------------------------------------------------------
select is((select name from public.open_participant_file('aaaaaaaa-9999-0000-0000-000000000001', true)), 'Pat medical form.pdf', 'opening a file hands back what''s needed to sign a link');
select is((select count(*)::int from storage.objects where bucket_id = 'participant-files'), 1, 'and only then does storage serve it');
select is((select count(*)::int from public.open_participant_file('bbbbbbbb-9999-0000-0000-000000000001', true)), 0, 'another organization''s file can''t be opened');

-- Project staff and other organizations ----------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.participant_files), 0, 'project staff see no participant files');
select is((select count(*)::int from public.open_participant_file('aaaaaaaa-9999-0000-0000-000000000001', false)), 0, 'and can''t open one');
select is((select count(*)::int from storage.objects where bucket_id = 'participant-files'), 0, 'or read one from storage');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('participant-files',
  'aaaaaaaa-0000-0000-0000-000000000000/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/44444444-4444-4444-8444-444444444444', 'a0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'or upload one');
select throws_ok($$ insert into public.participant_files (organization_id, participant_id, project_id, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sneaky.pdf',
   'aaaaaaaa-0000-0000-0000-000000000000/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/44444444-4444-4444-8444-444444444444', 'application/pdf', 1, 'a0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'or record one');
select is(tests.affected($q$ delete from public.participant_files $q$), 0, 'or delete one');
select is((select count(*)::int from public.participant_file_events), 0, 'or read the access record');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.participant_files where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'another organization''s owner sees none of them');
select is((select count(*)::int from public.participant_file_events where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'nor their access record');
select is((select count(*)::int from storage.objects where bucket_id = 'participant-files' and name like 'aaaaaaaa%'), 0, 'nor the stored files');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('participant-files',
  'aaaaaaaa-0000-0000-0000-000000000000/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/55555555-5555-4555-8555-555555555555', 'b0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'and can''t upload into them');
select is(tests.affected($q$ delete from public.participant_files where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'or delete them');

select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.participant_files), 0, 'someone in no organization sees nothing');

-- The access record: owners and the program's leads ---------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(
  (select array_agg(action::text order by id) from public.participant_file_events),
  array['uploaded', 'downloaded'],
  'the program''s lead reads every upload and download'
);
select is(
  (select actor_name from public.participant_file_events where action = 'downloaded'),
  'Ada Admin',
  'with who did it'
);
select is((select count(*)::int from storage.objects where bucket_id = 'participant-files'), 0, 'reading the record doesn''t open the file');
select is(tests.affected($q$ delete from public.participant_file_events $q$), 0, 'and nobody can erase it');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.participant_file_events), 2, 'owners read it too');
select is(tests.affected($q$ update public.participant_file_events set actor_name = 'Someone' $q$), 0, 'and can''t change it');

-- Deleting ---------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is(tests.affected($q$ delete from public.participant_files where id = 'aaaaaaaa-9999-0000-0000-000000000001' $q$), 1, 'a program admin deletes a file');
select is(
  tests.affected($q$ delete from storage.objects where bucket_id = 'participant-files' and name like 'aaaaaaaa%' $q$),
  1,
  'and, having just recorded it, removes the stored copy'
);

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(
  (select array_agg(action::text order by id) from public.participant_file_events),
  array['uploaded', 'downloaded', 'deleted'],
  'the deletion is recorded'
);

-- Deleting a participant (a privacy request) ------------------------------------------------
reset role;
insert into storage.objects (bucket_id, name, owner_id) values
  ('participant-files', 'aaaaaaaa-0000-0000-0000-000000000000/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/66666666-6666-4666-8666-666666666666', 'a0000000-0000-0000-0000-00000000000d');
insert into public.participant_files (id, organization_id, participant_id, project_id, kind, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('aaaaaaaa-9999-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000', 'consent', 'Pat consent.pdf',
   'aaaaaaaa-0000-0000-0000-000000000000/aaaaaaaa-3333-0000-0000-000000000000/aaaaaaaa-8888-0000-0000-000000000001/66666666-6666-4666-8666-666666666666', 'application/pdf', 1, 'a0000000-0000-0000-0000-00000000000d');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ delete from public.participants where id = 'aaaaaaaa-8888-0000-0000-000000000001' $q$), 1, 'a manager on the program deletes the participant');
select is(
  tests.affected($q$ delete from storage.objects where bucket_id = 'participant-files' and name like 'aaaaaaaa%' $q$),
  1,
  'and removes their stored files'
);
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.participant_files where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0, 'their files are gone');
select is(
  (select count(*)::int from public.participant_file_events where file_name is not null or participant_id is not null),
  0,
  'and the access record no longer names them or their files'
);
select is((select count(*)::int from public.participant_file_events where action = 'deleted'), 2, 'though it still shows the deletions');

select * from finish();
rollback;
