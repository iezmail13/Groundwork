-- Chat (D106): text-only conversations inside an organization.
--
-- Three kinds of channel:
--   * org     — one per organization, for every member;
--   * project — one per program, created with it, for the people on it plus owners;
--   * direct  — between two members, opened on demand.
--
-- One function, can_view_channel(), decides who sees a channel, and every
-- read goes through it: the channel list, messages, unread counts, the
-- people a mention can reach, notifications and the Realtime topics.
--
-- History on a program's channel starts when the person first joined that
-- program (their original join date, kept even if they leave and come back),
-- and on the organization channel when they joined the organization. Owners
-- read every program channel in full, as they see every program.
--
-- Direct messages are the one place an owner can't see what isn't theirs
-- (D90): only the two people in the conversation can read it. There is no
-- owner exception in can_view_channel() for them, on purpose.
--
-- Text only: no attachments, reactions, threads or calls.

create type public.chat_channel_kind as enum ('org', 'project', 'direct');

create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.chat_channel_kind not null,
  project_id uuid,
  -- a direct conversation's two people, the lower id first
  member_a uuid references public.profiles (id) on delete cascade,
  member_b uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  check (
    case kind
      when 'org' then project_id is null and member_a is null and member_b is null
      when 'project' then project_id is not null and member_a is null and member_b is null
      when 'direct' then project_id is null and member_a is not null and member_b is not null and member_a < member_b
    end
  )
);

create unique index chat_channels_org_idx on public.chat_channels (organization_id) where kind = 'org';
create unique index chat_channels_project_idx on public.chat_channels (project_id) where kind = 'project';
create unique index chat_channels_direct_idx on public.chat_channels (organization_id, member_a, member_b) where kind = 'direct';

-- When each person first joined each program. Leaving and coming back keeps
-- the first date, so chat history doesn't reset.
create table public.project_first_joins (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  membership_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (project_id, membership_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id) references public.memberships (id, organization_id) on delete cascade
);

insert into public.project_first_joins (organization_id, project_id, membership_id, joined_at)
select organization_id, project_id, membership_id, created_at from public.project_members
on conflict do nothing;

create function public.record_project_first_join() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_first_joins (organization_id, project_id, membership_id, joined_at)
  values (new.organization_id, new.project_id, new.membership_id, new.created_at)
  on conflict do nothing;
  return new;
end;
$$;

create trigger project_members_first_join
  after insert on public.project_members
  for each row execute function public.record_project_first_join();

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id uuid not null,
  sender_id uuid references public.profiles (id) on delete set null default auth.uid(),
  -- mentions are written into the text as <@user-id>, and read back live
  body text not null,
  -- who the text mentions, worked out from the body by the database
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (channel_id, organization_id) references public.chat_channels (id, organization_id) on delete cascade,
  check (
    (deleted_at is null and char_length(btrim(body)) between 1 and 4000)
    or (deleted_at is not null and body = '')
  )
);

create index chat_messages_channel_idx on public.chat_messages (channel_id, created_at desc);

-- How far each person has read each channel.
create table public.chat_reads (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id),
  foreign key (channel_id, organization_id) references public.chat_channels (id, organization_id) on delete cascade
);

-- Visibility ------------------------------------------------------------------------------

-- The one place that decides who sees a channel (D106). Security definer and
-- reads tables directly, so policies that call it never recurse.
create function public.can_view_channel(channel uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case c.kind
      when 'org' then public.is_member(c.organization_id)
      -- the people on the program, plus owners (through can_view_project)
      when 'project' then public.can_view_project(c.project_id)
      -- only the two people in it: no owner exception (D90)
      when 'direct' then auth.uid() in (c.member_a, c.member_b) and public.is_member(c.organization_id)
    end
    from public.chat_channels c
    where c.id = channel
  ), false);
$$;

