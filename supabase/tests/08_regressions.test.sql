-- Regressions found in the production-readiness review.
begin;
\ir fixtures.inc
select plan(12);

-- Long org names whose 40th slug character is a separator --------------------
select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is(
  (select slug from public.create_organization('The Northside Youth and Family Services Association', 'nonprofit')),
  'the-northside-youth-and-family-services',
  'a long name never produces a slug ending in a hyphen'
);
select is(
  (select slug from public.create_organization('The Northside Youth and Family Services Association', 'nonprofit')),
  'the-northside-youth-and-family-services-2',
  'a colliding long name gets a valid numbered slug'
);

-- Deleting an account that created things --------------------------------------
reset role;
-- Mia (a member of A) creates one of everything; she also invited someone.
insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-0000000000ee', 'aaaaaaaa-0000-0000-0000-000000000000', 'Mia project', 'a0000000-0000-0000-0000-00000000000b');
insert into public.tasks (id, organization_id, project_id, title, created_by) values
  ('aaaaaaaa-4444-0000-0000-0000000000ee', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia task', 'a0000000-0000-0000-0000-00000000000b');
insert into public.events (id, organization_id, title, starts_at, ends_at, created_by) values
  ('aaaaaaaa-5555-0000-0000-0000000000ee', 'aaaaaaaa-0000-0000-0000-000000000000', 'Mia event', now(), now(), 'a0000000-0000-0000-0000-00000000000b');
insert into public.documents (id, organization_id, name, storage_path, mime_type, size_bytes, uploaded_by) values
  ('aaaaaaaa-6666-0000-0000-0000000000ee', 'aaaaaaaa-0000-0000-0000-000000000000', 'mia.txt', 'aaaaaaaa-0000-0000-0000-000000000000/9-mia.txt', 'text/plain', 1, 'a0000000-0000-0000-0000-00000000000b');
insert into public.invitations (organization_id, email, token, invited_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'friend@a.test', 'token-mia', 'a0000000-0000-0000-0000-00000000000b');

-- a client still can't clear authorship itself
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ update public.projects set created_by = null where id = 'aaaaaaaa-3333-0000-0000-0000000000ee' $$, '42501', null, 'clients cannot null created_by directly');
select throws_ok($$ update public.documents set uploaded_by = null where id = 'aaaaaaaa-6666-0000-0000-0000000000ee' $$, '42501', null, 'clients cannot null uploaded_by directly');

reset role;
select is((select count(*)::int from public.activity_log where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' and action = 'updated'), 0, 'no edits logged before the deletion');
select lives_ok($$ delete from auth.users where id = 'a0000000-0000-0000-0000-00000000000b' $$, 'an account that created things can be deleted');
select is((select created_by from public.projects where id = 'aaaaaaaa-3333-0000-0000-0000000000ee'), null, 'their projects stay, unattributed');
select is((select created_by from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000ee'), null, 'their tasks stay, unattributed');
select is((select uploaded_by from public.documents where id = 'aaaaaaaa-6666-0000-0000-0000000000ee'), null, 'their documents stay, unattributed');
select is((select invited_by from public.invitations where token = 'token-mia'), null, 'their invitations stay, unattributed');
select is((select count(*)::int from public.activity_log where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' and action = 'updated'), 0, 'the cascade is not logged as edits');

-- ...but the last admin of an organization still can't be deleted
select throws_ok($$ delete from auth.users where id = 'a0000000-0000-0000-0000-00000000000a' $$, 'P0001', 'An organization must keep at least one admin', 'deleting the only admin of an organization is refused');

select * from finish();
rollback;
