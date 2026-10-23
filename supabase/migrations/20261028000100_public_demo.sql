-- The public demo (D95, D115). "Try the demo" signs a visitor in with a
-- temporary anonymous account and gives them their own private copy of a
-- sample organization, which they own. Nobody else can see it, and it can't
-- reach anything outside itself: no invitations, uploads, share links or
-- calendar feeds. It lasts two hours. When it ends, by "End demo" or by
-- expiry, the organization, everything in it, its pretend teammates and the
-- temporary account are deleted; a cron job checks every minute, and an
-- expired demo is locked even before that runs.

alter table public.organizations
  add column demo_expires_at timestamptz,
  add column demo_owner uuid references auth.users (id) on delete cascade;

create index organizations_demo_expires_idx on public.organizations (demo_expires_at) where demo_expires_at is not null;
create unique index organizations_demo_owner_idx on public.organizations (demo_owner) where demo_owner is not null;

-- Is the caller a temporary demo visitor (Supabase's anonymous sign-in)?
create function public.is_demo_user() returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

revoke execute on function public.is_demo_user() from public, anon;
grant execute on function public.is_demo_user() to authenticated, service_role;

-- Membership checks ignore a demo whose time is up, so it is locked the
-- moment it expires, before the cleanup removes it.
create or replace function public.is_member(org_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = org_id and m.user_id = auth.uid()
      and (o.demo_expires_at is null or o.demo_expires_at > now())
  );
$$;

create or replace function public.my_rank(org_id uuid) returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.role_rank(m.role) from public.memberships m
     join public.organizations o on o.id = m.organization_id
     where m.organization_id = org_id and m.user_id = auth.uid()
       and (o.demo_expires_at is null or o.demo_expires_at > now())),
    0
  );
$$;

create or replace function public.my_membership_id(org_id uuid) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = org_id and m.user_id = auth.uid()
    and (o.demo_expires_at is null or o.demo_expires_at > now());
$$;

-- Every organization table also refuses rows of an expired demo, whatever
-- path a query takes (some visibility helpers read memberships directly).
-- New org-scoped tables need the same policy; pgTAP checks they all have it.
create function public.org_is_live(org_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.organizations o where o.id = org_id and o.demo_expires_at <= now()
  );
$$;

revoke execute on function public.org_is_live(uuid) from public, anon;
grant execute on function public.org_is_live(uuid) to authenticated, service_role;

do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'organization_id' and x.table_type = 'BASE TABLE'
  loop
    execute format(
      'create policy demo_live on public.%I as restrictive for all to authenticated '
      'using (public.org_is_live(organization_id)) with check (public.org_is_live(organization_id))', t);
  end loop;
end;
$$;

create policy demo_live on public.organizations as restrictive for all to authenticated
  using (public.org_is_live(id)) with check (public.org_is_live(id));

-- What a demo can't do ------------------------------------------------------------------------
-- Restrictive policies add to every other rule rather than replacing it.

create policy demo_no_uploads on storage.objects
  as restrictive
  for insert to authenticated
  with check (not public.is_demo_user());

create policy demo_no_invitations on public.invitations
  as restrictive
  for insert to authenticated
  with check (not public.is_demo_user());

-- Organizations, share links and calendar feeds are also made by definer
-- functions, so a trigger stops a demo visitor there.
create function public.refuse_demo_user() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- start_demo() makes the visitor's own demo; turning a feed off is fine
  if public.is_demo_user()
     and not (tg_table_name = 'organizations' and to_jsonb(new) ->> 'demo_owner' is not null)
     and not (tg_table_name = 'profiles' and to_jsonb(new) ->> 'calendar_feed_token_hash' is null) then
    raise exception 'That isn''t available in the demo' using errcode = '42501', hint = 'demo_only';
  end if;
  return new;
end;
$$;

create trigger organizations_no_demo before insert on public.organizations
  for each row execute function public.refuse_demo_user();
create trigger report_shares_no_demo before insert on public.report_shares
  for each row execute function public.refuse_demo_user();
create trigger profiles_no_demo_feed before update of calendar_feed_token_hash on public.profiles
  for each row execute function public.refuse_demo_user();

-- Ending a demo -------------------------------------------------------------------------------

