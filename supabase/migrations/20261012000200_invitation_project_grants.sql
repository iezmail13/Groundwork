-- Invitations grant projects too, can carry a name, and pending invitees can
-- be assigned work before they join (Part B, phase 2). Invitations are only
-- ever matched against a verified email address.

alter table public.invitations
  add column name text check (name is null or char_length(btrim(name)) between 1 and 120),
  add constraint invitations_id_org_key unique (id, organization_id);

-- Project grants ---------------------------------------------------------------

create table public.invitation_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invitation_id uuid not null,
  project_id uuid not null,
  role public.project_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (invitation_id, project_id),
  foreign key (invitation_id, organization_id)
    references public.invitations (id, organization_id) on delete cascade,
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade
);

create index invitation_projects_project_idx on public.invitation_projects (project_id);

create trigger invitation_projects_immutable
  before update on public.invitation_projects
  for each row execute function public.forbid_column_changes('organization_id', 'invitation_id', 'project_id');

-- The invited org role caps each granted project role, as for members.
create function public.enforce_invitation_grant_ceiling() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_role public.member_role;
begin
  select i.role into org_role from public.invitations i where i.id = new.invitation_id;
  if public.project_role_rank(new.role) > public.project_rank_ceiling(org_role) then
    raise exception 'The invited role doesn''t allow that project role'
      using errcode = 'P0001', hint = 'project_role_ceiling';
  end if;
  return new;
end;
$$;

create trigger invitation_projects_ceiling
  before insert or update of role on public.invitation_projects
  for each row execute function public.enforce_invitation_grant_ceiling();

create function public.clamp_invitation_grants() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    update public.invitation_projects ip
    set role = public.project_role_for_rank(public.project_rank_ceiling(new.role))
    where ip.invitation_id = new.id
      and public.project_role_rank(ip.role) > public.project_rank_ceiling(new.role);
  end if;
  return new;
end;
$$;

create trigger invitations_clamp_grants
  after update of role on public.invitations
  for each row execute function public.clamp_invitation_grants();

alter table public.invitation_projects enable row level security;

-- managers see invitations; grants only for projects they can see
create policy invitation_projects_select on public.invitation_projects
  for select to authenticated
  using (public.has_permission(organization_id, 'manager') and public.can_view_project(project_id));
create policy invitation_projects_insert on public.invitation_projects
  for insert to authenticated
  with check (public.has_permission(organization_id, 'manager') and public.can_grant_project_role(project_id, role));
create policy invitation_projects_update on public.invitation_projects
  for update to authenticated
  using (public.has_permission(organization_id, 'manager') and public.can_grant_project_role(project_id, role))
  with check (public.has_permission(organization_id, 'manager') and public.can_grant_project_role(project_id, role));
create policy invitation_projects_delete on public.invitation_projects
  for delete to authenticated
  using (public.has_permission(organization_id, 'manager') and public.can_view_project(project_id));

revoke all on table public.invitation_projects from anon, authenticated;
grant select, insert, update, delete on table public.invitation_projects to authenticated;

-- Pending invitees as assignees -----------------------------------------------------

alter table public.tasks
  add column assignee_invitation_id uuid,
  add constraint tasks_assignee_invitation_fkey
    foreign key (assignee_invitation_id, organization_id)
    references public.invitations (id, organization_id) on delete set null (assignee_invitation_id),
  add constraint tasks_one_assignee check (assignee_membership_id is null or assignee_invitation_id is null);

create index tasks_assignee_invitation_idx on public.tasks (assignee_invitation_id);

-- Withdrawing a project from an invitation frees the invitee's open tasks there.
create function public.release_invitation_tasks() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.invitations i where i.id = old.invitation_id)
     or not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;
  update public.tasks t
  set assignee_invitation_id = null, needs_assignee = (t.status <> 'done')
  where t.project_id = old.project_id and t.assignee_invitation_id = old.invitation_id;
  return old;
end;
$$;

create trigger invitation_projects_release_tasks
  after delete on public.invitation_projects
  for each row execute function public.release_invitation_tasks();

-- A task's assignee, member or invitee, must be able to see it.
create or replace function public.check_task_assignee() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- an open task whose assignee went away in a cascade (membership deleted,
  -- invitation revoked or declined) needs a new one
  if tg_op = 'UPDATE' and new.status <> 'done' and pg_catalog.pg_trigger_depth() > 1
     and new.assignee_membership_id is null and new.assignee_invitation_id is null
     and (old.assignee_membership_id is not null or old.assignee_invitation_id is not null) then
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
  if new.assignee_invitation_id is not null then
    new.needs_assignee := false;
    if not exists (
      select 1 from public.invitations i
      join public.invitation_projects ip on ip.invitation_id = i.id and ip.project_id = new.project_id
      where i.id = new.assignee_invitation_id and i.accepted_at is null
    ) then
      raise exception 'That invitation doesn''t include this project'
        using errcode = 'P0001', hint = 'assignee_not_on_project';
    end if;
  end if;
  return new;
end;
$$;

drop trigger tasks_check_assignee on public.tasks;
create trigger tasks_check_assignee
  before insert or update of assignee_membership_id, assignee_invitation_id, project_id on public.tasks
  for each row execute function public.check_task_assignee();

