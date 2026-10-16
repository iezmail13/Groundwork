-- Telling a task's people when it changes (D106): its title, due date,
-- priority, status (finishing it has its own notification, D103) or program.
-- Whoever made the change isn't told. A run of edits makes one notification
-- until it's read, so a busy afternoon doesn't fill the bell.
--
-- Reading a notification that waits on a key (a conversation, a changed
-- task) releases the key, so the next event notifies again.

create function public.notify_task_changed() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  changed text[] := array_remove(array[
    case when new.title is distinct from old.title then 'title' end,
    case when new.due_date is distinct from old.due_date then 'due_date' end,
    case when new.priority is distinct from old.priority then 'priority' end,
    -- a status change made by giving or claiming work (a trigger on assignees) is
    -- already told as "assigned" or "claimed", so only direct changes count
    case when new.status is distinct from old.status and new.status <> 'done' and pg_trigger_depth() = 1 then 'status' end,
    case when new.project_id is distinct from old.project_id then 'project' end
  ], null);
begin
  if cardinality(changed) = 0 or auth.uid() is null then
    return null;
  end if;
  for person in select public.task_people(new.id) loop
    perform public.notify(new.organization_id, person, 'task_changed', 'task', new.id, auth.uid(),
      jsonb_build_object('changed', changed), 'changed:' || new.id);
  end loop;
  return null;
end;
$$;

create trigger tasks_notify_changed
  after update of title, due_date, priority, status, project_id on public.tasks
  for each row execute function public.notify_task_changed();

create function public.release_notification_key() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.read_at is null and new.read_at is not null
    and new.type in ('task_changed', 'channel_message', 'direct_message') then
    new.dedupe_key := null;
  end if;
  return new;
end;
$$;

create trigger notifications_release_key
  before update of read_at on public.notifications
  for each row execute function public.release_notification_key();
