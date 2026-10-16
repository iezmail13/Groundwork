-- In-app notifications (D103). No email, SMS or push.
--
-- Only meaningful events notify: being given work, someone claiming work you
-- made, work you made (or on a program you lead) being finished, your work
-- coming due or going overdue, an invitation you sent being accepted, and a
-- participant's attendance falling below the organization's low mark.
--
-- Rows are written only by the functions and triggers here, and only after
-- checking that the recipient can see what the notification is about, as
-- that person (can_view_task, can_view_participant). Recipients read and mark
-- their own; nobody else sees them.
--
-- One function, notification_muted(), decides whether someone has muted a
-- notification. Today it reads per-type mutes from Settings → Notifications;
-- later parts add muting a person and a channel to the same function.

create type public.notification_type as enum (
  'assigned', 'claimed', 'completed', 'due_soon', 'overdue', 'invitation_accepted', 'low_attendance'
);

-- The organization's low attendance mark, as a percentage.
alter table public.organizations
  add column low_attendance_percent smallint not null default 75
    check (low_attendance_percent between 1 and 100);
grant update (low_attendance_percent) on table public.organizations to authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  subject_type text not null check (subject_type in ('task', 'participant', 'invitation')),
  subject_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null,
  -- small details for the sentence (a rate, the program); never names or titles,
  -- which are read live so they follow the recipient's current access
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  -- notifications that must not repeat (due tomorrow, overdue) carry a key
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, organization_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id, organization_id) where read_at is null;
create unique index notifications_dedupe_idx on public.notifications (recipient_id, dedupe_key) where dedupe_key is not null;

create table public.notification_mutes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  type public.notification_type not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, type)
);

-- RLS ----------------------------------------------------------------------------------

alter table public.notifications enable row level security;
alter table public.notification_mutes enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid() and public.is_member(organization_id));
-- written only by the functions below
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (false);
-- recipients mark their own read or unread (only read_at is granted)
create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid() and public.is_member(organization_id))
  with check (recipient_id = auth.uid() and public.is_member(organization_id));
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (false);

create policy notification_mutes_select on public.notification_mutes
  for select to authenticated
  using (user_id = auth.uid() and public.is_member(organization_id));
create policy notification_mutes_insert on public.notification_mutes
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(organization_id));
-- a mute is added or removed, never edited
create policy notification_mutes_update on public.notification_mutes
  for update to authenticated
  using (false) with check (false);
create policy notification_mutes_delete on public.notification_mutes
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.notifications from anon, authenticated;
revoke all on table public.notification_mutes from anon, authenticated;
grant select, insert, delete on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notification_mutes to authenticated;

-- Checking visibility as the recipient -------------------------------------------------
-- The visibility helpers read auth.uid(). These answer for someone else by
-- setting the request's identity to them for one call, then restoring it.

create function public.as_user_begin(uid uuid) returns text[]
language plpgsql
volatile
set search_path = ''
as $$
declare
  saved text[] := array[current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)];
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
  return saved;
end;
$$;

create function public.as_user_end(saved text[]) returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(saved[1], ''), true);
  perform set_config('request.jwt.claims', coalesce(saved[2], ''), true);
end;
$$;

create function public.user_can_view_task(uid uuid, task_id uuid) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  saved text[] := public.as_user_begin(uid);
  answer boolean;
begin
  answer := public.can_view_task(task_id);
  perform public.as_user_end(saved);
  return coalesce(answer, false);
end;
$$;

create function public.user_can_view_participant(uid uuid, participant_id uuid) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  saved text[] := public.as_user_begin(uid);
  answer boolean;
begin
  answer := public.can_view_participant(participant_id);
  perform public.as_user_end(saved);
  return coalesce(answer, false);
end;
$$;

-- The one place that decides whether a notification is muted. Parts 7 and 9
-- add per-person and per-channel mutes here.
create function public.notification_muted(org uuid, recipient uuid, kind public.notification_type, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notification_mutes nm
    where nm.organization_id = org and nm.user_id = recipient and nm.type = kind
  );
