-- 25_season_packs.sql
-- Applied as migration 25_season_packs.
--
-- Season packs: curated seasons (The Long Pilgrimage, Ho Ho Hoist, The Apprenticeship) whose
-- content (workouts, stations, doors, stamp rules) lives in the app's own files, not here. The
-- database only remembers who joined which pack and when (a "run"), and which stamps each person
-- has earned. Stamps are cosmetic and never taken away; each one is earned once per person.
-- Crew can see each other's runs and stamps (for the stamp book and the feed); only you add
-- your own. Rate limits and row caps apply like everywhere else.
create table if not exists public.lift_season_runs (
  id          uuid primary key default gen_random_uuid(),
  season_key  text not null check (season_key ~ '^[a-z][a-z0-9-]{1,39}$'),
  starts_on   date not null,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists lift_season_runs_owner on public.lift_season_runs (created_by);
alter table public.lift_season_runs enable row level security;

create table if not exists public.lift_stamps (
  id          uuid primary key default gen_random_uuid(),
  season_key  text not null check (season_key ~ '^[a-z][a-z0-9-]{1,39}$'),
  stamp_key   text not null check (stamp_key ~ '^[a-z][a-z0-9-]{1,39}$'),
  earned_on   date not null,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists lift_stamps_once on public.lift_stamps (created_by, season_key, stamp_key) where deleted_at is null;
alter table public.lift_stamps enable row level security;

drop policy if exists "runs: read" on public.lift_season_runs;
drop policy if exists "runs: add" on public.lift_season_runs;
drop policy if exists "runs: change" on public.lift_season_runs;
create policy "runs: read" on public.lift_season_runs for select to authenticated
  using ((select private.is_member()) and deleted_at is null);
create policy "runs: add" on public.lift_season_runs for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid()) and starts_on between current_date - 60 and current_date + 60);
create policy "runs: change" on public.lift_season_runs for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));
revoke all on public.lift_season_runs from anon, authenticated;
grant select on public.lift_season_runs to authenticated;
grant insert (id, season_key, starts_on) on public.lift_season_runs to authenticated;
grant update (deleted_at)                on public.lift_season_runs to authenticated;

drop policy if exists "stamps: read" on public.lift_stamps;
drop policy if exists "stamps: add" on public.lift_stamps;
create policy "stamps: read" on public.lift_stamps for select to authenticated
  using ((select private.is_member()) and deleted_at is null);
create policy "stamps: add" on public.lift_stamps for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid()) and earned_on between current_date - 400 and current_date + 1);
revoke all on public.lift_stamps from anon, authenticated;
grant select on public.lift_stamps to authenticated;
grant insert (id, season_key, stamp_key, earned_on) on public.lift_stamps to authenticated;

-- A stamp can show up in the crew's stream of wins.
alter table public.lift_posts drop constraint if exists lift_posts_kind_check;
alter table public.lift_posts add constraint lift_posts_kind_check check (kind in ('session', 'pr', 'club', 'goal', 'record', 'quest', 'stamp'));

insert into private.limits (table_name, per_minute, per_day, max_live_rows) values
  ('lift_season_runs', 10, 30, 500), ('lift_stamps', 30, 200, 5000)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_season_runs');
select private.protect('public.lift_stamps');
