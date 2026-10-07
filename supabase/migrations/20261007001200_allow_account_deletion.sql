-- Deleting an account (Supabase dashboard, or auth.admin.deleteUser) cascades
-- auth.users -> profiles, and the "on delete set null" foreign keys then clear
-- created_by / uploaded_by / invited_by on that person's rows. The
-- forbid_column_changes trigger rejected those updates, so no account that
-- had ever created anything could be deleted.
--
-- Allow exactly that case: a change to NULL made by a foreign-key cascade,
-- which runs nested inside another trigger (pg_trigger_depth() > 1). A client
-- UPDATE runs at depth 1 and is still refused, whatever the new value.

create or replace function public.forbid_column_changes() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col)
       and not (pg_catalog.pg_trigger_depth() > 1 and (to_jsonb(new) -> col) = 'null'::jsonb) then
      raise exception 'Column % cannot be changed', col using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- The activity trigger must not log those cascaded updates as edits.
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
    -- Ignore updates nobody made: reordering on the board, and references
    -- cleared by a cascade when an account or membership is deleted
    -- (authorship always; assignee/owner only when that membership is gone).
    if (old_rec - 'position' - 'updated_at' - 'created_by' - 'uploaded_by' - 'assignee_membership_id' - 'owner_membership_id')
         = (rec - 'position' - 'updated_at' - 'created_by' - 'uploaded_by' - 'assignee_membership_id' - 'owner_membership_id')
       and (rec -> 'assignee_membership_id' is not distinct from old_rec -> 'assignee_membership_id'
            or (rec ->> 'assignee_membership_id' is null
                and not exists (select 1 from public.memberships m where m.id = (old_rec ->> 'assignee_membership_id')::uuid)))
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

