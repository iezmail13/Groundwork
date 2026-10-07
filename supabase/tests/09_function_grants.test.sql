-- Helpers that policies, constraints and generated columns call as the
-- signed-in user are granted to authenticated explicitly, never only through
-- PostgreSQL's default EXECUTE for PUBLIC, which a project owner may revoke.
begin;
\ir fixtures.inc
select plan(7);

select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.tags_to_text(text[])'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'tags_to_text is not executable through PUBLIC'
);
select ok(
  exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.tags_to_text(text[])'::regprocedure
      and a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE'
  ),
  'tags_to_text is granted to authenticated explicitly'
);
select ok(
  not has_function_privilege('anon', 'public.tags_to_text(text[])', 'EXECUTE'),
  'anon cannot run tags_to_text'
);

-- every function an RLS policy calls is granted to authenticated explicitly
select is(
  (
    select coalesce(array_agg(distinct p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
    from pg_policy pol
    join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = pol.oid and d.refclassid = 'pg_proc'::regclass
    join pg_proc p on p.oid = d.refobjid
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where not exists (
      select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE'
    )
  ),
  '{}'::text[],
  'policy helpers are all granted to authenticated'
);

-- documents still work for a member when the PUBLIC default is gone
select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into public.documents (id, organization_id, name, storage_path, mime_type, size_bytes, tags)
     values ('aaaaaaaa-6666-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000000', 'Grant check',
             'aaaaaaaa-0000-0000-0000-000000000000/f1-grant.txt', 'text/plain', 1, '{budget}') $$,
  'a member can add a tagged document'
);
select lives_ok(
  $$ update public.documents set tags = '{forms}', pinned = true where id = 'aaaaaaaa-6666-0000-0000-0000000000f1' $$,
  'a member can retag and pin a document'
);
select is(
  (select count(*)::int from public.documents where search @@ to_tsquery('simple', 'forms') and id = 'aaaaaaaa-6666-0000-0000-0000000000f1'),
  1,
  'the search column is computed for the member'
);

select * from finish();
rollback;
