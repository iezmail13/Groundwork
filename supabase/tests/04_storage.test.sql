-- Storage objects in the documents bucket are isolated per organization by
-- the first path segment; members delete only their own uploads.
begin;
\ir fixtures.inc
select plan(12);

-- storage blocks raw SQL deletes unless this is set; the policies still apply
select set_config('storage.allow_delete_query', 'true', true);

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select array_agg(name) from storage.objects where bucket_id = 'documents'), array['aaaaaaaa-0000-0000-0000-000000000000/1-a-plan.pdf'], 'A sees only its own objects');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', 'bbbbbbbb-0000-0000-0000-000000000000/evil.pdf', 'a0000000-0000-0000-0000-00000000000a') $$, '42501', null, 'A cannot upload into B''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', 'not-a-uuid/evil.pdf', 'a0000000-0000-0000-0000-00000000000a') $$, '42501', null, 'objects outside an organization folder are rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', 'evil.pdf', 'a0000000-0000-0000-0000-00000000000a') $$, '42501', null, 'objects at the bucket root are rejected');
select is(tests.affected($q$ update storage.objects set metadata = '{"x":1}' where name like 'bbbbbbbb%' $q$), 0, 'A cannot update B''s objects');
select is(tests.affected($q$ delete from storage.objects where name like 'bbbbbbbb%' $q$), 0, 'A cannot delete B''s objects');

select tests.as_user('a0000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', 'aaaaaaaa-0000-0000-0000-000000000000/2-mia.txt', 'a0000000-0000-0000-0000-00000000000b') $$, 'a member can upload into their organization''s folder');
select is(tests.affected($q$ delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/1-a-plan.pdf' $q$), 0, 'a member cannot delete someone else''s upload');
select is(tests.affected($q$ delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/2-mia.txt' $q$), 1, 'a member can delete their own upload');

select tests.as_user('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 0, 'an outsider sees no objects');

select tests.as_user('a0000000-0000-0000-0000-00000000000a');
select is(tests.affected($q$ delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-000000000000/1-a-plan.pdf' $q$), 1, 'an admin can delete any object in their organization');

reset role;
select is((select count(*)::int from storage.objects where name like 'bbbbbbbb%'), 1, 'B''s object still exists');

select * from finish();
rollback;
