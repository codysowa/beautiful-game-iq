alter table public.players add column if not exists first_name text;
alter table public.players add column if not exists last_name text;

update public.players
set first_name = split_part(trim(name), ' ', 1),
    last_name = nullif(trim(regexp_replace(trim(name), '^\S+\s*', '')), '')
where first_name is null;