$$;

-- Sends one notification, if it should be sent at all.
create function public.notify(
  org uuid,
  recipient uuid,
  kind public.notification_type,
  subject_type text,
  subject_id uuid,
  actor uuid,
  data jsonb default '{}'::jsonb,
  dedupe text default null
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- nobody is told about their own actions
  if recipient is null or recipient is not distinct from actor then
    return;
  end if;
  if not exists (select 1 from public.memberships m where m.organization_id = org and m.user_id = recipient) then
    return;
  end if;
  if public.notification_muted(org, recipient, kind, actor) then
    return;
  end if;
  if subject_type = 'task' and not public.user_can_view_task(recipient, subject_id) then
    return;
  end if;
  if subject_type = 'participant' and not public.user_can_view_participant(recipient, subject_id) then
    return;
  end if;
  insert into public.notifications (organization_id, recipient_id, type, subject_type, subject_id, actor_id, data, dedupe_key)
  values (org, recipient, kind, subject_type, subject_id, actor, coalesce(data, '{}'::jsonb), dedupe)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

revoke execute on function public.as_user_begin(uuid) from public, anon, authenticated;
revoke execute on function public.as_user_end(text[]) from public, anon, authenticated;
revoke execute on function public.user_can_view_task(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.user_can_view_participant(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.notification_muted(uuid, uuid, public.notification_type, uuid) from public, anon, authenticated;
revoke execute on function public.notify(uuid, uuid, public.notification_type, text, uuid, uuid, jsonb, text) from public, anon, authenticated;

-- Events ---------------------------------------------------------------------------------

-- Being given work, and someone claiming work you made.
create function public.notify_task_assignee() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  person uuid;
begin
  if new.membership_id is null then
    return new;
  end if;
  select * into t from public.tasks x where x.id = new.task_id;
  select m.user_id into person from public.memberships m where m.id = new.membership_id;
  if new.kind = 'appointed' then
    perform public.notify(t.organization_id, person, 'assigned', 'task', t.id, auth.uid());
  else
    perform public.notify(t.organization_id, t.created_by, 'claimed', 'task', t.id, person);
  end if;
  return new;
end;
$$;

create trigger task_assignees_notify
  after insert on public.task_assignees
  for each row execute function public.notify_task_assignee();

-- Work being finished: its creator and the program's leads, never whoever
-- finished it.
create function public.notify_task_completed() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  if new.status <> 'done' or old.status = 'done' then
    return new;
  end if;
  for person in
    select new.created_by
    union
    select m.user_id
    from public.project_members pm
    join public.memberships m on m.id = pm.membership_id
    -- someone's personal work is theirs: their leads aren't told when it's done
    where new.project_id is not null and new.kind <> 'personal'
      and pm.project_id = new.project_id and pm.role = 'lead'
  loop
    perform public.notify(new.organization_id, person, 'completed', 'task', new.id, auth.uid());
  end loop;
  return new;
end;
$$;

create trigger tasks_notify_completed
  after update of status on public.tasks
  for each row execute function public.notify_task_completed();

-- An invitation being accepted: whoever sent it.
create function public.notify_invitation_accepted() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.accepted_at is null and new.accepted_at is not null then
    perform public.notify(new.organization_id, new.invited_by, 'invitation_accepted', 'invitation', new.id, auth.uid());
  end if;
  return new;
end;
$$;

create trigger invitations_notify_accepted
  after update of accepted_at on public.invitations
  for each row execute function public.notify_invitation_accepted();

-- Attendance falling below the organization's low mark: owners, and the
-- program's admins and leads. Told once when it crosses the mark, after at
-- least three counted sessions; again only if it recovers and falls again.
create function public.attendance_rate(participant_id uuid, project_id uuid, skip_mark uuid, extra_status public.attendance_status)
returns table (counted int, rate numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with marks as (
    select a.status
    from public.attendance a
    join public.events e on e.id = a.event_id
    where a.participant_id = attendance_rate.participant_id
      and e.project_id = attendance_rate.project_id
      and a.id is distinct from skip_mark
    union all
    select extra_status where extra_status is not null
  )
  select
    count(*) filter (where status <> 'excused')::int,
    case
      when count(*) filter (where status <> 'excused') = 0 then null
      else 100.0 * count(*) filter (where status in ('present', 'late')) / count(*) filter (where status <> 'excused')
    end
  from marks;
$$;

revoke execute on function public.attendance_rate(uuid, uuid, uuid, public.attendance_status) from public, anon, authenticated;

create function public.notify_low_attendance() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  program uuid;
  low smallint;
  before_counted int;
  before_rate numeric;
  after_counted int;
  after_rate numeric;
  person uuid;
begin
  if new.participant_id is null then
    return new;
  end if;
  select e.project_id into program from public.events e where e.id = new.event_id;
  select o.low_attendance_percent into low from public.organizations o where o.id = new.organization_id;
  if program is null then
    return new;
  end if;
  select r.counted, r.rate into after_counted, after_rate
  from public.attendance_rate(new.participant_id, program, null, null) r;
  select r.counted, r.rate into before_counted, before_rate
  from public.attendance_rate(new.participant_id, program, new.id, case when tg_op = 'UPDATE' then old.status end) r;
  if after_counted < 3 or after_rate is null or after_rate >= low then
    return new;
  end if;
  if before_counted >= 3 and before_rate is not null and before_rate < low then
    -- already below: they've been told
    return new;
  end if;
  for person in
    select m.user_id from public.memberships m
    where m.organization_id = new.organization_id and m.role = 'owner'
    union
    select m.user_id
    from public.project_members pm
    join public.memberships m on m.id = pm.membership_id
    where pm.project_id = program and pm.role in ('admin', 'lead')
  loop
    perform public.notify(
      new.organization_id, person, 'low_attendance', 'participant', new.participant_id, auth.uid(),
      jsonb_build_object('rate', round(after_rate), 'project_id', program)
    );
  end loop;
  return new;
end;
$$;

create trigger attendance_notify_low
  after insert or update of status on public.attendance
  for each row execute function public.notify_low_attendance();

-- Work due tomorrow or overdue, for the person asking. Called when they open
-- the app, with today's date where they are; each due date notifies once.
create function public.queue_my_due_notifications(org uuid, today date) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t record;
begin
  if me is null or not public.is_member(org) then
    return;
  end if;
  -- "today" comes from the browser's time zone, so allow a day either side
  if today is null or today not between current_date - 1 and current_date + 1 then
    return;
  end if;
  for t in
    select x.id, x.due_date
    from public.tasks x
    join public.task_assignees a on a.task_id = x.id
    join public.memberships m on m.id = a.membership_id and m.user_id = me
    where x.organization_id = org
      and x.status <> 'done'
      and a.done_at is null
      and x.due_date is not null
      and x.due_date <= today + 1
  loop
    if t.due_date = today + 1 then
      perform public.notify(org, me, 'due_soon', 'task', t.id, null, jsonb_build_object('due_date', t.due_date), 'due_soon:' || t.id || ':' || t.due_date);
    elsif t.due_date < today then
      perform public.notify(org, me, 'overdue', 'task', t.id, null, jsonb_build_object('due_date', t.due_date), 'overdue:' || t.id || ':' || t.due_date);
    end if;
  end loop;
end;
$$;

revoke execute on function public.queue_my_due_notifications(uuid, date) from public, anon;
grant execute on function public.queue_my_due_notifications(uuid, date) to authenticated;

-- The activity log is append-only (D103) --------------------------------------------------
-- Entries are written only by the logging triggers (all security definer), so
-- nobody can add a forged entry or remove a real one.

drop policy activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log
  for insert to authenticated
  with check (false);
drop policy activity_log_delete on public.activity_log;
create policy activity_log_delete on public.activity_log
  for delete to authenticated
  using (false);
