-- Projects (relabelled per preset: Program, Project, Subject, ...).

create type public.project_status as enum ('active', 'archived');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 4000),
  status public.project_status not null default 'active',
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  owner_membership_id uuid,
  start_date date,
  end_date date,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (start_date is null or end_date is null or end_date >= start_date),
  foreign key (owner_membership_id, organization_id)
    references public.memberships (id, organization_id) on delete set null (owner_membership_id)
);

create index projects_org_status_idx on public.projects (organization_id, status);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();
create trigger projects_immutable
  before update on public.projects
  for each row execute function public.forbid_column_changes('organization_id', 'created_by');

alter table public.projects enable row level security;

create policy projects_select on public.projects
  for select to authenticated
  using (public.is_member(organization_id));
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_member(organization_id) and created_by = auth.uid());
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_member(organization_id))
  with check (public.is_member(organization_id));
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.has_role(organization_id, 'admin') or created_by = auth.uid());

revoke all on table public.projects from anon, authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
