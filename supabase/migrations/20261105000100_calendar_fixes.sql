-- Calendar fixes (D118).
--
-- 1. The private calendar feed (D57, D102) also carries the organization's
--    own calendar items (those on no program, which every member sees) and
--    open, dated work the person created that nobody has been given yet.
--    Program items still come only from the programs they're on, so an
--    owner's feed is not everything they can see.
--
-- 2. reschedule_event_series(): "this and later times" of a repeating event
--    (D112) are replaced by a new pattern in one transaction. It runs as the
--    caller, so the events policies decide what they may delete and add. It
--    refuses when any of those times can't be deleted by them, and when
--    attendance has been taken at any of them, so nothing is half-done and no
--    attendance is lost.

create or replace function public.calendar_feed(feed_token text)
returns table (
  item_type text,
  item_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  due_date date,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid;
  previous_sub text := current_setting('request.jwt.claim.sub', true);
  previous_claims text := current_setting('request.jwt.claims', true);
begin
  if feed_token is not null and feed_token ~ '^[A-Za-z0-9_-]{43}$' then
    select p.id into uid
    from public.profiles p
    where p.calendar_feed_token_hash = encode(sha256(convert_to(feed_token, 'UTF8')), 'hex');
  end if;
  if uid is null then
    raise exception 'No such calendar feed' using errcode = 'P0002';
  end if;

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);

  return query
    -- open, dated work that is theirs: their own part not yet ticked, or work
    -- they created that nobody has been given yet
    select 'task'::text, t.id, t.title, null::timestamptz, null::timestamptz, true, t.due_date, t.updated_at
    from public.tasks t
    where t.due_date is not null
      and t.status <> 'done'
      and (
        exists (
          select 1 from public.task_assignees a
          join public.memberships m on m.id = a.membership_id and m.user_id = uid
          where a.task_id = t.id and a.done_at is null
        )
        or (
          t.created_by = uid
          and not exists (select 1 from public.task_assignees a where a.task_id = t.id)
        )
      )
      and public.can_view_task(t.id)
    union all
    -- calendar items, from 90 days back to a year ahead: the organization's
    -- own (on no program), and those on the programs they're on
    select 'event'::text, e.id, e.title, e.starts_at, e.ends_at, e.all_day, null::date, e.updated_at
    from public.events e
    where e.ends_at >= now() - interval '90 days'
      and e.starts_at <= now() + interval '1 year'
      and (
        (e.project_id is null and public.is_member(e.organization_id))
        or (
          e.project_id is not null
          and exists (
            select 1 from public.project_members pm
            join public.memberships m on m.id = pm.membership_id and m.user_id = uid
            where pm.project_id = e.project_id
          )
          and public.can_view_project(e.project_id)
        )
      );

  -- return query has already run: hand the request back its own identity
  perform set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
end;
$$;
revoke execute on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

-- Whether attendance has been taken at a time of a series from a moment on.
-- A definer, because staff can't read attendance, yet must not wipe it out by
-- rescheduling; it answers only for a series the caller can see.
create function public.series_has_attendance_from(series uuid, from_time timestamptz) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join public.attendance a on a.event_id = e.id
    where e.series_id = series
      and e.starts_at >= from_time
      and public.is_member(e.organization_id)
  );
$$;
revoke execute on function public.series_has_attendance_from(uuid, timestamptz) from public, anon;
grant execute on function public.series_has_attendance_from(uuid, timestamptz) to authenticated;

create function public.reschedule_event_series(from_event uuid, occurrences jsonb) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ev public.events;
  later integer;
  removed integer;
  added integer;
begin
  select * into ev from public.events e where e.id = from_event;
  if not found or ev.series_id is null then
    raise exception 'That repeating event doesn''t exist' using errcode = 'P0002';
  end if;
  if jsonb_typeof(occurrences) <> 'array' or jsonb_array_length(occurrences) not between 1 and 200 then
    raise exception 'Give between 1 and 200 times' using errcode = '22023';
  end if;
  if public.series_has_attendance_from(ev.series_id, ev.starts_at) then
    raise exception 'Attendance has been taken at one of these times' using errcode = 'P0001', hint = 'has_attendance';
  end if;

  select count(*) into later from public.events e where e.series_id = ev.series_id and e.starts_at >= ev.starts_at;
  with gone as (
    delete from public.events e where e.series_id = ev.series_id and e.starts_at >= ev.starts_at returning 1
  )
  select count(*) into removed from gone;
  if removed <> later then
    raise exception 'Some of these times were made by someone else' using errcode = '42501', hint = 'series_not_yours';
  end if;

  with added_rows as (
    insert into public.events (organization_id, series_id, project_id, title, description, location, all_day, starts_at, ends_at)
    select ev.organization_id, ev.series_id, o.project_id, o.title, o.description, o.location, o.all_day, o.starts_at, o.ends_at
    from jsonb_to_recordset(occurrences) as o (
      project_id uuid, title text, description text, location text, all_day boolean, starts_at timestamptz, ends_at timestamptz
    )
    returning 1
  )
  select count(*) into added from added_rows;
  return added;
end;
$$;
revoke execute on function public.reschedule_event_series(uuid, jsonb) from public, anon;
grant execute on function public.reschedule_event_series(uuid, jsonb) to authenticated;
