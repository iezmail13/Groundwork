-- Discussion boards (D106): titled threads with replies, either on a program
-- (for the people who can see it) or for the whole organization. One
-- function, can_view_discussion(), decides who sees a thread and its replies.
--
-- People edit or delete their own posts. A thread's author, and anyone who
-- can manage the program's content (or an owner or manager, for the
-- organization's board), can remove a whole thread.
--
-- A new thread tells the people on its program (everyone, for the
-- organization's board, is too many: they find it on the board); a reply
-- tells the thread's author and everyone who has replied; mentions tell the
-- person mentioned. All through notify(), which checks they can still see it.

create table public.discussions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);

create index discussions_board_idx on public.discussions (organization_id, project_id, last_activity_at desc);

create table public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  discussion_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null,
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (discussion_id, organization_id) references public.discussions (id, organization_id) on delete cascade,
  check (
    (deleted_at is null and char_length(btrim(body)) between 1 and 4000)
    or (deleted_at is not null and body = '')
  )
);

create index discussion_replies_thread_idx on public.discussion_replies (discussion_id, created_at);

-- Visibility ------------------------------------------------------------------------------

create function public.can_view_discussion(discussion uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when d.project_id is null then public.is_member(d.organization_id)
      else public.can_view_project(d.project_id)
    end
    from public.discussions d
    where d.id = discussion
  ), false);
$$;

-- Removing a whole thread: its author, or whoever runs the board.
create function public.can_remove_discussion(discussion uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.can_view_discussion(d.id) and (
      d.author_id = auth.uid()
      or case
        when d.project_id is null then public.has_permission(d.organization_id, 'manager')
        else public.can_manage_project_content(d.project_id)
      end
    )
    from public.discussions d
    where d.id = discussion
  ), false);
$$;

create function public.user_can_view_discussion(uid uuid, discussion uuid) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  saved text[] := public.as_user_begin(uid);
  answer boolean;
begin
  answer := public.can_view_discussion(discussion);
  perform public.as_user_end(saved);
  return coalesce(answer, false);
end;
$$;

revoke execute on function public.can_view_discussion(uuid) from public, anon;
revoke execute on function public.can_remove_discussion(uuid) from public, anon;
revoke execute on function public.user_can_view_discussion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_view_discussion(uuid) to authenticated;
grant execute on function public.can_remove_discussion(uuid) to authenticated;

-- RLS -------------------------------------------------------------------------------------

alter table public.discussions enable row level security;
alter table public.discussion_replies enable row level security;

create policy discussions_select on public.discussions
  for select to authenticated
  using (public.is_member(organization_id) and public.can_view_discussion(id));
create policy discussions_insert on public.discussions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_member(organization_id)
    and (project_id is null or public.can_view_project(project_id))
    and edited_at is null
  );
-- authors edit their own (only title and body are granted)
create policy discussions_update on public.discussions
  for update to authenticated
  using (author_id = auth.uid() and public.can_view_discussion(id))
  with check (author_id = auth.uid() and public.can_view_discussion(id));
create policy discussions_delete on public.discussions
  for delete to authenticated
  using (public.can_remove_discussion(id));

create policy discussion_replies_select on public.discussion_replies
  for select to authenticated
  using (public.is_member(organization_id) and public.can_view_discussion(discussion_id));
create policy discussion_replies_insert on public.discussion_replies
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_member(organization_id)
    and public.can_view_discussion(discussion_id)
    and edited_at is null
    and deleted_at is null
  );
create policy discussion_replies_update on public.discussion_replies
  for update to authenticated
  using (author_id = auth.uid() and public.can_view_discussion(discussion_id))
  with check (author_id = auth.uid() and public.can_view_discussion(discussion_id));
-- a deleted reply leaves "reply deleted"; replies go with their thread
create policy discussion_replies_delete on public.discussion_replies
  for delete to authenticated
  using (false);

revoke all on table public.discussions from anon, authenticated;
revoke all on table public.discussion_replies from anon, authenticated;
grant select, insert, delete on table public.discussions to authenticated;
grant update (title, body) on table public.discussions to authenticated;
grant select, insert, delete on table public.discussion_replies to authenticated;
grant update (body, deleted_at) on table public.discussion_replies to authenticated;

