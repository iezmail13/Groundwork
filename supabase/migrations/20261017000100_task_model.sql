-- The task model grows (D89, D100).
--
-- Tasks get a kind (general, appointed or personal), a priority, a "hide from
-- other collaborators" flag, a claim limit, a completion rule (any or all) and
-- a share list, and may sit outside a project (personal and org-level tasks).
-- Assignees move from the single tasks.assignee_* columns to task_assignees,
-- so a task can have several, each either claimed (they took it) or appointed
-- (someone above them gave it to them). Visibility still has one source of
-- truth, can_view_task(), which now applies all of these rules.
--
-- Deploy behind maintenance mode: the old assignee columns are dropped.

create type public.task_kind as enum ('general', 'appointed', 'personal');
create type public.task_priority as enum ('critical', 'high', 'medium', 'low');
create type public.task_completion as enum ('any', 'all');
create type public.task_assignee_kind as enum ('claimed', 'appointed');

alter table public.tasks
  add column kind public.task_kind not null default 'general',
  add column priority public.task_priority not null default 'medium',
  add column hidden boolean not null default false,
  add column claim_limit integer check (claim_limit is null or claim_limit between 1 and 1000),
  add column completion public.task_completion not null default 'any',
  alter column project_id drop not null,
  add constraint tasks_claim_limit_general check (claim_limit is null or kind = 'general'),
  add constraint tasks_id_organization_id_key unique (id, organization_id);

create index tasks_org_kind_idx on public.tasks (organization_id, kind);

-- Assignees -------------------------------------------------------------------------------

create table public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null,
  -- a member, or someone invited but not yet joined (D70, D79)
  membership_id uuid,
  invitation_id uuid,
  kind public.task_assignee_kind not null,
  added_by uuid references public.profiles (id) on delete set null default auth.uid(),
  -- each assignee's own part, for tasks that need everyone to finish ("all")
  done_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (task_id, organization_id) references public.tasks (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id) references public.memberships (id, organization_id) on delete cascade,
  foreign key (invitation_id, organization_id) references public.invitations (id, organization_id) on delete cascade,
  constraint task_assignees_one_person check ((membership_id is null) <> (invitation_id is null)),
  unique (task_id, membership_id),
  unique (task_id, invitation_id)
);

create index task_assignees_membership_idx on public.task_assignees (membership_id);
create index task_assignees_invitation_idx on public.task_assignees (invitation_id);

-- Share list ------------------------------------------------------------------------------

create table public.task_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null,
  membership_id uuid not null,
  added_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (task_id, organization_id) references public.tasks (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id) references public.memberships (id, organization_id) on delete cascade,
  unique (task_id, membership_id)
);

create index task_shares_membership_idx on public.task_shares (membership_id);

-- Existing assignees move over, with no data loss -----------------------------------------
-- Someone who assigned themselves claimed a general task; anyone else was
-- appointed. Assigned work is in progress, unassigned work is to do, and
-- finished work stays done. Every task starts at medium priority.

insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by, created_at)
select t.organization_id, t.id, t.assignee_membership_id,
  case when m.user_id = t.created_by then 'claimed' else 'appointed' end::public.task_assignee_kind,
  t.created_by, t.created_at
from public.tasks t
join public.memberships m on m.id = t.assignee_membership_id;

insert into public.task_assignees (organization_id, task_id, invitation_id, kind, added_by, created_at)
select t.organization_id, t.id, t.assignee_invitation_id, 'appointed', t.created_by, t.created_at
from public.tasks t
where t.assignee_invitation_id is not null;

update public.tasks t set kind = 'appointed'
where exists (select 1 from public.task_assignees a where a.task_id = t.id and a.kind = 'appointed');

-- (bypassing the creator-rank guard and the activity log: nobody is editing these)
alter table public.tasks disable trigger tasks_guard_creator_rank;
alter table public.tasks disable trigger tasks_activity;
update public.tasks t
set status = case when exists (select 1 from public.task_assignees a where a.task_id = t.id) then 'in_progress' else 'todo' end::public.task_status
where t.status <> 'done';
alter table public.tasks enable trigger tasks_guard_creator_rank;
alter table public.tasks enable trigger tasks_activity;