-- Where the viewer's history in a channel starts.
create function public.chat_history_start(channel uuid) returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when c.kind = 'direct' then '-infinity'::timestamptz
    when public.has_permission(c.organization_id, 'owner') then '-infinity'::timestamptz
    when c.kind = 'org' then coalesce(
      (select m.created_at from public.memberships m where m.organization_id = c.organization_id and m.user_id = auth.uid()),
      'infinity'::timestamptz
    )
    else coalesce(
      (
        select j.joined_at
        from public.project_first_joins j
        join public.memberships m on m.id = j.membership_id
        where j.project_id = c.project_id and m.user_id = auth.uid()
      ),
      'infinity'::timestamptz
    )
  end
  from public.chat_channels c
  where c.id = channel;
$$;

create function public.can_read_chat_message(channel uuid, sent_at timestamptz) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_channel(channel) and sent_at >= public.chat_history_start(channel);
$$;

-- Whether the viewer is one of the channel's own people (not an owner looking
-- in on a program they aren't on). Only these count towards the chat badge
-- and get a message notification for every new conversation.
create function public.in_channel(channel uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case c.kind
      when 'org' then public.is_member(c.organization_id)
      when 'direct' then auth.uid() in (c.member_a, c.member_b) and public.is_member(c.organization_id)
      else exists (
        select 1 from public.project_members pm
        join public.memberships m on m.id = pm.membership_id
        where pm.project_id = c.project_id and m.user_id = auth.uid()
      )
    end
    from public.chat_channels c
    where c.id = channel
  ), false);
$$;

create function public.user_can_view_channel(uid uuid, channel uuid) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  saved text[] := public.as_user_begin(uid);
  answer boolean;
begin
  answer := public.can_view_channel(channel);
  perform public.as_user_end(saved);
  return coalesce(answer, false);
end;
$$;

-- The people who can see a channel: who a mention can reach. Empty unless
-- the caller can see it too.
create function public.chat_channel_people(channel uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.chat_channels c
  join public.memberships m on m.organization_id = c.organization_id
  where c.id = channel
    and public.can_view_channel(channel)
    and case c.kind
      when 'org' then true
      when 'direct' then m.user_id in (c.member_a, c.member_b)
      else m.role = 'owner' or exists (
        select 1 from public.project_members pm where pm.project_id = c.project_id and pm.membership_id = m.id
      )
    end;
$$;

revoke execute on function public.can_view_channel(uuid) from public, anon;
revoke execute on function public.chat_history_start(uuid) from public, anon;
revoke execute on function public.can_read_chat_message(uuid, timestamptz) from public, anon;
revoke execute on function public.in_channel(uuid) from public, anon;
revoke execute on function public.chat_channel_people(uuid) from public, anon;
revoke execute on function public.user_can_view_channel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_view_channel(uuid) to authenticated;
grant execute on function public.chat_history_start(uuid) to authenticated;
grant execute on function public.can_read_chat_message(uuid, timestamptz) to authenticated;
grant execute on function public.in_channel(uuid) to authenticated;
grant execute on function public.chat_channel_people(uuid) to authenticated;

-- RLS -------------------------------------------------------------------------------------

alter table public.chat_channels enable row level security;
alter table public.project_first_joins enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

create policy chat_channels_select on public.chat_channels
  for select to authenticated
  using (public.can_view_channel(id));
-- channels are made by the triggers and open_direct_channel() below
create policy chat_channels_insert on public.chat_channels
  for insert to authenticated
  with check (false);
create policy chat_channels_update on public.chat_channels
  for update to authenticated
  using (false) with check (false);
-- they go with their organization or program
create policy chat_channels_delete on public.chat_channels
  for delete to authenticated
  using (false);

create policy project_first_joins_select on public.project_first_joins
  for select to authenticated
  using (public.is_member(organization_id) and public.can_view_project(project_id));
create policy project_first_joins_insert on public.project_first_joins
  for insert to authenticated
  with check (false);
create policy project_first_joins_update on public.project_first_joins
  for update to authenticated
  using (false) with check (false);
create policy project_first_joins_delete on public.project_first_joins
  for delete to authenticated
  using (false);

create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (public.is_member(organization_id) and public.can_read_chat_message(channel_id, created_at));
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_member(organization_id)
    and public.can_view_channel(channel_id)
    and edited_at is null
    and deleted_at is null
  );
