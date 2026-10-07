-- Per-member dashboard layout (widget order, size, visibility).
-- Private: a member can read and write only their own row.

create table public.dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null unique,
  layout jsonb not null check (jsonb_typeof(layout) = 'object'),
  updated_at timestamptz not null default now(),
  foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete cascade
);

create trigger dashboard_layouts_set_updated_at
  before update on public.dashboard_layouts
  for each row execute function public.set_updated_at();
create trigger dashboard_layouts_immutable
  before update on public.dashboard_layouts
  for each row execute function public.forbid_column_changes('organization_id', 'membership_id');

alter table public.dashboard_layouts enable row level security;

create policy dashboard_layouts_select on public.dashboard_layouts
  for select to authenticated
  using (membership_id = public.my_membership_id(organization_id));
create policy dashboard_layouts_insert on public.dashboard_layouts
  for insert to authenticated
  with check (membership_id = public.my_membership_id(organization_id));
create policy dashboard_layouts_update on public.dashboard_layouts
  for update to authenticated
  using (membership_id = public.my_membership_id(organization_id))
  with check (membership_id = public.my_membership_id(organization_id));
create policy dashboard_layouts_delete on public.dashboard_layouts
  for delete to authenticated
  using (membership_id = public.my_membership_id(organization_id));

revoke all on table public.dashboard_layouts from anon, authenticated;
grant select, insert, update, delete on table public.dashboard_layouts to authenticated;
