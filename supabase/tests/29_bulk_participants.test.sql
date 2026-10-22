-- Adding several participants at once (D112): the same rules as adding one
-- (program admins and leads, and owners, on programs that track participants,
-- not archived), all or nothing, and never into another organization.
begin;
\ir fixtures.inc
select plan(11);

-- Ada is an admin and project admin on A's program; Mia is project staff there
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000d', 'admin');
update public.projects set tracks_participants = true
where id in ('aaaaaaaa-3333-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000');

select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is(cardinality(public.add_participants('aaaaaaaa-3333-0000-0000-000000000000', $j$[
  {"name": " Ana Lima ", "email": "ANA@Example.org", "phone": "555-0101", "guardianName": "Rosa Lima", "emergencyContact": "Rosa 555-0102"},
  {"name": "Ben Okafor"},
  {"name": "Cy Tran", "email": ""}
]$j$)), 3, 'a program admin adds three people at once');
select is((select count(*)::int from public.participant_programs where project_id = 'aaaaaaaa-3333-0000-0000-000000000000'), 3, 'all enrolled in the program');
select is((select row(email, phone, guardian_name, emergency_contact)::text from public.participants where name = 'Ana Lima'),
  '(ana@example.org,555-0101,"Rosa Lima","Rosa 555-0102")', 'with their details, trimmed and the email lower-cased');
select is((select email from public.participants where name = 'Cy Tran'), null, 'empty details are left empty');

select throws_ok($$ select public.add_participants('aaaaaaaa-3333-0000-0000-000000000000', '[{"name": "Dee"}, {"name": ""}]') $$,
  '23514', null, 'one bad row stops them all');
select is((select count(*)::int from public.participants where name = 'Dee'), 0, 'so nobody from that batch was added');
select throws_ok($$ select public.add_participants('aaaaaaaa-3333-0000-0000-000000000000', '[]') $$, '22023', null, 'an empty list is refused');

-- staff on the program, and another organization, can't
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.add_participants('aaaaaaaa-3333-0000-0000-000000000000', '[{"name": "Eve"}]') $$, '42501', null, 'project staff can''t add people');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.add_participants('aaaaaaaa-3333-0000-0000-000000000000', '[{"name": "Sneaky"}]') $$, '42501', null, 'another organization''s owner can''t either');
select is((select count(*)::int from public.participants where name = 'Ana Lima'), 0, 'nor see who was added');
select is(cardinality(public.add_participants('bbbbbbbb-3333-0000-0000-000000000000', '[{"name": "Bo"}, {"name": "Bree"}]')), 2, 'but adds to their own program');

select * from finish();
rollback;