-- senders edit or delete their own (only body and deleted_at are granted)
create policy chat_messages_update on public.chat_messages
  for update to authenticated
  using (sender_id = auth.uid() and public.can_view_channel(channel_id))
  with check (sender_id = auth.uid() and public.can_view_channel(channel_id));
-- deleting leaves "message deleted" in place, so rows are never removed
create policy chat_messages_delete on public.chat_messages
  for delete to authenticated
  using (false);

create policy chat_reads_select on public.chat_reads
  for select to authenticated
  using (user_id = auth.uid() and public.is_member(organization_id));
create policy chat_reads_insert on public.chat_reads
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_channel(channel_id));
create policy chat_reads_update on public.chat_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_view_channel(channel_id));
create policy chat_reads_delete on public.chat_reads
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.chat_channels from anon, authenticated;
revoke all on table public.project_first_joins from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;
revoke all on table public.chat_reads from anon, authenticated;
grant select, insert, update, delete on table public.chat_channels to authenticated;
grant select, insert, update, delete on table public.project_first_joins to authenticated;
grant select, insert, delete on table public.chat_messages to authenticated;
grant update (body, deleted_at) on table public.chat_messages to authenticated;
grant select, insert, update, delete on table public.chat_reads to authenticated;

-- Channels made for you -------------------------------------------------------------------

insert into public.chat_channels (organization_id, kind)
select id, 'org' from public.organizations
on conflict do nothing;
insert into public.chat_channels (organization_id, kind, project_id)
select organization_id, 'project', id from public.projects
on conflict do nothing;

create function public.create_org_channel() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_channels (organization_id, kind) values (new.id, 'org') on conflict do nothing;
  return new;
end;
$$;

create trigger organizations_chat_channel
  after insert on public.organizations
  for each row execute function public.create_org_channel();

