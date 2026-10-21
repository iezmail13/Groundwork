-- Helpers answer only about the caller's own organizations (security audit, D113).
-- These run as definer and could confirm who belongs to another organization,
-- or which program a fund pays for, given ids from elsewhere.

create or replace function public.mentions_in(body text, org uuid) returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
  from regexp_matches(coalesce(body, ''), '<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') as hit(id)
  join public.memberships m on m.user_id = hit.id[1]::uuid and m.organization_id = org
  -- the demo seed runs as the service role, with no signed-in user
  where auth.uid() is null or public.is_member(org);
$$;

create or replace function public.fund_pays_for(fund uuid, project uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.funds f where f.id = fund and f.project_id = project and public.is_member(f.organization_id))
    or exists (
      select 1 from public.fund_allocations a
      join public.funds f on f.id = a.fund_id
      where a.fund_id = fund and a.project_id = project and public.is_member(f.organization_id)
    );
$$;

-- only used inside other definer functions
revoke execute on function public.task_creator_rank(uuid) from authenticated;
