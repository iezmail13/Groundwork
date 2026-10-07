-- Document metadata. The file itself lives in the private "documents"
-- storage bucket at {organization_id}/{uuid}-{filename}.

-- array_to_string is only STABLE; generated columns need IMMUTABLE. Joining a
-- text[] with a fixed separator does not depend on any setting.
create function public.tags_to_text(tags text[]) returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_to_string(tags, ' '), '');
$$;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  storage_path text not null unique check (char_length(storage_path) <= 1024),
  mime_type text not null check (char_length(mime_type) <= 255),
  size_bytes bigint not null check (size_bytes between 0 and 26214400),
  tags text[] not null default '{}'
    check (cardinality(tags) <= 20)
    check (public.tags_to_text(tags) = lower(public.tags_to_text(tags))),
  pinned boolean not null default false,
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  search tsvector generated always as (
    to_tsvector(
      'simple',
      name || ' ' || regexp_replace(name, '[^[:alnum:]]+', ' ', 'g') || ' ' || public.tags_to_text(tags)
    )
  ) stored,
  created_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = organization_id::text),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete set null (project_id)
);

create index documents_org_created_idx on public.documents (organization_id, created_at desc);
create index documents_project_idx on public.documents (project_id);
create index documents_search_idx on public.documents using gin (search);
create index documents_tags_idx on public.documents using gin (tags);

create trigger documents_immutable
  before update on public.documents
  for each row execute function public.forbid_column_changes(
    'organization_id', 'storage_path', 'mime_type', 'size_bytes', 'uploaded_by'
  );

alter table public.documents enable row level security;

create policy documents_select on public.documents
  for select to authenticated
  using (public.is_member(organization_id));
create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.is_member(organization_id) and uploaded_by = auth.uid());
create policy documents_update on public.documents
  for update to authenticated
  using (public.is_member(organization_id))
  with check (public.is_member(organization_id));
-- admins delete anything; members delete what they uploaded
create policy documents_delete on public.documents
  for delete to authenticated
  using (public.has_role(organization_id, 'admin') or uploaded_by = auth.uid());

revoke all on table public.documents from anon, authenticated;
grant select, insert, update, delete on table public.documents to authenticated;
