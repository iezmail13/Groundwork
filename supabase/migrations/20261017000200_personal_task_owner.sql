-- Personal tasks are their creator's own work (D100, D101): the creator can
-- put themselves on one, so it shows in their own lists and moves to In
-- progress, and nobody else can. Otherwise claim_task is unchanged: only open
-- (general) work can be claimed.

create or replace function public.claim_task(task_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  me uuid;
begin
  select * into t from public.tasks tk where tk.id = claim_task.task_id;
  if not found or not public.can_view_task(t.id) then
    raise exception 'That task doesn''t exist' using errcode = 'P0002';
  end if;
  if t.project_id is not null and not public.project_is_active(t.project_id) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;
  if not (t.kind = 'general' or (t.kind = 'personal' and t.created_by = auth.uid())) then
    raise exception 'Only open tasks can be claimed' using errcode = 'P0001', hint = 'not_claimable';
  end if;
  if t.status = 'done' then
    raise exception 'This task is already done' using errcode = 'P0001', hint = 'task_done';
  end if;
  me := public.my_membership_id(t.organization_id);
  if exists (select 1 from public.task_assignees a where a.task_id = t.id and a.membership_id = me) then
    return;
  end if;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by)
  values (t.organization_id, t.id, me, 'claimed', auth.uid());
end;
$$;
