-- Attendance records who took it and when (security audit, D113).
-- recorded_by and recorded_at were writable, so a mark could be attributed to
-- someone else or back-dated. People's saves now always record themselves and
-- the moment; the demo seed (service role) keeps what it sets.

create function public.stamp_attendance() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.recorded_by := auth.uid();
    new.recorded_at := now();
  end if;
  return new;
end;
$$;

create trigger attendance_stamp before insert or update on public.attendance
  for each row execute function public.stamp_attendance();
