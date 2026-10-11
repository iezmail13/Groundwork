-- Project membership is the main visibility gate (Part B, phase 2).
--
--   project roles: lead (3) > admin (2) > staff (1)
--
-- Someone not on a project can't see it, its tasks, calendar items, files or
-- activity. Owners see every project and act as its lead without being added.
-- The org role is a ceiling on the project role: managers and owners can
-- lead, admins can be project admins, staff stay staff. Archived projects are
-- read-only but stay visible to their members.

create type public.project_role as enum ('lead', 'admin', 'staff');

create function public.project_role_rank(role public.project_role) returns int
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case role when 'lead' then 3 when 'admin' then 2 when 'staff' then 1 end;
$$;

-- The highest project rank an org role allows.
create function public.project_rank_ceiling(role public.member_role) returns int
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case role when 'owner' then 3 when 'manager' then 3 when 'admin' then 2 when 'staff' then 1 end;
$$;

create function public.project_role_for_rank(rank int) returns public.project_role
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when rank >= 3 then 'lead' when rank = 2 then 'admin' else 'staff' end::public.project_role;
$$;

-- Table -----------------------------------------------------------------------

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  membership_id uuid not null,
  role public.project_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (project_id, membership_id),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete cascade
);

create index project_members_membership_idx on public.project_members (membership_id);

create trigger project_members_immutable
  before update on public.project_members
  for each row execute function public.forbid_column_changes('organization_id', 'project_id', 'membership_id');

-- The org role caps the project role.
create function public.enforce_project_role_ceiling() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_role public.member_role;
begin
  select m.role into org_role from public.memberships m where m.id = new.membership_id;
  if public.project_role_rank(new.role) > public.project_rank_ceiling(org_role) then
    raise exception 'Their organization role doesn''t allow that project role'
      using errcode = 'P0001', hint = 'project_role_ceiling';
  end if;
  return new;
end;
$$;

create trigger project_members_ceiling
  before insert or update of role on public.project_members
  for each row execute function public.enforce_project_role_ceiling();

-- A demotion in the organization lowers project roles above the new ceiling.
create function public.clamp_project_roles() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    update public.project_members pm
    set role = public.project_role_for_rank(public.project_rank_ceiling(new.role))
    where pm.membership_id = new.id
      and public.project_role_rank(pm.role) > public.project_rank_ceiling(new.role);
  end if;
  return new;
end;
$$;

create trigger memberships_clamp_project_roles
  after update of role on public.memberships
  for each row execute function public.clamp_project_roles();

-- Helpers (security definer, so policies never recurse) -----------------------

-- The caller's rank on a project: 3 for owners of its organization, else
-- their project role's rank, else 0. Read live, like has_permission().
create function public.my_project_rank(project_id uuid) returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select greatest(
      case when m.role = 'owner' then 3 else 0 end,
      coalesce((
        select public.project_role_rank(pm.role) from public.project_members pm
        where pm.project_id = p.id and pm.membership_id = m.id
      ), 0)
    )
    from public.projects p
    join public.memberships m on m.organization_id = p.organization_id and m.user_id = auth.uid()
    where p.id = my_project_rank.project_id
  ), 0);
$$;

