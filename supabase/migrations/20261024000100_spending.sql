-- Finance (D108): budgets and spending against them. Tracking, not
-- accounting: no bank feeds, tax, payroll, invoices or sync (D82, D91).
--
-- A fund is the budget: its total, an optional deadline for spending it, and
-- the programs it pays for (the fund's own program and its allocations').
-- Spending entries record money spent against a fund for a program, with an
-- optional receipt, and go through approval.
--
--   * Anyone on a program can submit an entry for it, and sees only their own.
--     They never see budgets, totals or anyone else's entries.
--   * Owners and managers see every entry and approve or reject them. Nobody
--     decides on their own entry, and the approver must rank above the
--     submitter (owners, whom nobody outranks, are decided by another owner).
--   * Only approved entries count as spent.
--
-- Bookkeeping work is ordinary work: tasks gain an optional link (to the
-- accounting software, say). Settings → Finance holds a plain link to the
-- organization's accounting software: no sign-in, no credentials, no API.

alter table public.funds
  add column spend_by date;

-- the link to the organization's own accounting software
alter table public.organizations
  add column accounting_name text check (accounting_name is null or accounting_name in ('QuickBooks', 'Xero', 'Wave', 'Sage', 'Other')),
  add column accounting_url text check (
    accounting_url is null or (accounting_url ~ '^https://[^\s]+$' and char_length(accounting_url) <= 500)
  );
grant update (accounting_name, accounting_url) on table public.organizations to authenticated;

-- managers may update the organization, but only owners set the accounting link
create function public.guard_accounting_link() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
    and (new.accounting_name is distinct from old.accounting_name or new.accounting_url is distinct from old.accounting_url)
    and not public.has_permission(new.id, 'owner') then
    raise exception 'Only owners set the accounting software link' using errcode = '42501', hint = 'owner_only';
  end if;
  return new;
end;
$$;

create trigger organizations_accounting_link
  before update of accounting_name, accounting_url on public.organizations
  for each row execute function public.guard_accounting_link();

-- an optional link on work, for bookkeeping tasks and the like
alter table public.tasks
  add column link_url text check (link_url is null or (link_url ~ '^https?://[^\s]+$' and char_length(link_url) <= 500));

create type public.spending_status as enum ('pending', 'approved', 'rejected');

