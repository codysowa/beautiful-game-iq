alter table public.games
  add column if not exists extra_time_enabled boolean not null default false;

alter table public.game_position_segments
  drop constraint if exists game_position_segments_quarter_check;

alter table public.game_position_segments
  add constraint game_position_segments_quarter_check
  check (quarter between 1 and 6);