-- Names to show for pending invitees on the projects the caller can see, so
-- assignee pickers and task lists can say "Name (pending)". Tokens stay hidden.
create function public.pending_invitees(org_id uuid)
returns table (id uuid, name text, email text, project_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.name, i.email, ip.project_id
  from public.invitations i
  join public.invitation_projects ip on ip.invitation_id = i.id
  where i.organization_id = org_id
    and i.accepted_at is null
    and i.expires_at > now()
    and public.can_view_project(ip.project_id);
$$;

revoke execute on function public.pending_invitees(uuid) from public, anon;
grant execute on function public.pending_invitees(uuid) to authenticated;

-- Verified email ------------------------------------------------------------------

-- The caller's email, only once the auth provider has confirmed they own it
-- (a magic link they opened, or Google saying the address is verified).
create function public.my_verified_email() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null and u.email is not null;
$$;

revoke execute on function public.my_verified_email() from public, anon;
grant execute on function public.my_verified_email() to authenticated;

-- Accepting -------------------------------------------------------------------------

create or replace function public.accept_invitation(token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.invitations;
  verified text := public.my_verified_email();
  user_email text;
  org_slug text;
  new_membership uuid;
begin
  if uid is null then
    raise exception 'You must be signed in to accept an invitation' using errcode = '42501';
  end if;

  select * into inv from public.invitations i where i.token = accept_invitation.token for update;
  if not found then
    raise exception 'This invitation does not exist' using errcode = 'P0002', hint = 'invite_not_found';
  end if;

  select o.slug into org_slug from public.organizations o where o.id = inv.organization_id;
  select u.email into user_email from auth.users u where u.id = uid;

  if lower(coalesce(user_email, '')) <> lower(inv.email) then
    raise exception 'This invitation was sent to a different email address'
      using errcode = '42501', hint = 'invite_wrong_user';
  end if;
  if verified is null or verified <> lower(inv.email) then
    raise exception 'Confirm your email address before accepting this invitation'
      using errcode = '42501', hint = 'invite_unverified';
  end if;

  if inv.accepted_at is not null then
    if exists (select 1 from public.memberships m where m.organization_id = inv.organization_id and m.user_id = uid) then
      return org_slug;
    end if;
    raise exception 'This invitation has already been used' using errcode = 'P0001', hint = 'invite_used';
  end if;

  if inv.expires_at < now() then
    raise exception 'This invitation has expired' using errcode = 'P0001', hint = 'invite_expired';
  end if;

  insert into public.profiles (id, email)
  values (uid, coalesce(user_email, ''))
  on conflict (id) do nothing;
  -- the name they were invited under, unless they've already given their own
  if inv.name is not null then
    update public.profiles p set full_name = inv.name
    where p.id = uid and coalesce(btrim(p.full_name), '') = '';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role)
  on conflict (organization_id, user_id) do nothing;
  select m.id into new_membership from public.memberships m
  where m.organization_id = inv.organization_id and m.user_id = uid;

  -- the granted projects, capped by the role they actually hold
  insert into public.project_members (organization_id, project_id, membership_id, role)
  select ip.organization_id, ip.project_id, new_membership,
    public.project_role_for_rank(least(
      public.project_role_rank(ip.role),
      public.project_rank_ceiling((select m.role from public.memberships m where m.id = new_membership))
    ))
  from public.invitation_projects ip
  where ip.invitation_id = inv.id
  on conflict (project_id, membership_id) do nothing;

  -- work assigned while they were pending becomes theirs (on projects they
  -- joined; anything else is flagged for a new assignee)
  update public.tasks t
  set assignee_invitation_id = null,
      assignee_membership_id = case when pm.id is not null then new_membership end,
      needs_assignee = pm.id is null and t.status <> 'done'
  from public.tasks t2
  left join public.project_members pm on pm.project_id = t2.project_id and pm.membership_id = new_membership
  where t2.id = t.id and t.assignee_invitation_id = inv.id;

  update public.invitations set accepted_at = now() where id = inv.id;

  return org_slug;
end;
$$;

-- Pending invitations for the signed-in person -----------------------------------

create function public.my_pending_invitations()
returns table (
  token text,
  organization_name text,
  organization_slug text,
  role public.member_role,
  invited_by_name text,
  expires_at timestamptz,
  project_names text[],
  preset_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.token,
    o.name,
    o.slug,
    i.role,
    coalesce(nullif(p.full_name, ''), p.email),
    i.expires_at,
    coalesce(
      (select array_agg(pr.name order by pr.name)
       from public.invitation_projects ip join public.projects pr on pr.id = ip.project_id
       where ip.invitation_id = i.id),
      '{}'
    ),
    o.preset_key
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.id = i.invited_by
  where lower(i.email) = public.my_verified_email()
    and i.accepted_at is null
    and i.expires_at > now()
    and not exists (
      select 1 from public.memberships m where m.organization_id = i.organization_id and m.user_id = auth.uid()
    )
  order by i.created_at desc;
$$;

-- Turning an invitation down removes it; anything assigned to the invitee is
-- flagged for a new assignee.
create function public.decline_invitation(token text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations i where i.token = decline_invitation.token;
  if not found or inv.accepted_at is not null then
    raise exception 'This invitation does not exist' using errcode = 'P0002', hint = 'invite_not_found';
  end if;
  if public.my_verified_email() is distinct from lower(inv.email) then
    raise exception 'This invitation was sent to a different email address'
      using errcode = '42501', hint = 'invite_wrong_user';
  end if;
  delete from public.invitations where id = inv.id;
end;
$$;

revoke execute on function public.my_pending_invitations() from public, anon;
revoke execute on function public.decline_invitation(text) from public, anon;
grant execute on function public.my_pending_invitations() to authenticated;
grant execute on function public.decline_invitation(text) to authenticated;