drop trigger tasks_check_assignee on public.tasks;
drop function public.check_task_assignee();
alter table public.tasks
  drop column assignee_membership_id,
  drop column assignee_invitation_id;

-- Helpers ---------------------------------------------------------------------------------

-- The rank of the person who created a task: their current role, or the one
-- they held when they made it if they've left.
create function public.task_creator_rank(task_id uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.role_rank(m.role) from public.tasks t
     join public.memberships m on m.organization_id = t.organization_id and m.user_id = t.created_by
     where t.id = task_id),
    (select public.role_rank(t.created_by_role) from public.tasks t where t.id = task_id),
    0
  );
$$;

-- Who can see a task (D89, D100). Owners see everything. Otherwise, on a
-- project the viewer must be on it, and then:
--   personal: the creator, anyone ranked above them, or someone it's shared with;
--   hidden: its assignees, creator, people it's shared with, anyone ranked
--     above an assignee, and the project's leads;
--   org-level (no project): everyone, unless a share list narrows it to the
--     creator, assignees, shared people and anyone ranked above the creator;
--   anything else: everyone on the project.
create or replace function public.can_view_task(task_id uuid) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
  me public.memberships;
  my integer;
begin
  select tk.id, tk.organization_id, tk.project_id, tk.kind, tk.hidden, tk.created_by into t
  from public.tasks tk where tk.id = can_view_task.task_id;
  if not found then
    return false;
  end if;
  select * into me from public.memberships m where m.organization_id = t.organization_id and m.user_id = auth.uid();
  if not found then
    return false;
  end if;
  if me.role = 'owner' then
    return true;
  end if;
  if t.project_id is not null and not public.can_view_project(t.project_id) then
    return false;
  end if;
  if t.created_by = auth.uid()
     or exists (select 1 from public.task_assignees a where a.task_id = t.id and a.membership_id = me.id)
     or exists (select 1 from public.task_shares s where s.task_id = t.id and s.membership_id = me.id) then
    return true;
  end if;
  my := public.role_rank(me.role);
  if t.kind = 'personal' then
    return my > public.task_creator_rank(t.id);
  end if;
  if t.hidden then
    return (t.project_id is not null and public.my_project_rank(t.project_id) = 3)
      or exists (
        select 1 from public.task_assignees a
        join public.memberships m on m.id = a.membership_id
        where a.task_id = t.id and my > public.role_rank(m.role)
      );
  end if;
  if t.project_id is null then
    return not exists (select 1 from public.task_shares s where s.task_id = t.id)
      or my > public.task_creator_rank(t.id);
  end if;
  return true;
end;
$$;

-- Can the viewer change this task's details (title, dates, priority, hiding)?
-- The project's content managers, its creator, or for tasks outside a project
-- managers and owners. The creator-rank guard (D80) still applies on top.
create function public.can_edit_task(task_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = can_edit_task.task_id
      and public.can_view_task(t.id)
      and (
        t.created_by = auth.uid()
        or (t.project_id is not null and public.can_manage_project_content(t.project_id))
        or (t.project_id is null and t.kind <> 'personal' and public.has_permission(t.organization_id, 'manager'))
      )
  );
$$;

-- Leads and managers (and owners) may hide a task from other collaborators.
create function public.can_hide_task(project_id uuid, org_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(org_id, 'manager')
    or (project_id is not null and public.my_project_rank(project_id) = 3);
$$;

-- Can the viewer give this task to someone of `target_rank`? Someone ranked
-- above them, the project's lead, or a manager or owner.
create function public.can_appoint(task_id uuid, target_rank integer) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = can_appoint.task_id
      and public.can_view_task(t.id)
      and (
        public.my_rank(t.organization_id) > target_rank
        or public.has_permission(t.organization_id, 'manager')
        or (t.project_id is not null and public.my_project_rank(t.project_id) = 3)
      )
  );
$$;

-- The creator or anyone ranked above them, the project lead, or an owner may
-- share a task with specific people.
create function public.can_share_task(task_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = can_share_task.task_id
      and public.can_view_task(t.id)
      and (
        t.created_by = auth.uid()
        or public.my_rank(t.organization_id) > public.task_creator_rank(t.id)
        or public.has_permission(t.organization_id, 'owner')
        or (t.project_id is not null and public.my_project_rank(t.project_id) = 3)
      )
  );
