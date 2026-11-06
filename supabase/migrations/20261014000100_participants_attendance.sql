-- Participants and attendance (owner's request; brief B3 and CLAUDE.md scope).
--
-- Participants are people a program serves. They never sign in: they're
-- records the organization keeps. A participant belongs to the organization
-- and is enrolled in one or more programs (projects) that track participants.
-- A session is a calendar event on such a program, and attendance is one
-- mark (present, late, absent or excused) per participant per session.
--
-- Who sees any of it: owners, plus project admins and leads of a program the
-- participant is enrolled in (CLAUDE.md: participant data is restricted to
-- project admins and above plus owners). Project staff see none of it.
--
-- Archiving hides a participant from rosters and check-in but keeps their
-- attendance, which still counts in reports. Deleting permanently (owners and
-- managers, for privacy requests) erases the participant row and its notes,
-- keeps their attendance marks anonymised so session counts don't change, and
-- removes their name from earlier activity entries.

-- Programs opt in ------------------------------------------------------------------------

alter table public.projects add column tracks_participants boolean not null default false;

-- attendance references (event, organization) like every other org-scoped link
alter table public.events add constraint events_id_organization_id_key unique (id, organization_id);

-- Tables ---------------------------------------------------------------------------------

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  date_of_birth date,
  guardian_name text check (guardian_name is null or char_length(guardian_name) <= 120),
  emergency_contact text check (emergency_contact is null or char_length(emergency_contact) <= 200),
  -- medical and accessibility notes
  care_notes text check (care_notes is null or char_length(care_notes) <= 2000),
  notes text check (notes is null or char_length(notes) <= 4000),
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index participants_org_name_idx on public.participants (organization_id, lower(name));

create table public.participant_programs (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  participant_id uuid not null,
  project_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (participant_id, project_id),
  foreign key (participant_id, organization_id)
    references public.participants (id, organization_id) on delete cascade,
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade
);

create index participant_programs_project_idx on public.participant_programs (project_id);

create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null,
  -- null once the participant is deleted: the mark stays, anonymised
  participant_id uuid,
  status public.attendance_status not null,
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  recorded_at timestamptz not null default now(),
  unique (event_id, participant_id),
  foreign key (event_id, organization_id)
    references public.events (id, organization_id) on delete cascade,
  foreign key (participant_id, organization_id)
    references public.participants (id, organization_id) on delete set null (participant_id)
);

create index attendance_participant_idx on public.attendance (participant_id);

create trigger participants_set_updated_at
  before update on public.participants
  for each row execute function public.set_updated_at();
create trigger participants_immutable
  before update on public.participants
  for each row execute function public.forbid_column_changes('organization_id', 'created_by');
create trigger attendance_immutable
  before update on public.attendance
  for each row execute function public.forbid_column_changes('organization_id', 'event_id');

-- A mark stays with its participant; the only change allowed is the
-- anonymising one, when the participant is deleted.
create function public.keep_attendance_participant() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.participant_id is not null and new.participant_id is distinct from old.participant_id then
    raise exception 'Column participant_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger attendance_keep_participant
  before update on public.attendance
  for each row execute function public.keep_attendance_participant();

-- Helpers (security definer, so policies never recurse) -----------------------------------

-- Project admins and leads of a program that tracks participants (owners act
-- as lead everywhere).
create function public.can_manage_participants_in(project_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = can_manage_participants_in.project_id and p.tracks_participants
  ) and public.my_project_rank(project_id) >= 2;
$$;

create function public.can_view_participant(participant_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participants x
    where x.id = can_view_participant.participant_id
      and (
        public.has_permission(x.organization_id, 'owner')
        or exists (
          select 1 from public.participant_programs pp
          where pp.participant_id = x.id and public.can_manage_participants_in(pp.project_id)
        )
      )
  );
$$;

-- A session's attendance belongs to its program.
create function public.can_view_session_attendance(event_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = can_view_session_attendance.event_id
      and e.project_id is not null
      and (public.has_permission(e.organization_id, 'owner') or public.can_manage_participants_in(e.project_id))
  );
