-- Finance (D108): anyone on a program submits spending for it and sees only
-- their own; owners and managers see everything and decide; nobody decides
-- on their own entry and the approver ranks above the submitter; another
-- organization sees nothing; receipts are private.
begin;
\ir fixtures.inc
select plan(38);

select set_config('storage.allow_delete_query', 'true', true);

-- Org A also has Max (manager) and Sam (staff, not on the program).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@a.test', '{"full_name":"Max Manager"}', now(), now(), now()),
  ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'manager'),
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000c', 'staff');
insert into public.funds (id, organization_id, name, total_cents, project_id, spend_by) values
  ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Program grant', 500000, 'aaaaaaaa-3333-0000-0000-000000000000', current_date + 60),
  ('aaaaaaaa-7777-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Other fund', 100000, null, null);

-- Submitting ---------------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select results_eq($$ select name from public.spendable_funds('aaaaaaaa-3333-0000-0000-000000000000') $$, $$ values ('Program grant') $$,
  'people on a program see the names of the funds that pay for it');
select is((select count(*)::int from public.funds), 0, 'but never the funds themselves, or their amounts');
select lives_ok($$ insert into public.spending_entries (id, organization_id, fund_id, project_id, amount_cents, category, spent_on)
  values ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-000000000001',
  'aaaaaaaa-3333-0000-0000-000000000000', 4250, 'Supplies', current_date) $$, 'someone on the program submits spending for it');
select throws_ok($$ insert into public.spending_entries (organization_id, fund_id, project_id, amount_cents, category, spent_on)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-000000000002', 'aaaaaaaa-3333-0000-0000-000000000000', 100, 'Snacks', current_date) $$,
  '42501', null, 'but only against a fund that pays for it');
select throws_ok($$ insert into public.spending_entries (organization_id, fund_id, project_id, amount_cents, category, spent_on, status)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000', 100, 'Snacks', current_date, 'approved') $$,
  '42501', null, 'and it starts pending');
select throws_ok($$ insert into public.spending_entries (organization_id, fund_id, project_id, amount_cents, category, spent_on)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000', 0, 'Nothing', current_date) $$,
  '23514', null, 'for an amount above zero');
select is(tests.affected($q$ update public.spending_entries set amount_cents = 4500 $q$), 1, 'they correct their own while it waits');
select throws_ok($$ update public.spending_entries set status = 'approved' $$, '42501', null, 'but can''t approve it by hand');
select throws_ok($$ select public.decide_spending('aaaaaaaa-8888-0000-0000-000000000001', true) $$, '42501', null, 'or through the approval');

select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select lives_ok($$ insert into public.spending_entries (id, organization_id, fund_id, project_id, amount_cents, category, spent_on)
  values ('aaaaaaaa-8888-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-000000000001',
  'aaaaaaaa-3333-0000-0000-000000000000', 10000, 'Bus tickets', current_date) $$, 'a manager on the program submits too');

-- Seeing -----------------------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.spending_entries), 1, 'staff see only their own entries');
select is((select count(*)::int from public.fund_spending('aaaaaaaa-0000-0000-0000-000000000000')), 0, 'and no totals');
select is(tests.affected($q$ update public.spending_entries set note = 'Changed' where id = 'aaaaaaaa-8888-0000-0000-000000000002' $q$), 0,
  'and can''t touch anyone else''s');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.spending_entries), 0, 'someone off the program sees none');
select is((select count(*)::int from public.spendable_funds('aaaaaaaa-3333-0000-0000-000000000000')), 0, 'and no funds to spend against');
select throws_ok($$ insert into public.spending_entries (organization_id, fund_id, project_id, amount_cents, category, spent_on)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000', 100, 'Snacks', current_date) $$,
  '42501', null, 'and can''t submit for it');
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.spending_entries), 2, 'managers see every entry');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.spending_entries), 0, 'another organization''s owner sees none');
select is(tests.affected($q$ update public.spending_entries set note = 'B' $q$), 0, 'edits none');
select is(tests.affected($q$ delete from public.spending_entries $q$), 0, 'deletes none');
select throws_ok($$ select public.decide_spending('aaaaaaaa-8888-0000-0000-000000000001', true) $$, 'P0002', null, 'and decides none');
select throws_ok($$ insert into public.spending_entries (organization_id, fund_id, project_id, amount_cents, category, spent_on)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000000', 100, 'B', current_date) $$,
  '42501', null, 'or submits any');

-- Deciding ------------------------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.decide_spending('aaaaaaaa-8888-0000-0000-000000000002', true) $$, '42501', null, 'nobody approves their own spending');
select is(public.decide_spending('aaaaaaaa-8888-0000-0000-000000000001', true, 'Thanks')::text, 'approved', 'a manager approves staff spending');
select is((select decided_by from public.spending_entries where id = 'aaaaaaaa-8888-0000-0000-000000000001'), 'a0000000-0000-0000-0000-00000000000c'::uuid,
  'recording who decided');
reset role;
update public.memberships set role = 'manager' where id = 'aaaaaaaa-1111-0000-0000-00000000000b';
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.decide_spending('aaaaaaaa-8888-0000-0000-000000000002', true) $$, '42501', null,
  'a manager can''t decide on another manager''s spending');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(public.decide_spending('aaaaaaaa-8888-0000-0000-000000000002', false, 'Use the org card')::text, 'rejected', 'an owner can');
select is((select approved_cents from public.fund_spending('aaaaaaaa-0000-0000-0000-000000000000')), 4500::bigint, 'only approved spending counts');
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(tests.affected($q$ update public.spending_entries set amount_cents = 1 where id = 'aaaaaaaa-8888-0000-0000-000000000001' $q$), 0,
  'a decided entry can''t be changed');
select is(tests.affected($q$ delete from public.spending_entries where id = 'aaaaaaaa-8888-0000-0000-000000000001' $q$), 0, 'or withdrawn');

-- Receipts -----------------------------------------------------------------------------------------------------
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('receipts',
  'aaaaaaaa-0000-0000-0000-000000000000/a0000000-0000-0000-0000-00000000000b/11111111-1111-4111-8111-111111111111.png', 'a0000000-0000-0000-0000-00000000000b') $$,
  'people upload receipts into their own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('receipts',
  'aaaaaaaa-0000-0000-0000-000000000000/a0000000-0000-0000-0000-00000000000c/22222222-2222-4222-8222-222222222222.png', 'a0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'not anyone else''s');
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 0, 'colleagues can''t see someone''s receipts');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 1, 'owners and managers can');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from storage.objects where bucket_id = 'receipts'), 0, 'another organization can''t');

-- Settings -------------------------------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000c');
select throws_ok($$ update public.organizations set accounting_name = 'Xero', accounting_url = 'https://go.xero.com' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$,
  '42501', null, 'managers can''t set the accounting link');
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.organizations set accounting_url = 'javascript:alert(1)' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$,
  '23514', null, 'the accounting link must be an https address');
select is(tests.affected($q$ update public.organizations set accounting_name = 'Xero', accounting_url = 'https://go.xero.com' where id = 'aaaaaaaa-0000-0000-0000-000000000000' $q$), 1,
  'owners set it');

select * from finish();
rollback;
