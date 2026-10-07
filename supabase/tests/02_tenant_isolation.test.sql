-- Org A cannot read, insert, update or delete org B's rows in any table.
-- Alice is an admin of A (the most privileged role), and B is untouched.
begin;
\ir fixtures.inc
select plan(46);

select tests.as_user('a0000000-0000-0000-0000-00000000000a');

-- read ------------------------------------------------------------------------
select is((select count(*)::int from public.organizations where id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B organization');
select is((select count(*)::int from public.memberships where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B memberships');
select is((select count(*)::int from public.invitations where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B invitations');
select is((select count(*)::int from public.projects where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B projects');
select is((select count(*)::int from public.tasks where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B tasks');
select is((select count(*)::int from public.events where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B events');
select is((select count(*)::int from public.documents where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B documents');
select is((select count(*)::int from public.activity_log where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B activity');
select is((select count(*)::int from public.dashboard_layouts where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'A cannot read B dashboard layouts');
select is((select count(*)::int from public.profiles where id in ('b0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b')), 0, 'A cannot read profiles of B-only users');
select is((select count(*)::int from public.recent_projects('bbbbbbbb-0000-0000-0000-000000000000')), 0, 'recent_projects returns nothing for B');
select is((select count(*)::int from public.organizations), 1, 'A sees exactly one organization');

-- insert ----------------------------------------------------------------------
select throws_ok($$ insert into public.organizations (name, slug) values ('Sneaky', 'sneaky') $$, '42501', null, 'cannot insert organizations directly');
select throws_ok($$ insert into public.memberships (organization_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'admin') $$, '42501', null, 'A cannot add itself to B');
select throws_ok($$ insert into public.invitations (organization_id, email) values ('bbbbbbbb-0000-0000-0000-000000000000', 'x@a.test') $$, '42501', null, 'A cannot invite into B');
select throws_ok($$ insert into public.projects (organization_id, name) values ('bbbbbbbb-0000-0000-0000-000000000000', 'x') $$, '42501', null, 'A cannot insert B projects');
select throws_ok($$ insert into public.tasks (organization_id, project_id, title) values ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000', 'x') $$, '42501', null, 'A cannot insert B tasks');
select throws_ok($$ insert into public.tasks (organization_id, project_id, title) values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000', 'x') $$, '23503', null, 'A cannot attach its task to a B project');
select throws_ok($$ insert into public.events (organization_id, title, starts_at, ends_at) values ('bbbbbbbb-0000-0000-0000-000000000000', 'x', now(), now()) $$, '42501', null, 'A cannot insert B events');
select throws_ok($$ insert into public.documents (organization_id, name, storage_path, mime_type, size_bytes) values ('bbbbbbbb-0000-0000-0000-000000000000', 'x', 'bbbbbbbb-0000-0000-0000-000000000000/x', 'text/plain', 1) $$, '42501', null, 'A cannot insert B documents');
select throws_ok($$ insert into public.documents (organization_id, name, storage_path, mime_type, size_bytes) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 'bbbbbbbb-0000-0000-0000-000000000000/x', 'text/plain', 1) $$, '23514', null, 'A cannot point a document at B storage');
select throws_ok($$ insert into public.activity_log (organization_id, entity_type, entity_id, action) values ('bbbbbbbb-0000-0000-0000-000000000000', 'task', gen_random_uuid(), 'created') $$, '42501', null, 'A cannot insert B activity');
select throws_ok($$ insert into public.dashboard_layouts (organization_id, membership_id, layout) values ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-00000000000b', '{}') $$, '42501', null, 'A cannot insert B dashboard layouts');
select throws_ok($$ insert into public.profiles (id, email) values ('b0000000-0000-0000-0000-00000000000b', 'x@a.test') $$, '42501', null, 'A cannot insert a profile for someone else');

-- update ----------------------------------------------------------------------
select is(tests.affected($q$update public.organizations set name = 'pwned' where id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot update B organization');
select is(tests.affected($q$update public.memberships set role = 'member' where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot update B memberships');
select is(tests.affected($q$update public.invitations set role = 'admin' where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot update B invitations');
select is(tests.affected($q$update public.projects set name = 'pwned' where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot update B projects');
select is(tests.affected($q$update public.tasks set title = 'pwned' where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot update B tasks');
select is(tests.affected($q$update public.events set title = 'pwned' where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot update B events');
select is(tests.affected($q$update public.documents set pinned = true where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot update B documents');
select throws_ok($$ update public.activity_log set action = 'pwned' $$, '42501', null, 'activity log is append-only even for own rows');
select is(tests.affected($q$update public.dashboard_layouts set layout = '{"x":1}' where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot update B dashboard layouts');
select is(tests.affected($q$update public.profiles set full_name = 'pwned' where id = 'b0000000-0000-0000-0000-00000000000a'$q$), 0, 'A cannot update B profiles');
select throws_ok($$ update public.projects set organization_id = 'bbbbbbbb-0000-0000-0000-000000000000' where id = 'aaaaaaaa-3333-0000-0000-000000000000' $$, '42501', null, 'A cannot move its project into B');

-- delete ----------------------------------------------------------------------
select is(tests.affected($q$delete from public.organizations where id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B organization');
select is(tests.affected($q$delete from public.memberships where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B memberships');
select is(tests.affected($q$delete from public.invitations where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B invitations');
select is(tests.affected($q$delete from public.projects where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B projects');
select is(tests.affected($q$delete from public.tasks where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B tasks');
select is(tests.affected($q$delete from public.events where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B events');
select is(tests.affected($q$delete from public.documents where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B documents');
select is(tests.affected($q$delete from public.activity_log where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B activity');
select is(tests.affected($q$delete from public.dashboard_layouts where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000'$q$), 0, 'A cannot delete B dashboard layouts');

-- B is untouched --------------------------------------------------------------
reset role;
select is(
  (select row(o.name, (select count(*) from public.memberships where organization_id = o.id),
              (select count(*) from public.projects where organization_id = o.id and name = 'B project'),
              (select count(*) from public.tasks where organization_id = o.id and title = 'B task'),
              (select count(*) from public.events where organization_id = o.id and title = 'B event'),
              (select count(*) from public.documents where organization_id = o.id and not pinned),
              (select count(*) from public.dashboard_layouts where organization_id = o.id and layout = '{"widgets":[]}'))::text
     from public.organizations o where o.id = 'bbbbbbbb-0000-0000-0000-000000000000'),
  '("Org B",2,1,1,1,1,1)',
  'all of B''s rows are unchanged'
);
select is((select count(*)::int from public.invitations where organization_id = 'bbbbbbbb-0000-0000-0000-000000000000' and role = 'member'), 1, 'B invitation unchanged');

select * from finish();
rollback;
