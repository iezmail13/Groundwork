-- Reports (D109): share links hold a snapshot behind a hashed token, expire
-- within 90 days and can be revoked; attendance reports are never shared;
-- costs reports are shared only by owners and managers; another organization
-- sees nothing; report activity is visible to owners and managers only.
begin;
\ir fixtures.inc
select plan(22);

-- the token is 64 hex characters; only its SHA-256 is stored
create function tests.hash(token text) returns text language sql as $$ select encode(sha256(convert_to(token, 'UTF8')), 'hex') $$;

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok(format($$ insert into public.report_shares (id, organization_id, template, title, snapshot, token_hash, expires_at)
  values ('aaaaaaaa-9999-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'progress', 'October progress',
  '{"sections":[]}', %L, now() + interval '30 days') $$, tests.hash(repeat('a', 64))), 'anyone shares a report they can generate');
select throws_ok(format($$ insert into public.report_shares (organization_id, template, title, snapshot, token_hash, expires_at)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'attendance', 'Roster', '{}', %L, now() + interval '7 days') $$, tests.hash(repeat('b', 64))),
  '23514', null, 'attendance reports are never shared by link');
select throws_ok(format($$ insert into public.report_shares (organization_id, template, title, snapshot, token_hash, expires_at)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'costs', 'Costs', '{}', %L, now() + interval '7 days') $$, tests.hash(repeat('c', 64))),
  '42501', null, 'staff can''t share a costs report');
select throws_ok(format($$ insert into public.report_shares (organization_id, template, title, snapshot, token_hash, expires_at)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'progress', 'Forever', '{}', %L, now() + interval '1 year') $$, tests.hash(repeat('d', 64))),
  '23514', null, 'links last at most 90 days');
select throws_ok(format($$ insert into public.report_shares (organization_id, template, title, snapshot, token_hash, expires_at, created_by)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'progress', 'Not mine', '{}', %L, now() + interval '7 days', 'a0000000-0000-0000-0000-00000000000a') $$,
  tests.hash(repeat('e', 64))), '42501', null, 'nobody shares in someone else''s name');
select is((select count(*)::int from public.report_shares), 1, 'people see their own links');
select throws_ok($$ update public.report_shares set title = 'Changed' $$, '42501', null, 'a shared snapshot can''t be edited');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.report_shares), 1, 'owners see every link');
select lives_ok(format($$ insert into public.report_shares (organization_id, template, title, snapshot, token_hash, expires_at)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'costs', 'Costs', '{}', %L, now() + interval '7 days') $$, tests.hash(repeat('f', 64))),
  'owners share costs reports');

-- opening a link
select tests.as_anon();
select is((select title from public.shared_report(repeat('a', 64))), 'October progress', 'anyone with the token opens the snapshot');
select is((select shared_by from public.shared_report(repeat('a', 64))), 'Mia Member', 'and sees who shared it');
select is((select count(*)::int from public.shared_report(repeat('z', 64))), 0, 'a wrong token opens nothing');
select is((select count(*)::int from public.shared_report('')), 0, 'nor an empty one');
select throws_ok($$ select * from public.report_shares $$, '42501', null, 'and nobody signed out can list links');

-- revoking
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.report_shares), 0, 'another organization sees no links');
select is(tests.affected($q$ update public.report_shares set revoked_at = now() $q$), 0, 'and can''t revoke them');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.report_shares set revoked_at = now() where id = 'aaaaaaaa-9999-0000-0000-000000000001' $q$), 1,
  'the creator revokes their link');
select tests.as_anon();
select is((select count(*)::int from public.shared_report(repeat('a', 64))), 0, 'and it stops working at once');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ delete from public.report_shares $q$), 0, 'links are revoked, never deleted');

-- activity
select lives_ok($$ select public.log_report('aaaaaaaa-0000-0000-0000-000000000000', 'generated', '{"template":"progress"}') $$,
  'generating a report is recorded');
select is((select count(*)::int from public.activity_log where entity_type = 'report'), 0, 'which staff can''t read');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.activity_log where entity_type = 'report'), 1, 'but owners can');

select * from finish();
rollback;
