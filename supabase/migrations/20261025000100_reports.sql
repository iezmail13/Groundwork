-- Reports (D109): templated reports on progress, people's workload, costs
-- and attendance. A report only ever holds what the person generating it can
-- see: it's built through the same functions and RLS as everything else.
--
-- Reports are sent by share link, not email (no email, per CLAUDE.md): a
-- read-only snapshot of the report as its creator saw it, behind a long
-- random token (only its hash is stored), with an expiry of at most 90 days,
-- and revocable. Attendance reports hold participant data and are never
-- shared by link. Generating, exporting, sharing and revoking are recorded
-- in the activity log, which only owners and managers see for reports.

alter table public.activity_log drop constraint activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('project', 'task', 'event', 'document', 'participant', 'fund', 'organization', 'report'));

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
    and (
      entity_type <> 'task'
      or public.can_view_task(entity_id)
      or (
        not exists (select 1 from public.tasks t where t.id = entity_id)
        and (metadata ->> 'restricted' is null or public.has_permission(organization_id, 'owner'))
      )
    )
  );

create type public.report_template as enum ('progress', 'resources', 'costs', 'attendance');

create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template public.report_template not null check (template <> 'attendance'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- the report as its creator saw it when sharing
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 500000),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);

create index report_shares_org_idx on public.report_shares (organization_id, created_at desc);

alter table public.report_shares enable row level security;

-- creators see their own links; owners and managers see every link
create policy report_shares_select on public.report_shares
  for select to authenticated
  using (
    public.is_member(organization_id)
    and (created_by = auth.uid() or public.has_permission(organization_id, 'manager'))
  );
-- anyone may share a report they can generate; costs are for owners and managers
create policy report_shares_insert on public.report_shares
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_member(organization_id)
    and revoked_at is null
    and (template <> 'costs' or public.has_permission(organization_id, 'manager'))
  );
-- only revoking is allowed (only revoked_at is granted), by the creator or a manager
create policy report_shares_update on public.report_shares
  for update to authenticated
  using (public.is_member(organization_id) and (created_by = auth.uid() or public.has_permission(organization_id, 'manager')))
  with check (public.is_member(organization_id) and (created_by = auth.uid() or public.has_permission(organization_id, 'manager')));
create policy report_shares_delete on public.report_shares
  for delete to authenticated
  using (false);

revoke all on table public.report_shares from anon, authenticated;
grant select, insert, delete on table public.report_shares to authenticated;
grant update (revoked_at) on table public.report_shares to authenticated;

-- a revoked link stays revoked
create function public.keep_share_revoked() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
  end if;
  return new;
end;
$$;

create trigger report_shares_keep_revoked
  before update on public.report_shares
  for each row execute function public.keep_share_revoked();

-- Recording report activity ---------------------------------------------------------------------

create function public.log_report(org uuid, action text, details jsonb default '{}'::jsonb, report uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_member(org) then
    raise exception 'Not a member of this organization' using errcode = '42501';
  end if;
  if action not in ('generated', 'exported_csv', 'printed', 'shared', 'revoked') then
    raise exception 'Unknown report action' using errcode = '22023';
  end if;
  insert into public.activity_log (organization_id, actor_membership_id, entity_type, entity_id, action, metadata)
  values (
    org,
    public.my_membership_id(org),
    'report',
    coalesce(report, gen_random_uuid()),
    action,
    -- only what the report was, never its contents
    jsonb_strip_nulls(jsonb_build_object(
      'template', details ->> 'template',
      'from', details ->> 'from',
      'to', details ->> 'to',
      'title', left(details ->> 'title', 200)
    ))
  );
end;
$$;

revoke execute on function public.log_report(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.log_report(uuid, text, jsonb, uuid) to authenticated;

-- Opening a shared link ------------------------------------------------------------------------------
-- Anyone with the token may read that one snapshot while it's live and its
-- creator is still in the organization. Nothing else is reachable through it.

create function public.shared_report(token text)
returns table (
  title text,
  template public.report_template,
  snapshot jsonb,
  organization_name text,
  shared_by text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.title, s.template, s.snapshot, o.name, coalesce(nullif(p.full_name, ''), 'Someone'), s.created_at, s.expires_at
  from public.report_shares s
  join public.organizations o on o.id = s.organization_id
  left join public.profiles p on p.id = s.created_by
  where char_length(coalesce(token, '')) between 32 and 128
    and s.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
    and exists (select 1 from public.memberships m where m.organization_id = s.organization_id and m.user_id = s.created_by);
$$;

revoke execute on function public.shared_report(text) from public;
grant execute on function public.shared_report(text) to anon, authenticated;
