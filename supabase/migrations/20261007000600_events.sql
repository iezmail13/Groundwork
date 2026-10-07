-- Calendar events (relabelled per preset: Session, Meeting, Lesson, ...).
-- All-day events are stored as UTC midnight to UTC midnight of the next day
-- and rendered by their UTC date, so they never drift across time zones.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text check (location is null or char_length(location) <= 200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete set null (project_id)
);

create index events_org_starts_idx on public.events (organization_id, starts_at);
create index events_project_idx on public.events (project_id);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
create trigger events_immutable
  before update on public.events
  for each row execute function public.forbid_column_changes('organization_id', 'created_by');

alter table public.events enable row level security;

create policy events_select on public.events
  for select to authenticated
  using (public.is_member(organization_id));
create policy events_insert on public.events
  for insert to authenticated
  with check (public.is_member(organization_id) and created_by = auth.uid());
create policy events_update on public.events
  for update to authenticated
  using (public.is_member(organization_id))
  with check (public.is_member(organization_id));
create policy events_delete on public.events
  for delete to authenticated
  using (public.has_role(organization_id, 'admin') or created_by = auth.uid());

revoke all on table public.events from anon, authenticated;
grant select, insert, update, delete on table public.events to authenticated;
