-- Kanban workflows (D107): only the people who run a program set its steps;
-- everyone on it sees them, nobody else does; moving a card into a done step
-- finishes the work and moving it out reopens it; ticking work off moves its
-- card; the rules for who may tick work off (D101) still hold.
begin;
\ir fixtures.inc
select plan(33);

-- Org A also has Sam (staff, on the program). Mia leads A's program; Alice owns the org.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values ('a0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@a.test', '{"full_name":"Sam Staff"}', now(), now(), now());
insert into public.memberships (id, organization_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'staff');
update public.memberships set role = 'manager' where id = 'aaaaaaaa-1111-0000-0000-00000000000b';
update public.project_members set role = 'lead' where membership_id = 'aaaaaaaa-1111-0000-0000-00000000000b';
insert into public.project_members (organization_id, project_id, membership_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-00000000000e', 'staff');
insert into public.tasks (id, organization_id, project_id, title, created_by, status) values
  ('aaaaaaaa-4444-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Open work', 'a0000000-0000-0000-0000-00000000000b', 'todo'),
  ('aaaaaaaa-4444-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Finished work', 'a0000000-0000-0000-0000-00000000000b', 'done'),
  ('aaaaaaaa-4444-0000-0000-0000000000e3', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sam''s work', 'a0000000-0000-0000-0000-00000000000b', 'todo'),
  ('aaaaaaaa-4444-0000-0000-0000000000e4', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Mia''s other work', 'a0000000-0000-0000-0000-00000000000b', 'todo');
insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-4444-0000-0000-0000000000e3', 'aaaaaaaa-1111-0000-0000-00000000000e', 'appointed', 'a0000000-0000-0000-0000-00000000000b');

create function tests.step(name text) returns uuid language sql security definer as $$
  select id from public.workflow_steps where project_id = 'aaaaaaaa-3333-0000-0000-000000000000' and workflow_steps.name = step.name $$;
create function tests.step_of(task uuid) returns text language sql security definer as $$
  select s.name from public.tasks t left join public.workflow_steps s on s.id = t.step_id where t.id = task $$;
create function tests.status_of(task uuid) returns text language sql security definer as $$
  select status::text from public.tasks where id = task $$;
grant execute on all functions in schema tests to authenticated;

-- Setting the steps ------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select throws_ok($$ select public.save_workflow('aaaaaaaa-3333-0000-0000-000000000000',
  '[{"name":"Intake","kind":"open"},{"name":"Done","kind":"done"}]') $$, '42501', null, 'staff can''t set a program''s steps');
select throws_ok($$ insert into public.workflow_steps (organization_id, project_id, name, kind, position)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000', 'Sneaky', 'open', 0) $$, '42501', null,
  'or add one by hand');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.save_workflow('aaaaaaaa-3333-0000-0000-000000000000', '[{"name":"Only","kind":"open"},{"name":"Also","kind":"open"}]') $$,
  '22023', null, 'a workflow needs a done step');
select throws_ok($$ select public.save_workflow('aaaaaaaa-3333-0000-0000-000000000000', '[{"name":"Done","kind":"done"}]') $$,
  '22023', null, 'and at least two steps');
select throws_ok($$ select public.save_workflow('aaaaaaaa-3333-0000-0000-000000000000',
  '[{"name":"Review","kind":"open"},{"name":"review","kind":"open"},{"name":"Done","kind":"done"}]') $$, '22023', null, 'with names of their own');
select lives_ok($$ select public.save_workflow('aaaaaaaa-3333-0000-0000-000000000000',
  '[{"name":"Intake","kind":"open"},{"name":"Review","kind":"open","wip_limit":"2"},{"name":"Approved","kind":"done"}]') $$,
  'the program''s lead sets its steps');
select results_eq($$ select name, kind::text, position::int, wip_limit::int from public.workflow_steps order by position $$,
  $$ values ('Intake', 'open', 0, null::int), ('Review', 'open', 1, 2), ('Approved', 'done', 2, null::int) $$, 'in order, with a limit');
select is(tests.step_of('aaaaaaaa-4444-0000-0000-0000000000e1'), 'Intake', 'open work starts at the first open step');
select is(tests.step_of('aaaaaaaa-4444-0000-0000-0000000000e2'), 'Approved', 'finished work starts at the done step');

select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.workflow_steps), 3, 'everyone on the program sees its steps');
select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.workflow_steps), 0, 'another organization sees none');
select is(tests.affected($q$ update public.workflow_steps set name = 'Hacked' $q$), 0, 'edits none');
select is(tests.affected($q$ delete from public.workflow_steps $q$), 0, 'and deletes none');
select throws_ok($$ select public.save_workflow('aaaaaaaa-3333-0000-0000-000000000000', '[]') $$, 'P0002', null, 'or turns it off');

