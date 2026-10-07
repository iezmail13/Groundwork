-- Private "documents" bucket. Every object path starts with the owning
-- organization's id; all policies key on that first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/rtf',
    'text/plain',
    'text/csv',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.storage_org_id(object_name text) returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

grant execute on function public.storage_org_id(text) to authenticated;

create policy documents_bucket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_member(public.storage_org_id(name)));

create policy documents_bucket_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_member(public.storage_org_id(name)));

create policy documents_bucket_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.has_role(public.storage_org_id(name), 'admin')
      or (owner_id = auth.uid()::text and public.is_member(public.storage_org_id(name)))
    )
  )
  with check (bucket_id = 'documents' and public.is_member(public.storage_org_id(name)));

create policy documents_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.has_role(public.storage_org_id(name), 'admin')
      or (owner_id = auth.uid()::text and public.is_member(public.storage_org_id(name)))
    )
  );