$$;

revoke execute on function public.task_creator_rank(uuid) from public, anon;
revoke execute on function public.can_edit_task(uuid) from public, anon;
revoke execute on function public.can_hide_task(uuid, uuid) from public, anon;
revoke execute on function public.can_appoint(uuid, integer) from public, anon;
revoke execute on function public.can_share_task(uuid) from public, anon;
grant execute on function public.task_creator_rank(uuid) to authenticated, service_role;
grant execute on function public.can_edit_task(uuid) to authenticated, service_role;
grant execute on function public.can_hide_task(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_appoint(uuid, integer) to authenticated, service_role;
grant execute on function public.can_share_task(uuid) to authenticated, service_role;

-- Tasks: who may create, change and delete them ----------------------------------------

drop policy tasks_insert on public.tasks;
drop policy tasks_update on public.tasks;
drop policy tasks_delete on public.tasks;

-- On a project: anyone on it. Outside one: personal tasks for anyone in the
-- org, and org-level tasks for managers and owners.
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_member(organization_id)
    and (
      (project_id is not null and public.can_view_project(project_id) and public.project_is_active(project_id))
      or (project_id is null and (kind = 'personal' or public.has_permission(organization_id, 'manager')))
    )
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.can_view_task(id) and (project_id is null or public.project_is_active(project_id)))
  with check (
    (project_id is not null and public.can_view_project(project_id) and public.project_is_active(project_id))
    or (project_id is null and (kind = 'personal' or public.has_permission(organization_id, 'manager')))
  );

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.can_view_task(id)
    and (project_id is null or public.project_is_active(project_id))
    and (
      created_by = auth.uid()
      or (project_id is not null and public.can_manage_project_content(project_id))
      or (project_id is null and kind <> 'personal' and public.has_permission(organization_id, 'manager'))
    )
  );

-- Rules on the task row itself, for people editing directly.
create function public.check_task_rules() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  -- a personal task stays personal, and nothing else becomes one
  if tg_op = 'INSERT' then
    if new.hidden and not public.can_hide_task(new.project_id, new.organization_id) then
      raise exception 'Only project leads and managers can hide a task' using errcode = '42501', hint = 'hide_not_allowed';
    end if;
    return new;
  end if;
  if (old.kind = 'personal') <> (new.kind = 'personal') then
    raise exception 'A personal task can''t become shared work, or the other way round'
      using errcode = '42501', hint = 'personal_kind_fixed';
  end if;
  if new.hidden is distinct from old.hidden and not public.can_hide_task(new.project_id, new.organization_id) then
    raise exception 'Only project leads and managers can hide a task' using errcode = '42501', hint = 'hide_not_allowed';
  end if;
  -- "all" tasks change between done and not done only through set_task_done,
  -- as each assignee ticks or unticks their own part
  if new.completion = 'all' and (new.status = 'done') <> (old.status = 'done')
     and exists (select 1 from public.task_assignees a where a.task_id = new.id) then
    raise exception 'Each person assigned ticks their own part' using errcode = 'P0001', hint = 'completion_all';
  end if;
  return new;
end;
$$;

create trigger tasks_check_rules before insert or update on public.tasks
  for each row execute function public.check_task_rules();

-- Moving a task to another project drops assignees who can't see it there.
create function public.after_task_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- moving a task to another project drops assignees who can't see it there
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id and new.project_id is not null then
    delete from public.task_assignees a
    using public.memberships m
    where a.task_id = new.id and m.id = a.membership_id and m.role <> 'owner'
      and not exists (select 1 from public.project_members pm where pm.project_id = new.project_id and pm.membership_id = m.id);
    delete from public.task_assignees a
    where a.task_id = new.id and a.invitation_id is not null
      and not exists (
        select 1 from public.invitation_projects ip
        where ip.invitation_id = a.invitation_id and ip.project_id = new.project_id
      );
  end if;
  return null;
end;
$$;

create trigger tasks_after_change after update on public.tasks
  for each row execute function public.after_task_change();

