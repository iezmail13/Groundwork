-- Kanban workflows (D107): a program can replace the plain board with its
-- own ordered steps (Intake → Review → Approved → Done, say). Each step is
-- "open" or "done", so everything built on a task's status (dashboards,
-- notifications, the calendar, reports) keeps working: moving a card into a
-- done step finishes the work, and moving it back out reopens it. Steps may
-- carry a work-in-progress limit, which the board warns about but doesn't
-- enforce.
--
-- The people who run a program (its admins and leads, and owners) set its
-- steps, all at once, through save_workflow(). Anyone who may tick a task
-- off (whoever can edit it, or the people on it) may move it between steps,
-- through move_task_to_step(), which keeps the done rules from D101.

create type public.step_kind as enum ('open', 'done');

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind public.step_kind not null default 'open',
  position smallint not null check (position between 0 and 99),
  wip_limit smallint check (wip_limit is null or wip_limit between 1 and 999),
  created_at timestamptz not null default now(),
  unique (id, project_id),
  unique (project_id, position) deferrable initially deferred,
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);

alter table public.tasks
  add column step_id uuid,
  add constraint tasks_step_fkey foreign key (step_id, project_id)
    references public.workflow_steps (id, project_id) on delete set null (step_id);
create index tasks_step_idx on public.tasks (step_id) where step_id is not null;

-- RLS -------------------------------------------------------------------------------------

alter table public.workflow_steps enable row level security;

create policy workflow_steps_select on public.workflow_steps
  for select to authenticated
  using (public.is_member(organization_id) and public.can_view_project(project_id));
create policy workflow_steps_insert on public.workflow_steps
  for insert to authenticated
  with check (public.can_manage_project_content(project_id) and public.project_is_active(project_id));
create policy workflow_steps_update on public.workflow_steps
  for update to authenticated
  using (public.can_manage_project_content(project_id) and public.project_is_active(project_id))
  with check (public.can_manage_project_content(project_id) and public.project_is_active(project_id));
create policy workflow_steps_delete on public.workflow_steps
  for delete to authenticated
  using (public.can_manage_project_content(project_id) and public.project_is_active(project_id));

revoke all on table public.workflow_steps from anon, authenticated;
grant select, insert, update, delete on table public.workflow_steps to authenticated;

-- Keeping a task's step and status in step ---------------------------------------------------

create function public.first_step(project uuid, k public.step_kind) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.workflow_steps s where s.project_id = project and s.kind = k order by s.position limit 1;
$$;

create function public.last_step(project uuid, k public.step_kind) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.workflow_steps s where s.project_id = project and s.kind = k order by s.position desc limit 1;
$$;

revoke execute on function public.first_step(uuid, public.step_kind) from public, anon, authenticated;
revoke execute on function public.last_step(uuid, public.step_kind) from public, anon, authenticated;

create function public.sync_task_step() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sk public.step_kind;
  has_people boolean;
begin
  -- work outside a program, or on a program without a workflow, has no step
  if new.project_id is null or not exists (select 1 from public.workflow_steps s where s.project_id = new.project_id) then
    new.step_id := null;
    return new;
  end if;

  -- new work, or work that moved program, starts at the right end of the board
  if tg_op = 'INSERT' or new.project_id is distinct from old.project_id or new.step_id is null then
    if new.step_id is null or not exists (select 1 from public.workflow_steps s where s.id = new.step_id and s.project_id = new.project_id) then
      new.step_id := case when new.status = 'done' then public.first_step(new.project_id, 'done') else public.first_step(new.project_id, 'open') end;
    end if;
    return new;
  end if;

  select s.kind into sk from public.workflow_steps s where s.id = new.step_id;

  if new.step_id is distinct from old.step_id then
    -- the card moved: its step decides whether the work is done
    if sk = 'done' and new.status <> 'done' then
      new.status := 'done';
    elsif sk = 'open' and new.status = 'done' then
      has_people := exists (select 1 from public.task_assignees a where a.task_id = new.id);
      new.status := case when has_people then 'in_progress' else 'todo' end;
    end if;
  elsif new.status is distinct from old.status then
    -- the work was ticked off or reopened elsewhere: its card follows
    if new.status = 'done' and sk = 'open' then
      new.step_id := public.first_step(new.project_id, 'done');
    elsif new.status <> 'done' and sk = 'done' then
      new.step_id := public.last_step(new.project_id, 'open');
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_sync_step
  before insert or update of step_id, status, project_id on public.tasks
  for each row execute function public.sync_task_step();