$$;

-- Marks can be taken for an active participant enrolled in the session's
-- program, while the program is active.
create function public.can_record_attendance(event_id uuid, participant_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join public.participant_programs pp on pp.project_id = e.project_id
    join public.participants x on x.id = pp.participant_id
    where e.id = can_record_attendance.event_id
      and x.id = can_record_attendance.participant_id
      and x.archived_at is null
      and public.project_is_active(e.project_id)
      and public.can_manage_participants_in(e.project_id)
  );
$$;

revoke execute on function public.can_manage_participants_in(uuid) from public, anon;
revoke execute on function public.can_view_participant(uuid) from public, anon;
revoke execute on function public.can_view_session_attendance(uuid) from public, anon;
revoke execute on function public.can_record_attendance(uuid, uuid) from public, anon;
grant execute on function public.can_manage_participants_in(uuid) to authenticated, service_role;
grant execute on function public.can_view_participant(uuid) to authenticated, service_role;
grant execute on function public.can_view_session_attendance(uuid) to authenticated, service_role;
grant execute on function public.can_record_attendance(uuid, uuid) to authenticated, service_role;

-- A new participant is created and enrolled in one step, so it is never
-- invisible to the person adding it.
create function public.add_participant(project_id uuid, name text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  new_id uuid;
begin
  select p.organization_id into org from public.projects p where p.id = add_participant.project_id;
  if org is null or not public.can_manage_participants_in(project_id) then
    raise exception 'You can''t add people to that program' using errcode = '42501';
  end if;
  if not public.project_is_active(project_id) then
    raise exception 'This is archived and read-only' using errcode = '42501', hint = 'project_archived';
  end if;
  insert into public.participants (organization_id, name, created_by)
  values (org, btrim(add_participant.name), auth.uid())
  returning id into new_id;
  insert into public.participant_programs (organization_id, participant_id, project_id)
  values (org, new_id, add_participant.project_id);
  return new_id;
end;
$$;

revoke execute on function public.add_participant(uuid, text) from public, anon;
grant execute on function public.add_participant(uuid, text) to authenticated;

-- RLS ----------------------------------------------------------------------------------

alter table public.participants enable row level security;
alter table public.participant_programs enable row level security;
alter table public.attendance enable row level security;

create policy participants_select on public.participants
  for select to authenticated
  using (public.can_view_participant(id));
-- created only through add_participant(), which enrolls them at the same time
create policy participants_insert on public.participants
  for insert to authenticated
  with check (false);
create policy participants_update on public.participants
  for update to authenticated
  using (public.can_view_participant(id))
  with check (public.can_view_participant(id));
-- permanent deletion is for privacy requests: owners and managers only
create policy participants_delete on public.participants
  for delete to authenticated
  using (public.can_view_participant(id) and public.has_permission(organization_id, 'manager'));

create policy participant_programs_select on public.participant_programs
  for select to authenticated
  using (public.has_permission(organization_id, 'owner') or public.can_manage_participants_in(project_id));
create policy participant_programs_insert on public.participant_programs
  for insert to authenticated
  with check (
    public.can_manage_participants_in(project_id)
    and public.project_is_active(project_id)
    and public.can_view_participant(participant_id)
  );
-- enrollments are added or removed, never edited
create policy participant_programs_update on public.participant_programs
  for update to authenticated
  using (false) with check (false);
create policy participant_programs_delete on public.participant_programs
  for delete to authenticated
  using (public.can_manage_participants_in(project_id) and public.project_is_active(project_id));

create policy attendance_select on public.attendance
  for select to authenticated
  using (public.can_view_session_attendance(event_id));
create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (public.can_record_attendance(event_id, participant_id) and recorded_by = auth.uid());
create policy attendance_update on public.attendance
  for update to authenticated
  using (public.can_view_session_attendance(event_id))
  with check (public.can_record_attendance(event_id, participant_id));
create policy attendance_delete on public.attendance
  for delete to authenticated
  using (public.can_view_session_attendance(event_id));

revoke all on table public.participants from anon, authenticated;
revoke all on table public.participant_programs from anon, authenticated;
revoke all on table public.attendance from anon, authenticated;
grant select, insert, update, delete on table public.participants to authenticated;
grant select, insert, update, delete on table public.participant_programs to authenticated;
grant select, insert, update, delete on table public.attendance to authenticated;

-- Activity ------------------------------------------------------------------------------
-- Participant entries name the participant only while they exist, and are seen
-- only by people who can see the participant (and owners).

alter table public.activity_log drop constraint activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('project', 'task', 'event', 'document', 'participant'));

