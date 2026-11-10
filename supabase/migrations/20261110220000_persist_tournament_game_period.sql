alter table public.games
  add column if not exists tournament_current_period integer not null default 1
  check (tournament_current_period between 1 and 12);
