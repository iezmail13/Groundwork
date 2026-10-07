-- Presets: global, read-only reference data that drives terminology, the
-- default theme and the starter content of a new organization.

create table public.presets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null check (char_length(name) between 1 and 60),
  labels jsonb not null default '{}'::jsonb check (jsonb_typeof(labels) = 'object'),
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme) = 'object'),
  starter_content jsonb not null default '{}'::jsonb check (jsonb_typeof(starter_content) = 'object')
);

alter table public.presets enable row level security;

create policy presets_select on public.presets
  for select to authenticated using (true);
create policy presets_insert on public.presets
  for insert to authenticated with check (false);
create policy presets_update on public.presets
  for update to authenticated using (false) with check (false);
create policy presets_delete on public.presets
  for delete to authenticated using (false);

revoke all on table public.presets from anon, authenticated;
grant select on table public.presets to authenticated;

insert into public.presets (key, name, labels, theme, starter_content) values
(
  'nonprofit',
  'Nonprofit',
  '{
    "project": {"one": "Program", "other": "Programs"},
    "task": {"one": "Task", "other": "Tasks"},
    "event": {"one": "Session", "other": "Sessions"},
    "document": {"one": "Document", "other": "Documents"},
    "member": {"one": "Team member", "other": "Team members"}
  }'::jsonb,
  '{"navy": "#1F2D4D", "mode": "light"}'::jsonb,
  '{
    "projects": [
      {
        "name": "Getting started",
        "description": "A first program to try things out. Rename it, archive it, or delete it once your real programs are in.",
        "tasks": [
          {"title": "Invite your team from Settings", "due_in_days": 2},
          {"title": "Add your first real program", "due_in_days": 3},
          {"title": "Upload your volunteer handbook", "due_in_days": 7}
        ]
      }
    ]
  }'::jsonb
),
(
  'business',
  'Business',
  '{
    "project": {"one": "Project", "other": "Projects"},
    "task": {"one": "Task", "other": "Tasks"},
    "event": {"one": "Meeting", "other": "Meetings"},
    "document": {"one": "Document", "other": "Documents"},
    "member": {"one": "Member", "other": "Members"}
  }'::jsonb,
  '{"navy": "#1F2D4D", "mode": "light"}'::jsonb,
  '{
    "projects": [
      {
        "name": "Getting started",
        "description": "A first project to try things out. Rename it, archive it, or delete it once your real projects are in.",
        "tasks": [
          {"title": "Invite your team from Settings", "due_in_days": 2},
          {"title": "Add your first real project", "due_in_days": 3},
          {"title": "Schedule a kickoff meeting", "due_in_days": 7}
        ]
      }
    ]
  }'::jsonb
),
(
  'tutoring',
  'Tutoring',
  '{
    "project": {"one": "Subject", "other": "Subjects"},
    "task": {"one": "Task", "other": "Tasks"},
    "event": {"one": "Lesson", "other": "Lessons"},
    "document": {"one": "Material", "other": "Materials"},
    "member": {"one": "Tutor", "other": "Tutors"}
  }'::jsonb,
  '{"navy": "#1F2D4D", "mode": "light"}'::jsonb,
  '{
    "projects": [
      {
        "name": "Getting started",
        "description": "A first subject to try things out. Rename it, archive it, or delete it once your real subjects are in.",
        "tasks": [
          {"title": "Invite your tutors from Settings", "due_in_days": 2},
          {"title": "Add your first real subject", "due_in_days": 3},
          {"title": "Upload a lesson plan template", "due_in_days": 7}
        ]
      }
    ]
  }'::jsonb
);
