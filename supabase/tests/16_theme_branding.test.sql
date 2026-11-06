-- Theme and branding: people change only their own theme and accent; only
-- owners and managers change an organization's branding, and only owners
-- switch personal accents off; logos stay in the organization's own
-- branding folder; branding changes are logged for the whole organization.
begin;
\ir fixtures.inc
select plan(35);

select set_config('storage.allow_delete_query', 'true', true);

-- Org A also has Max (manager).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager');

-- People's own settings -------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.profiles set theme_mode = 'dark', accent = '#0F766E' where id = auth.uid() $q$), 1,
  'staff set their own theme and accent');
select is((select theme_mode from public.profiles where id = auth.uid()), 'dark', 'the theme is saved');
select is(tests.affected($q$ update public.profiles set theme_mode = 'light' where id = 'a0000000-0000-0000-0000-00000000000a' $q$), 0,
  'nobody changes someone else''s theme');
select throws_ok($$ update public.profiles set theme_mode = 'sepia' where id = auth.uid() $$, '23514', null, 'only light, dark or system');
select throws_ok($$ update public.profiles set accent = '#0f766e' where id = auth.uid() $$, '23514', null, 'accents are stored as upper-case hex');
select throws_ok($$ update public.profiles set accent = 'red' where id = auth.uid() $$, '23514', null, 'accents must be hex colours');
select is((select theme_mode from public.profiles where id = 'a0000000-0000-0000-0000-00000000000b'), 'dark', 'refused changes leave it as it was');

reset role;
select is((select theme_mode from public.profiles where id = 'c0000000-0000-0000-0000-00000000000c'), 'system', 'new people follow the system setting');

-- Organization branding -------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.organizations set accent = '#BE185D' $q$), 0, 'staff can''t change the org accent');
select is(tests.affected($q$ update public.organizations set logo_path = 'aaaaaaaa-0000-0000-0000-000000000000/branding/x.png' $q$), 0,
  'or the logo');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.organizations set accent = '#BE185D' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0,
  'another org''s owner can''t change Org A''s branding');

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is(tests.affected($q$ update public.organizations set accent = '#0F766E', show_illustrations = false where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 1,
  'a manager sets the accent and hides the illustrations');
select throws_ok($$ update public.organizations set allow_personal_accent = false where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$,
  '42501', null, 'a manager can''t switch personal accents off');
select throws_ok($$ update public.organizations set logo_path = 'bbbbbbbb-0000-0000-0000-000000000000/branding/x.png' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$,
  '23514', null, 'a logo must be in the organization''s own folder');
select throws_ok($$ update public.organizations set logo_path = 'aaaaaaaa-0000-0000-0000-000000000000/1-plan.pdf' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$,
  '23514', null, 'and in its branding folder');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ update public.organizations set allow_personal_accent = false, logo_path = 'aaaaaaaa-0000-0000-0000-000000000000/branding/logo.png' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 1,
  'an owner switches personal accents off and sets a logo');
select is(tests.affected($q$ update public.organizations set logo_path = null where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 1,
  'and removes it');

-- Activity --------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(
  (select array_agg(action order by action) from public.activity_log where entity_type = 'organization'),
  array['blocked_personal_accents', 'changed_accent', 'hid_illustrations', 'removed_logo', 'uploaded_logo'],
  'every branding change is in the log, and staff can read it');
select is(
  (select metadata ->> 'to' from public.activity_log where action = 'changed_accent'),
  '#0F766E', 'the new accent is recorded');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.activity_log where entity_type = 'organization'), 0, 'other organizations see none of it');

-- Branding storage ------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('branding', 'aaaaaaaa-0000-0000-0000-000000000000/branding/s.png', 'a0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'staff can''t upload a logo');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('branding', 'aaaaaaaa-0000-0000-0000-000000000000/branding/b.png', 'b0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'another org''s owner can''t upload into Org A');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('branding', 'aaaaaaaa-0000-0000-0000-000000000000/other/a.png', 'a0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'logos go in the branding folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('branding', 'not-a-uuid/branding/a.png', 'a0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'and under an organization');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('branding', 'aaaaaaaa-0000-0000-0000-000000000000/branding/a.png', 'a0000000-0000-0000-0000-00000000000a') $$,
  'an owner uploads a logo');

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('branding', 'aaaaaaaa-0000-0000-0000-000000000000/branding/m.png', 'a0000000-0000-0000-0000-00000000000c') $$,
  'so does a manager');
select is(tests.affected($q$ update storage.objects set metadata = '{"x":1}' where bucket_id = 'branding' and name like '%/a.png' $q$), 1,
  'a manager updates a logo file');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name, owner_id) values ('branding', 'bbbbbbbb-0000-0000-0000-000000000000/branding/b.png', 'b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from storage.objects where bucket_id = 'branding'), 1, 'Org B sees only its own logo');
select is(tests.affected($q$ update storage.objects set metadata = '{"x":1}' where bucket_id = 'branding' and name like 'aaaaaaaa%' $q$), 0,
  'and can''t change Org A''s');
select is(tests.affected($q$ delete from storage.objects where bucket_id = 'branding' and name like 'aaaaaaaa%' $q$), 0,
  'or delete them');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from storage.objects where bucket_id = 'branding'), 2, 'staff can see their organization''s logos');
select is(tests.affected($q$ update storage.objects set metadata = '{"x":1}' where bucket_id = 'branding' $q$), 0, 'but not change them');
select is(tests.affected($q$ delete from storage.objects where bucket_id = 'branding' $q$), 0, 'or delete them');

select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from storage.objects where bucket_id = 'branding'), 0, 'outsiders see no logos');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ delete from storage.objects where bucket_id = 'branding' $q$), 2, 'an owner deletes their logos');

select * from finish();
rollback;
