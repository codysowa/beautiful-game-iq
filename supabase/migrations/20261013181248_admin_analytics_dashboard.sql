-- Keep source control aligned with the already-applied admin_analytics_dashboard migration.
-- Admin access is restricted inside the SECURITY DEFINER function via public.admin_users.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;
grant all on table public.admin_users to service_role;

insert into public.admin_users (user_id)
values ('0151ad75-64d3-4cad-9292-c187ae4b76e3'::uuid)
on conflict (user_id) do nothing;

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
