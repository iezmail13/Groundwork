-- Invitations: admins invite by email and share the link; the invitee accepts
-- through accept_invitation(), which checks expiry and the signed-in email.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null
    check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role public.member_role not null default 'member',
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  invited_by uuid references public.profiles (id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_org_idx on public.invitations (organization_id);
create unique index invitations_one_pending_per_email
  on public.invitations (organization_id, lower(email))
  where accepted_at is null;

create trigger invitations_immutable
  before update on public.invitations
  for each row execute function public.forbid_column_changes('organization_id', 'invited_by');

alter table public.invitations enable row level security;

-- Tokens are secrets: only admins of the organization can see invitations.
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.has_role(organization_id, 'admin'));
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.has_role(organization_id, 'admin') and invited_by = auth.uid());
create policy invitations_update on public.invitations
  for update to authenticated
  using (public.has_role(organization_id, 'admin'))
  with check (public.has_role(organization_id, 'admin'));
create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.has_role(organization_id, 'admin'));

revoke all on table public.invitations from anon, authenticated;
grant select, insert, update, delete on table public.invitations to authenticated;

-- What the invite page shows before accepting. Anyone holding the token may
-- see which organization invited which address; nothing else is exposed.
create function public.get_invitation(token text)
returns table (
  organization_name text,
  organization_slug text,
  email text,
  role public.member_role,
  expires_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, o.slug, i.email, i.role, i.expires_at, i.accepted_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = get_invitation.token;
$$;

revoke execute on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;

create function public.accept_invitation(token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.invitations;
  user_email text;
  org_slug text;
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

  insert into public.memberships (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.invitations set accepted_at = now() where id = inv.id;

  return org_slug;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
