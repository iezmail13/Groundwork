-- The public demo (D115): each temporary visitor gets their own private
-- sample organization; demos never see each other or real organizations, and
-- real people never see demos; a demo can't invite, upload, share or publish
-- a feed; ending or expiring a demo leaves nothing behind, not even the
-- temporary account; an expired demo is locked before the cleanup runs.
begin;
\ir fixtures.inc
select plan(29);

create function tests.as_demo(uid uuid) returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on function tests.as_demo(uuid) to authenticated;

-- rows left anywhere for an organization, across every org-scoped table
create function tests.rows_left(org uuid) returns integer
language plpgsql
security definer
as $$
declare
  t text;
  n integer := 0;
  c integer;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'organization_id' and x.table_type = 'BASE TABLE'
  loop
    execute format('select count(*) from public.%I where organization_id = $1', t) into c using org;
    n := n + c;
  end loop;
  return n + (select count(*)::int from public.organizations where id = org);
end;
$$;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at) values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()),
  -- signed in long ago and never started a demo
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now() - interval '3 hours', now());

-- Starting ----------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.start_demo() $$, '42501', null, 'real accounts don''t start demos');

select tests.as_demo('d0000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.start_demo() $$, 'a temporary visitor starts a demo');
create temp table demo_one on commit drop as select id, slug from public.organizations where demo_owner = 'd0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from demo_one), 1, 'and gets their own organization');
select is(public.start_demo(), (select slug from demo_one), 'starting again returns the same one');
select is((select role::text from public.memberships where user_id = auth.uid()), 'owner', 'they own it');
select ok((select count(*) from public.tasks) >= 10, 'it comes with sample work');
select ok((select count(*) from public.attendance) > 0 and (select count(*) from public.chat_messages) > 0,
  'and attendance and conversation');
select is((select count(*)::int from public.organizations), 1, 'they see only their demo');
select is((select count(*)::int from public.tasks where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 0,
  'and nothing of any real organization');
select ok((select demo_expires_at from public.organizations where id = (select id from demo_one)) between now() + interval '119 minutes' and now() + interval '121 minutes',
  'it lasts two hours');

select tests.as_demo('d0000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.start_demo() $$, 'a second visitor starts their own');
select is((select count(*)::int from public.organizations), 1, 'and sees only theirs');
select is((select count(*)::int from public.tasks where organization_id = (select id from demo_one)), 0, 'not the first visitor''s work');
select is(tests.affected($q$ update public.tasks set title = 'Changed by someone else' where organization_id = (select id from demo_one) $q$), 0,
  'and can''t change it');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.organizations where demo_owner is not null), 0, 'real people never see demos');

-- What a demo can't do -------------------------------------------------------------------------
select tests.as_demo('d0000000-0000-0000-0000-000000000001');
select throws_ok(format($$ insert into public.invitations (organization_id, email, role, invited_by) values (%L, 'friend@example.org', 'staff', auth.uid()) $$,
  (select id from demo_one)), '42501', null, 'a demo can''t invite anyone');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', %L, auth.uid()::text) $$,
  (select id from demo_one) || '/x-file.pdf'), '42501', null, 'or upload files');
select throws_ok(format($$ select public.create_report_share(%L, 'progress', 'Progress', '{"template":"progress","sections":[]}', %L, 7) $$,
  (select id from demo_one), repeat('a', 64)), '42501', null, 'or share a report by link');
select throws_ok($$ select public.regenerate_calendar_feed() $$, '42501', null, 'or publish a calendar feed');
select throws_ok($$ select public.create_organization('Real org', 'nonprofit') $$, '42501', null, 'or create a real organization');

-- Ending -----------------------------------------------------------------------------------------
select lives_ok($$ select public.end_demo() $$, 'the visitor ends their demo');
reset role;
select is(tests.rows_left((select id from demo_one)), 0, 'and nothing of it is left in any table');
select is((select count(*)::int from auth.users where id = 'd0000000-0000-0000-0000-000000000001'
  or raw_app_meta_data ->> 'demo_org' = (select id from demo_one)::text), 0,
  'not the temporary account or its pretend teammates either');

-- Expiring ---------------------------------------------------------------------------------------
create temp table demo_two on commit drop as select id from public.organizations where demo_owner = 'd0000000-0000-0000-0000-000000000002';
update public.organizations set demo_expires_at = now() - interval '1 second' where id = (select id from demo_two);
select tests.as_demo('d0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.tasks), 0, 'an expired demo is locked before the cleanup runs');
reset role;
select is(public.expire_demos(), 1, 'the cleanup ends expired demos');
select is(tests.rows_left((select id from demo_two)), 0, 'leaving nothing behind');
select is((select count(*)::int from auth.users where is_anonymous), 0,
  'and removes temporary accounts that never started a demo once their time is up');
select is((select count(*)::int from cron.job where jobname = 'end-expired-demos' and schedule = '* * * * *'), 1,
  'and runs every minute');

select is((select count(*)::int from information_schema.columns c
  join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
  where c.table_schema = 'public' and c.column_name = 'organization_id' and x.table_type = 'BASE TABLE'
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name
                    and p.policyname = 'demo_live' and p.permissive = 'RESTRICTIVE')), 0,
  'every organization table locks an expired demo');

select * from finish();
rollback;
