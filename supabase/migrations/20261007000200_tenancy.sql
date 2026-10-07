-- Tenancy and identity: profiles, organizations, memberships, the
-- security-definer helpers every policy relies on, and create_organization.

-- Generic trigger helpers ---------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Usage: before update ... execute function public.forbid_column_changes('organization_id', 'created_by')
create function public.forbid_column_changes() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'Column % cannot be changed', col using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) between 1 and 120),
  email text not null,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Organizations -------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$')
    check (slug not in ('login', 'auth', 'invite', 'create-organization', 'api', 'logo', 'favicon', 'settings')),
  preset_key text not null default 'business' references public.presets (key),
  terminology_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(terminology_overrides) = 'object'),
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme) = 'object'),
  created_at timestamptz not null default now()
);

-- Memberships ---------------------------------------------------------------

create type public.member_role as enum ('admin', 'member');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  -- lets other tables enforce "this membership belongs to the same org"
  unique (id, organization_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_immutable
  before update on public.memberships
  for each row execute function public.forbid_column_changes('organization_id', 'user_id');

-- Security-definer helpers (bypass RLS on memberships, so no policy recursion)

create function public.is_member(org_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id and m.user_id = auth.uid()
  );
$$;

-- has_role(org, 'admin') is true for admins only; has_role(org, 'member') is
-- true for any member, since admins can do everything members can.
create function public.has_role(org_id uuid, required public.member_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and (m.role = required or required = 'member')
  );
$$;

create function public.my_membership_id(org_id uuid) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.memberships m
  where m.organization_id = org_id and m.user_id = auth.uid();
$$;

create function public.shares_org(other_user uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = other_user
  );
$$;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.member_role) from public, anon;
revoke execute on function public.my_membership_id(uuid) from public, anon;
revoke execute on function public.shares_org(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.member_role) to authenticated;
grant execute on function public.my_membership_id(uuid) to authenticated;
grant execute on function public.shares_org(uuid) to authenticated;

-- Last-admin guard ----------------------------------------------------------

create function public.guard_last_admin() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'admin')) then
    -- a cascade from deleting the whole organization is fine
    if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
      return old;
    end if;
    -- serialize concurrent demotions/removals within one organization
    perform 1 from public.organizations o where o.id = old.organization_id for update;
    if not exists (
      select 1 from public.memberships m
      where m.organization_id = old.organization_id and m.role = 'admin' and m.id <> old.id
    ) then
      raise exception 'An organization must keep at least one admin'
        using errcode = 'P0001', hint = 'last_admin';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_guard_last_admin
  before update or delete on public.memberships
  for each row execute function public.guard_last_admin();

-- RLS: profiles -------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_org(id));
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (false);

revoke all on table public.profiles from anon, authenticated;
grant select, insert on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

-- RLS: organizations --------------------------------------------------------

alter table public.organizations enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_member(id));
-- organizations are only created through create_organization()
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (false);
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_role(id, 'admin')) with check (public.has_role(id, 'admin'));
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.has_role(id, 'admin'));

revoke all on table public.organizations from anon, authenticated;
grant select, delete on table public.organizations to authenticated;
grant update (name, slug, preset_key, terminology_overrides, theme) on table public.organizations to authenticated;

-- RLS: memberships ----------------------------------------------------------

alter table public.memberships enable row level security;

create policy memberships_select on public.memberships
  for select to authenticated
  using (public.is_member(organization_id));
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.has_role(organization_id, 'admin'));
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.has_role(organization_id, 'admin'))
  with check (public.has_role(organization_id, 'admin'));
-- admins remove anyone; a member may leave on their own
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.has_role(organization_id, 'admin') or user_id = auth.uid());

revoke all on table public.memberships from anon, authenticated;
grant select, insert, delete on table public.memberships to authenticated;
grant update (role) on table public.memberships to authenticated;

-- create_organization -------------------------------------------------------

create function public.slugify(value text) returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    btrim(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'), '-'),
    40
  );
$$;

create function public.create_organization(name text, preset_key text)
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
  values (org.id, uid, 'admin');

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

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
