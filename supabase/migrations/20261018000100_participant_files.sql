-- Participant files (D56, D102).
--
-- Files a program keeps about a participant: waivers, medical forms, consent
-- forms, ID and anything else. They live in a second private bucket,
-- "participant-files", at {organization_id}/{project_id}/{participant_id}/{uuid}.
-- The path holds no file name, so nothing personal sits in storage paths or
-- in the access log that records them.
--
-- Who sees them: the same people who see the participant (D81): owners, plus
-- project admins and leads of a program the participant is enrolled in.
-- Uploading and deleting belong to the program the file was added in (its
-- admins and leads) and owners.
--
-- Every upload, view, download and deletion is recorded in
-- participant_file_events, which only owners and the program's leads can read.
-- Storage itself only serves a file to someone who has just recorded a view or
-- download of it (in the last two minutes), so a file can't be opened without
-- leaving an entry, even by calling storage directly.

-- Tables ---------------------------------------------------------------------------------

create type public.participant_file_kind as enum ('waiver', 'medical', 'consent', 'id', 'other');
create type public.participant_file_action as enum ('uploaded', 'viewed', 'downloaded', 'deleted');

create table public.participant_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  participant_id uuid not null,
  project_id uuid not null,
  kind public.participant_file_kind not null default 'other',
  name text not null check (char_length(btrim(name)) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check (char_length(mime_type) <= 255),
  size_bytes bigint not null check (size_bytes between 0 and 26214400),
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (
    storage_path ~ (
      '^' || organization_id::text || '/' || project_id::text || '/' || participant_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  ),
  foreign key (participant_id, organization_id)
    references public.participants (id, organization_id) on delete cascade,
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade
);

create index participant_files_participant_idx on public.participant_files (participant_id, created_at desc);
create index participant_files_project_idx on public.participant_files (project_id);

-- The record of who touched which file. No foreign key to the file or the
-- participant: entries outlive both. Deleting a participant erases the file
-- names and the participant link from their entries (a privacy request).
create table public.participant_file_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid,
  file_id uuid not null,
  participant_id uuid,
  storage_path text not null,
  file_name text,
  file_kind public.participant_file_kind not null,
  action public.participant_file_action not null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete set null (project_id)
);

create index participant_file_events_file_idx on public.participant_file_events (file_id, created_at desc);
create index participant_file_events_path_actor_idx on public.participant_file_events (storage_path, actor_id, created_at desc);
create index participant_file_events_participant_idx on public.participant_file_events (participant_id, created_at desc);

-- Helpers ---------------------------------------------------------------------------------

