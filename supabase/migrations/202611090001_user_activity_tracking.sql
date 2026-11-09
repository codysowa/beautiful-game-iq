-- Record authenticated app opens and foreground returns separately from Auth sign-in timestamps.
create table if not exists public.user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_active_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  last_activity_type text not null default 'app_open'
);

alter table public.user_activity enable row level security;
revoke all on table public.user_activity from anon, authenticated;
grant all on table public.user_activity to service_role;

create or replace function public.record_user_activity(p_activity_type text default 'app_open')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_activity_type text := coalesce(nullif(trim(p_activity_type), ''), 'app_open');
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_activity_type not in ('app_open', 'app_resumed') then
    v_activity_type := 'app_open';
  end if;

  insert into public.user_activity (user_id, last_active_at, last_activity_at, last_activity_type)
  values (v_user_id, now(), now(), v_activity_type)
  on conflict (user_id) do update
  set last_active_at = excluded.last_active_at,
      last_activity_at = excluded.last_activity_at,
      last_activity_type = excluded.last_activity_type;
end;
$$;

revoke all on function public.record_user_activity(text) from public, anon;
grant execute on function public.record_user_activity(text) to authenticated;

create or replace function public.get_admin_analytics()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'accounts', (select count(*) from auth.users),
      'teams', (select count(*) from public.teams),
      'games', (select count(*) from public.games),
      'game_events', (select count(*) from public.game_events),
      'teams_7d', (select count(*) from public.teams where created_at >= now() - interval '7 days'),
      'teams_30d', (select count(*) from public.teams where created_at >= now() - interval '30 days'),
      'games_7d', (select count(*) from public.games where created_at >= now() - interval '7 days'),
      'games_30d', (select count(*) from public.games where created_at >= now() - interval '30 days'),
      'accounts_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      'accounts_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days')
    ),
    'recent_users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'last_active_at', a.last_active_at,
        'last_activity_type', a.last_activity_type
      ) order by coalesce(a.last_active_at, u.last_sign_in_at, u.created_at) desc)
      from auth.users u
      left join public.user_activity a on a.user_id = u.id
    ), '[]'::jsonb),
    'recent_teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', t.name, 'age_group', t.age_group, 'format', t.format, 'created_at', t.created_at
      ) order by t.created_at desc)
      from (select name, age_group, format, created_at from public.teams order by created_at desc limit 8) t
    ), '[]'::jsonb),
    'recent_games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'opponent', g.opponent, 'game_date', g.game_date, 'status', g.status, 'created_at', g.created_at
      ) order by g.created_at desc)
      from (select opponent, game_date, status, created_at from public.games order by created_at desc limit 8) g
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_analytics() from public, anon;
grant execute on function public.get_admin_analytics() to authenticated;
