-- Optional first-run acquisition attribution and user-submitted product feedback.
create table if not exists public.user_discovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null check (source in ('app_store', 'web_search', 'social_media', 'friend_coach', 'work_organization', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_discovery enable row level security;
revoke all on table public.user_discovery from anon, public;
grant select, insert, update on table public.user_discovery to authenticated;

drop policy if exists "Users can view their own discovery response" on public.user_discovery;
create policy "Users can view their own discovery response"
  on public.user_discovery for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can submit their own discovery response" on public.user_discovery;
create policy "Users can submit their own discovery response"
  on public.user_discovery for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own discovery response" on public.user_discovery;
create policy "Users can update their own discovery response"
  on public.user_discovery for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('suggestion', 'general')),
  message text not null check (length(trim(message)) between 1 and 4000),
  platform text not null default 'unknown' check (platform in ('ios', 'mac', 'web', 'unknown')),
  created_at timestamptz not null default now()
);

alter table public.user_feedback enable row level security;
revoke all on table public.user_feedback from anon, public;
grant insert on table public.user_feedback to authenticated;

drop policy if exists "Users can submit their own feedback" on public.user_feedback;
create policy "Users can submit their own feedback"
  on public.user_feedback for insert to authenticated
  with check (auth.uid() = user_id);

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
      'accounts_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      'feedback_submissions', (select count(*) from public.user_feedback)
    ),
    'discovery_sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'count', source_count) order by source_count desc, source)
      from (
        select source, count(*)::integer as source_count
        from public.user_discovery
        group by source
      ) source_totals
    ), '[]'::jsonb),
    'recent_feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'feedback_type', feedback_type, 'message', message, 'platform', platform, 'created_at', created_at
      ) order by created_at desc)
      from (select feedback_type, message, platform, created_at from public.user_feedback order by created_at desc limit 10) feedback
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
