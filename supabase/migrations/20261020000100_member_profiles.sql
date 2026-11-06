-- Member profiles and online status (D104).
--
-- A person's name (the existing full_name, which is their display name),
-- title and short bio live on their global profile; they edit their own. A
-- photo belongs to their membership in an organization and is stored in the
-- private "profile-photos" bucket at {organization_id}/profiles/{user_id}/{file},
-- so only that organization's members can see it.
--
-- Online status uses Supabase Realtime Presence on a private channel per
-- organization, "org:{organization_id}:presence", which only that
-- organization's members can join (the realtime.messages policies below).
-- Someone can set Do not disturb, which also mutes their notifications, or
-- Appear offline. Those choices are stored on the profile.
--
-- Muting a person adds to the one mute check from D103: notification_muted().

-- Profile fields ------------------------------------------------------------------------

create type public.presence_mode as enum ('auto', 'dnd', 'invisible');

alter table public.profiles
  add column title text check (title is null or char_length(title) <= 120),
  add column bio text check (bio is null or char_length(bio) <= 1000),
  add column presence_mode public.presence_mode not null default 'auto';

grant select (title, bio, presence_mode) on table public.profiles to authenticated;
grant update (title, bio, presence_mode) on table public.profiles to authenticated;

-- Photos ----------------------------------------------------------------------------------

alter table public.memberships
  add column photo_path text check (
    photo_path is null
    or photo_path ~ (
      '^' || organization_id::text || '/profiles/' || user_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Every member of the organization sees its members' photos; each person adds
-- and removes only their own, in their own folder.
create function public.is_own_profile_photo(object_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(object_name, '/', 2) = 'profiles'
    and split_part(object_name, '/', 3) = auth.uid()::text
    and public.is_member(public.storage_org_id(object_name));
$$;

revoke execute on function public.is_own_profile_photo(text) from public, anon;
grant execute on function public.is_own_profile_photo(text) to authenticated;

create policy profile_photos_bucket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos' and public.is_member(public.storage_org_id(name)));
create policy profile_photos_bucket_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-photos' and public.is_own_profile_photo(name));
-- a photo is replaced by a new file, never overwritten
create policy profile_photos_bucket_update on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-photos' and false)
  with check (bucket_id = 'profile-photos' and false);
create policy profile_photos_bucket_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-photos' and public.is_own_profile_photo(name));

-- Sets the caller's photo in an organization, returning the one it replaces
-- (for the caller to delete). The membership row's other columns stay out of
-- reach: roles change only in Settings → Members.
create function public.set_my_photo(org_id uuid, path text) returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_path text;
begin
  if auth.uid() is null or not public.is_member(org_id) then
    raise exception 'You''re not a member of this organization' using errcode = '42501';
  end if;
  if path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id = 'profile-photos' and o.name = path and o.owner_id = auth.uid()::text
  ) then
    raise exception 'Upload the photo first' using errcode = 'P0001';
  end if;
  select m.photo_path into old_path from public.memberships m
  where m.organization_id = org_id and m.user_id = auth.uid();
  -- the check constraint holds the path to the caller's own folder
  update public.memberships m set photo_path = path
  where m.organization_id = org_id and m.user_id = auth.uid();
  return old_path;
end;
$$;

revoke execute on function public.set_my_photo(uuid, text) from public, anon;
grant execute on function public.set_my_photo(uuid, text) to authenticated;

-- Muting a person, and Do not disturb ------------------------------------------------

alter table public.notification_mutes
  alter column type drop not null,
  add column muted_user_id uuid references public.profiles (id) on delete cascade,
  add constraint notification_mutes_one_kind check ((type is null) <> (muted_user_id is null)),
  add constraint notification_mutes_not_self check (muted_user_id is null or muted_user_id <> user_id);
create unique index notification_mutes_person_idx on public.notification_mutes (organization_id, user_id, muted_user_id)
  where muted_user_id is not null;

-- someone can only mute a person in their own organization
drop policy notification_mutes_insert on public.notification_mutes;
create policy notification_mutes_insert on public.notification_mutes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member(organization_id)
    and (
      muted_user_id is null
      or exists (select 1 from public.memberships m where m.organization_id = notification_mutes.organization_id and m.user_id = muted_user_id)
    )
  );

-- The one place that decides whether a notification is muted (D103): the
-- kind is muted, the person who caused it is muted, or the recipient has set
-- Do not disturb. Part 9 adds channel mutes here.
create or replace function public.notification_muted(org uuid, recipient uuid, kind public.notification_type, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.notification_mutes nm
      where nm.organization_id = org and nm.user_id = recipient
        and (nm.type = kind or (actor is not null and nm.muted_user_id = actor))
    )
    or exists (select 1 from public.profiles p where p.id = recipient and p.presence_mode = 'dnd');
$$;

-- Online status: private Realtime channels -------------------------------------------
-- Topics look like "org:{organization_id}:presence". Only that organization's
-- members may listen or announce themselves on them. (Part 9 adds chat topics.)

create function public.can_use_realtime_topic(topic text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(coalesce(topic, ''), ':');
begin
  if cardinality(parts) = 3 and parts[1] = 'org' and parts[3] = 'presence' then
    return public.is_member(parts[2]::uuid);
  end if;
  return false;
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke execute on function public.can_use_realtime_topic(text) from public, anon;
grant execute on function public.can_use_realtime_topic(text) to authenticated;

create policy groundwork_realtime_select on realtime.messages
  for select to authenticated
  using (public.can_use_realtime_topic(realtime.topic()));
create policy groundwork_realtime_insert on realtime.messages
  for insert to authenticated
  with check (public.can_use_realtime_topic(realtime.topic()));
