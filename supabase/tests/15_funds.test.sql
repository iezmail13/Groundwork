-- Funds: only owners and managers see or change them (and their activity);
-- organizations never see each other's; allocations can't exceed the fund.
begin;
\ir fixtures.inc
select plan(36);

-- Org A also has Max (manager) and Ada (admin). Mia is staff.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ada@a.test', '{"full_name":"Ada Admin"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'admin');

-- Owners and managers ---------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.funds (id, organization_id, name, total_cents, project_id) values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Community grant', 1000000, 'aaaaaaaa-3333-0000-0000-000000000000') $$,
  'an owner creates a $10,000 fund for a project');
select throws_ok($$ insert into public.funds (organization_id, name, total_cents, project_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Wrong project', 100, 'bbbbbbbb-3333-0000-0000-000000000000') $$,
  '23503', null, 'a fund can''t point at another organization''s project');

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.funds), 1, 'a manager sees the fund');
select lives_ok($$ insert into public.fund_allocations (organization_id, fund_id, label, amount_cents) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'Supplies', 400000),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'Snacks', 150000) $$,
  'and splits it');
select lives_ok($$ insert into public.fund_allocations (organization_id, fund_id, label, amount_cents, project_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'Tutor stipends', 450000, 'aaaaaaaa-3333-0000-0000-000000000000') $$,
  'up to the full amount, with a part tied to a project');
select is((select sum(amount_cents)::bigint from public.fund_allocations), 1000000::bigint, 'fully allocated');
select is(tests.affected($q$ update public.fund_allocations set label = 'Books and supplies' where label = 'Supplies' $q$), 1, 'a manager edits an allocation');
select is(tests.affected($q$ update public.funds set description = 'Fall term' $q$), 1, 'and the fund');

-- Never more than the fund ----------------------------------------------------------------
select throws_ok($$ insert into public.fund_allocations (organization_id, fund_id, label, amount_cents) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'Extra', 1) $$,
  '23514', null, 'allocations can''t add up to more than the fund');
select throws_ok($$ update public.fund_allocations set amount_cents = amount_cents + 1 where label = 'Snacks' $$,
  '23514', null, 'raising an allocation past the total is refused');
select throws_ok($$ update public.funds set total_cents = 999999 $$,
  '23514', null, 'and so is lowering the total below what''s allocated');
select is(tests.affected($q$ update public.funds set total_cents = 1200000 $q$), 1, 'raising the total is fine');
select throws_ok($$ insert into public.fund_allocations (organization_id, fund_id, label, amount_cents) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'Zero', 0) $$,
  '23514', null, 'an allocation has to be more than zero');

-- Everyone else in the organization ------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.funds), 0, 'an admin sees no funds');
select is((select count(*)::int from public.fund_allocations), 0, 'or allocations');
select throws_ok($$ insert into public.funds (organization_id, name, total_cents) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Ada fund', 100) $$,
  '42501', null, 'and can''t create one');
select is(tests.affected($q$ update public.funds set name = 'Ada' $q$), 0, 'or rename one');
select is(tests.affected($q$ delete from public.fund_allocations $q$), 0, 'or remove an allocation');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.funds), 0, 'staff see no funds');
select throws_ok($$ insert into public.fund_allocations (organization_id, fund_id, label, amount_cents) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'Mia', 1) $$,
  '42501', null, 'and can''t allocate');
select is(tests.affected($q$ update public.fund_allocations set amount_cents = 1 $q$), 0, 'or change allocations');
select is(tests.affected($q$ delete from public.funds $q$), 0, 'or delete a fund');
select is((select count(*)::int from public.activity_log where entity_type = 'fund'), 0, 'or see fund activity');

-- Other organizations --------------------------------------------------------------------
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.funds), 0, 'another organization''s owner sees none of A''s funds');
select is((select count(*)::int from public.fund_allocations), 0, 'or allocations');
select throws_ok($$ insert into public.fund_allocations (organization_id, fund_id, label, amount_cents) values
  ('bbbbbbbb-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'Bob', 1) $$,
  null, null, 'can''t allocate from A''s fund');
select throws_ok($$ insert into public.fund_allocations (organization_id, fund_id, label, amount_cents) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-8888-0000-0000-000000000001', 'Bob', 1) $$,
  '42501', null, 'even naming A as the organization');
select is(tests.affected($q$ update public.funds set name = 'Bob' where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'or rename A''s fund');
select is(tests.affected($q$ delete from public.funds where organization_id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 0, 'or delete it');
select is((select count(*)::int from public.activity_log where entity_type = 'fund'), 0, 'or see its activity');
select lives_ok($$ insert into public.funds (organization_id, name, total_cents) values ('bbbbbbbb-0000-0000-0000-000000000000', 'B fund', 500) $$, 'B''s owner has funds of their own');

-- Activity and cleanup --------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select ok((select count(*)::int from public.activity_log where entity_type = 'fund') >= 5, 'managers see the fund''s history');
select is((select count(*)::int from public.funds), 1, 'and still only their own organization''s fund');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ delete from public.projects where id = 'aaaaaaaa-3333-0000-0000-000000000000' $q$), 1, 'deleting the project');
select is((select project_id from public.funds where id = 'aaaaaaaa-8888-0000-0000-000000000001'), null, 'leaves the fund, unlinked');
select is(tests.affected($q$ delete from public.funds where id = 'aaaaaaaa-8888-0000-0000-000000000001' $q$), 1, 'deleting the fund');

select * from finish();
rollback;
