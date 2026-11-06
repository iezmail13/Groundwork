-- Repeating events (D112). A repeating event is stored as one row per
-- occurrence (so each shows, edits and exports like any other event) sharing a
-- series_id. Creating, editing and deleting go through the events policies as
-- before; deleting a series is a delete by series_id, which those policies
-- still limit to rows the caller may delete.

alter table public.events add column series_id uuid;
create index events_series_idx on public.events (series_id) where series_id is not null;

-- a series belongs to one organization: an occurrence can't join another
-- organization's series
create function public.guard_event_series()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.series_id is not null and exists (
    select 1 from public.events e
    where e.series_id = new.series_id and e.organization_id <> new.organization_id
  ) then
    raise exception 'That series belongs to another organization' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_guard_series
  before insert or update of series_id on public.events
  for each row execute function public.guard_event_series();

revoke execute on function public.guard_event_series() from public, anon, authenticated;
