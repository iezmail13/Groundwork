-- Tasks: one project, one assignee, one due date, one status.

create type public.task_status as enum ('todo', 'in_progress', 'done');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  status public.task_status not null default 'todo',
  assignee_membership_id uuid,
  due_date date,
  -- board order within a status column; new tasks land at the bottom
  position double precision not null default extract(epoch from clock_timestamp()),
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  foreign key (assignee_membership_id, organization_id)
    references public.memberships (id, organization_id) on delete set null (assignee_membership_id)
);

create index tasks_org_status_position_idx on public.tasks (organization_id, status, position);
create index tasks_org_due_idx on public.tasks (organization_id, due_date);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_membership_id);

create function public.set_task_completed_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_completed_at
  before insert or update of status on public.tasks
  for each row execute function public.set_task_completed_at();
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger tasks_immutable
  before update on public.tasks
  for each row execute function public.forbid_column_changes('organization_id', 'created_by');

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_member(organization_id));
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_member(organization_id) and created_by = auth.uid());
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_member(organization_id))
  with check (public.is_member(organization_id));
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.has_role(organization_id, 'admin') or created_by = auth.uid());

revoke all on table public.tasks from anon, authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
