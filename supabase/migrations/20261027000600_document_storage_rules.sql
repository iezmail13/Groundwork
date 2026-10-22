-- Stored documents follow their row (security audit, D113).
-- A stored file with no documents row was readable by everyone in the
-- organization, and deleting a row could leave its file behind (the storage
-- rule was narrower than the row's). Now a file is readable only through its
-- row (or by its uploader while the row is being written), and whoever may
-- delete the row may delete the file.

create function public.can_delete_document(doc_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = doc_id
      and public.is_member(d.organization_id)
      and not public.outranked_by_creator(d.organization_id, d.uploaded_by, d.created_by_role)
      and (
        (d.project_id is null and (d.uploaded_by = auth.uid() or public.has_permission(d.organization_id, 'manager')))
        or (
          d.project_id is not null
          and public.can_view_project(d.project_id)
          and public.project_is_active(d.project_id)
          and (d.uploaded_by = auth.uid() or public.can_manage_project_content(d.project_id))
        )
      )
  );
$$;

create or replace function public.can_view_storage_object(object_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = object_name
      and public.is_member(d.organization_id)
      and (d.project_id is null or public.can_view_project(d.project_id))
  );
$$;

create function public.document_has_row(object_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.documents d where d.storage_path = object_name and public.is_member(d.organization_id));
$$;

create function public.can_delete_storage_object(object_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = object_name
      and (public.can_delete_document(d.id) or (d.project_id is not null and public.can_delete_project(d.project_id)))
  );
$$;

revoke execute on function public.can_delete_document(uuid) from public, anon;
revoke execute on function public.document_has_row(text) from public, anon;
revoke execute on function public.can_delete_storage_object(text) from public, anon;
grant execute on function public.can_delete_document(uuid) to authenticated, service_role;
grant execute on function public.document_has_row(text) to authenticated, service_role;
grant execute on function public.can_delete_storage_object(text) to authenticated, service_role;

drop policy documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete to authenticated
  using (public.can_delete_document(id));

drop policy documents_bucket_select on storage.objects;
drop policy documents_bucket_update on storage.objects;
drop policy documents_bucket_delete on storage.objects;
create policy documents_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.is_member(public.storage_org_id(name))
    and (
      public.can_view_storage_object(name)
      or (owner_id = auth.uid()::text and not public.document_has_row(name))
    )
  );
create policy documents_bucket_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and public.can_view_storage_object(name)
    and (
      public.has_permission(public.storage_org_id(name), 'manager')
      or (owner_id = auth.uid()::text and public.is_member(public.storage_org_id(name)))
    )
  )
  with check (bucket_id = 'documents' and public.is_member(public.storage_org_id(name)));
create policy documents_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.is_member(public.storage_org_id(name))
    and (
      public.can_delete_storage_object(name)
      or (owner_id = auth.uid()::text and not public.document_has_row(name))
    )
  );
