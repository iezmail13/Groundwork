-- Deleting a program deletes its documents and calendar items (security audit, D113).
-- They used to fall back to the whole organization, so files and events only
-- the program's people could see became visible to everyone.

alter table public.documents drop constraint documents_project_id_organization_id_fkey;
alter table public.documents add constraint documents_project_id_organization_id_fkey
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade;
alter table public.events drop constraint events_project_id_organization_id_fkey;
alter table public.events add constraint events_project_id_organization_id_fkey
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade;

-- Whether the viewer may delete this program: one of its leads, not outranked
-- by its creator. Checked before any of its files are removed, so a refused
-- delete never loses them.
create function public.can_delete_project(project_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = can_delete_project.project_id
      and public.my_project_rank(p.id) = 3
      and not public.outranked_by_creator(p.organization_id, p.created_by, p.created_by_role)
  );
$$;

revoke execute on function public.can_delete_project(uuid) from public, anon;
grant execute on function public.can_delete_project(uuid) to authenticated, service_role;

create or replace function public.release_program_files(project_id uuid) returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_delete_project(release_program_files.project_id) then
    raise exception 'Only the program''s leads can do that' using errcode = '42501';
  end if;
  return query
    delete from public.participant_files f
    where f.project_id = release_program_files.project_id
    returning f.storage_path;
end;
$$;

-- Items deleted along with their program aren't logged one by one, as tasks
-- already weren't.
create or replace function public.log_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  old_rec jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  org_id uuid := (rec ->> 'organization_id')::uuid;
  entity text := tg_argv[0];
  author uuid := coalesce(auth.uid(), (rec ->> 'created_by')::uuid, (rec ->> 'uploaded_by')::uuid);
  actor uuid;
  actor_name text;
  verb text;
  meta jsonb := '{}'::jsonb;
  -- columns that change without anyone editing the item: board order,
  -- authorship cleared by a cascade, and the needs-assignee flag
  quiet text[] := array['position', 'updated_at', 'created_by', 'uploaded_by', 'needs_assignee', 'owner_membership_id'];
begin
  -- cascades from deleting an organization or project are not worth logging
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.organizations o where o.id = org_id) then
      return old;
    end if;
    if entity in ('task', 'event', 'document') and rec ->> 'project_id' is not null
       and not exists (select 1 from public.projects p where p.id = (rec ->> 'project_id')::uuid) then
      return old;
    end if;
  end if;

  if tg_op = 'INSERT' then
    verb := case when entity = 'document' then 'uploaded' else 'created' end;
  elsif tg_op = 'DELETE' then
    verb := 'deleted';
  elsif entity = 'project' and old_rec ->> 'status' is distinct from rec ->> 'status' then
    verb := case when rec ->> 'status' = 'archived' then 'archived' else 'restored' end;
  elsif entity = 'task' and old_rec ->> 'status' is distinct from rec ->> 'status' then
    -- an assignee leaving the project or organization moves the task back to
    -- To do (sync_task_status marks it); that isn't anyone working on it
    if coalesce(current_setting('groundwork.quiet_status', true), '') = 'on' then
      return new;
    end if;
    verb := case when rec ->> 'status' = 'done' then 'completed' else 'moved' end;
    meta := jsonb_build_object('from', old_rec ->> 'status', 'to', rec ->> 'status');
  elsif entity = 'document' and old_rec ->> 'pinned' is distinct from rec ->> 'pinned' then
    verb := case when (rec ->> 'pinned')::boolean then 'pinned' else 'unpinned' end;
  else
    -- Ignore updates nobody made: reordering on the board, and references
    -- cleared by a cascade when an account or membership is deleted.
    if (old_rec - quiet) = (rec - quiet)
       and (rec -> 'owner_membership_id' is not distinct from old_rec -> 'owner_membership_id'
            or (rec ->> 'owner_membership_id' is null
                and not exists (select 1 from public.memberships m where m.id = (old_rec ->> 'owner_membership_id')::uuid))) then
      return new;
    end if;
    verb := 'updated';
  end if;

  select m.id into actor
  from public.memberships m
  where m.organization_id = org_id and m.user_id = author;
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into actor_name
  from public.profiles p where p.id = author;

  meta := meta || jsonb_build_object(
    'label', coalesce(rec ->> 'name', rec ->> 'title'),
    'project_id', case when entity = 'project' then rec ->> 'id' else rec ->> 'project_id' end,
    'actor_name', actor_name,
    'restricted', case when entity = 'task' and (rec ->> 'kind' = 'personal' or (rec ->> 'hidden')::boolean) then true end
  );

  insert into public.activity_log (organization_id, actor_membership_id, entity_type, entity_id, action, metadata)
  values (org_id, actor, entity, (rec ->> 'id')::uuid, verb, jsonb_strip_nulls(meta));

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