-- Setting a program's steps ------------------------------------------------------------------

-- Replaces a program's steps with the given list, in order. Each item is
-- {id?, name, kind, wip_limit?}: an id keeps that step (and its cards); a
-- step left out is removed and its cards move to the first remaining step of
-- the same kind. An empty list turns the workflow off. 2 to 12 steps, at
-- least one open and one done, names unique.
create function public.save_workflow(project uuid, steps jsonb) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  org uuid;
  item jsonb;
  i integer := 0;
  kept uuid[] := '{}';
  step uuid;
begin
  select p.organization_id into org from public.projects p where p.id = project;
  if org is null or not public.can_view_project(project) then
    raise exception 'That program doesn''t exist' using errcode = 'P0002';
  end if;
  if not public.can_manage_project_content(project) then
    raise exception 'Only the people who run this program can change its steps' using errcode = '42501';
  end if;
  if not public.project_is_active(project) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;
  if jsonb_typeof(steps) <> 'array' then
    raise exception 'Steps must be a list' using errcode = '22023';
  end if;

  if jsonb_array_length(steps) = 0 then
    update public.tasks set step_id = null where project_id = project and step_id is not null;
    delete from public.workflow_steps where project_id = project;
    return;
  end if;

  if jsonb_array_length(steps) not between 2 and 12 then
    raise exception 'Use between 2 and 12 steps' using errcode = '22023', hint = 'step_count';
  end if;
  if not exists (select 1 from jsonb_array_elements(steps) e where e ->> 'kind' = 'open')
    or not exists (select 1 from jsonb_array_elements(steps) e where e ->> 'kind' = 'done') then
    raise exception 'Keep at least one open step and one done step' using errcode = '22023', hint = 'step_kinds';
  end if;
  if (select count(distinct lower(btrim(e ->> 'name'))) from jsonb_array_elements(steps) e) <> jsonb_array_length(steps) then
    raise exception 'Give each step its own name' using errcode = '22023', hint = 'step_names';
  end if;

  -- positions are rewritten below; move existing ones out of the way first
  update public.workflow_steps set position = position + 50 where project_id = project and position < 50;

  for item in select * from jsonb_array_elements(steps) loop
    step := nullif(item ->> 'id', '')::uuid;
    if step is not null and exists (select 1 from public.workflow_steps s where s.id = step and s.project_id = project) then
      update public.workflow_steps
      set name = btrim(item ->> 'name'),
          kind = (item ->> 'kind')::public.step_kind,
          position = i,
          wip_limit = nullif(item ->> 'wip_limit', '')::smallint
      where id = step;
    else
      insert into public.workflow_steps (organization_id, project_id, name, kind, position, wip_limit)
      values (org, project, btrim(item ->> 'name'), (item ->> 'kind')::public.step_kind, i, nullif(item ->> 'wip_limit', '')::smallint)
      returning id into step;
    end if;
    kept := kept || step;
    i := i + 1;
  end loop;

  -- cards on a removed step move to the first remaining step of its kind
  update public.tasks t
  set step_id = case
    when t.status = 'done' then public.first_step(project, 'done')
    else public.first_step(project, 'open')
  end
  where t.project_id = project and (t.step_id is null or not t.step_id = any (kept));
  delete from public.workflow_steps where project_id = project and not id = any (kept);

  -- a step whose kind changed takes its cards' status with it
  update public.tasks t
  set status = case
    when s.kind = 'done' then 'done'::public.task_status
    when exists (select 1 from public.task_assignees a where a.task_id = t.id) then 'in_progress'::public.task_status
    else 'todo'::public.task_status
  end
  from public.workflow_steps s
  where s.id = t.step_id and t.project_id = project and ((s.kind = 'done') <> (t.status = 'done'));