create table public.spending_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fund_id uuid not null,
  project_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 100000000000000),
  category text not null check (char_length(btrim(category)) between 1 and 60),
  spent_on date not null,
  note text check (note is null or char_length(note) <= 1000),
  receipt_path text,
  submitted_by uuid references public.profiles (id) on delete set null default auth.uid(),
  status public.spending_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (fund_id, organization_id) references public.funds (id, organization_id) on delete cascade,
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  check (receipt_path is null or receipt_path ~ ('^' || organization_id::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$')),
  check ((status = 'pending') = (decided_by is null and decided_at is null))
);

create index spending_entries_fund_idx on public.spending_entries (fund_id, spent_on);
create index spending_entries_submitter_idx on public.spending_entries (submitted_by);

create trigger spending_entries_set_updated_at
  before update on public.spending_entries
  for each row execute function public.set_updated_at();

-- Which funds pay for a program ---------------------------------------------------------------

create function public.fund_pays_for(fund uuid, project uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.funds f where f.id = fund and f.project_id = project)
    or exists (select 1 from public.fund_allocations a where a.fund_id = fund and a.project_id = project);
$$;
revoke execute on function public.fund_pays_for(uuid, uuid) from public, anon, authenticated;

-- The funds someone on a program can spend against: names only, never amounts.
create function public.spendable_funds(project uuid)
returns table (id uuid, name text, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.name, f.currency
  from public.funds f
  where public.can_view_project(project)
    and public.fund_pays_for(f.id, project)
  order by f.name;
$$;
revoke execute on function public.spendable_funds(uuid) from public, anon;
grant execute on function public.spendable_funds(uuid) to authenticated;

-- The active programs someone can see that a fund pays for: where they can submit spending.
create function public.my_projects_with_funds(org uuid)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name
  from public.projects p
  where p.organization_id = org
    and p.status = 'active'
    and public.can_view_project(p.id)
    and exists (select 1 from public.funds f where f.organization_id = org and public.fund_pays_for(f.id, p.id))
  order by p.name;
$$;
revoke execute on function public.my_projects_with_funds(uuid) from public, anon;
grant execute on function public.my_projects_with_funds(uuid) to authenticated;

-- RLS -------------------------------------------------------------------------------------------

alter table public.spending_entries enable row level security;

-- owners and managers see every entry; everyone else sees only their own,
-- and only while they're still on its program
create policy spending_entries_select on public.spending_entries
  for select to authenticated
  using (
    public.is_member(organization_id)
    and (
      public.has_permission(organization_id, 'manager')
      or (submitted_by = auth.uid() and public.can_view_project(project_id))
    )
  );
create policy spending_entries_insert on public.spending_entries
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and status = 'pending'
    and public.is_member(organization_id)
    and public.can_view_project(project_id)
    and public.project_is_active(project_id)
    and public.fund_pays_for(fund_id, project_id)
  );
-- submitters change their own entry while it waits (decisions go through decide_spending)
create policy spending_entries_update on public.spending_entries
  for update to authenticated
  using (submitted_by = auth.uid() and status = 'pending' and public.can_view_project(project_id))
  with check (
    submitted_by = auth.uid() and status = 'pending'
    and public.can_view_project(project_id) and public.fund_pays_for(fund_id, project_id)
  );
-- submitters withdraw their own waiting entry; owners remove any
create policy spending_entries_delete on public.spending_entries
  for delete to authenticated
  using (
    (submitted_by = auth.uid() and status = 'pending')
    or public.has_permission(organization_id, 'owner')
  );

revoke all on table public.spending_entries from anon, authenticated;
grant select, insert, delete on table public.spending_entries to authenticated;
grant update (fund_id, project_id, amount_cents, category, spent_on, note, receipt_path) on table public.spending_entries to authenticated;

-- Deciding ------------------------------------------------------------------------------------------

create function public.decide_spending(entry uuid, approve boolean, note text default null)
returns public.spending_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.spending_entries;
  my_rank integer;
  their_rank integer;
  result public.spending_status := case when approve then 'approved' else 'rejected' end;
begin
  select * into e from public.spending_entries s where s.id = entry for update;
  if not found or not public.is_member(e.organization_id) then
    raise exception 'That entry doesn''t exist' using errcode = 'P0002';
  end if;
  if not public.has_permission(e.organization_id, 'manager') then
    raise exception 'Only owners and managers approve spending' using errcode = '42501', hint = 'not_approver';
  end if;
  if e.submitted_by = auth.uid() then
    raise exception 'Nobody approves their own spending' using errcode = '42501', hint = 'own_entry';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;
  select public.role_rank(m.role) into my_rank from public.memberships m where m.organization_id = e.organization_id and m.user_id = auth.uid();
  select public.role_rank(m.role) into their_rank from public.memberships m where m.organization_id = e.organization_id and m.user_id = e.submitted_by;
  -- the approver ranks above the submitter; an owner, whom nobody outranks, is decided by another owner
  if their_rank is not null and not (my_rank > their_rank or (my_rank = 4 and their_rank = 4)) then
    raise exception 'Only someone ranked above them can decide on this' using errcode = '42501', hint = 'rank';
  end if;
  update public.spending_entries s
  set status = result, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(note), '')
  where s.id = entry;
  return result;
end;
$$;
revoke execute on function public.decide_spending(uuid, boolean, text) from public, anon;
grant execute on function public.decide_spending(uuid, boolean, text) to authenticated;

-- Budget against actual: approved and waiting spending per fund, for owners and managers.
create function public.fund_spending(org uuid)
returns table (fund_id uuid, approved_cents bigint, pending_cents bigint, last_spent_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select s.fund_id,
    coalesce(sum(s.amount_cents) filter (where s.status = 'approved'), 0)::bigint,
    coalesce(sum(s.amount_cents) filter (where s.status = 'pending'), 0)::bigint,
    max(s.spent_on) filter (where s.status = 'approved')
  from public.spending_entries s
  where s.organization_id = org and public.has_permission(org, 'manager')
  group by s.fund_id;
$$;
revoke execute on function public.fund_spending(uuid) from public, anon;
grant execute on function public.fund_spending(uuid) to authenticated;

-- Receipts ------------------------------------------------------------------------------------------
-- A private bucket at {organization_id}/{uploader}/{uuid}.{ext}. The uploader
-- writes into their own folder; owners and managers, and the uploader, read.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.can_read_receipt(name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (storage.foldername(name))[1] !~ '^[0-9a-f-]{36}$' then false
    else public.is_member(((storage.foldername(name))[1])::uuid) and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.has_permission(((storage.foldername(name))[1])::uuid, 'manager')
    )
  end;
$$;
revoke execute on function public.can_read_receipt(text) from public, anon;
grant execute on function public.can_read_receipt(text) to authenticated;

create policy receipts_select on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.can_read_receipt(name));
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
  );
create policy receipts_update on storage.objects
  for update to authenticated
  using (false) with check (false);
create policy receipts_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[2] = auth.uid()::text and public.can_read_receipt(name));
