-- Role ladder, step 2: rank-based permissions, ownership safety, ownership
-- transfer, and can_view_task() as the single source of truth for task
-- visibility.
--
--   owner (4) > manager (3) > admin (2) > staff (1)
--
-- Owners and managers handle settings and members and can delete anything.
-- Nobody grants a role above their own or changes someone ranked at or above
-- them, except owners. Every organization keeps at least one owner.

-- Ranks -----------------------------------------------------------------------

create function public.role_rank(role public.member_role) returns int
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case role
    when 'owner' then 4
    when 'manager' then 3
    when 'admin' then 2
    when 'staff' then 1
  end;
$$;

-- The caller's rank in an organization, read live from the membership row
-- (0 when they aren't a member), so a promotion or demotion applies at once.
create function public.my_rank(org_id uuid) returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.role_rank(m.role) from public.memberships m
     where m.organization_id = org_id and m.user_id = auth.uid()),
    0
  );
$$;

-- has_permission(org, 'manager') is true for managers and owners, and so on
-- down the ladder. Replaces has_role().
create function public.has_permission(org_id uuid, required public.member_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_rank(org_id) >= public.role_rank(required);
$$;

-- Whether the caller may give someone this role: managers and owners only,
-- and only below their own rank, except that owners may make other owners.
create function public.can_grant_role(org_id uuid, role public.member_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.my_rank(org_id) = 4 then true
    when public.my_rank(org_id) = 3 then public.role_rank(role) < 3
    else false
  end;
$$;

-- Whether the caller may change or remove someone who holds this role:
-- owners anyone, managers only those ranked below them.
create function public.can_manage_member(org_id uuid, role public.member_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.my_rank(org_id) = 4 then true
    when public.my_rank(org_id) = 3 then public.role_rank(role) < 3
    else false
  end;
$$;

revoke execute on function public.my_rank(uuid) from public, anon;
revoke execute on function public.has_permission(uuid, public.member_role) from public, anon;
revoke execute on function public.can_grant_role(uuid, public.member_role) from public, anon;
revoke execute on function public.can_manage_member(uuid, public.member_role) from public, anon;
grant execute on function public.my_rank(uuid) to authenticated, service_role;
grant execute on function public.has_permission(uuid, public.member_role) to authenticated, service_role;
grant execute on function public.can_grant_role(uuid, public.member_role) to authenticated, service_role;
grant execute on function public.can_manage_member(uuid, public.member_role) to authenticated, service_role;

-- Task visibility ---------------------------------------------------------------

-- The one place that decides whether the caller can see a task. Today every
-- member of the task's organization can; project membership and task
-- audiences narrow this in later phases, and every task list, count, feed,
-- search and calendar feed goes through it so nothing leaks by title.
create function public.can_view_task(task_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_member(t.organization_id)
  );
$$;

revoke execute on function public.can_view_task(uuid) from public, anon;
grant execute on function public.can_view_task(uuid) to authenticated, service_role;

drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.can_view_task(id));

-- Ownership safety --------------------------------------------------------------

drop trigger memberships_guard_last_admin on public.memberships;
drop function public.guard_last_admin();

create function public.guard_last_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'owner')) then
    -- a cascade from deleting the whole organization is fine
    if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
      return old;
    end if;
    -- serialize concurrent demotions/removals within one organization
    perform 1 from public.organizations o where o.id = old.organization_id for update;
    if not exists (
      select 1 from public.memberships m
      where m.organization_id = old.organization_id and m.role = 'owner' and m.id <> old.id
    ) then
      raise exception 'An organization must keep at least one owner'
        using errcode = 'P0001', hint = 'last_owner';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_guard_last_owner
  before update or delete on public.memberships
  for each row execute function public.guard_last_owner();

