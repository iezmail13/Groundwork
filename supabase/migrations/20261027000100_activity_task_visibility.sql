-- Activity about tasks someone can't see (security audit, D113).
-- The old policy treated "I can't see this task" as "this task is deleted",
-- because its existence check ran under the reader's RLS, so entries about
-- hidden and share-listed tasks showed their titles. Now an entry about a task
-- that exists follows can_view_task(); once the task is deleted, its entries
-- show only if it was open work when it was deleted (owners see everything).

create function public.can_view_task_activity(entity uuid, org uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.has_permission(org, 'owner') then true
    when exists (select 1 from public.tasks t where t.id = entity) then public.can_view_task(entity)
    else not exists (
      select 1 from public.activity_log a
      where a.entity_type = 'task' and a.entity_id = entity and a.metadata ? 'restricted'
    )
  end;
$$;

-- finds a deleted task's history quickly
create index activity_log_task_entity_idx on public.activity_log (entity_id) where entity_type = 'task';

revoke execute on function public.can_view_task_activity(uuid, uuid) from public, anon;
grant execute on function public.can_view_task_activity(uuid, uuid) to authenticated, service_role;

-- When a task that wasn't open to everyone on its project is deleted (personal,
-- hidden, or narrowed to a share list), its whole history becomes owner-only.
-- Runs before the delete, while its share list still exists.
create function public.restrict_task_history() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.kind = 'personal' or old.hidden
     or exists (select 1 from public.task_shares s where s.task_id = old.id) then
    update public.activity_log a
    set metadata = a.metadata || '{"restricted": true}'::jsonb
    where a.entity_type = 'task' and a.entity_id = old.id and not a.metadata ? 'restricted';
  end if;
  return old;
end;
$$;

create trigger tasks_restrict_history before delete on public.tasks
  for each row execute function public.restrict_task_history();

drop policy activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated
  using (
    public.is_member(organization_id)
    and (
      metadata ->> 'project_id' is null
      or public.has_permission(organization_id, 'owner')
      or public.can_view_project((metadata ->> 'project_id')::uuid)
    )
    and (
      entity_type <> 'participant'
      or public.has_permission(organization_id, 'owner')
      or public.can_view_participant(entity_id)
    )
    and (entity_type <> 'fund' or public.has_permission(organization_id, 'manager'))
    and (entity_type <> 'report' or public.has_permission(organization_id, 'manager'))
    and (entity_type <> 'task' or public.can_view_task_activity(entity_id, organization_id))
  );
