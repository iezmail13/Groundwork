-- Theme and branding (D84, D86, D99).
--
-- People choose light, dark or system mode and may pick their own accent
-- colour. Organizations pick an accent, may upload a logo (and a version for
-- dark mode), may switch personal accents off, and may hide the illustrated
-- artwork on empty pages. Logos live in a private "branding" bucket at
-- {organization_id}/branding/{file}, served through signed URLs.

-- People ------------------------------------------------------------------------------------

alter table public.profiles
  add column theme_mode text not null default 'system' check (theme_mode in ('light', 'dark', 'system')),
  add column accent text check (accent is null or accent ~ '^#[0-9A-F]{6}$');

-- profiles_update already limits people to their own row
grant update (theme_mode, accent) on table public.profiles to authenticated;

-- Organizations -----------------------------------------------------------------------------

alter table public.organizations
  add column accent text check (accent is null or accent ~ '^#[0-9A-F]{6}$'),
  add column allow_personal_accent boolean not null default true,
  add column show_illustrations boolean not null default true,
  add column logo_path text,
  add column logo_dark_path text,
  add constraint organizations_logo_path_check
    check (logo_path is null or logo_path ~ ('^' || id::text || '/branding/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$')),
  add constraint organizations_logo_dark_path_check
    check (logo_dark_path is null or logo_dark_path ~ ('^' || id::text || '/branding/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$'));

-- organizations_update already limits changes to owners and managers
grant update (accent, allow_personal_accent, show_illustrations, logo_path, logo_dark_path)
  on table public.organizations to authenticated;

-- Only owners decide whether people may override the org's accent (D84).
create function public.guard_personal_accent_switch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and new.allow_personal_accent is distinct from old.allow_personal_accent
     and not public.has_permission(new.id, 'owner') then
    raise exception 'Only owners can turn personal accent colours on or off'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_personal_accent_owner_only
  before update on public.organizations
  for each row execute function public.guard_personal_accent_switch();

-- Activity: logo and theme changes are history for everyone in the org ------------------

alter table public.activity_log drop constraint activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('project', 'task', 'event', 'document', 'participant', 'fund', 'organization'));

create function public.log_branding_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  actor_name text;
  changes text[] := '{}';
  change text;
begin
  -- only people's changes are history; the seed and admin scripts write as nobody
  if auth.uid() is null then
    return null;
  end if;

  if new.accent is distinct from old.accent then
    changes := changes || case when new.accent is null then 'reset_accent' else 'changed_accent' end;
  end if;
  if new.logo_path is distinct from old.logo_path then
    changes := changes || case when new.logo_path is null then 'removed_logo' else 'uploaded_logo' end;
  end if;
  if new.logo_dark_path is distinct from old.logo_dark_path then
    changes := changes || case when new.logo_dark_path is null then 'removed_dark_logo' else 'uploaded_dark_logo' end;
  end if;
  if new.allow_personal_accent is distinct from old.allow_personal_accent then
    changes := changes || case when new.allow_personal_accent then 'allowed_personal_accents' else 'blocked_personal_accents' end;
  end if;
  if new.show_illustrations is distinct from old.show_illustrations then
    changes := changes || case when new.show_illustrations then 'showed_illustrations' else 'hid_illustrations' end;
  end if;
  if cardinality(changes) = 0 then
    return null;
  end if;

  select m.id into actor from public.memberships m where m.organization_id = new.id and m.user_id = auth.uid();
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into actor_name from public.profiles p where p.id = auth.uid();

  foreach change in array changes loop
    insert into public.activity_log (organization_id, actor_membership_id, entity_type, entity_id, action, metadata)
    values (
      new.id,
      actor,
      'organization',
      new.id,
      change,
      jsonb_strip_nulls(jsonb_build_object('label', new.name, 'actor_name', actor_name, 'to', case when change = 'changed_accent' then new.accent end))
    );
  end loop;
  return null;
end;
$$;

create trigger organizations_branding_activity
  after update of accent, logo_path, logo_dark_path, allow_personal_accent, show_illustrations on public.organizations
  for each row execute function public.log_branding_activity();

-- Storage: the private "branding" bucket ---------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Every member sees their organization's logo; owners and managers change it.
-- Objects must sit in {organization_id}/branding/.
create policy branding_bucket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and public.is_member(public.storage_org_id(name)));

create policy branding_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and split_part(name, '/', 2) = 'branding'
    and public.has_permission(public.storage_org_id(name), 'manager')
  );

create policy branding_bucket_update on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and public.has_permission(public.storage_org_id(name), 'manager'))
  with check (
    bucket_id = 'branding'
    and split_part(name, '/', 2) = 'branding'
    and public.has_permission(public.storage_org_id(name), 'manager')
  );

create policy branding_bucket_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.has_permission(public.storage_org_id(name), 'manager'));