create function public.can_view_project(project_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_project_rank(project_id) > 0;
$$;

-- Editing, reassigning and deleting anyone's items in a project: project
-- admins and leads, owners, and org managers who are on the project.
create function public.can_manage_project_content(project_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_project_rank(project_id) >= 2
    or (
      public.my_project_rank(project_id) >= 1
      and exists (
        select 1 from public.projects p
        where p.id = can_manage_project_content.project_id and public.has_permission(p.organization_id, 'manager')
      )
    );
$$;

-- Who may put someone on a project in a role, or change or remove someone
-- holding it: leads (and owners) any role, project admins only staff.
create function public.can_grant_project_role(project_id uuid, role public.project_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.my_project_rank(project_id)
    when 3 then true
    when 2 then role = 'staff'
    else false
  end;
$$;

create function public.project_is_active(project_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.projects p where p.id = project_id and p.status = 'active');
$$;

revoke execute on function public.my_project_rank(uuid) from public, anon;
revoke execute on function public.can_view_project(uuid) from public, anon;
revoke execute on function public.can_manage_project_content(uuid) from public, anon;
revoke execute on function public.can_grant_project_role(uuid, public.project_role) from public, anon;
revoke execute on function public.project_is_active(uuid) from public, anon;
grant execute on function public.my_project_rank(uuid) to authenticated, service_role;
grant execute on function public.can_view_project(uuid) to authenticated, service_role;
grant execute on function public.can_manage_project_content(uuid) to authenticated, service_role;
grant execute on function public.can_grant_project_role(uuid, public.project_role) to authenticated, service_role;
grant execute on function public.project_is_active(uuid) to authenticated, service_role;

-- RLS: project_members ----------------------------------------------------------

alter table public.project_members enable row level security;

create policy project_members_select on public.project_members
  for select to authenticated
  using (public.can_view_project(project_id));
create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (public.can_grant_project_role(project_id, role) and public.project_is_active(project_id));
-- the old role must be one the caller may manage, the new one one they may grant
create policy project_members_update on public.project_members
  for update to authenticated
  using (public.can_grant_project_role(project_id, role) and public.project_is_active(project_id))
  with check (public.can_grant_project_role(project_id, role));
-- remove someone you may manage, or take yourself off
create policy project_members_delete on public.project_members
  for delete to authenticated
  using (
    public.can_grant_project_role(project_id, role)
    or membership_id = public.my_membership_id(organization_id)
  );

revoke all on table public.project_members from anon, authenticated;
grant select, insert, update, delete on table public.project_members to authenticated;

-- Existing projects keep everyone who could see them -------------------------------

-- Before this phase every member saw every project, so every non-owner member
-- joins every existing project as staff (owners need no row). The person each
-- project named as its lead gets the highest role their org role allows.
insert into public.project_members (organization_id, project_id, membership_id, role)
select p.organization_id, p.id, m.id,
  case
    when m.id = p.owner_membership_id then public.project_role_for_rank(public.project_rank_ceiling(m.role))
    else 'staff'
  end
from public.projects p
join public.memberships m on m.organization_id = p.organization_id
where m.role <> 'owner' or m.id = p.owner_membership_id;

-- New projects: creating needs org admin or above, and the creator joins as
-- lead (or project admin, if that's their ceiling).
create function public.add_project_creator() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator public.memberships;
begin
  select * into creator from public.memberships m
  where m.organization_id = new.organization_id and m.user_id = new.created_by;
  if found then
    insert into public.project_members (organization_id, project_id, membership_id, role)
    values (new.organization_id, new.id, creator.id, public.project_role_for_rank(public.project_rank_ceiling(creator.role)))
    on conflict (project_id, membership_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_add_creator
  after insert on public.projects
  for each row execute function public.add_project_creator();

-- Archived projects are read-only: the only change allowed is restoring them.
create function public.guard_archived_project() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'archived'
     and (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at')
     and pg_catalog.pg_trigger_depth() = 1 then
    raise exception 'Archived projects are read-only. Restore it to make changes.'
      using errcode = 'P0001', hint = 'project_archived';
  end if;
  return new;
end;
$$;

create trigger projects_guard_archived
  before update on public.projects
  for each row execute function public.guard_archived_project();

-- RLS: projects -------------------------------------------------------------------

drop policy projects_select on public.projects;
drop policy projects_insert on public.projects;
drop policy projects_update on public.projects;
drop policy projects_delete on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_view_project(id));
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.has_permission(organization_id, 'admin') and created_by = auth.uid());
-- project admins and leads edit, archive and restore it
create policy projects_update on public.projects
  for update to authenticated
  using (public.my_project_rank(id) >= 2)
  with check (public.my_project_rank(id) >= 2);
-- deleting a whole project is for its leads (and owners)
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.my_project_rank(id) = 3);

-- Tasks ------------------------------------------------------------------------------

-- Set when an open task loses its assignee because they left the project or
-- the organization, so it can be picked up again; cleared on reassignment.
alter table public.tasks add column needs_assignee boolean not null default false;

create or replace function public.can_view_task(task_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = task_id and public.can_view_project(t.project_id)
  );
$$;

-- A task's assignee must be on its project (or own the organization), so a
-- task is never assigned to someone who can't see it.
create function public.check_task_assignee() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- an open task whose assignee's membership was deleted (a cascade) needs a new one
  if tg_op = 'UPDATE' and new.assignee_membership_id is null and old.assignee_membership_id is not null
     and new.status <> 'done' and pg_catalog.pg_trigger_depth() > 1 then
    new.needs_assignee := true;
  end if;
  if new.assignee_membership_id is not null then
    new.needs_assignee := false;
    if not exists (
      select 1 from public.memberships m
      where m.id = new.assignee_membership_id
        and (
          m.role = 'owner'
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = new.project_id and pm.membership_id = m.id
          )
        )
    ) then
      raise exception 'That person isn''t on this project'
        using errcode = 'P0001', hint = 'assignee_not_on_project';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_check_assignee
  before insert or update of assignee_membership_id, project_id on public.tasks
  for each row execute function public.check_task_assignee();

-- Taking someone off a project frees their open tasks there for reassignment.
create function public.release_project_tasks() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- nothing to do while the project, the person or the organization is being
  -- deleted: those cascades clear or delete the tasks themselves
  if not exists (select 1 from public.organizations o where o.id = old.organization_id)
     or not exists (select 1 from public.projects p where p.id = old.project_id)
     or not exists (select 1 from public.memberships m where m.id = old.membership_id) then
    return old;
  end if;
  -- owners keep seeing every project
  if exists (select 1 from public.memberships m where m.id = old.membership_id and m.role = 'owner') then
    return old;
  end if;
  update public.tasks t
  set assignee_membership_id = null, needs_assignee = true
  where t.project_id = old.project_id
    and t.assignee_membership_id = old.membership_id
    and t.status <> 'done';
  return old;
end;
$$;

create trigger project_members_release_tasks
  after delete on public.project_members
  for each row execute function public.release_project_tasks();

drop policy tasks_select on public.tasks;
drop policy tasks_insert on public.tasks;
drop policy tasks_update on public.tasks;
drop policy tasks_delete on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.can_view_task(id));
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_view_project(project_id)
    and public.project_is_active(project_id)
  );
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.can_view_task(id) and public.project_is_active(project_id))
  with check (public.can_view_project(project_id) and public.project_is_active(project_id));
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.can_view_task(id)
    and public.project_is_active(project_id)
    and (created_by = auth.uid() or public.can_manage_project_content(project_id))
  );