-- The creator-rank guard (D80): the assignee exception now reads task_assignees.
create or replace function public.guard_creator_rank() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_rec jsonb := to_jsonb(old);
  new_rec jsonb;
  changed text[];
  -- columns the database keeps up to date itself
  derived text[] := array['updated_at', 'completed_at', 'needs_assignee'];
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if not public.outranked_by_creator(
    (old_rec ->> 'organization_id')::uuid,
    (old_rec ->> tg_argv[0])::uuid,
    (old_rec ->> 'created_by_role')::public.member_role
  ) then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    new_rec := to_jsonb(new);
    select coalesce(array_agg(n.key), '{}') into changed
    from jsonb_each(new_rec) n
    where n.value is distinct from old_rec -> n.key;
    -- saving without changing anything is harmless
    if changed <@ derived then
      return new;
    end if;
    -- an assignee may move their task and mark it done
    if tg_table_name = 'tasks'
       and changed <@ (derived || array['status', 'position'])
       and exists (
         select 1 from public.task_assignees a
         join public.memberships m on m.id = a.membership_id
         where a.task_id = (old_rec ->> 'id')::uuid and m.user_id = auth.uid()
       ) then
      return new;
    end if;
  end if;

  raise exception 'Someone ranked above you created this, so you can''t change it'
    using errcode = '42501', hint = 'outranked_by_creator';
end;
$$;

-- Assignee rows: checks, status and the needs-assignee flag ------------------------------

create function public.check_task_assignee_row() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  creator_membership uuid;
begin
  select * into t from public.tasks tk where tk.id = new.task_id;
  if t.kind = 'personal' then
    select m.id into creator_membership from public.memberships m
    where m.organization_id = t.organization_id and m.user_id = t.created_by;
    if new.membership_id is distinct from creator_membership then
      raise exception 'A personal task belongs to the person who made it' using errcode = 'P0001', hint = 'personal_task';
    end if;
  end if;
  if new.membership_id is not null and t.project_id is not null and not exists (
    select 1 from public.memberships m
    where m.id = new.membership_id
      and (
        m.role = 'owner'
        or exists (select 1 from public.project_members pm where pm.project_id = t.project_id and pm.membership_id = m.id)
      )
  ) then
    raise exception 'That person isn''t on this project' using errcode = 'P0001', hint = 'assignee_not_on_project';
  end if;
  if new.invitation_id is not null and not exists (
    select 1 from public.invitations i
    where i.id = new.invitation_id and i.accepted_at is null
      and (
        t.project_id is null
        or exists (select 1 from public.invitation_projects ip where ip.invitation_id = i.id and ip.project_id = t.project_id)
      )
  ) then
    raise exception 'That invitation doesn''t include this project' using errcode = 'P0001', hint = 'assignee_not_on_project';
  end if;
  if tg_op = 'INSERT' and new.kind = 'claimed' and t.claim_limit is not null
     and (select count(*) from public.task_assignees a where a.task_id = t.id) >= t.claim_limit then
    raise exception 'Every spot on this task is taken' using errcode = 'P0001', hint = 'claim_limit';
  end if;
  return new;
end;
$$;

create trigger task_assignees_check before insert or update of membership_id, invitation_id on public.task_assignees
  for each row execute function public.check_task_assignee_row();

-- Status follows the assignees: someone on it means in progress, nobody means
-- to do (done stays done). An open task whose last assignee went away without
-- choosing to (they left the project or organization, or their invitation was
-- withdrawn or declined) is flagged "needs assignee", and that move back to
-- To do isn't logged as anyone's work. Leaving by choice goes through
-- unclaim_task or remove_task_assignee, which mark the change as by hand.
create function public.sync_task_status() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tid uuid := coalesce(new.task_id, old.task_id);
  remaining integer;
  released boolean := tg_op = 'DELETE' and coalesce(current_setting('groundwork.assignee_change', true), '') <> 'by_hand';
  t public.tasks;
  next_status public.task_status;
  next_flag boolean;
begin
  select * into t from public.tasks tk where tk.id = tid;
  if not found then
    return null;
  end if;
  select count(*) into remaining from public.task_assignees a where a.task_id = tid;
  next_status := case when t.status = 'done' then 'done' when remaining > 0 then 'in_progress' else 'todo' end;
  next_flag := case
    when remaining > 0 then false
    when released and t.status <> 'done' then true
    else t.needs_assignee
  end;
  if next_status = t.status and next_flag = t.needs_assignee then
    return null;
  end if;
  if released then
    perform set_config('groundwork.quiet_status', 'on', true);
  end if;
  update public.tasks tk set status = next_status, needs_assignee = next_flag where tk.id = tid;
  perform set_config('groundwork.quiet_status', '', true);
  return null;
