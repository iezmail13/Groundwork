-- Funds and how they're split (owner's request; CLAUDE.md scope changed to
-- allow it). A fund is an amount of money, such as a grant or a donation
-- drive, divided into labelled allocations. A fund, or any one allocation,
-- can be linked to the project it pays for. This is planning, not accounting:
-- no transactions, payments or bank data.
--
-- Only owners and managers see or change funds, and fund activity is hidden
-- from everyone else too. Allocations can never add up to more than the fund.

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  -- whole cents, so sums are exact
  total_cents bigint not null check (total_cents between 0 and 100000000000000),
  currency text not null default 'CAD' check (currency in ('CAD', 'USD', 'EUR', 'GBP')),
  project_id uuid,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete set null (project_id)
);

create index funds_org_idx on public.funds (organization_id, name);
create index funds_project_idx on public.funds (project_id);

create table public.fund_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fund_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000000),
  project_id uuid,
  position double precision not null default extract(epoch from clock_timestamp()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (fund_id, organization_id)
    references public.funds (id, organization_id) on delete cascade,
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete set null (project_id)
);

create index fund_allocations_fund_idx on public.fund_allocations (fund_id, position);
create index fund_allocations_project_idx on public.fund_allocations (project_id);

create trigger funds_set_updated_at
  before update on public.funds
  for each row execute function public.set_updated_at();
create trigger funds_immutable
  before update on public.funds
  for each row execute function public.forbid_column_changes('organization_id', 'created_by');
create trigger fund_allocations_set_updated_at
  before update on public.fund_allocations
  for each row execute function public.set_updated_at();
create trigger fund_allocations_immutable
  before update on public.fund_allocations
  for each row execute function public.forbid_column_changes('organization_id', 'fund_id');

-- Never more allocated than the fund holds ----------------------------------------------

create function public.check_fund_balance() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := (to_jsonb(new) ->> case when tg_table_name = 'funds' then 'id' else 'fund_id' end)::uuid;
  total bigint;
  allocated bigint;
begin
  select f.total_cents into total from public.funds f where f.id = target for update;
  select coalesce(sum(a.amount_cents), 0) into allocated from public.fund_allocations a where a.fund_id = target;
  if allocated > total then
    raise exception 'The allocations add up to more than the fund''s total'
      using errcode = '23514', hint = 'fund_overallocated';
  end if;
  return null;
end;
$$;

-- after-row triggers run once the statement has finished, so a batch is checked as a whole
create constraint trigger fund_allocations_balance
  after insert or update of amount_cents on public.fund_allocations
  for each row execute function public.check_fund_balance();
create constraint trigger funds_balance
  after update of total_cents on public.funds
  for each row execute function public.check_fund_balance();

-- RLS: owners and managers only ------------------------------------------------------------

alter table public.funds enable row level security;
alter table public.fund_allocations enable row level security;

create policy funds_select on public.funds
  for select to authenticated
  using (public.has_permission(organization_id, 'manager'));
create policy funds_insert on public.funds
  for insert to authenticated
  with check (public.has_permission(organization_id, 'manager') and created_by = auth.uid());
create policy funds_update on public.funds
  for update to authenticated
  using (public.has_permission(organization_id, 'manager'))
  with check (public.has_permission(organization_id, 'manager'));
create policy funds_delete on public.funds
  for delete to authenticated
  using (public.has_permission(organization_id, 'manager'));

create policy fund_allocations_select on public.fund_allocations
  for select to authenticated
  using (public.has_permission(organization_id, 'manager'));
create policy fund_allocations_insert on public.fund_allocations
  for insert to authenticated
  with check (public.has_permission(organization_id, 'manager'));
create policy fund_allocations_update on public.fund_allocations
  for update to authenticated
  using (public.has_permission(organization_id, 'manager'))
  with check (public.has_permission(organization_id, 'manager'));
create policy fund_allocations_delete on public.fund_allocations
  for delete to authenticated
  using (public.has_permission(organization_id, 'manager'));

revoke all on table public.funds from anon, authenticated;
revoke all on table public.fund_allocations from anon, authenticated;
grant select, insert, update, delete on table public.funds to authenticated;
grant select, insert, update, delete on table public.fund_allocations to authenticated;

-- Activity: fund entries are seen only by owners and managers -----------------------------

alter table public.activity_log drop constraint activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('project', 'task', 'event', 'document', 'participant', 'fund'));

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
  );

-- A fund's own changes, and changes to its allocations, are entries about the fund.
create function public.log_fund_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  fund_id uuid := case when tg_table_name = 'funds' then (rec ->> 'id')::uuid else (rec ->> 'fund_id')::uuid end;
  org_id uuid := (rec ->> 'organization_id')::uuid;
  fund_name text;
  verb text;
  actor_name text;
begin
  -- only people's changes are history; the seed and admin scripts write as nobody
  if auth.uid() is null then
    return null;
  end if;
  -- cascades from deleting the organization or the fund aren't worth logging
  if not exists (select 1 from public.organizations o where o.id = org_id) then
    return null;
  end if;
  if tg_table_name = 'fund_allocations' and not exists (select 1 from public.funds f where f.id = fund_id) then
    return null;
  end if;

  if tg_table_name = 'funds' then
    fund_name := rec ->> 'name';
    verb := case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end;
  else
    select f.name into fund_name from public.funds f where f.id = fund_id;
    verb := 'updated';
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), p.email) into actor_name
  from public.profiles p where p.id = auth.uid();

  insert into public.activity_log (organization_id, actor_membership_id, entity_type, entity_id, action, metadata)
  values (
    org_id,
    (select m.id from public.memberships m where m.organization_id = org_id and m.user_id = auth.uid()),
    'fund',
    fund_id,
    verb,
    jsonb_strip_nulls(jsonb_build_object('label', fund_name, 'actor_name', actor_name))
  );
  return null;
end;
$$;

create trigger funds_activity
  after insert or update or delete on public.funds
  for each row execute function public.log_fund_activity();
create trigger fund_allocations_activity
  after insert or update or delete on public.fund_allocations
  for each row execute function public.log_fund_activity();