-- Events and documents: org-wide when they have no project ------------------

drop policy events_select on public.events;
drop policy events_insert on public.events;
drop policy events_update on public.events;
drop policy events_delete on public.events;
create policy events_select on public.events
  for select to authenticated
  using (public.is_member(organization_id) and (project_id is null or public.can_view_project(project_id)));
create policy events_insert on public.events
  for insert to authenticated
  with check (
    public.is_member(organization_id)
    and created_by = auth.uid()
    and (project_id is null or (public.can_view_project(project_id) and public.project_is_active(project_id)))
  );
create policy events_update on public.events
  for update to authenticated
  using (
    public.is_member(organization_id)
    and (project_id is null or (public.can_view_project(project_id) and public.project_is_active(project_id)))
  )
  with check (
    public.is_member(organization_id)
    and (project_id is null or (public.can_view_project(project_id) and public.project_is_active(project_id)))
  );
create policy events_delete on public.events
  for delete to authenticated
  using (
    public.is_member(organization_id)
    and (
      (project_id is null and (created_by = auth.uid() or public.has_permission(organization_id, 'manager')))
      or (
        project_id is not null
        and public.can_view_project(project_id)
        and public.project_is_active(project_id)
        and (created_by = auth.uid() or public.can_manage_project_content(project_id))
      )
    )
  );

drop policy documents_select on public.documents;
drop policy documents_insert on public.documents;
drop policy documents_update on public.documents;
drop policy documents_delete on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (public.is_member(organization_id) and (project_id is null or public.can_view_project(project_id)));
create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    public.is_member(organization_id)
    and uploaded_by = auth.uid()
    and (project_id is null or (public.can_view_project(project_id) and public.project_is_active(project_id)))
  );
create policy documents_update on public.documents
  for update to authenticated
  using (
    public.is_member(organization_id)
    and (project_id is null or (public.can_view_project(project_id) and public.project_is_active(project_id)))
  )
  with check (
    public.is_member(organization_id)
    and (project_id is null or (public.can_view_project(project_id) and public.project_is_active(project_id)))
  );
create policy documents_delete on public.documents
  for delete to authenticated
  using (
    public.is_member(organization_id)
    and (
      (project_id is null and (uploaded_by = auth.uid() or public.has_permission(organization_id, 'manager')))
      or (
        project_id is not null
        and public.can_view_project(project_id)
        and public.project_is_active(project_id)
        and (uploaded_by = auth.uid() or public.can_manage_project_content(project_id))
      )
    )
  );

-- Stored files follow their document row: a file attached to a project is
-- only readable by people who can see that project. Objects with no row yet
-- (mid-upload) fall back to the organization check.
create function public.can_view_storage_object(object_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.documents d
    where d.storage_path = object_name
      and d.project_id is not null
      and not public.can_view_project(d.project_id)
  );
$$;

revoke execute on function public.can_view_storage_object(text) from public, anon;
grant execute on function public.can_view_storage_object(text) to authenticated, service_role;

drop policy documents_bucket_select on storage.objects;
drop policy documents_bucket_update on storage.objects;
drop policy documents_bucket_delete on storage.objects;
create policy documents_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.is_member(public.storage_org_id(name))
    and public.can_view_storage_object(name)
  );
create policy documents_bucket_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and public.can_view_storage_object(name)
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
    and public.can_view_storage_object(name)
    and (
      public.has_permission(public.storage_org_id(name), 'manager')
      or (owner_id = auth.uid()::text and public.is_member(public.storage_org_id(name)))
    )
  );

-- Activity: entries about a project's items follow the project ----------------

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
  );