-- Who may add files to a participant in a program: its admins and leads (and
-- owners), while the program is active and the participant is enrolled in it.
create function public.can_add_participant_file(project_id uuid, participant_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_participants_in(can_add_participant_file.project_id)
    and public.project_is_active(can_add_participant_file.project_id)
    and exists (
      select 1 from public.participant_programs pp
      where pp.project_id = can_add_participant_file.project_id
        and pp.participant_id = can_add_participant_file.participant_id
    );
$$;

-- Who may delete a file: owners and the admins and leads of its program.
create function public.can_delete_participant_file(file_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participant_files f
    where f.id = can_delete_participant_file.file_id
      and public.can_view_participant(f.participant_id)
      and (public.has_permission(f.organization_id, 'owner') or public.can_manage_participants_in(f.project_id))
  );
$$;

-- Storage: an object may be uploaded at {org}/{program}/{participant}/{uuid}
-- by someone who may add files to that participant in that program.
create function public.can_upload_participant_object(object_name text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(object_name, '/');
  org uuid;
  program uuid;
  person uuid;
begin
  if cardinality(parts) <> 4
     or parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  org := parts[1]::uuid;
  program := parts[2]::uuid;
  person := parts[3]::uuid;
  return exists (
      select 1 from public.projects p
      join public.participants x on x.id = person and x.organization_id = p.organization_id
      where p.id = program and p.organization_id = org
    )
    and public.can_add_participant_file(program, person);
exception
  when invalid_text_representation then
    return false;
end;
$$;

-- Storage: an object may be read (and so given a signed URL) or removed by:
--  * whoever uploaded it, until it is recorded as a file (finishing or
--    abandoning an upload);
--  * someone who recorded a view or download of it in the last two minutes,
--    while they can still see the participant;
--  * someone who recorded its deletion in the last two minutes (the database
--    row goes first, then the stored object).
create function public.can_read_participant_object(object_name text, object_owner text, purpose text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      object_owner = auth.uid()::text
      and not exists (select 1 from public.participant_files f where f.storage_path = object_name)
      and not exists (select 1 from public.participant_file_events e where e.storage_path = object_name and e.action = 'deleted')
    )
    or (
      purpose = 'read'
      and exists (
        select 1
        from public.participant_file_events e
        join public.participant_files f on f.id = e.file_id
        where e.storage_path = object_name
          and e.actor_id = auth.uid()
          and e.action in ('viewed', 'downloaded')
          and e.created_at > now() - interval '2 minutes'
          and public.can_view_participant(f.participant_id)
      )
    )
    or exists (
      select 1 from public.participant_file_events e
      where e.storage_path = object_name
        and e.actor_id = auth.uid()
        and e.action = 'deleted'
        and e.created_at > now() - interval '2 minutes'
    );
$$;

revoke execute on function public.can_add_participant_file(uuid, uuid) from public, anon;
revoke execute on function public.can_delete_participant_file(uuid) from public, anon;
revoke execute on function public.can_upload_participant_object(text) from public, anon;
revoke execute on function public.can_read_participant_object(text, text, text) from public, anon;
grant execute on function public.can_add_participant_file(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_delete_participant_file(uuid) to authenticated, service_role;
grant execute on function public.can_upload_participant_object(text) to authenticated, service_role;
grant execute on function public.can_read_participant_object(text, text, text) to authenticated, service_role;

-- Recording access ------------------------------------------------------------------------

create function public.record_participant_file_event(f public.participant_files, what public.participant_file_action)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- an upload made outside a session (the demo seed) is credited to its uploader
  actor uuid := coalesce(auth.uid(), case when what = 'uploaded' then f.uploaded_by end);
  actor_name text;
  person_exists boolean := exists (select 1 from public.participants x where x.id = f.participant_id);
begin
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into actor_name
  from public.profiles p where p.id = actor;
  insert into public.participant_file_events (
    organization_id, project_id, file_id, participant_id, storage_path, file_name, file_kind, action, actor_id, actor_name
  )
  values (
    f.organization_id,
    f.project_id,
    f.id,
    -- a file removed because its participant was deleted keeps no link or name
    case when person_exists then f.participant_id end,
    f.storage_path,
    case when person_exists then f.name end,
    f.kind,
    what,
    actor,
    actor_name
  );
end;
$$;

revoke execute on function public.record_participant_file_event(public.participant_files, public.participant_file_action) from public, anon, authenticated;

-- Opening a file: records the view or download, then hands back what's needed
-- to sign a short-lived URL. Nothing is returned (and nothing recorded) for a
-- file the caller can't see.
create function public.open_participant_file(file_id uuid, download boolean)
returns table (storage_path text, name text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.participant_files;
begin
  select * into f from public.participant_files x where x.id = open_participant_file.file_id;
  if f.id is null or not public.can_view_participant(f.participant_id) then
    return;
  end if;
  perform public.record_participant_file_event(f, case when download then 'downloaded' else 'viewed' end::public.participant_file_action);
  return query select f.storage_path, f.name, f.mime_type;
end;
$$;

revoke execute on function public.open_participant_file(uuid, boolean) from public, anon;
grant execute on function public.open_participant_file(uuid, boolean) to authenticated;

create function public.log_participant_file_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_participant_file_event(new, 'uploaded');
    return new;
  end if;
  -- cascades from deleting the organization aren't worth recording
  if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
    return old;
  end if;
  perform public.record_participant_file_event(old, 'deleted');
  return old;
end;
$$;

create trigger participant_files_log
  after insert or delete on public.participant_files
  for each row execute function public.log_participant_file_change();

-- Deleting a participant (a privacy request) erases what their file entries
-- say about them; their files go with them (on delete cascade above).
create function public.erase_participant_file_events() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.participant_file_events e
  set file_name = null, participant_id = null
  where e.participant_id = old.id;
  return old;
end;
$$;

create trigger participants_erase_file_events
  before delete on public.participants
  for each row execute function public.erase_participant_file_events();

-- Deleting a program removes its participant files. The program's leads (who
-- may delete it) clear them first, so the stored objects can be removed too.
create function public.release_program_files(project_id uuid) returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_project_rank(release_program_files.project_id) < 3 then
    raise exception 'Only the program''s leads can do that' using errcode = '42501';
  end if;
  return query
    delete from public.participant_files f
    where f.project_id = release_program_files.project_id
    returning f.storage_path;
end;
$$;

revoke execute on function public.release_program_files(uuid) from public, anon;
grant execute on function public.release_program_files(uuid) to authenticated;

-- RLS ----------------------------------------------------------------------------------

alter table public.participant_files enable row level security;
alter table public.participant_file_events enable row level security;

create policy participant_files_select on public.participant_files
  for select to authenticated
  using (public.can_view_participant(participant_id));
create policy participant_files_insert on public.participant_files
  for insert to authenticated
  with check (
    public.can_add_participant_file(project_id, participant_id)
    and uploaded_by = auth.uid()
  );
-- a file is replaced by uploading a new one, never edited
create policy participant_files_update on public.participant_files
  for update to authenticated
  using (false) with check (false);
create policy participant_files_delete on public.participant_files
  for delete to authenticated
  using (public.can_delete_participant_file(id));

-- The access record: owners, and the leads of the file's program.
create policy participant_file_events_select on public.participant_file_events
  for select to authenticated
  using (
    public.has_permission(organization_id, 'owner')
    or (project_id is not null and public.is_member(organization_id) and public.my_project_rank(project_id) >= 3)
  );
-- written only by the functions above
create policy participant_file_events_insert on public.participant_file_events
  for insert to authenticated
  with check (false);
create policy participant_file_events_update on public.participant_file_events
  for update to authenticated
  using (false) with check (false);
create policy participant_file_events_delete on public.participant_file_events
  for delete to authenticated
  using (false);

revoke all on table public.participant_files from anon, authenticated;
revoke all on table public.participant_file_events from anon, authenticated;
grant select, insert, update, delete on table public.participant_files to authenticated;
grant select, insert, update, delete on table public.participant_file_events to authenticated;

-- Storage: the private "participant-files" bucket ----------------------------------------
-- Same size and type rules as "documents".

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'participant-files', 'participant-files', false, b.file_size_limit, b.allowed_mime_types
from storage.buckets b
where b.id = 'documents'
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy participant_files_bucket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'participant-files' and public.can_read_participant_object(name, owner_id, 'read'));

create policy participant_files_bucket_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'participant-files' and public.can_upload_participant_object(name));

-- stored files are never overwritten
create policy participant_files_bucket_update on storage.objects
  for update to authenticated
  using (bucket_id = 'participant-files' and false)
  with check (bucket_id = 'participant-files' and false);

create policy participant_files_bucket_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'participant-files' and public.can_read_participant_object(name, owner_id, 'delete'));