-- Keeping posts in shape ---------------------------------------------------------------------

create function public.prepare_discussion() returns trigger
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
  if tg_op = 'INSERT' and current_user = 'authenticated' then
    new.last_activity_at := new.created_at;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.author_id := old.author_id;
    new.project_id := old.project_id;
    new.organization_id := old.organization_id;
    if new.title is distinct from old.title or new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  new.mentions := public.mentions_in(new.body, new.organization_id);
  return new;
end;
$$;

create trigger discussions_prepare
  before insert or update on public.discussions
  for each row execute function public.prepare_discussion();

create function public.prepare_discussion_reply() returns trigger
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
      raise exception 'That reply was deleted.' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    new.author_id := old.author_id;
    new.discussion_id := old.discussion_id;
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

create trigger discussion_replies_prepare
  before insert or update on public.discussion_replies
  for each row execute function public.prepare_discussion_reply();

-- Notifications ----------------------------------------------------------------------------

create function public.notify_discussion() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  foreach person in array new.mentions loop
    perform public.notify(new.organization_id, person, 'mention', 'discussion', new.id, new.author_id);
  end loop;
  if new.project_id is not null then
    for person in
      select m.user_id from public.project_members pm join public.memberships m on m.id = pm.membership_id
      where pm.project_id = new.project_id
    loop
      if not person = any (new.mentions) then
        perform public.notify(new.organization_id, person, 'discussion', 'discussion', new.id, new.author_id);
      end if;
    end loop;
  end if;
  return null;
end;
$$;

create trigger discussions_notify
  after insert on public.discussions
  for each row execute function public.notify_discussion();

create function public.notify_discussion_reply() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  update public.discussions set last_activity_at = new.created_at where id = new.discussion_id;
  foreach person in array new.mentions loop
    perform public.notify(new.organization_id, person, 'mention', 'discussion', new.discussion_id, new.author_id,
      jsonb_build_object('reply_id', new.id));
  end loop;
  for person in
    select d.author_id from public.discussions d where d.id = new.discussion_id and d.author_id is not null
    union
    select r.author_id from public.discussion_replies r where r.discussion_id = new.discussion_id and r.author_id is not null
  loop
    if not person = any (new.mentions) then
      perform public.notify(new.organization_id, person, 'discussion', 'discussion', new.discussion_id, new.author_id,
        jsonb_build_object('reply_id', new.id));
    end if;
  end loop;
  return null;
end;
$$;

create trigger discussion_replies_notify
  after insert on public.discussion_replies
  for each row execute function public.notify_discussion_reply();

alter table public.notifications drop constraint notifications_subject_type_check;
alter table public.notifications
  add constraint notifications_subject_type_check
  check (subject_type in ('task', 'participant', 'invitation', 'channel', 'discussion'));

-- notify() checks the recipient can see a discussion too.
create or replace function public.notify(
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
  if public.notification_muted(org, recipient, kind, actor, case when subject_type = 'channel' then subject_id end) then
    return;
  end if;
  if subject_type = 'task' and not public.user_can_view_task(recipient, subject_id) then
    return;
  end if;
  if subject_type = 'participant' and not public.user_can_view_participant(recipient, subject_id) then
    return;
  end if;
  if subject_type = 'channel' and not public.user_can_view_channel(recipient, subject_id) then
    return;
  end if;
  if subject_type = 'discussion' and not public.user_can_view_discussion(recipient, subject_id) then
    return;
  end if;
  insert into public.notifications (organization_id, recipient_id, type, subject_type, subject_id, actor_id, data, dedupe_key)
  values (org, recipient, kind, subject_type, subject_id, actor, coalesce(data, '{}'::jsonb), dedupe)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- Who a post can mention: the people who can see the thread. Empty unless
-- the caller can see it too.
create function public.discussion_audience(discussion uuid) returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.discussions d
  join public.memberships m on m.organization_id = d.organization_id
  where d.id = discussion
    and public.can_view_discussion(discussion)
    and (
      d.project_id is null
      or m.role = 'owner'
      or exists (select 1 from public.project_members pm where pm.project_id = d.project_id and pm.membership_id = m.id)
    );
$$;

revoke execute on function public.discussion_audience(uuid) from public, anon;
grant execute on function public.discussion_audience(uuid) to authenticated;
