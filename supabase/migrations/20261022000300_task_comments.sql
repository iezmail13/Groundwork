-- Comments on work (D106). Anyone who can see a task can read and add
-- comments on it, through can_view_task(), the one source of truth for task
-- visibility. People edit or delete their own; a deleted comment leaves
-- "comment deleted" in place. Mentions use the same <@user-id> form as chat.
--
-- A new comment tells the task's people (whoever made it, whoever is on it,
-- and whoever has commented before) and every person it mentions, through
-- notify(), which checks each one can still see the task.

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null,
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (task_id, organization_id) references public.tasks (id, organization_id) on delete cascade,
  check (
    (deleted_at is null and char_length(btrim(body)) between 1 and 4000)
    or (deleted_at is not null and body = '')
  )
);

create index task_comments_task_idx on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;

create policy task_comments_select on public.task_comments
  for select to authenticated
  using (public.is_member(organization_id) and public.can_view_task(task_id));
create policy task_comments_insert on public.task_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_member(organization_id)
    and public.can_view_task(task_id)
    and edited_at is null
    and deleted_at is null
  );
create policy task_comments_update on public.task_comments
  for update to authenticated
  using (author_id = auth.uid() and public.can_view_task(task_id))
  with check (author_id = auth.uid() and public.can_view_task(task_id));
-- deleting leaves "comment deleted" in place; rows go with their task
create policy task_comments_delete on public.task_comments
  for delete to authenticated
  using (false);

revoke all on table public.task_comments from anon, authenticated;
grant select, insert, delete on table public.task_comments to authenticated;
grant update (body, deleted_at) on table public.task_comments to authenticated;

-- The same rules as chat messages: mentions follow the text, edits are
-- marked, deleted comments are emptied and stay deleted.
create function public.prepare_task_comment() returns trigger
language plpgsql
-- security invoker, so current_user tells people from the service role
set search_path = ''
as $$
begin
  -- people's posts get the moment they were written (never a date they pick,
  -- which could hide a post before someone's join date); the demo seed, which
  -- runs as the service role, keeps the times it sets
  if tg_op = 'INSERT' and current_user = 'authenticated' then
    new.created_at := clock_timestamp();
  end if;
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null then
      raise exception 'That comment was deleted.' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    new.author_id := old.author_id;
    new.task_id := old.task_id;
    new.organization_id := old.organization_id;
    if new.deleted_at is not null then
      new.body := '';
      new.mentions := '{}';
      return new;
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  new.mentions := public.mentions_in(new.body, new.organization_id);
  return new;
end;
$$;

create trigger task_comments_prepare
  before insert or update on public.task_comments
  for each row execute function public.prepare_task_comment();

-- A task's people: whoever made it, whoever is on it, and whoever has
-- commented on it. They hear about comments and changes.
create function public.task_people(task uuid) returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.created_by from public.tasks t where t.id = task and t.created_by is not null
  union
  select m.user_id from public.task_assignees a join public.memberships m on m.id = a.membership_id where a.task_id = task
  union
  select c.author_id from public.task_comments c where c.task_id = task and c.author_id is not null;
$$;
revoke execute on function public.task_people(uuid) from public, anon, authenticated;

create function public.notify_task_comment() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  foreach person in array new.mentions loop
    perform public.notify(new.organization_id, person, 'mention', 'task', new.task_id, new.author_id,
      jsonb_build_object('comment_id', new.id));
  end loop;
  for person in select public.task_people(new.task_id) loop
    if not person = any (new.mentions) then
      perform public.notify(new.organization_id, person, 'task_comment', 'task', new.task_id, new.author_id,
        jsonb_build_object('comment_id', new.id));
    end if;
  end loop;
  perform public.send_change_signal(new.organization_id, (select project_id from public.tasks where id = new.task_id));
  return null;
end;
$$;

create trigger task_comments_notify
  after insert on public.task_comments
  for each row execute function public.notify_task_comment();

-- Who a comment can mention: the people who can see the task. Empty unless
-- the caller can see it too.
create function public.task_audience(task uuid) returns table (user_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if not public.can_view_task(task) then
    return;
  end if;
  return query
    select m.user_id
    from public.tasks t
    join public.memberships m on m.organization_id = t.organization_id
    where t.id = task and (m.user_id = caller or public.user_can_view_task(m.user_id, task));
end;
$$;

revoke execute on function public.task_audience(uuid) from public, anon;
grant execute on function public.task_audience(uuid) to authenticated;
