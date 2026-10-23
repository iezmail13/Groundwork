-- Shared fixtures for the pgTAP suite, included with \ir from each test file.
set client_min_messages = warning;
-- Everything happens inside the test's transaction and is rolled back.
--
-- Organization A: alice (owner), mia (staff)
-- Organization B: bob (owner), bea (staff)
-- oscar: signed up, belongs to no organization

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.email_of(uid uuid) returns text
language sql
security definer
as $$ select email from auth.users where id = uid $$;

create or replace function tests.as_user(uid uuid) returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'email', tests.email_of(uid))::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.as_anon() returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Runs a statement as the current role and returns how many rows it touched.
create or replace function tests.affected(statement text) returns int
language plpgsql
as $$
declare
  n int;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;

-- every fixture user has confirmed their email, as a real sign-in does
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@a.test', '{"full_name":"Alice Admin"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mia@a.test', '{"full_name":"Mia Member"}', now(), now(), now()),
  ('b0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@b.test', '{"full_name":"Bob Admin"}', now(), now(), now()),
  ('b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bea@b.test', '{"full_name":"Bea Member"}', now(), now(), now()),
  ('c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oscar@c.test', '{"full_name":"Oscar Outsider"}', now(), now(), now());

insert into public.organizations (id, name, slug, preset_key) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a', 'nonprofit'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b', 'business');

insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-1111-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000b', 'staff'),
  ('bbbbbbbb-1111-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000a', 'owner'),
  ('bbbbbbbb-1111-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'staff');

insert into public.invitations (id, organization_id, email, role, token, invited_by) values
  ('aaaaaaaa-2222-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'newbie@a.test', 'staff', 'token-a', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-2222-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'oscar@c.test', 'staff', 'token-b', 'b0000000-0000-0000-0000-00000000000a');

insert into public.projects (id, organization_id, name, created_by) values
  ('aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'A project', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-3333-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'B project', 'b0000000-0000-0000-0000-00000000000a');

-- mia and bea are on their organization's project; alice and bob own theirs
-- (the creator trigger adds them as lead)
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000b', 'staff'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-00000000000b', 'staff');

insert into public.tasks (id, organization_id, project_id, title, created_by) values
  ('aaaaaaaa-4444-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'A task', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-4444-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000', 'B task', 'b0000000-0000-0000-0000-00000000000a');

insert into public.events (id, organization_id, title, starts_at, ends_at, created_by) values
  ('aaaaaaaa-5555-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'A event', now(), now() + interval '1 hour', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-5555-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'B event', now(), now() + interval '1 hour', 'b0000000-0000-0000-0000-00000000000a');

insert into public.documents (id, organization_id, name, storage_path, mime_type, size_bytes, tags, uploaded_by) values
  ('aaaaaaaa-6666-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'a-plan.pdf', 'aaaaaaaa-0000-0000-0000-000000000000/1-a-plan.pdf', 'application/pdf', 10, '{plans}', 'a0000000-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-6666-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'b-plan.pdf', 'bbbbbbbb-0000-0000-0000-000000000000/1-b-plan.pdf', 'application/pdf', 10, '{plans}', 'b0000000-0000-0000-0000-00000000000a');

insert into public.dashboard_layouts (id, organization_id, membership_id, layout) values
  ('aaaaaaaa-7777-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000a', '{"widgets":[]}'),
  ('aaaaaaaa-7777-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000b', '{"widgets":[]}'),
  ('bbbbbbbb-7777-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-00000000000a', '{"widgets":[]}');

insert into storage.objects (bucket_id, name, owner_id) values
  ('documents', 'aaaaaaaa-0000-0000-0000-000000000000/1-a-plan.pdf', 'a0000000-0000-0000-0000-00000000000a'),
  ('documents', 'bbbbbbbb-0000-0000-0000-000000000000/1-b-plan.pdf', 'b0000000-0000-0000-0000-00000000000a');
