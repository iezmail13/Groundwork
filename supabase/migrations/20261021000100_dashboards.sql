-- Dashboards (D105).
--
-- ("Done this week" uses tasks.completed_at, kept since the first release.)
--
-- 1. Two attendance marks per organization: below the low one is red (and
--    alerts, D103), below the high one amber, at or above it green.
-- 2. Live updates: a change to work, calendar items or attendance sends a
--    Realtime broadcast that carries no content, only which program changed
--    (or that something outside any program changed). Dashboards listening
--    on those private channels then re-fetch their own filtered numbers.
--    Only people who can see a program may listen on its channel.

-- 1. Attendance marks ---------------------------------------------------------------------

alter table public.organizations drop constraint organizations_low_attendance_percent_check;
alter table public.organizations alter column low_attendance_percent set default 50;
-- nobody has chosen a mark yet (D103 shipped with this update): move to the new default
update public.organizations set low_attendance_percent = 50 where low_attendance_percent = 75;
alter table public.organizations
  add column high_attendance_percent smallint not null default 80,
  add constraint organizations_attendance_marks_check
    check (low_attendance_percent >= 0 and low_attendance_percent < high_attendance_percent and high_attendance_percent <= 100);
grant update (high_attendance_percent) on table public.organizations to authenticated;

-- 2. Live update signals --------------------------------------------------------------------

create function public.send_change_signal(org uuid, project uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if project is not null then
    perform realtime.send(jsonb_build_object('project_id', project), 'changed', 'project:' || project || ':changes', true);
  elsif org is not null then
    perform realtime.send('{}'::jsonb, 'changed', 'org:' || org || ':changes', true);
  end if;
exception
  -- a missing Realtime service must never block the change itself
  when undefined_function or undefined_table then
    null;
end;
$$;

revoke execute on function public.send_change_signal(uuid, uuid) from public, anon, authenticated;

create function public.signal_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  org uuid := (rec ->> 'organization_id')::uuid;
  project uuid;
  old_project uuid;
begin
  if tg_table_name in ('tasks', 'events') then
    project := (rec ->> 'project_id')::uuid;
    if tg_op = 'UPDATE' then
      old_project := (to_jsonb(old) ->> 'project_id')::uuid;
    end if;
  elsif tg_table_name = 'task_assignees' then
    select t.project_id into project from public.tasks t where t.id = (rec ->> 'task_id')::uuid;
  elsif tg_table_name = 'attendance' then
    select e.project_id into project from public.events e where e.id = (rec ->> 'event_id')::uuid;
  end if;
  perform public.send_change_signal(org, project);
  if old_project is distinct from project and tg_op = 'UPDATE' then
    perform public.send_change_signal(org, old_project);
  end if;
  return null;
end;
$$;

create trigger tasks_signal after insert or update or delete on public.tasks
  for each row execute function public.signal_change();
create trigger task_assignees_signal after insert or update or delete on public.task_assignees
  for each row execute function public.signal_change();
create trigger events_signal after insert or update or delete on public.events
  for each row execute function public.signal_change();
create trigger attendance_signal after insert or update or delete on public.attendance
  for each row execute function public.signal_change();

-- Who may listen: a program's channel for people who can see the program, the
-- organization's channel (work outside any program) for its members.
create or replace function public.can_use_realtime_topic(topic text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(coalesce(topic, ''), ':');
begin
  if cardinality(parts) <> 3 then
    return false;
  end if;
  if parts[1] = 'org' and parts[3] in ('presence', 'changes') then
    return public.is_member(parts[2]::uuid);
  end if;
  if parts[1] = 'project' and parts[3] = 'changes' then
    return public.can_view_project(parts[2]::uuid);
  end if;
  return false;
exception
  when invalid_text_representation then
    return false;
end;
$$;

-- Clients only announce presence; change signals come from the database alone.
drop policy groundwork_realtime_insert on realtime.messages;
create policy groundwork_realtime_insert on realtime.messages
  for insert to authenticated
  with check (public.can_use_realtime_topic(realtime.topic()) and realtime.topic() like '%:presence');
