-- Report share links (security audit, D113).
-- Links are created only through create_report_share(), which sets who made
-- it and when (a client-chosen created_at let a link outlive the 90-day cap),
-- checks the snapshot matches its template and stamps the organization's real
-- name on it. Only a link's creator and owners can list links (managers could
-- read snapshots of programs they aren't on). A link stops working if its
-- creator is no longer allowed to make that report.

create function public.create_report_share(
  org uuid,
  template public.report_template,
  title text,
  snapshot jsonb,
  token_hash text,
  days integer
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  share_id uuid;
  org_name text;
begin
  if not public.is_member(org) then
    raise exception 'Not a member of this organization' using errcode = '42501';
  end if;
  if template = 'attendance' then
    raise exception 'Attendance reports are never shared by link' using errcode = '23514', hint = 'attendance_private';
  end if;
  if template = 'costs' and not public.has_permission(org, 'manager') then
    raise exception 'Only owners and managers share costs' using errcode = '42501', hint = 'costs_private';
  end if;
  if days not in (7, 30, 90) then
    raise exception 'Links last 7, 30 or 90 days' using errcode = '23514';
  end if;
  if jsonb_typeof(snapshot) <> 'object'
     or snapshot ->> 'template' is distinct from template::text
     or jsonb_typeof(snapshot -> 'sections') is distinct from 'array' then
    raise exception 'That isn''t a report of this kind' using errcode = '22023', hint = 'bad_snapshot';
  end if;
  select o.name into org_name from public.organizations o where o.id = org;
  insert into public.report_shares (organization_id, template, title, snapshot, token_hash, created_by, created_at, expires_at)
  values (
    org,
    template,
    title,
    jsonb_set(snapshot, '{organization}', to_jsonb(org_name)),
    token_hash,
    auth.uid(),
    now(),
    now() + make_interval(days => days)
  )
  returning id into share_id;
  return share_id;
end;
$$;

revoke execute on function public.create_report_share(uuid, public.report_template, text, jsonb, text, integer) from public, anon;
grant execute on function public.create_report_share(uuid, public.report_template, text, jsonb, text, integer) to authenticated;

drop policy report_shares_insert on public.report_shares;
create policy report_shares_insert on public.report_shares
  for insert to authenticated
  with check (false);
revoke insert on table public.report_shares from authenticated;

drop policy report_shares_select on public.report_shares;
create policy report_shares_select on public.report_shares
  for select to authenticated
  using (
    public.is_member(organization_id)
    and (created_by = auth.uid() or public.has_permission(organization_id, 'owner'))
  );
drop policy report_shares_update on public.report_shares;
create policy report_shares_update on public.report_shares
  for update to authenticated
  using (public.is_member(organization_id) and (created_by = auth.uid() or public.has_permission(organization_id, 'owner')))
  with check (public.is_member(organization_id) and (created_by = auth.uid() or public.has_permission(organization_id, 'owner')));

create or replace function public.shared_report(token text)
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
    and exists (
      select 1 from public.memberships m
      where m.organization_id = s.organization_id and m.user_id = s.created_by
        and (s.template <> 'costs' or m.role in ('owner', 'manager'))
    );
$$;