-- Deletes a demo organization, everything in it, its pretend teammates and
-- the visitor's temporary account. Internal: called by end_demo() and
-- expire_demos() only.
create function public.purge_demo(org_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  people uuid[];
begin
  select array_agg(u.id) into people
  from auth.users u
  where u.raw_app_meta_data ->> 'demo_org' = org_id::text
     or u.id = (select o.demo_owner from public.organizations o where o.id = org_id and o.demo_expires_at is not null);
  delete from public.organizations o where o.id = org_id and o.demo_expires_at is not null;
  if people is not null then
    -- sign-in records of these temporary accounts go too
    delete from auth.audit_log_entries a where a.payload ->> 'actor_id' = any (select unnest(people)::text);
    delete from auth.users u where u.id = any (people);
  end if;
end;
$$;

revoke execute on function public.purge_demo(uuid) from public, anon, authenticated;

-- The visitor ends their demo now.
create function public.end_demo() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
begin
  if not public.is_demo_user() then
    raise exception 'Only a demo can be ended' using errcode = '42501';
  end if;
  select o.id into org_id from public.organizations o where o.demo_owner = auth.uid();
  if org_id is not null then
    perform public.purge_demo(org_id);
  else
    delete from auth.users u where u.id = auth.uid() and u.is_anonymous;
  end if;
end;
$$;

revoke execute on function public.end_demo() from public, anon;
grant execute on function public.end_demo() to authenticated;

-- Removes every demo whose time is up, and any temporary account older than
-- a demo that never got one (for example, signed in but never started).
create function public.expire_demos() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
  n integer := 0;
begin
  for org_id in select o.id from public.organizations o where o.demo_expires_at <= now() loop
    perform public.purge_demo(org_id);
    n := n + 1;
  end loop;
  delete from auth.audit_log_entries a
  where a.payload ->> 'actor_id' in (
    select u.id::text from auth.users u
    where u.is_anonymous and u.created_at < now() - interval '2 hours'
      and not exists (select 1 from public.organizations o where o.demo_owner = u.id)
  );
  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '2 hours'
    and not exists (select 1 from public.organizations o where o.demo_owner = u.id);
  return n;
end;
$$;

revoke execute on function public.expire_demos() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('end-expired-demos', '* * * * *', 'select public.expire_demos()');

-- Starting a demo -----------------------------------------------------------------------------

-- A pretend teammate: an account that can't sign in, deleted with the demo.
create function public.demo_person(org_id uuid, full_name text, title text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    person, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    person::text || '@demo.groundwork.invalid',
    jsonb_build_object('demo_org', org_id, 'provider', 'demo'),
    jsonb_build_object('full_name', full_name),
    now(), now()
  );
  update public.profiles p set title = demo_person.title where p.id = person;
  return person;
end;
$$;

revoke execute on function public.demo_person(uuid, text, text) from public, anon, authenticated;

-- Gives the visitor their own sample organization and returns its slug. Calling
-- it again during the same demo returns the same one.
create function public.start_demo() returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  org public.organizations;
  sam uuid; lena uuid; theo uuid;
  m_me uuid; m_sam uuid; m_lena uuid; m_theo uuid;
  homework uuid; mentors uuid; coats uuid;
  t uuid;
  ev uuid;
  past_sessions uuid[] := '{}';
  kids uuid[] := '{}';
  kid uuid;
  fund uuid;
  chan uuid;
  disc uuid;
  i int;
  d date := current_date;
begin
  if me is null or not public.is_demo_user() then
    raise exception 'Demos are for temporary demo sign-ins' using errcode = '42501';
  end if;
  select * into org from public.organizations o where o.demo_owner = me and o.demo_expires_at > now();
  if found then
    return org.slug;
  end if;
  -- a demo that ran out but hasn't been cleaned up yet goes first (the visitor stays)
  delete from auth.users u
  where u.raw_app_meta_data ->> 'demo_org' in (select o.id::text from public.organizations o where o.demo_owner = me);
  delete from public.organizations o where o.demo_owner = me;

  insert into public.organizations (name, slug, preset_key, theme, demo_expires_at, demo_owner)
  select 'Riverside Youth Club', 'demo-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), p.key, p.theme,
         now() + interval '2 hours', me
  from public.presets p where p.key = 'nonprofit'
  returning * into org;

  update public.profiles p set full_name = 'Alex Morgan', title = 'Executive director' where p.id = me;
  sam := public.demo_person(org.id, 'Sam Okafor', 'Program manager');
  lena := public.demo_person(org.id, 'Lena Brooks', 'Youth worker');
  theo := public.demo_person(org.id, 'Theo Martin', 'Volunteer coordinator');

  insert into public.memberships (organization_id, user_id, role) values (org.id, me, 'owner') returning id into m_me;
  insert into public.memberships (organization_id, user_id, role) values (org.id, sam, 'manager') returning id into m_sam;
  insert into public.memberships (organization_id, user_id, role) values (org.id, lena, 'admin') returning id into m_lena;
  insert into public.memberships (organization_id, user_id, role) values (org.id, theo, 'staff') returning id into m_theo;

  -- programs (their creators become leads)
  insert into public.projects (organization_id, name, description, color, start_date, end_date, created_by, tracks_participants)
  values (org.id, 'Homework Club', 'After-school homework help, Monday to Thursday.', '#2563EB', d - 40, d + 60, sam, true)
  returning id into homework;
  insert into public.projects (organization_id, name, description, color, start_date, end_date, created_by)
  values (org.id, 'Teen Mentorship Circle', 'Pairs teens with volunteer mentors for the school year.', '#7C3AED', d - 20, d + 120, me)
  returning id into mentors;
  insert into public.projects (organization_id, name, description, color, start_date, end_date, created_by)
  values (org.id, 'Winter Coat Drive', 'Collect, sort and hand out winter coats before December.', '#0F766E', d - 10, d + 30, lena)
  returning id into coats;

  insert into public.project_members (organization_id, project_id, membership_id, role) values
    (org.id, homework, m_me, 'lead'), (org.id, homework, m_lena, 'admin'), (org.id, homework, m_theo, 'staff'),
    (org.id, mentors, m_sam, 'lead'), (org.id, mentors, m_theo, 'staff'),
    (org.id, coats, m_me, 'lead'), (org.id, coats, m_theo, 'staff')
  on conflict do nothing;

  -- work
  insert into public.tasks (organization_id, project_id, title, description, due_date, priority, created_by, position)
  values (org.id, homework, 'Order new math workbooks', 'Grades 5 to 8, about 30 copies.', d + 2, 'high', sam, 1) returning id into t;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values (org.id, t, m_me, 'appointed', sam);
  insert into public.task_comments (organization_id, task_id, author_id, body, created_at)
  values (org.id, t, sam, 'The supplier has a 10% discount if we order before Friday.', now() - interval '3 hours');

  insert into public.tasks (organization_id, project_id, title, due_date, priority, created_by, position)
  values (org.id, homework, 'Book the library room for exam week', d - 1, 'critical', me, 2) returning id into t;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values (org.id, t, m_lena, 'appointed', me);

  insert into public.tasks (organization_id, project_id, title, due_date, priority, created_by, position)
  values (org.id, homework, 'Restock the snack cupboard', d + 5, 'low', lena, 3) returning id into t;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values (org.id, t, m_theo, 'claimed', theo);

  insert into public.tasks (organization_id, project_id, title, due_date, priority, created_by, position, status)
  values (org.id, homework, 'Send the October attendance summary', d - 3, 'medium', me, 4, 'done');

  insert into public.tasks (organization_id, project_id, title, due_date, priority, created_by, position)
  values (org.id, mentors, 'Match the three new mentors', d + 4, 'high', sam, 1) returning id into t;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values (org.id, t, m_sam, 'claimed', sam);

  insert into public.tasks (organization_id, project_id, title, description, due_date, priority, created_by, position)
  values (org.id, mentors, 'Plan the mid-year mentor check-in', 'A one-hour session with pizza.', d + 14, 'medium', me, 2) returning id into t;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values (org.id, t, m_me, 'appointed', me);

  insert into public.tasks (organization_id, project_id, title, due_date, priority, created_by, position)
  values (org.id, mentors, 'Collect signed consent forms', d + 1, 'high', sam, 3) returning id into t;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values (org.id, t, m_theo, 'appointed', sam);

  insert into public.tasks (organization_id, project_id, title, due_date, priority, created_by, position)
  values (org.id, coats, 'Post the drive on community boards', d, 'medium', lena, 1) returning id into t;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values (org.id, t, m_theo, 'appointed', me);

  insert into public.tasks (organization_id, project_id, title, due_date, priority, created_by, position)
  values (org.id, coats, 'Find a second drop-off location', d + 7, 'medium', me, 2);

  insert into public.tasks (organization_id, project_id, title, due_date, priority, created_by, position, status)
  values (org.id, coats, 'Order collection boxes', d - 6, 'low', lena, 3, 'done');

  insert into public.tasks (organization_id, title, kind, due_date, priority, created_by, position) values
    (org.id, 'Draft the board report for November', 'general', d + 9, 'high', me, 1);
  insert into public.tasks (organization_id, title, kind, due_date, priority, created_by, position)
  values (org.id, 'Renew the insurance certificate', 'personal', d + 20, 'medium', me, 2) returning id into t;
  insert into public.task_assignees (organization_id, task_id, membership_id, kind, added_by) values (org.id, t, m_me, 'appointed', me);

  -- calendar: past and upcoming Homework Club sessions, and other events
  for i in -3..3 loop
    insert into public.events (organization_id, project_id, title, starts_at, ends_at, location, created_by)
    values (org.id, homework, 'Homework Club',
            (d + i * 2)::timestamp + time '15:30', (d + i * 2)::timestamp + time '17:30', 'Room 104', sam)
    returning id into ev;
    if i < 0 then
      past_sessions := past_sessions || ev;
    end if;
  end loop;
  insert into public.events (organization_id, project_id, title, starts_at, ends_at, location, created_by) values
    (org.id, mentors, 'Mentor training night', (d + 3)::timestamp + time '18:00', (d + 3)::timestamp + time '20:00', 'Community hall', sam),
    (org.id, coats, 'Coat sorting day', (d + 6)::timestamp + time '10:00', (d + 6)::timestamp + time '14:00', 'Warehouse, Bay 2', lena);
  insert into public.events (organization_id, title, starts_at, ends_at, all_day, created_by)
  values (org.id, 'Staff planning day', (d + 10)::timestamp, (d + 11)::timestamp, true, me);

  -- people in Homework Club, and their attendance at past sessions
  for i in 1..5 loop
    insert into public.participants (organization_id, name, guardian_name, created_by)
    values (org.id, (array['Jonah Brooks', 'Amira Haddad', 'Mateo Silva', 'Grace Liu', 'Ezra Cole'])[i],
            (array['Dana Brooks', 'Samir Haddad', 'Lucia Silva', 'Wei Liu', 'Tara Cole'])[i], sam)
    returning id into kid;
    insert into public.participant_programs (organization_id, participant_id, project_id) values (org.id, kid, homework);
    kids := kids || kid;
  end loop;
  foreach ev in array past_sessions loop
    for i in 1..5 loop
      insert into public.attendance (organization_id, event_id, participant_id, status, recorded_by)
      values (org.id, ev, kids[i],
              (case when i = 1 and ev = past_sessions[1] then 'absent'
                    when i = 1 then 'late'
                    when i = 3 and ev = past_sessions[2] then 'excused'
                    else 'present' end)::public.attendance_status,
              sam);
    end loop;
  end loop;

  -- money
  insert into public.funds (organization_id, name, description, total_cents, created_by, spend_by)
  values (org.id, 'Community Foundation grant', 'Annual operating grant.', 2500000, me, d + 200)
  returning id into fund;
  insert into public.fund_allocations (organization_id, fund_id, label, amount_cents, project_id, position) values
    (org.id, fund, 'Homework Club supplies', 600000, homework, 1),
    (org.id, fund, 'Mentorship events', 400000, mentors, 2),
    (org.id, fund, 'Coat drive logistics', 300000, coats, 3);
  insert into public.spending_entries (organization_id, fund_id, project_id, amount_cents, category, spent_on, note, submitted_by, status, decided_by, decided_at) values
    (org.id, fund, homework, 18450, 'Supplies', d - 12, 'Pencils, binders and printer paper', lena, 'approved', me, now() - interval '10 days'),
    (org.id, fund, coats, 9600, 'Transport', d - 2, 'Van rental for coat pick-up', theo, 'pending', null, null);

  -- conversation
  select c.id into chan from public.chat_channels c where c.organization_id = org.id and c.kind = 'org';
  if chan is not null then
    insert into public.chat_messages (organization_id, channel_id, sender_id, body, created_at) values
      (org.id, chan, sam, 'Morning all! Workbooks are on the way for Homework Club.', now() - interval '2 hours'),
      (org.id, chan, lena, 'Great. I''ll set up the room once they arrive.', now() - interval '100 minutes'),
      (org.id, chan, theo, 'Coat drive posters are up at the library and the rec centre.', now() - interval '40 minutes');
  end if;
  insert into public.discussions (organization_id, project_id, author_id, title, body, created_at, last_activity_at)
  values (org.id, mentors, sam, 'Ideas for the mid-year check-in', 'What should we cover with mentors in January? Share ideas below.', now() - interval '1 day', now() - interval '5 hours')
  returning id into disc;
  insert into public.discussion_replies (organization_id, discussion_id, author_id, body, created_at)
  values (org.id, disc, theo, 'A short session on setting goals for the spring would help.', now() - interval '5 hours');

  return org.slug;
end;
$$;

revoke execute on function public.start_demo() from public, anon;
grant execute on function public.start_demo() to authenticated;
