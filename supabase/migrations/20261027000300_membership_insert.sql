-- Memberships come only from creating an org or accepting an invitation (security audit, D113).
-- An owner or manager could insert a membership for any account, and with it
-- read that person's profile and message them, with no invitation. People now
-- join only through create_organization() and accept_invitation().

drop policy memberships_insert on public.memberships;
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (false);
