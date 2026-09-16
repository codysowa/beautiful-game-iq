alter table public.game_attendance
  add column if not exists departure_quarter integer;

alter table public.game_attendance
  drop constraint if exists game_attendance_departure_quarter_check;

alter table public.game_attendance
  add constraint game_attendance_departure_quarter_check
  check (departure_quarter is null or departure_quarter between 1 and 3);
