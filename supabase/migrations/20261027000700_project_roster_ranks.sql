-- Program rosters respect the organization's ranks (security audit, D113).
-- A program lead could remove or change someone who outranks them in the
-- organization. Now they can act only on people not ranked above them (owners
-- on anyone), and anyone may still take themselves off.

create function public.can_manage_project_member(org_id uuid, membership uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.id = membership and m.organization_id = org_id
      and (public.my_rank(org_id) = 4 or public.my_rank(org_id) >= public.role_rank(m.role))
  );
$$;

revoke execute on function public.can_manage_project_member(uuid, uuid) from public, anon;
grant execute on function public.can_manage_project_member(uuid, uuid) to authenticated, service_role;

drop policy project_members_update on public.project_members;
create policy project_members_update on public.project_members
  for update to authenticated
  using (
    public.can_grant_project_role(project_id, role)
    and public.project_is_active(project_id)
    and public.can_manage_project_member(organization_id, membership_id)
  )
  with check (public.can_grant_project_role(project_id, role));
drop policy project_members_delete on public.project_members;
create policy project_members_delete on public.project_members
  for delete to authenticated
  using (
    (public.can_grant_project_role(project_id, role) and public.can_manage_project_member(organization_id, membership_id))
    or membership_id = public.my_membership_id(organization_id)
  );
