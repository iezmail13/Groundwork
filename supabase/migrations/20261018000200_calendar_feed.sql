-- The private calendar (ICS) feed (D57, D102).
--
-- Each person can turn on one feed, a secret URL their calendar app
-- subscribes to. Only the SHA-256 digest of its token is stored, on their
-- profile, where nobody (not even they) can read it back. Turning the feed
-- off clears the digest, so the old URL stops working at once; making a new
-- one replaces it.
--
-- The feed holds titles and dates only: open work assigned to the person,
-- plus calendar items on the programs (projects) they're on. Everything goes
-- through the same visibility rules as the app (can_view_task,
-- can_view_project), evaluated as that person.

alter table public.profiles
  add column calendar_feed_token_hash text unique check (calendar_feed_token_hash ~ '^[0-9a-f]{64}$'),
  add column calendar_feed_created_at timestamptz;

-- The digest is never readable through the API. Every other column stays as
-- it was (people read their own profile and their colleagues' names).
revoke select on table public.profiles from authenticated;
grant select (id, full_name, email, created_at, theme_mode, accent, calendar_feed_created_at)
  on table public.profiles to authenticated;

-- Turns the feed on, or replaces it: returns the new token, once.
create function public.regenerate_calendar_feed() returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  -- 32 random bytes, base64url without padding: 43 characters
  token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  update public.profiles
  set calendar_feed_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'),
      calendar_feed_created_at = now()
  where id = auth.uid();
  return token;
end;
$$;

-- Turns the feed off: the old URL stops working immediately.
create function public.revoke_calendar_feed() returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.profiles
  set calendar_feed_token_hash = null, calendar_feed_created_at = null
  where id = auth.uid();
end;
$$;

revoke execute on function public.regenerate_calendar_feed() from public, anon;
revoke execute on function public.revoke_calendar_feed() from public, anon;
grant execute on function public.regenerate_calendar_feed() to authenticated;
grant execute on function public.revoke_calendar_feed() to authenticated;

-- What a feed shows. Called without a session (calendar apps can't sign in),
-- so it finds the person from the token's digest, then answers as them: the
-- visibility helpers all read auth.uid(), which is set to that person while
-- the rows are gathered and restored straight after. The lookup compares SHA-256 digests, so its
-- timing says nothing about the token. An unknown or revoked token raises
-- no_data_found (P0002), which the route turns into a 404.
create function public.calendar_feed(feed_token text)
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
    -- open work assigned to them (their own part not yet ticked), with a due date
    select 'task'::text, t.id, t.title, null::timestamptz, null::timestamptz, true, t.due_date, t.updated_at
    from public.tasks t
    join public.task_assignees a on a.task_id = t.id
    join public.memberships m on m.id = a.membership_id and m.user_id = uid
    where t.due_date is not null
      and t.status <> 'done'
      and a.done_at is null
      and public.can_view_task(t.id)
    union all
    -- calendar items on the programs they're on, from 90 days back to a year ahead
    select 'event'::text, e.id, e.title, e.starts_at, e.ends_at, e.all_day, null::date, e.updated_at
    from public.events e
    where e.project_id is not null
      and exists (
        select 1 from public.project_members pm
        join public.memberships m on m.id = pm.membership_id and m.user_id = uid
        where pm.project_id = e.project_id
      )
      and public.can_view_project(e.project_id)
      and e.ends_at >= now() - interval '90 days'
      and e.starts_at <= now() + interval '1 year';

  -- return query has already run: hand the request back its own identity
  perform set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
end;
$$;

revoke execute on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