-- Hands ownership to another member: they become an owner and the caller
-- steps down to manager, in one transaction.
create function public.transfer_ownership(org_id uuid, new_owner_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mine public.memberships;
  target public.memberships;
begin
  select * into mine from public.memberships m
  where m.organization_id = org_id and m.user_id = uid;
  if not found or mine.role <> 'owner' then
    raise exception 'Only an owner can transfer ownership' using errcode = '42501';
  end if;

  select * into target from public.memberships m
  where m.id = new_owner_membership_id and m.organization_id = org_id;
  if not found then
    raise exception 'That person is not in this organization' using errcode = 'P0002';
  end if;
  if target.id = mine.id then
    raise exception 'You already own this organization' using errcode = '22023';
  end if;

  -- promote first, so the last-owner guard always sees an owner
  update public.memberships set role = 'owner' where id = target.id;
  update public.memberships set role = 'manager' where id = mine.id;
end;
$$;

revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- Org creator is the owner ------------------------------------------------------

create or replace function public.create_organization(name text, preset_key text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  org_name text := btrim(coalesce(create_organization.name, ''));
  preset public.presets;
  base_slug text;
  candidate text;
  suffix int := 1;
  org public.organizations;
  starter jsonb;
  task jsonb;
  new_project_id uuid;
  task_position int;
begin
  if uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if char_length(org_name) not between 1 and 120 then
    raise exception 'Organization name must be 1 to 120 characters' using errcode = '22023';
  end if;

  select * into preset from public.presets p where p.key = create_organization.preset_key;
  if not found then
    raise exception 'Unknown preset' using errcode = '22023';
  end if;

  -- make sure the caller has a profile row (the auth trigger normally does this)
  insert into public.profiles (id, email)
  select u.id, coalesce(u.email, '') from auth.users u where u.id = uid
  on conflict (id) do nothing;

  base_slug := public.slugify(org_name);
  if base_slug = '' or base_slug in ('login', 'auth', 'invite', 'create-organization', 'api', 'logo', 'favicon', 'settings') then
    base_slug := 'org-' || coalesce(nullif(base_slug, ''), 'team');
  end if;
  candidate := base_slug;
  while exists (select 1 from public.organizations o where o.slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  insert into public.organizations (name, slug, preset_key, theme)
  values (org_name, candidate, preset.key, preset.theme)
  returning * into org;

  insert into public.memberships (organization_id, user_id, role)
  values (org.id, uid, 'owner');

  for starter in select * from jsonb_array_elements(coalesce(preset.starter_content -> 'projects', '[]'::jsonb)) loop
    insert into public.projects (organization_id, name, description, created_by)
    values (org.id, starter ->> 'name', starter ->> 'description', uid)
    returning id into new_project_id;

    task_position := 0;
    for task in select * from jsonb_array_elements(coalesce(starter -> 'tasks', '[]'::jsonb)) loop
      task_position := task_position + 1;
      insert into public.tasks (organization_id, project_id, title, due_date, position, created_by)
      values (
        org.id,
        new_project_id,
        task ->> 'title',
        case when task ? 'due_in_days' then current_date + (task ->> 'due_in_days')::int end,
        task_position,
        uid
      );
    end loop;
  end loop;

  return org;
end;
$$;

-- Policies: has_role() -> has_permission() and rank ceilings -------------------

drop policy organizations_update on public.organizations;
drop policy organizations_delete on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_permission(id, 'manager')) with check (public.has_permission(id, 'manager'));
-- deleting the whole organization is for owners only
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.has_permission(id, 'owner'));

drop policy memberships_insert on public.memberships;
drop policy memberships_update on public.memberships;
drop policy memberships_delete on public.memberships;
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.can_grant_role(organization_id, role));
-- the old row must be someone the caller may manage, the new role one they may grant
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.can_manage_member(organization_id, role))
  with check (public.can_grant_role(organization_id, role));
-- remove someone you outrank (owners: anyone), or leave yourself
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.can_manage_member(organization_id, role) or user_id = auth.uid());

drop policy invitations_select on public.invitations;
drop policy invitations_insert on public.invitations;
drop policy invitations_update on public.invitations;
drop policy invitations_delete on public.invitations;
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.has_permission(organization_id, 'manager'));
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.can_grant_role(organization_id, role) and invited_by = auth.uid());
create policy invitations_update on public.invitations
  for update to authenticated
  using (public.can_grant_role(organization_id, role))
  with check (public.can_grant_role(organization_id, role));
create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.can_grant_role(organization_id, role));

drop policy projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.has_permission(organization_id, 'manager') or created_by = auth.uid());

drop policy tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.has_permission(organization_id, 'manager') or created_by = auth.uid());

drop policy events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated
  using (public.has_permission(organization_id, 'manager') or created_by = auth.uid());

drop policy documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete to authenticated
  using (public.has_permission(organization_id, 'manager') or uploaded_by = auth.uid());

drop policy documents_bucket_update on storage.objects;
drop policy documents_bucket_delete on storage.objects;
create policy documents_bucket_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.has_permission(public.storage_org_id(name), 'manager')
      or (owner_id = auth.uid()::text and public.is_member(public.storage_org_id(name)))
    )
  )
  with check (bucket_id = 'documents' and public.is_member(public.storage_org_id(name)));
create policy documents_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.has_permission(public.storage_org_id(name), 'manager')
      or (owner_id = auth.uid()::text and public.is_member(public.storage_org_id(name)))
    )
  );

-- the log stays append-only for everyone but owners until the activity phase
drop policy activity_log_delete on public.activity_log;
create policy activity_log_delete on public.activity_log
  for delete to authenticated
  using (public.has_permission(organization_id, 'owner'));

-- nothing uses has_role() any more
drop function public.has_role(uuid, public.member_role);

-- Custom role labels follow their roles: the old "admin" label named the top
-- role, which is now owner, and the old "member" label is now staff.
update public.organizations
set terminology_overrides =
  (terminology_overrides - 'role.admin' - 'role.member')
  || case when terminology_overrides ? 'role.admin'
       then jsonb_build_object('role.owner', terminology_overrides -> 'role.admin') else '{}'::jsonb end
  || case when terminology_overrides ? 'role.member'
       then jsonb_build_object('role.staff', terminology_overrides -> 'role.member') else '{}'::jsonb end
where terminology_overrides ?| array['role.admin', 'role.member'];
