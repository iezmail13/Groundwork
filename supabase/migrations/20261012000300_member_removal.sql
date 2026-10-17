-- Removing someone, or leaving, keeps their history (Part B, phase 2).
--
-- remove_member() hands each of their open tasks to a chosen person (where
-- that person can see the task's project) or flags it as needing an assignee,
-- then removes the membership, all in one transaction. Activity entries keep
-- the name of whoever made them, so the log still reads correctly afterwards.

create function public.remove_member(membership_id uuid, reassign_to uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.memberships;
  heir public.memberships;
  reassigned int := 0;
  flagged int := 0;
begin
  select * into target from public.memberships m where m.id = remove_member.membership_id;
  if not found or not public.is_member(target.organization_id) then
    raise exception 'That person is not in this organization' using errcode = 'P0002';
  end if;
  if target.user_id <> auth.uid() and not public.can_manage_member(target.organization_id, target.role) then
    raise exception 'You don''t have permission to remove that person' using errcode = '42501';
  end if;

  if reassign_to is not null then
    select * into heir from public.memberships m
    where m.id = reassign_to and m.organization_id = target.organization_id and m.id <> target.id;
    if not found then
      raise exception 'Choose someone in this organization to take over' using errcode = '22023';
    end if;
  end if;

  -- open work goes to the heir where they can see it; the rest is flagged
  with moved as (
    update public.tasks t
    set assignee_membership_id = heir.id, needs_assignee = false
    where t.assignee_membership_id = target.id
      and t.status <> 'done'
      and heir.id is not null
      and (
        heir.role = 'owner'
        or exists (select 1 from public.project_members pm where pm.project_id = t.project_id and pm.membership_id = heir.id)
      )
    returning 1
  )
  select count(*) into reassigned from moved;

  with released as (
    update public.tasks t
    set assignee_membership_id = null, needs_assignee = true
    where t.assignee_membership_id = target.id and t.status <> 'done'
    returning 1
  )
  select count(*) into flagged from released;

  -- the last-owner guard still applies and rolls all of this back
  delete from public.memberships m where m.id = target.id;

  return jsonb_build_object('reassigned', reassigned, 'flagged', flagged);
end;
$$;

revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- Activity remembers who did it -----------------------------------------------------

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
  -- authorship and assignment cleared by a cascade, and the needs-assignee flag
  quiet text[] := array['position', 'updated_at', 'created_by', 'uploaded_by', 'assignee_membership_id',
                        'assignee_invitation_id', 'needs_assignee', 'owner_membership_id'];
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
    -- cleared by a cascade when an account, membership or invitation is
    -- deleted (authorship always; assignee/owner only when that row is gone).
    if (old_rec - quiet) = (rec - quiet)
       and (rec -> 'assignee_membership_id' is not distinct from old_rec -> 'assignee_membership_id'
            or (rec ->> 'assignee_membership_id' is null
                and not exists (select 1 from public.memberships m where m.id = (old_rec ->> 'assignee_membership_id')::uuid)))
       and (rec -> 'assignee_invitation_id' is not distinct from old_rec -> 'assignee_invitation_id'
            or (rec ->> 'assignee_invitation_id' is null
                and not exists (select 1 from public.invitations i where i.id = (old_rec ->> 'assignee_invitation_id')::uuid)))
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
    'actor_name', actor_name
  );

  insert into public.activity_log (organization_id, actor_membership_id, entity_type, entity_id, action, metadata)
  values (org_id, actor, entity, (rec ->> 'id')::uuid, verb, jsonb_strip_nulls(meta));

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- existing entries get the name of the member who made them
update public.activity_log a
set metadata = a.metadata || jsonb_build_object('actor_name', coalesce(nullif(btrim(p.full_name), ''), p.email))
from public.memberships m
join public.profiles p on p.id = m.user_id
where m.id = a.actor_membership_id
  and not a.metadata ? 'actor_name';