drop policy activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated
  using (
    public.is_member(organization_id)
    and (
      metadata ->> 'project_id' is null
      or public.has_permission(organization_id, 'owner')
      or public.can_view_project((metadata ->> 'project_id')::uuid)
    )
    and (
      entity_type <> 'participant'
      or public.has_permission(organization_id, 'owner')
      or public.can_view_participant(entity_id)
    )
  );

create function public.log_participant_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.participants := coalesce(new, old);
  verb text;
  meta jsonb := '{}'::jsonb;
  fields text[];
  actor_name text;
begin
  -- cascades from deleting the organization aren't worth logging
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations o where o.id = old.organization_id) then
    return old;
  end if;

  if tg_op = 'INSERT' then
    verb := 'created';
    meta := jsonb_build_object('label', new.name);
  elsif tg_op = 'DELETE' then
    -- the record is erased: no name, and earlier entries forget it too
    verb := 'deleted';
    update public.activity_log a set metadata = a.metadata - 'label'
    where a.entity_type = 'participant' and a.entity_id = old.id;
  elsif old.archived_at is null and new.archived_at is not null then
    verb := 'archived';
    meta := jsonb_build_object('label', new.name);
  elsif old.archived_at is not null and new.archived_at is null then
    verb := 'restored';
    meta := jsonb_build_object('label', new.name);
  else
    -- which details changed, never their values
    select coalesce(array_agg(n.key order by n.key), '{}') into fields
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at', 'archived_at') and n.value is distinct from to_jsonb(old) -> n.key;
    if cardinality(fields) = 0 then
      return new;
    end if;
    verb := 'updated';
    meta := jsonb_build_object('label', new.name, 'fields', to_jsonb(fields));
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), p.email) into actor_name
  from public.profiles p where p.id = auth.uid();

  insert into public.activity_log (organization_id, actor_membership_id, entity_type, entity_id, action, metadata)
  values (
    rec.organization_id,
    (select m.id from public.memberships m where m.organization_id = rec.organization_id and m.user_id = auth.uid()),
    'participant',
    rec.id,
    verb,
    jsonb_strip_nulls(meta || jsonb_build_object('actor_name', actor_name))
  );
  return rec;
end;
$$;

create trigger participants_activity
  after insert or update or delete on public.participants
  for each row execute function public.log_participant_activity();

-- Deleting a participant erases their notes on attendance marks; the marks
-- themselves stay (anonymised by the foreign key) so counts don't change.
create function public.erase_participant_notes() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attendance a set note = null where a.participant_id = old.id;
  return old;
end;
$$;

create trigger participants_erase_notes
  before delete on public.participants
  for each row execute function public.erase_participant_notes();

-- Words ---------------------------------------------------------------------------------
-- Each preset names the people its programs serve (added, nothing replaced).

update public.presets set labels = labels || '{"participant": {"one": "Participant", "other": "Participants"}}'::jsonb
where key = 'nonprofit' and not labels ? 'participant';
update public.presets set labels = labels || '{"participant": {"one": "Attendee", "other": "Attendees"}}'::jsonb
where key = 'business' and not labels ? 'participant';
update public.presets set labels = labels || '{"participant": {"one": "Student", "other": "Students"}}'::jsonb
where key = 'tutoring' and not labels ? 'participant';
