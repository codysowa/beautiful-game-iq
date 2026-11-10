-- Keep activity analytics current when Supabase Auth refreshes an existing session.
-- Client-side app-open events remain the more precise foreground signal.
create or replace function public.capture_auth_session_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity_at timestamptz := coalesce(new.refreshed_at, new.created_at, now());
begin
  insert into public.user_activity (user_id, last_active_at, last_activity_at, last_activity_type)
  values (new.user_id, v_activity_at, v_activity_at, 'session_refresh')
  on conflict (user_id) do update
  set last_active_at = greatest(public.user_activity.last_active_at, excluded.last_active_at),
      last_activity_at = greatest(public.user_activity.last_activity_at, excluded.last_activity_at),
      last_activity_type = case
        when excluded.last_activity_at >= public.user_activity.last_active_at
          then 'session_refresh'
        else public.user_activity.last_activity_type
      end;
  return new;
end;
$$;

drop trigger if exists capture_auth_session_activity on auth.sessions;
create trigger capture_auth_session_activity
after insert or update of refreshed_at on auth.sessions
for each row execute function public.capture_auth_session_activity();

insert into public.user_activity (user_id, last_active_at, last_activity_at, last_activity_type)
select distinct on (s.user_id)
  s.user_id,
  coalesce(s.refreshed_at, s.created_at, now()),
  coalesce(s.refreshed_at, s.created_at, now()),
  'session_refresh'
from auth.sessions s
where s.user_id is not null
order by s.user_id, coalesce(s.refreshed_at, s.created_at, now()) desc
on conflict (user_id) do update
set last_active_at = greatest(public.user_activity.last_active_at, excluded.last_active_at),
    last_activity_at = greatest(public.user_activity.last_active_at, excluded.last_active_at),
    last_activity_type = case
      when excluded.last_active_at >= public.user_activity.last_active_at
        then 'session_refresh'
      else public.user_activity.last_activity_type
    end;
