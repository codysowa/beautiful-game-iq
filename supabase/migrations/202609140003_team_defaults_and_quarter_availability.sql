alter table public.teams
  add column if not exists default_formation text;

update public.teams
set default_formation = case format
  when '6v6' then '2-1-2'
  when '7v7' then '3-2-1'
  when '9v9' then '4-3-1'
  when '11v11' then '4-4-2'
  when '5v5' then '2-1-2'
  else '3-2-1'
end
where default_formation is null;

alter table public.game_attendance
  add column if not exists available_quarters integer[];

update public.game_attendance
set available_quarters = case
  when status = 'Absent' then '{}'::integer[]
  else array(
    select q
    from generate_series(1, 4) as q
    where q >= case when status = 'Late' then coalesce(arrival_quarter, 2) else 1 end
      and q <= coalesce(departure_quarter, 4)
  )
end
where available_quarters is null;

alter table public.game_attendance
  drop constraint if exists game_attendance_available_quarters_check;

alter table public.game_attendance
  add constraint game_attendance_available_quarters_check
  check (
    available_quarters is null
    or (
      cardinality(available_quarters) between 0 and 4
      and not exists (
        select 1
        from unnest(available_quarters) as q
        where q < 1 or q > 4
      )
    )
  );
