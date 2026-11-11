-- Adding several participants at once (D112). The same checks as
-- add_participant() (the caller manages participants on that program, and it
-- isn't archived), in one transaction: everyone is added, or nobody is. Each
-- row carries the details shown on the add form; private details stay on the
-- profile. It returns the new ids, in order.

create function public.add_participants(project_id uuid, people jsonb) returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  person jsonb;
  new_id uuid;
  added uuid[] := array[]::uuid[];
begin
  select p.organization_id into org from public.projects p where p.id = add_participants.project_id;
  if org is null or not public.can_manage_participants_in(project_id) then
    raise exception 'You can''t add people to that program' using errcode = '42501';
  end if;
  if not public.project_is_active(project_id) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;
  if jsonb_typeof(people) <> 'array' or jsonb_array_length(people) = 0 then
    raise exception 'Add at least one person' using errcode = '22023', hint = 'no_people';
  end if;
  if jsonb_array_length(people) > 200 then
    raise exception 'Add 200 people or fewer at a time' using errcode = '22023', hint = 'too_many';
  end if;

  for person in select value from jsonb_array_elements(people) loop
    insert into public.participants (organization_id, name, email, phone, guardian_name, emergency_contact, created_by)
    values (
      org,
      btrim(person ->> 'name'),
      nullif(lower(btrim(person ->> 'email')), ''),
      nullif(btrim(person ->> 'phone'), ''),
      nullif(btrim(person ->> 'guardianName'), ''),
      nullif(btrim(person ->> 'emergencyContact'), ''),
      auth.uid()
    )
    returning id into new_id;
    insert into public.participant_programs (organization_id, participant_id, project_id)
    values (org, new_id, add_participants.project_id);
    added := added || new_id;
  end loop;
  return added;
end;
$$;

revoke execute on function public.add_participants(uuid, jsonb) from public, anon;
grant execute on function public.add_participants(uuid, jsonb) to authenticated;
