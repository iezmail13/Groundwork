-- Activity log: written by triggers so every change is recorded no matter
-- which client made it. Feeds "Recent activity" and the sidebar's recent list.

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_membership_id uuid,
  entity_type text not null check (entity_type in ('project', 'task', 'event', 'document')),
  entity_id uuid not null,
  action text not null check (char_length(action) between 1 and 40),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (actor_membership_id, organization_id)
    references public.memberships (id, organization_id) on delete set null (actor_membership_id)
);

create index activity_log_org_created_idx on public.activity_log (organization_id, created_at desc);

alter table public.activity_log enable row level security;

create policy activity_log_select on public.activity_log
  for select to authenticated
  using (public.is_member(organization_id));
-- clients may only write entries attributed to themselves
create policy activity_log_insert on public.activity_log
  for insert to authenticated
  with check (
    public.is_member(organization_id)
    and actor_membership_id = public.my_membership_id(organization_id)
  );
-- the log is append-only
create policy activity_log_update on public.activity_log
  for update to authenticated
  using (false) with check (false);
create policy activity_log_delete on public.activity_log
  for delete to authenticated
  using (public.has_role(organization_id, 'admin'));

revoke all on table public.activity_log from anon, authenticated;
grant select, insert, delete on table public.activity_log to authenticated;

-- Trigger ---------------------------------------------------------------------

create function public.log_activity() returns trigger
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
  verb text;
  meta jsonb := '{}'::jsonb;
begin
  -- cascades from deleting an organization or project are not worth logging
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.organizations o where o.id = org_id) then
      return old;
    end if;
    if entity = 'task' and not exists (select 1 from public.projects p where p.id = (rec ->> 'project_id')::uuid) then
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
    verb := case when rec ->> 'status' = 'done' then 'completed' else 'moved' end;
    meta := jsonb_build_object('from', old_rec ->> 'status', 'to', rec ->> 'status');
  elsif entity = 'document' and old_rec ->> 'pinned' is distinct from rec ->> 'pinned' then
    verb := case when (rec ->> 'pinned')::boolean then 'pinned' else 'unpinned' end;
  else
    -- ignore reorder-only updates on the board
    if entity = 'task'
       and (old_rec - 'position' - 'updated_at') = (rec - 'position' - 'updated_at') then
      return new;
    end if;
    verb := 'updated';
  end if;

  select m.id into actor
  from public.memberships m
  where m.organization_id = org_id and m.user_id = author;

  meta := meta || jsonb_build_object(
    'label', coalesce(rec ->> 'name', rec ->> 'title'),
    'project_id', case when entity = 'project' then rec ->> 'id' else rec ->> 'project_id' end
  );

  insert into public.activity_log (organization_id, actor_membership_id, entity_type, entity_id, action, metadata)
  values (org_id, actor, entity, (rec ->> 'id')::uuid, verb, jsonb_strip_nulls(meta));

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger projects_activity
  after insert or update or delete on public.projects
  for each row execute function public.log_activity('project');
create trigger tasks_activity
  after insert or update or delete on public.tasks
  for each row execute function public.log_activity('task');
create trigger events_activity
  after insert or update or delete on public.events
  for each row execute function public.log_activity('event');
create trigger documents_activity
  after insert or update or delete on public.documents
  for each row execute function public.log_activity('document');

-- Recent projects for the sidebar: active projects ordered by their latest
-- activity (anything logged against the project or one of its items).
-- Security invoker, so RLS on both tables still applies.
create function public.recent_projects(org_id uuid, max_rows int default 5)
returns table (id uuid, name text, color text, last_activity_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, p.color, max(a.created_at) as last_activity_at
  from public.activity_log a
  join public.projects p on p.id = (a.metadata ->> 'project_id')::uuid
  where a.organization_id = org_id
    and p.organization_id = org_id
    and p.status = 'active'
  group by p.id, p.name, p.color
  order by last_activity_at desc
  limit least(greatest(max_rows, 1), 20);
$$;

revoke execute on function public.recent_projects(uuid, int) from public, anon;
grant execute on function public.recent_projects(uuid, int) to authenticated;
