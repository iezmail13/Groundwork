-- Deleting an organization that has attendance failed: removing its
-- participants cleared their attendance notes after the organization row was
-- already gone, which broke the attendance rows' foreign key. When the whole
-- organization is going, there's nothing to clear (D115).
create or replace function public.erase_participant_notes() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.organizations o where o.id = old.organization_id) then
    update public.attendance a set note = null where a.participant_id = old.id;
  end if;
  return old;
end;
$$;