end;
$$;

revoke execute on function public.save_workflow(uuid, jsonb) from public, anon;
grant execute on function public.save_workflow(uuid, jsonb) to authenticated;

-- Moving a card --------------------------------------------------------------------------------

-- Moves work to a step (and a place in its column). Whoever may tick it off
-- may move it: someone who can edit it, or someone on it. Moving into a done
-- step goes through set_task_done(), so "everyone ticks their own part"
-- still holds; if that doesn't finish the work, the card stays where it was.
create function public.move_task_to_step(task uuid, step uuid, new_position double precision default null)
returns public.task_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  target public.workflow_steps;
  mine boolean;
  result public.task_status;
begin
  select * into t from public.tasks tk where tk.id = task;
  if not found or not public.can_view_task(t.id) then
    raise exception 'That task doesn''t exist' using errcode = 'P0002';
  end if;
  select * into target from public.workflow_steps s where s.id = step;
  if not found or target.project_id is distinct from t.project_id then
    raise exception 'That step isn''t on this program' using errcode = '22023', hint = 'wrong_step';
  end if;
  mine := exists (
    select 1 from public.task_assignees a
    where a.task_id = t.id and a.membership_id = public.my_membership_id(t.organization_id)
  );
  if not mine and not public.can_edit_task(t.id) then
    raise exception 'Only the people on this task, or someone who can edit it, can move it' using errcode = '42501';
  end if;
  if not mine and public.outranked_by_creator(t.organization_id, t.created_by, t.created_by_role) then
    raise exception 'Someone ranked above you created this, so you can''t change it'
      using errcode = '42501', hint = 'outranked_by_creator';
  end if;
  if not public.project_is_active(t.project_id) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;

  if target.kind = 'done' and t.status <> 'done' then
    result := public.set_task_done(t.id, true);
    if result <> 'done' then
      return result;
    end if;
  elsif target.kind = 'open' and t.status = 'done' then
    perform public.set_task_done(t.id, false);
  end if;

  update public.tasks tk
  set step_id = target.id, position = coalesce(new_position, tk.position)
  where tk.id = t.id
  returning tk.status into result;
  return result;
end;
$$;

revoke execute on function public.move_task_to_step(uuid, uuid, double precision) from public, anon;
grant execute on function public.move_task_to_step(uuid, uuid, double precision) to authenticated;

-- Telling a task's people when its step changes, alongside the D106 changes.
create or replace function public.notify_task_changed() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  changed text[] := array_remove(array[
    case when new.title is distinct from old.title then 'title' end,
    case when new.due_date is distinct from old.due_date then 'due_date' end,
    case when new.priority is distinct from old.priority then 'priority' end,
    -- a status change made by giving or claiming work (a trigger on assignees) is
    -- already told as "assigned" or "claimed", so only direct changes count
    case when new.status is distinct from old.status and new.status <> 'done' and pg_trigger_depth() = 1 then 'status' end,
    case when new.project_id is distinct from old.project_id then 'project' end,
    case when new.step_id is distinct from old.step_id and new.project_id is not distinct from old.project_id
      and new.status <> 'done' and old.step_id is not null then 'step' end
  ], null);
begin
  if cardinality(changed) = 0 or auth.uid() is null then
    return null;
  end if;
  for person in select public.task_people(new.id) loop
    perform public.notify(new.organization_id, person, 'task_changed', 'task', new.id, auth.uid(),
      jsonb_build_object('changed', changed), 'changed:' || new.id);
  end loop;
  return null;
end;
$$;

drop trigger tasks_notify_changed on public.tasks;
create trigger tasks_notify_changed
  after update of title, due_date, priority, status, project_id, step_id on public.tasks
  for each row execute function public.notify_task_changed();