-- Moving cards ------------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select is(public.move_task_to_step('aaaaaaaa-4444-0000-0000-0000000000e1', tests.step('Review'))::text, 'todo', 'cards move between open steps');
select is(tests.step_of('aaaaaaaa-4444-0000-0000-0000000000e1'), 'Review', 'and stay where they''re put');
select is(public.move_task_to_step('aaaaaaaa-4444-0000-0000-0000000000e1', tests.step('Approved'))::text, 'done', 'moving into a done step finishes the work');
select isnt((select completed_at from public.tasks where id = 'aaaaaaaa-4444-0000-0000-0000000000e1'), null, 'and records when');
select is(public.move_task_to_step('aaaaaaaa-4444-0000-0000-0000000000e1', tests.step('Intake'))::text, 'todo', 'moving it back out reopens it');

-- ticking work off elsewhere moves its card, and reopening brings it back
select is(public.set_task_done('aaaaaaaa-4444-0000-0000-0000000000e4', true)::text, 'done', 'ticking work off');
select is(tests.step_of('aaaaaaaa-4444-0000-0000-0000000000e4'), 'Approved', 'moves its card to the done step');
select is(public.set_task_done('aaaaaaaa-4444-0000-0000-0000000000e4', false)::text, 'todo', 'reopening it');
select is(tests.step_of('aaaaaaaa-4444-0000-0000-0000000000e4'), 'Review', 'moves it to the last open step');

-- the people on a card move it; others on the program can't
select tests.as_user('a0000000-0000-0000-0000-00000000000e');
select is(public.move_task_to_step('aaaaaaaa-4444-0000-0000-0000000000e3', tests.step('Review'))::text, 'in_progress', 'someone on the work moves its card');
select throws_ok($$ select public.move_task_to_step('aaaaaaaa-4444-0000-0000-0000000000e1', tests.step('Review')) $$, '42501', null,
  'but not someone else''s');
select throws_ok($$ update public.tasks set step_id = null where id = 'aaaaaaaa-4444-0000-0000-0000000000e3' $$, '42501', null,
  'and not around the rules by hand');

select tests.as_user('b0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.move_task_to_step('aaaaaaaa-4444-0000-0000-0000000000e1', tests.step('Review')) $$, 'P0002', null,
  'another organization can''t move cards');

-- Changing the steps ---------------------------------------------------------------------------------
select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok(format($$ select public.save_workflow('aaaaaaaa-3333-0000-0000-000000000000',
  '[{"id":"%s","name":"Intake","kind":"open"},{"name":"Checked","kind":"open"},{"id":"%s","name":"Approved","kind":"done"}]') $$,
  tests.step('Intake'), tests.step('Approved')), 'removing a step');
select is(tests.step_of('aaaaaaaa-4444-0000-0000-0000000000e3'), 'Intake', 'moves its cards to the first open step');
select is(tests.status_of('aaaaaaaa-4444-0000-0000-0000000000e3'), 'in_progress', 'without changing their status');
select lives_ok($$ select public.save_workflow('aaaaaaaa-3333-0000-0000-000000000000', '[]') $$, 'turning the workflow off');
select is((select count(*)::int from public.tasks where step_id is not null), 0, 'clears every card''s step');
select is((select count(*)::int from public.workflow_steps), 0, 'and removes the steps');

select * from finish();
rollback;