create function public.create_project_channel() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_channels (organization_id, kind, project_id)
  values (new.organization_id, 'project', new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger projects_chat_channel
  after insert on public.projects
  for each row execute function public.create_project_channel();

-- Opens (or finds) the direct conversation between the caller and another member.
create function public.open_direct_channel(org uuid, other uuid) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found uuid;
begin
  if me is null or other is null or other = me then
    raise exception 'Pick someone else to message.' using errcode = '22023';
  end if;
  if not public.is_member(org)
    or not exists (select 1 from public.memberships m where m.organization_id = org and m.user_id = other) then
    raise exception 'That person isn''t in this organization.' using errcode = '42501';
  end if;
  insert into public.chat_channels (organization_id, kind, member_a, member_b)
  values (org, 'direct', least(me, other), greatest(me, other))
  on conflict (organization_id, member_a, member_b) where kind = 'direct' do nothing
  returning id into found;
  if found is null then
    select c.id into found from public.chat_channels c
    where c.organization_id = org and c.kind = 'direct' and c.member_a = least(me, other) and c.member_b = greatest(me, other);
  end if;
  return found;
end;
$$;

revoke execute on function public.open_direct_channel(uuid, uuid) from public, anon;
grant execute on function public.open_direct_channel(uuid, uuid) to authenticated;

-- Messages ----------------------------------------------------------------------------------

-- Mentions are written into text as <@user-id>. This returns the people in
-- the organization a text mentions; anyone else is ignored.
create function public.mentions_in(body text, org uuid) returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
  from regexp_matches(coalesce(body, ''), '<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') as hit(id)
  join public.memberships m on m.user_id = hit.id[1]::uuid and m.organization_id = org;
$$;
revoke execute on function public.mentions_in(text, uuid) from public, anon;
grant execute on function public.mentions_in(text, uuid) to authenticated;

-- Keeps mentions in step with the text, marks edits, and empties deleted messages.
create function public.prepare_chat_message() returns trigger
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
      raise exception 'That message was deleted.' using errcode = '42501';
    end if;
    if new.deleted_at is not null then
      new.body := '';
      new.mentions := '{}';
      return new;
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    new.created_at := old.created_at;
    new.sender_id := old.sender_id;
    new.channel_id := old.channel_id;
    new.organization_id := old.organization_id;
  end if;
  new.mentions := public.mentions_in(new.body, new.organization_id);
  return new;
end;
$$;

create trigger chat_messages_prepare
  before insert or update on public.chat_messages
  for each row execute function public.prepare_chat_message();

-- Tells open conversations, and the people in them, that something changed.
create function public.signal_chat(channel uuid, recipients uuid[], event text) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  perform realtime.send(jsonb_build_object('channel_id', channel), event, 'chat:' || channel || ':messages', true);
  foreach person in array coalesce(recipients, '{}') loop
    perform realtime.send(jsonb_build_object('channel_id', channel), event, 'user:' || person || ':chat', true);
  end loop;
end;
$$;

revoke execute on function public.signal_chat(uuid, uuid[], text) from public, anon, authenticated;

-- New messages notify through D103: a direct message tells the other person,
-- a channel message tells its own people (once until they open it), and a
-- mention tells the person mentioned every time. The mute check lives in
-- notification_muted(), which includes channel mutes from here on.
create function public.after_chat_message() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chat_channels;
  people uuid[];
  person uuid;
begin
  select * into c from public.chat_channels where id = new.channel_id;
  people := array(
    select m.user_id
    from public.memberships m
    where m.organization_id = c.organization_id
      and m.user_id is distinct from new.sender_id
      and case c.kind
        when 'org' then true
        when 'direct' then m.user_id in (c.member_a, c.member_b)
        else exists (select 1 from public.project_members pm where pm.project_id = c.project_id and pm.membership_id = m.id)
      end
  );

  if tg_op = 'INSERT' then
    foreach person in array new.mentions loop
      perform public.notify(c.organization_id, person, 'mention', 'channel', c.id, new.sender_id, jsonb_build_object('message_id', new.id));
    end loop;
    foreach person in array people loop
      if not person = any (new.mentions) then
        perform public.notify(
          c.organization_id, person,
          case c.kind when 'direct' then 'direct_message' else 'channel_message' end::public.notification_type,
          'channel', c.id, new.sender_id,
          jsonb_build_object('message_id', new.id),
          'chat:' || c.id
        );
      end if;
    end loop;
    perform public.signal_chat(c.id, people, 'message');
  else
    perform public.signal_chat(c.id, '{}', 'changed');
  end if;
  return null;
end;
$$;

create trigger chat_messages_after
  after insert or update on public.chat_messages
  for each row execute function public.after_chat_message();

-- Opening a conversation marks it read, and clears its waiting notifications
-- so the next message notifies again.
create function public.mark_channel_read(channel uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  if not public.can_view_channel(channel) then
    raise exception 'You can''t see that conversation.' using errcode = '42501';
  end if;
  select organization_id into org from public.chat_channels where id = channel;
  insert into public.chat_reads (organization_id, channel_id, user_id, last_read_at)
  values (org, channel, auth.uid(), clock_timestamp())
  on conflict (channel_id, user_id) do update set last_read_at = excluded.last_read_at;
  update public.notifications
  set read_at = coalesce(read_at, clock_timestamp()), dedupe_key = null
  where recipient_id = auth.uid() and subject_type = 'channel' and subject_id = channel
    and (read_at is null or dedupe_key is not null);
end;
$$;

revoke execute on function public.mark_channel_read(uuid) from public, anon;
grant execute on function public.mark_channel_read(uuid) to authenticated;


-- Notifications (D103) ---------------------------------------------------------------------

alter table public.notifications drop constraint notifications_subject_type_check;
alter table public.notifications
  add constraint notifications_subject_type_check check (subject_type in ('task', 'participant', 'invitation', 'channel'));

-- muting a conversation, from its header
alter table public.notification_mutes
  add column muted_channel_id uuid references public.chat_channels (id) on delete cascade,
  drop constraint notification_mutes_one_kind,
  add constraint notification_mutes_one_kind check (num_nonnulls(type, muted_user_id, muted_channel_id) = 1);
create unique index notification_mutes_channel_idx on public.notification_mutes (user_id, muted_channel_id)
  where muted_channel_id is not null;

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
    and (
      muted_channel_id is null
      or exists (
        select 1 from public.chat_channels c
        where c.id = muted_channel_id and c.organization_id = notification_mutes.organization_id and public.can_view_channel(c.id)
      )
    )
  );

-- The one place that decides whether a notification is muted (D103, D104):
-- the kind is muted, the person who caused it is muted, the conversation is
-- muted, or the recipient has set Do not disturb. Any "off" wins.
drop function public.notification_muted(uuid, uuid, public.notification_type, uuid);
create function public.notification_muted(org uuid, recipient uuid, kind public.notification_type, actor uuid, channel uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.notification_mutes nm
      where nm.organization_id = org and nm.user_id = recipient
        and (
          nm.type = kind
          or (actor is not null and nm.muted_user_id = actor)
          or (channel is not null and nm.muted_channel_id = channel)
        )
    )
    or exists (select 1 from public.profiles p where p.id = recipient and p.presence_mode = 'dnd');
$$;
revoke execute on function public.notification_muted(uuid, uuid, public.notification_type, uuid, uuid) from public, anon, authenticated;

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
  insert into public.notifications (organization_id, recipient_id, type, subject_type, subject_id, actor_id, data, dedupe_key)
  values (org, recipient, kind, subject_type, subject_id, actor, coalesce(data, '{}'::jsonb), dedupe)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- Realtime ----------------------------------------------------------------------------------
-- chat:{channel}:typing   people in the conversation say they're typing (broadcast, not Presence)
-- chat:{channel}:messages the database says a message arrived or changed
-- user:{id}:chat          the database tells one person a conversation has news

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
  if parts[1] = 'chat' and parts[3] in ('typing', 'messages') then
    return public.can_view_channel(parts[2]::uuid);
  end if;
  if parts[1] = 'user' and parts[3] = 'chat' then
    return parts[2]::uuid = auth.uid();
  end if;
  return false;
exception
  when invalid_text_representation then
    return false;
end;
$$;

-- Clients announce presence and typing; everything else comes from the database.
drop policy groundwork_realtime_insert on realtime.messages;
create policy groundwork_realtime_insert on realtime.messages
  for insert to authenticated
  with check (
    public.can_use_realtime_topic(realtime.topic())
    and (realtime.topic() like '%:presence' or realtime.topic() like 'chat:%:typing')
  );

-- The viewer's conversations, with unread counts. Security invoker: RLS
-- (and so can_view_channel and the history window) decides every row.
create function public.my_chat_channels(org uuid)
returns table (
  id uuid,
  kind public.chat_channel_kind,
  project_id uuid,
  project_name text,
  other_user uuid,
  joined boolean,
  muted boolean,
  last_message_at timestamptz,
  unread integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.kind,
    c.project_id,
    p.name,
    case when c.kind = 'direct' then case when c.member_a = auth.uid() then c.member_b else c.member_a end end,
    public.in_channel(c.id),
    exists (select 1 from public.notification_mutes nm where nm.user_id = auth.uid() and nm.muted_channel_id = c.id),
    (select max(m.created_at) from public.chat_messages m where m.channel_id = c.id),
    (
      select count(*)::integer from public.chat_messages m
      where m.channel_id = c.id
        and m.sender_id is distinct from auth.uid()
        and m.deleted_at is null
        and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    )
  from public.chat_channels c
  left join public.projects p on p.id = c.project_id
  left join public.chat_reads r on r.channel_id = c.id and r.user_id = auth.uid()
  where c.organization_id = org
    and (c.kind <> 'project' or p.status = 'active');
$$;

revoke execute on function public.my_chat_channels(uuid) from public, anon;
grant execute on function public.my_chat_channels(uuid) to authenticated;