end;
$$;

create trigger task_assignees_sync_status after insert or delete on public.task_assignees
  for each row execute function public.sync_task_status();

-- What the database keeps fixed on assignee and share rows.
create trigger task_assignees_immutable before update on public.task_assignees
  for each row execute function public.forbid_column_changes('organization_id', 'task_id');
create trigger task_shares_immutable before update on public.task_shares
  for each row execute function public.forbid_column_changes('organization_id', 'task_id', 'membership_id');

-- Claiming, appointing, leaving and finishing ---------------------------------------------
-- People change assignees only through these functions, which check the rules.

create function public.claim_task(task_id uuid) returns void
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
  if t.kind <> 'general' then
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

-- Each claimer can unclaim only themselves; appointed people can't leave.
create function public.unclaim_task(task_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  mine public.task_assignees;
begin
  select * into t from public.tasks tk where tk.id = unclaim_task.task_id;
  if not found or not public.can_view_task(t.id) then
    raise exception 'That task doesn''t exist' using errcode = 'P0002';
  end if;
  if t.project_id is not null and not public.project_is_active(t.project_id) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;
  select * into mine from public.task_assignees a
  where a.task_id = t.id and a.membership_id = public.my_membership_id(t.organization_id);
  if not found then
    return;
  end if;
  if mine.kind = 'appointed' then
    raise exception 'You were appointed to this, so only the person who appointed you (or someone above them) can take you off'
      using errcode = '42501', hint = 'appointed_cannot_leave';
  end if;
  perform set_config('groundwork.assignee_change', 'by_hand', true);
  delete from public.task_assignees a where a.id = mine.id;
  perform set_config('groundwork.assignee_change', '', true);
end;
$$;

-- A superior gives a task to someone: a member, or a pending invitee.
create function public.appoint_to_task(task_id uuid, membership_id uuid default null, invitation_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  target_rank integer;
begin
  select * into t from public.tasks tk where tk.id = appoint_to_task.task_id;
  if not found or not public.can_view_task(t.id) then
    raise exception 'That task doesn''t exist' using errcode = 'P0002';
  end if;
  if t.project_id is not null and not public.project_is_active(t.project_id) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;
  if (appoint_to_task.membership_id is null) = (appoint_to_task.invitation_id is null) then
    raise exception 'Choose one person to appoint' using errcode = '22023';
  end if;
  if t.kind = 'personal' then
    raise exception 'A personal task belongs to the person who made it' using errcode = 'P0001', hint = 'personal_task';
  end if;
  if appoint_to_task.membership_id is not null then
    select public.role_rank(m.role) into target_rank from public.memberships m
    where m.id = appoint_to_task.membership_id and m.organization_id = t.organization_id;
  else
    select public.role_rank(i.role) into target_rank from public.invitations i
    where i.id = appoint_to_task.invitation_id and i.organization_id = t.organization_id;
  end if;
  if target_rank is null then
    raise exception 'That person isn''t in this organization' using errcode = 'P0002';
  end if;
  if not public.can_appoint(t.id, target_rank) then
    raise exception 'Only someone ranked above them, the project lead or a manager can give them this task'
      using errcode = '42501', hint = 'appoint_not_allowed';
  end if;
  -- someone who'd claimed it is now appointed to it
  update public.task_assignees a set kind = 'appointed', added_by = auth.uid()
  where a.task_id = t.id
    and (a.membership_id = appoint_to_task.membership_id or a.invitation_id = appoint_to_task.invitation_id);
  if found then
    return;
  end if;
  insert into public.task_assignees (organization_id, task_id, membership_id, invitation_id, kind, added_by)
  values (t.organization_id, t.id, appoint_to_task.membership_id, appoint_to_task.invitation_id, 'appointed', auth.uid());
end;
$$;

-- Taking someone off a task. Claimers may take themselves off; the project's
-- content managers may take off anyone who claimed it. An appointed person
-- comes off only by the one who appointed them, someone ranked above that
-- person, or an owner.
create function public.remove_task_assignee(task_id uuid, membership_id uuid default null, invitation_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  target_row public.task_assignees;
  appointer_rank integer;
begin
  select * into t from public.tasks tk where tk.id = remove_task_assignee.task_id;
  if not found or not public.can_view_task(t.id) then
    raise exception 'That task doesn''t exist' using errcode = 'P0002';
  end if;
  if t.project_id is not null and not public.project_is_active(t.project_id) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;
  select * into target_row from public.task_assignees a
  where a.task_id = t.id
    and (a.membership_id = remove_task_assignee.membership_id or a.invitation_id = remove_task_assignee.invitation_id);
  if not found then
    return;
  end if;
  if target_row.kind = 'claimed' then
    if not (
      target_row.membership_id = public.my_membership_id(t.organization_id)
      or public.can_edit_task(t.id)
      or public.has_permission(t.organization_id, 'manager')
    ) then
      raise exception 'Only they can take themselves off this task' using errcode = '42501', hint = 'remove_not_allowed';
    end if;
  else
    select public.role_rank(m.role) into appointer_rank from public.memberships m
    where m.organization_id = t.organization_id and m.user_id = target_row.added_by;
    if not (
      target_row.added_by = auth.uid()
      or public.my_rank(t.organization_id) > coalesce(appointer_rank, 0)
      or public.has_permission(t.organization_id, 'owner')
    ) then
      raise exception 'Only the person who appointed them, someone ranked above that person, or an owner can take them off'
        using errcode = '42501', hint = 'appointed_cannot_leave';
    end if;
  end if;
  perform set_config('groundwork.assignee_change', 'by_hand', true);
  delete from public.task_assignees a where a.id = target_row.id;
  perform set_config('groundwork.assignee_change', '', true);
end;
$$;

-- Ticking a task done (or undoing it). With completion "any", one tick by an
-- assignee (or anyone who can edit the task) finishes it. With "all", each
-- assignee ticks their own part and the task is done when everyone has.
-- Returns the task's status afterwards.
create function public.set_task_done(task_id uuid, done boolean) returns public.task_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  me uuid;
  mine boolean;
  has_assignees boolean;
  result public.task_status;
begin
  select * into t from public.tasks tk where tk.id = set_task_done.task_id;
  if not found or not public.can_view_task(t.id) then
    raise exception 'That task doesn''t exist' using errcode = 'P0002';
  end if;
  if t.project_id is not null and not public.project_is_active(t.project_id) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;
  me := public.my_membership_id(t.organization_id);
  mine := exists (select 1 from public.task_assignees a where a.task_id = t.id and a.membership_id = me);
  has_assignees := exists (select 1 from public.task_assignees a where a.task_id = t.id);

  if t.completion = 'all' and has_assignees then
    if not mine then
      raise exception 'Each person assigned ticks their own part' using errcode = '42501', hint = 'completion_all';
    end if;
    update public.task_assignees a set done_at = case when set_task_done.done then coalesce(a.done_at, now()) end
    where a.task_id = t.id and a.membership_id = me;
    result := case
      when not exists (select 1 from public.task_assignees a where a.task_id = t.id and a.done_at is null) then 'done'
      else 'in_progress'
    end;
  else
    if not mine and not public.can_edit_task(t.id) then
      raise exception 'Only the people on this task, or someone who can edit it, can tick it off'
        using errcode = '42501', hint = 'done_not_allowed';
    end if;
    if not mine and public.outranked_by_creator(t.organization_id, t.created_by, t.created_by_role) then
      raise exception 'Someone ranked above you created this, so you can''t change it'
        using errcode = '42501', hint = 'outranked_by_creator';
    end if;
    result := case
      when set_task_done.done then 'done'
      when has_assignees then 'in_progress'
      else 'todo'
    end;
  end if;

  if result is distinct from t.status then
    update public.tasks tk set status = result where tk.id = t.id;
  end if;
  return result;
end;
$$;

revoke execute on function public.claim_task(uuid) from public, anon;
revoke execute on function public.unclaim_task(uuid) from public, anon;
revoke execute on function public.appoint_to_task(uuid, uuid, uuid) from public, anon;
revoke execute on function public.remove_task_assignee(uuid, uuid, uuid) from public, anon;
revoke execute on function public.set_task_done(uuid, boolean) from public, anon;
grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.unclaim_task(uuid) to authenticated;
grant execute on function public.appoint_to_task(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_task_assignee(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_task_done(uuid, boolean) to authenticated;

-- RLS on the new tables -------------------------------------------------------------------

alter table public.task_assignees enable row level security;
alter table public.task_shares enable row level security;

create policy task_assignees_select on public.task_assignees
  for select to authenticated
  using (public.can_view_task(task_id));
-- assignees change only through claim_task, appoint_to_task, unclaim_task,
-- remove_task_assignee and set_task_done
create policy task_assignees_insert on public.task_assignees
  for insert to authenticated
  with check (false);
create policy task_assignees_update on public.task_assignees
  for update to authenticated
  using (false) with check (false);
create policy task_assignees_delete on public.task_assignees
  for delete to authenticated
  using (false);

create policy task_shares_select on public.task_shares
  for select to authenticated
  using (public.can_view_task(task_id));
create policy task_shares_insert on public.task_shares
  for insert to authenticated
  with check (public.is_member(organization_id) and public.can_share_task(task_id));
-- a share is added or removed, never edited
create policy task_shares_update on public.task_shares
  for update to authenticated
  using (false) with check (false);
create policy task_shares_delete on public.task_shares
  for delete to authenticated
  using (public.can_share_task(task_id));

revoke all on table public.task_assignees from anon, authenticated;
revoke all on table public.task_shares from anon, authenticated;
-- the policies decide (assignee writes are refused outright; see above)
grant select, insert, update, delete on table public.task_assignees to authenticated;
grant select, insert, update, delete on table public.task_shares to authenticated;

-- Releasing work when someone leaves -------------------------------------------------------

-- Off a project: their open tasks there lose them (the delete flags the task).
create or replace function public.release_project_tasks() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- nothing to do while the project, the person or the organization is being
  -- deleted: those cascades clear or delete the rows themselves
  if not exists (select 1 from public.organizations o where o.id = old.organization_id)
     or not exists (select 1 from public.projects p where p.id = old.project_id)
     or not exists (select 1 from public.memberships m where m.id = old.membership_id) then
    return old;
  end if;
  -- owners keep seeing every project
  if exists (select 1 from public.memberships m where m.id = old.membership_id and m.role = 'owner') then
    return old;
  end if;
  delete from public.task_assignees a
  using public.tasks t
  where t.id = a.task_id and t.project_id = old.project_id
    and a.membership_id = old.membership_id and t.status <> 'done';
  return old;
end;
$$;

-- An invitation loses a project: its open tasks there lose the invitee.
create or replace function public.release_invitation_tasks() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.invitations i where i.id = old.invitation_id)
     or not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;
  delete from public.task_assignees a
  using public.tasks t
  where t.id = a.task_id and t.project_id = old.project_id and a.invitation_id = old.invitation_id;
  return old;
end;
$$;

-- remove_member (D73): open work goes to the heir where they can see it; the
-- rest loses them and is flagged. Personal tasks stay with their creator.
create or replace function public.remove_member(membership_id uuid, reassign_to uuid default null)
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

  if heir.id is not null then
    -- where the heir is already on the task, the leaver simply comes off
    with moved as (
      update public.task_assignees a
      set membership_id = heir.id, added_by = auth.uid()
      from public.tasks t
      where t.id = a.task_id and a.membership_id = target.id
        and t.status <> 'done' and t.kind <> 'personal'
        and not exists (select 1 from public.task_assignees b where b.task_id = a.task_id and b.membership_id = heir.id)
        and (
          heir.role = 'owner'
          or t.project_id is null
          or exists (select 1 from public.project_members pm where pm.project_id = t.project_id and pm.membership_id = heir.id)
        )
      returning 1
    )
    select count(*) into reassigned from moved;
  end if;

  -- open work they're still on, and nobody else is, gets flagged as it's released
  select count(*) into flagged
  from public.task_assignees a
  join public.tasks t on t.id = a.task_id
  where a.membership_id = target.id and t.status <> 'done'
    and not exists (select 1 from public.task_assignees b where b.task_id = a.task_id and b.id <> a.id);

  -- the last-owner guard still applies and rolls all of this back
  delete from public.memberships m where m.id = target.id;

  return jsonb_build_object('reassigned', reassigned, 'flagged', flagged);
end;
$$;

-- accept_invitation: work given to the invitee becomes theirs where they can
-- see it; anything else is released and flagged.
create or replace function public.accept_invitation(token text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.invitations;
  verified text := public.my_verified_email();
  user_email text;
  org_slug text;
  new_membership uuid;
  released uuid[];
begin
  if uid is null then
    raise exception 'You must be signed in to accept an invitation' using errcode = '42501';
  end if;

  select * into inv from public.invitations i where i.token = accept_invitation.token for update;
  if not found then
    raise exception 'This invitation does not exist' using errcode = 'P0002', hint = 'invite_not_found';
  end if;

  select o.slug into org_slug from public.organizations o where o.id = inv.organization_id;
  select u.email into user_email from auth.users u where u.id = uid;

  if lower(coalesce(user_email, '')) <> lower(inv.email) then
    raise exception 'This invitation was sent to a different email address'
      using errcode = '42501', hint = 'invite_wrong_user';
  end if;
  if verified is null or verified <> lower(inv.email) then
    raise exception 'Confirm your email address before accepting this invitation'
      using errcode = '42501', hint = 'invite_unverified';
  end if;

  if inv.accepted_at is not null then
    if exists (select 1 from public.memberships m where m.organization_id = inv.organization_id and m.user_id = uid) then
      return org_slug;
    end if;
    raise exception 'This invitation has already been used' using errcode = 'P0001', hint = 'invite_used';
  end if;

  if inv.expires_at < now() then
    raise exception 'This invitation has expired' using errcode = 'P0001', hint = 'invite_expired';
  end if;

  insert into public.profiles (id, email)
  values (uid, coalesce(user_email, ''))
  on conflict (id) do nothing;
  -- the name they were invited under, unless they've already given their own
  if inv.name is not null then
    update public.profiles p set full_name = inv.name
    where p.id = uid and coalesce(btrim(p.full_name), '') = '';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role)
  on conflict (organization_id, user_id) do nothing;
  select m.id into new_membership from public.memberships m
  where m.organization_id = inv.organization_id and m.user_id = uid;

  -- the granted projects, capped by the role they actually hold
  insert into public.project_members (organization_id, project_id, membership_id, role)
  select ip.organization_id, ip.project_id, new_membership,
    public.project_role_for_rank(least(
      public.project_role_rank(ip.role),
      public.project_rank_ceiling((select m.role from public.memberships m where m.id = new_membership))
    ))
  from public.invitation_projects ip
  where ip.invitation_id = inv.id
  on conflict (project_id, membership_id) do nothing;

  -- work given to them while they were pending becomes theirs (on tasks they
  -- can now see and aren't already on); anything else is released and flagged
  update public.task_assignees a
  set membership_id = new_membership, invitation_id = null
  from public.tasks t
  where t.id = a.task_id and a.invitation_id = inv.id
    and (t.project_id is null or exists (
      select 1 from public.project_members pm where pm.project_id = t.project_id and pm.membership_id = new_membership
    ))
    and not exists (select 1 from public.task_assignees b where b.task_id = a.task_id and b.membership_id = new_membership);

  with gone as (
    delete from public.task_assignees a where a.invitation_id = inv.id returning a.task_id
  )
  select coalesce(array_agg(task_id), '{}') into released from gone;
  update public.tasks t set needs_assignee = true
  where t.id = any (released) and t.status <> 'done'
    and not exists (select 1 from public.task_assignees a where a.task_id = t.id);

  update public.invitations set accepted_at = now() where id = inv.id;

  return org_slug;
end;
$$;

-- Activity: entries about tasks follow can_view_task --------------------------------------
-- An entry about a task that still exists is shown to whoever can see the
-- task. Once a task is deleted, an entry about a personal or hidden one is
-- shown only to owners (it's marked restricted when it's written).

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
    if entity = 'task' and rec ->> 'project_id' is not null
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
    and (
      entity_type <> 'task'
      or public.can_view_task(entity_id)
      or (
        not exists (select 1 from public.tasks t where t.id = entity_id)
        and (metadata ->> 'restricted' is null or public.has_permission(organization_id, 'owner'))
      )
    )
  );
