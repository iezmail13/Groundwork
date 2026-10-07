-- Every public table has RLS enabled and a policy for each command, and
-- anonymous users can neither read nor write any table.
begin;
\ir fixtures.inc
select plan(5);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null,
  'RLS is enabled on every table in public'
);

select is(
  (select array_agg(t.tablename || ':' || cmd order by t.tablename, cmd)
     from pg_tables t
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as cmd
    where t.schemaname = 'public'
      and not exists (
        select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename and p.cmd = cmd
      )),
  null,
  'every public table has select, insert, update and delete policies'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'documents_bucket_%'),
  4,
  'storage.objects has select, insert, update and delete policies for the documents bucket'
);

select ok(
  (select not public from storage.buckets where id = 'documents')
  and (select file_size_limit = 26214400 from storage.buckets where id = 'documents'),
  'documents bucket is private and capped at 25 MB'
);

select tests.as_anon();
select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  0,
  'anon has no table privileges in public'
);

select * from finish();
rollback;
