-- What a higher rank created, a lower rank can't change (owner's request).
--
-- Projects, tasks, calendar events and documents remember the org role their
-- creator held when they made them (created_by_role). Someone ranked below
-- that role can't edit or delete the item; the creator, equal ranks and
-- higher ranks can. The role is kept on the row, so the rule still holds
-- after the creator is demoted or leaves.
--
-- One exception: the person a task is assigned to may move it and mark it
-- done (status and board position), whoever created it.
--
-- The guard applies to people editing directly (the `authenticated` role).
-- The app's own database functions (member removal, accepting or declining
-- an invitation, project roster changes) and foreign-key cascades run as
-- their owner, so the bookkeeping they do on someone's behalf still works.

alter table public.projects add column created_by_role public.member_role;
alter table public.tasks add column created_by_role public.member_role;
alter table public.events add column created_by_role public.member_role;
alter table public.documents add column created_by_role public.member_role;

-- Existing rows take their creator's current role: the role they held when
-- they made it wasn't recorded. Rows whose creator has left stay unguarded.
update public.projects x set created_by_role = m.role
from public.memberships m where m.organization_id = x.organization_id and m.user_id = x.created_by;
update public.tasks x set created_by_role = m.role
from public.memberships m where m.organization_id = x.organization_id and m.user_id = x.created_by;
update public.events x set created_by_role = m.role
from public.memberships m where m.organization_id = x.organization_id and m.user_id = x.created_by;
update public.documents x set created_by_role = m.role
from public.memberships m where m.organization_id = x.organization_id and m.user_id = x.uploaded_by;

-- On insert the role is read from the creator's membership, never taken from
-- the client. Argument: the column naming the creator.
create function public.stamp_creator_role() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  new.created_by_role := (
    select m.role from public.memberships m
    where m.organization_id = new.organization_id and m.user_id = creator
  );
  return new;
end;
$$;

-- True when the caller ranks below the role an item's creator held, and
-- isn't that creator.
create function public.outranked_by_creator(org_id uuid, creator uuid, creator_role public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select creator_role is not null
    and creator is distinct from auth.uid()
    and public.my_rank(org_id) < public.role_rank(creator_role);
$$;

revoke execute on function public.outranked_by_creator(uuid, uuid, public.member_role) from public, anon;
grant execute on function public.outranked_by_creator(uuid, uuid, public.member_role) to authenticated, service_role;

-- Argument: the column naming the creator. Not security definer: it has to
-- see who is really running the statement.
create function public.guard_creator_rank() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_rec jsonb := to_jsonb(old);
  new_rec jsonb;
  changed text[];
  -- columns the database keeps up to date itself
  derived text[] := array['updated_at', 'completed_at', 'needs_assignee'];
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if not public.outranked_by_creator(
    (old_rec ->> 'organization_id')::uuid,
    (old_rec ->> tg_argv[0])::uuid,
    (old_rec ->> 'created_by_role')::public.member_role
  ) then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    new_rec := to_jsonb(new);
    select coalesce(array_agg(n.key), '{}') into changed
    from jsonb_each(new_rec) n
    where n.value is distinct from old_rec -> n.key;
    -- saving without changing anything is harmless
    if changed <@ derived then
      return new;
    end if;
    -- the assignee may move their task and mark it done
    if tg_table_name = 'tasks'
       and changed <@ (derived || array['status', 'position'])
       and exists (
         select 1 from public.memberships m
         where m.id = (old_rec ->> 'assignee_membership_id')::uuid and m.user_id = auth.uid()
       ) then
      return new;
    end if;
  end if;

  raise exception 'Someone ranked above you created this, so you can''t change it'
    using errcode = '42501', hint = 'outranked_by_creator';
end;
$$;

create trigger projects_stamp_creator_role before insert on public.projects
  for each row execute function public.stamp_creator_role('created_by');
create trigger tasks_stamp_creator_role before insert on public.tasks
  for each row execute function public.stamp_creator_role('created_by');
create trigger events_stamp_creator_role before insert on public.events
  for each row execute function public.stamp_creator_role('created_by');
create trigger documents_stamp_creator_role before insert on public.documents
  for each row execute function public.stamp_creator_role('uploaded_by');

create trigger projects_guard_creator_rank before update or delete on public.projects
  for each row execute function public.guard_creator_rank('created_by');
create trigger tasks_guard_creator_rank before update or delete on public.tasks
  for each row execute function public.guard_creator_rank('created_by');
create trigger events_guard_creator_rank before update or delete on public.events
  for each row execute function public.guard_creator_rank('created_by');
create trigger documents_guard_creator_rank before update or delete on public.documents
  for each row execute function public.guard_creator_rank('uploaded_by');

create trigger projects_creator_role_immutable before update on public.projects
  for each row execute function public.forbid_column_changes('created_by_role');
create trigger tasks_creator_role_immutable before update on public.tasks
  for each row execute function public.forbid_column_changes('created_by_role');
create trigger events_creator_role_immutable before update on public.events
  for each row execute function public.forbid_column_changes('created_by_role');
create trigger documents_creator_role_immutable before update on public.documents
  for each row execute function public.forbid_column_changes('created_by_role');
