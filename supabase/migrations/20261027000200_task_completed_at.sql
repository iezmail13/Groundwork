-- When work was finished is the database's to say (security audit, D113).
-- completed_at was writable by anyone editing a task, so "Done this week" could
-- be back-dated. People's edits now always get the real moment; the demo seed,
-- which runs as the service role, keeps the times it sets.

create or replace function public.set_task_completed_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      new.completed_at := case when new.status = 'done' then now() end;
    else
      new.completed_at := old.completed_at;
    end if;
    return new;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger tasks_completed_at on public.tasks;
create trigger tasks_completed_at
  before insert or update on public.tasks
  for each row execute function public.set_task_completed_at();
