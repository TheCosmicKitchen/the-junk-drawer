-- 03_lifting.sql
-- The lift log: a web version of Sisyfitness, with Supabase as the backend.
--
-- Same model as the app:
--   * Sets are the core. A "visit" is a day with at least one set; nothing to start or finish.
--   * Every set has its own unit. lb and kg totals are always kept separate, never converted.
--   * Bodyweight only counts toward volume when a set says so, and is stored separately.
--   * Volume = (weight + bodyweight if counted) x reps. Sets marked as warm-ups don't count.
--
-- Tables:
--   lift_exercises          the one shared exercise catalogue. Only the admin adds or changes it.
--   lift_exercise_aliases   other spellings, for search (admin-managed)
--   lift_sets               the log. Private to each person.
--   lift_seasons            each person's own date ranges ("Spring block")
--   lift_season_goals       visit or volume targets for a season
--   lift_templates          a flat repeatable workout ("Push day")
--   lift_template_items     its exercises, sets x reps, fixed load or % of 1RM
--   lift_import_batches     one row per spreadsheet import, so a whole import can be undone
--   lift_challenges         group challenges with a date window and a metric
--   lift_challenge_entries  who has opted in to a challenge
--
-- Views (each person only ever sees their own rows):
--   lift_days   per-day sets, exercises and lb/kg volume: visits, cadence, season totals, charts
--   lift_bests  heaviest load for each exercise, unit and rep count, and when it was first hit
--
-- Functions the page can call:
--   challenge_standings(challenge)  totals ONLY for people who opted in; never anyone's sets
--   import_sets(source, rows)       up to 20,000 sets in one undoable batch
--   undo_import(batch)              soft-deletes every set from that batch
--
-- Run after 01 and 02. Safe to run more than once.

-- ===========================================================================
-- Exercises
-- ===========================================================================
create table if not exists public.lift_exercises (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(btrim(name)) between 1 and 80),
  supports_bodyweight boolean not null default false,  -- hint for the page: offer "count bodyweight"
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,  -- null for seeded rows
  created_at          timestamptz not null default now(),
  updated_by          uuid,
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz   -- retired from the picker; old sets keep pointing at it
);
-- Similar names are never merged automatically; only an exact (case-insensitive) clash is refused.
create unique index if not exists lift_exercises_unique_name
  on public.lift_exercises (lower(btrim(name))) where deleted_at is null;

create table if not exists public.lift_exercise_aliases (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.lift_exercises (id) on delete cascade,
  alias       text not null check (char_length(btrim(alias)) between 1 and 80),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists lift_exercise_aliases_unique
  on public.lift_exercise_aliases (exercise_id, lower(btrim(alias))) where deleted_at is null;

-- ===========================================================================
-- Import batches (before sets, which point at them)
-- ===========================================================================
create table if not exists public.lift_import_batches (
  id          uuid primary key default gen_random_uuid(),
  source_name text not null check (char_length(btrim(source_name)) between 1 and 120),
  row_count   int not null check (row_count between 1 and 20000),
  note        text check (char_length(note) <= 300),
  undone_at   timestamptz,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ===========================================================================
-- Sets
-- ===========================================================================
create table if not exists public.lift_sets (
  id               uuid primary key default gen_random_uuid(),
  exercise_id      uuid not null references public.lift_exercises (id),
  performed_on     date not null default current_date
                   check (performed_on between date '2000-01-01' and date '2100-01-01'),
  logged_at        timestamptz not null default now(),   -- the page sends the real time for sets queued offline
  date_only        boolean not null default false,       -- imported rows that only had a date
  weight           numeric(7, 2) not null default 0 check (weight between 0 and 2000),  -- external load, in this set's unit
  reps             smallint not null check (reps between 1 and 1000),
  unit             text not null check (unit in ('lb', 'kg')),
  count_bodyweight boolean not null default false,
  bodyweight       numeric(6, 1) check (bodyweight between 1 and 1000),                -- in this set's unit
  is_warmup        boolean default false,                -- null = unknown (imports); only true is left out of volume
  notes            text check (char_length(notes) <= 300),
  import_batch_id  uuid references public.lift_import_batches (id),
  source_row       int check (source_row between 1 and 1000000),   -- spreadsheet row, for review
  created_by       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_by       uuid,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint lift_sets_bodyweight_given check (not count_bodyweight or bodyweight is not null)
);
create index if not exists lift_sets_by_day      on public.lift_sets (created_by, performed_on desc);
create index if not exists lift_sets_by_exercise on public.lift_sets (created_by, exercise_id, performed_on desc);
create index if not exists lift_sets_by_batch    on public.lift_sets (import_batch_id) where import_batch_id is not null;

-- ===========================================================================
-- Seasons and goals
-- ===========================================================================
create table if not exists public.lift_seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  starts_on   date not null,
  ends_on     date not null,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint lift_seasons_dates check (ends_on >= starts_on and starts_on >= date '2000-01-01' and ends_on <= date '2100-01-01')
);

create table if not exists public.lift_season_goals (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.lift_seasons (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  metric      text not null check (metric in ('visits', 'volume')),
  target      numeric(14, 1) not null check (target > 0 and target <= 1000000000),
  unit        text check (unit in ('lb', 'kg')),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint lift_goals_unit check ((metric = 'visits' and unit is null) or (metric = 'volume' and unit is not null))
);

-- ===========================================================================
-- Templates
-- ===========================================================================
create table if not exists public.lift_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  notes       text check (char_length(notes) <= 500),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.lift_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.lift_templates (id) on delete cascade,
  exercise_id uuid not null references public.lift_exercises (id),
  position    smallint not null default 1 check (position between 1 and 100),
  sets        smallint not null default 3 check (sets between 1 and 20),
  reps        smallint not null default 8 check (reps between 1 and 100),
  load_mode   text not null default 'fixed' check (load_mode in ('fixed', 'percent_1rm')),
  load_value  numeric(7, 2) not null default 0,
  unit        text not null default 'lb' check (unit in ('lb', 'kg')),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint lift_template_load check (
    (load_mode = 'fixed' and load_value between 0 and 2000)
    or (load_mode = 'percent_1rm' and load_value between 1 and 150))
);
create index if not exists lift_template_items_by_template on public.lift_template_items (template_id, position);

-- ===========================================================================
-- Challenges
-- ===========================================================================
create table if not exists public.lift_challenges (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 500),
  starts_on   date not null,
  ends_on     date not null,
  metric      text not null check (metric in ('visits', 'volume_lb', 'volume_kg', 'sets')),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint lift_challenges_dates check (ends_on >= starts_on and ends_on - starts_on <= 3660)
);

create table if not exists public.lift_challenge_entries (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.lift_challenges (id) on delete cascade,
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,  -- the participant
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz   -- set = left the challenge
);
create unique index if not exists lift_challenge_entries_once
  on public.lift_challenge_entries (challenge_id, created_by) where deleted_at is null;

-- ===========================================================================
-- Rules
-- ===========================================================================
alter table public.lift_exercises         enable row level security;
alter table public.lift_exercise_aliases  enable row level security;
alter table public.lift_import_batches    enable row level security;
alter table public.lift_sets              enable row level security;
alter table public.lift_seasons           enable row level security;
alter table public.lift_season_goals      enable row level security;
alter table public.lift_templates         enable row level security;
alter table public.lift_template_items    enable row level security;
alter table public.lift_challenges        enable row level security;
alter table public.lift_challenge_entries enable row level security;

-- Exercises: one shared catalogue. Every member can see it (retired ones too,
-- so old sets still show a name); only the admin adds, renames or retires.
drop policy if exists "exercises: read"   on public.lift_exercises;
drop policy if exists "exercises: add"    on public.lift_exercises;
drop policy if exists "exercises: change" on public.lift_exercises;
create policy "exercises: read" on public.lift_exercises
  for select to authenticated
  using ((select private.is_member()));
create policy "exercises: add" on public.lift_exercises
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy "exercises: change" on public.lift_exercises
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "aliases: read"         on public.lift_exercise_aliases;
drop policy if exists "aliases: admin adds"   on public.lift_exercise_aliases;
drop policy if exists "aliases: admin changes" on public.lift_exercise_aliases;
create policy "aliases: read" on public.lift_exercise_aliases
  for select to authenticated
  using ((select private.is_member()) and deleted_at is null
         and exists (select 1 from public.lift_exercises e where e.id = exercise_id));
create policy "aliases: admin adds" on public.lift_exercise_aliases
  for insert to authenticated with check ((select private.is_admin()));
create policy "aliases: admin changes" on public.lift_exercise_aliases
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Everything below is "your own rows only". Soft-deleted rows stay visible to
-- their owner so the page can offer undo.
do $$
declare
  t text;
begin
  foreach t in array array['lift_import_batches', 'lift_seasons', 'lift_templates'] loop
    execute format('drop policy if exists "own: read" on public.%I', t);
    execute format('drop policy if exists "own: add" on public.%I', t);
    execute format('drop policy if exists "own: change" on public.%I', t);
    execute format('create policy "own: read" on public.%I for select to authenticated using ((select private.is_member()) and created_by = (select auth.uid()))', t);
    execute format('create policy "own: add" on public.%I for insert to authenticated with check ((select private.is_member()) and created_by = (select auth.uid()))', t);
    execute format('create policy "own: change" on public.%I for update to authenticated using ((select private.is_member()) and created_by = (select auth.uid())) with check ((select private.is_member()) and created_by = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Sets: yours, using a catalogue exercise, and (if imported) one of your own batches.
-- Editing an old set may keep its retired exercise, but new sets need a current one.
drop policy if exists "own sets: read"   on public.lift_sets;
drop policy if exists "own sets: add"    on public.lift_sets;
drop policy if exists "own sets: change" on public.lift_sets;
create policy "own sets: read" on public.lift_sets
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "own sets: add" on public.lift_sets
  for insert to authenticated
  with check (
    (select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_exercises e where e.id = exercise_id and e.deleted_at is null)
    and (import_batch_id is null or exists (select 1 from public.lift_import_batches b
                where b.id = import_batch_id and b.created_by = (select auth.uid()))));
create policy "own sets: change" on public.lift_sets
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));

-- Goals: yours, on your own season.
drop policy if exists "own goals: read"   on public.lift_season_goals;
drop policy if exists "own goals: add"    on public.lift_season_goals;
drop policy if exists "own goals: change" on public.lift_season_goals;
create policy "own goals: read" on public.lift_season_goals
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "own goals: add" on public.lift_season_goals
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
              and exists (select 1 from public.lift_seasons s where s.id = season_id and s.created_by = (select auth.uid())));
create policy "own goals: change" on public.lift_season_goals
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid())
              and exists (select 1 from public.lift_seasons s where s.id = season_id and s.created_by = (select auth.uid())));

-- Template items: yours, in your own template, using a catalogue exercise.
drop policy if exists "own items: read"   on public.lift_template_items;
drop policy if exists "own items: add"    on public.lift_template_items;
drop policy if exists "own items: change" on public.lift_template_items;
create policy "own items: read" on public.lift_template_items
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "own items: add" on public.lift_template_items
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_templates t where t.id = template_id and t.created_by = (select auth.uid()))
    and exists (select 1 from public.lift_exercises e where e.id = exercise_id and e.deleted_at is null));
create policy "own items: change" on public.lift_template_items
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_templates t where t.id = template_id and t.created_by = (select auth.uid())));

-- Challenges: every member can see them and who joined; anyone can start one;
-- only its creator (or the admin) can change it; you can only join or leave yourself.
drop policy if exists "challenges: read"   on public.lift_challenges;
drop policy if exists "challenges: add"    on public.lift_challenges;
drop policy if exists "challenges: change" on public.lift_challenges;
create policy "challenges: read" on public.lift_challenges
  for select to authenticated
  using ((select private.is_member()) and (deleted_at is null or created_by = (select auth.uid())));
create policy "challenges: add" on public.lift_challenges
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid()));
create policy "challenges: change" on public.lift_challenges
  for update to authenticated
  using ((select private.is_member()) and (created_by = (select auth.uid()) or (select private.is_admin())))
  with check ((select private.is_member()) and (created_by = (select auth.uid()) or (select private.is_admin())));

drop policy if exists "entries: read"   on public.lift_challenge_entries;
drop policy if exists "entries: join"   on public.lift_challenge_entries;
drop policy if exists "entries: change" on public.lift_challenge_entries;
create policy "entries: read" on public.lift_challenge_entries
  for select to authenticated
  using ((select private.is_member()) and (deleted_at is null or created_by = (select auth.uid())));
create policy "entries: join" on public.lift_challenge_entries
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
              and exists (select 1 from public.lift_challenges c where c.id = challenge_id and c.deleted_at is null));
create policy "entries: change" on public.lift_challenge_entries
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));

-- No delete policies anywhere: hard deletes are refused. "Delete" sets deleted_at.

-- ===========================================================================
-- What the page may send, column by column (who/when columns are filled in by triggers)
-- ===========================================================================
revoke all on public.lift_exercises, public.lift_exercise_aliases, public.lift_import_batches, public.lift_sets,
              public.lift_seasons, public.lift_season_goals, public.lift_templates, public.lift_template_items,
              public.lift_challenges, public.lift_challenge_entries
  from anon, authenticated;

grant select on public.lift_exercises to authenticated;
grant insert (id, name, supports_bodyweight)          on public.lift_exercises to authenticated;  -- the rules limit this to the admin
grant update (name, supports_bodyweight, deleted_at)  on public.lift_exercises to authenticated;

grant select on public.lift_exercise_aliases to authenticated;
grant insert (id, exercise_id, alias)  on public.lift_exercise_aliases to authenticated;
grant update (alias, deleted_at)       on public.lift_exercise_aliases to authenticated;

grant select on public.lift_import_batches to authenticated;
grant insert (id, source_name, row_count, note)  on public.lift_import_batches to authenticated;
grant update (note, undone_at)                   on public.lift_import_batches to authenticated;

grant select on public.lift_sets to authenticated;
grant insert (id, exercise_id, performed_on, logged_at, date_only, weight, reps, unit, count_bodyweight, bodyweight,
              is_warmup, notes, import_batch_id, source_row) on public.lift_sets to authenticated;
grant update (exercise_id, performed_on, date_only, weight, reps, unit, count_bodyweight, bodyweight,
              is_warmup, notes, deleted_at) on public.lift_sets to authenticated;

grant select on public.lift_seasons to authenticated;
grant insert (id, name, starts_on, ends_on)              on public.lift_seasons to authenticated;
grant update (name, starts_on, ends_on, deleted_at)      on public.lift_seasons to authenticated;

grant select on public.lift_season_goals to authenticated;
grant insert (id, season_id, name, metric, target, unit)          on public.lift_season_goals to authenticated;
grant update (name, metric, target, unit, deleted_at)             on public.lift_season_goals to authenticated;

grant select on public.lift_templates to authenticated;
grant insert (id, name, notes)              on public.lift_templates to authenticated;
grant update (name, notes, deleted_at)      on public.lift_templates to authenticated;

grant select on public.lift_template_items to authenticated;
grant insert (id, template_id, exercise_id, position, sets, reps, load_mode, load_value, unit) on public.lift_template_items to authenticated;
grant update (exercise_id, position, sets, reps, load_mode, load_value, unit, deleted_at)      on public.lift_template_items to authenticated;

grant select on public.lift_challenges to authenticated;
grant insert (id, name, description, starts_on, ends_on, metric)              on public.lift_challenges to authenticated;
grant update (name, description, starts_on, ends_on, metric, deleted_at)      on public.lift_challenges to authenticated;

grant select on public.lift_challenge_entries to authenticated;
grant insert (id, challenge_id)  on public.lift_challenge_entries to authenticated;
grant update (deleted_at)        on public.lift_challenge_entries to authenticated;

-- Rate limits, row caps, who/when stamps and the audit log on every table.
select private.protect('public.lift_exercises');
select private.protect('public.lift_exercise_aliases');
select private.protect('public.lift_import_batches');
select private.protect('public.lift_sets');
select private.protect('public.lift_seasons');
select private.protect('public.lift_season_goals');
select private.protect('public.lift_templates');
select private.protect('public.lift_template_items');
select private.protect('public.lift_challenges');
select private.protect('public.lift_challenge_entries');

-- ===========================================================================
-- Views. security_invoker: they run with the reader's rights, so the rules
-- above apply and you only ever see your own sets.
-- ===========================================================================
create or replace view public.lift_days
with (security_invoker = true)
as
select
  s.performed_on,
  count(*)                      as sets,
  count(distinct s.exercise_id) as exercises,
  coalesce(sum((s.weight + case when s.count_bodyweight then s.bodyweight else 0 end) * s.reps)
           filter (where s.unit = 'lb'), 0) as volume_lb,
  coalesce(sum((s.weight + case when s.count_bodyweight then s.bodyweight else 0 end) * s.reps)
           filter (where s.unit = 'kg'), 0) as volume_kg
from public.lift_sets s
where s.deleted_at is null
  and s.is_warmup is not true
group by s.performed_on;

-- Heaviest external load for each exercise, unit and rep count, and the first day it was lifted.
-- (Estimated 1RM is worked out in the page, labelled as an estimate with its formula.)
create or replace view public.lift_bests
with (security_invoker = true)
as
select distinct on (s.exercise_id, s.unit, s.reps)
  s.exercise_id,
  s.unit,
  s.reps,
  s.weight       as heaviest,
  s.performed_on as first_lifted_on
from public.lift_sets s
where s.deleted_at is null
  and s.is_warmup is not true
order by s.exercise_id, s.unit, s.reps, s.weight desc, s.performed_on asc;

revoke all on public.lift_days, public.lift_bests from anon, authenticated;
grant select on public.lift_days, public.lift_bests to authenticated;

-- ===========================================================================
-- Challenge standings: TOTALS for people who opted in, nothing else.
-- Runs with extra rights so it can add up other people's sets, which is why
-- it only ever returns sums and only to members.
-- ===========================================================================
create or replace function public.challenge_standings(p_challenge uuid)
returns table (user_id uuid, display_name text, visits bigint, sets bigint, volume_lb numeric, volume_kg numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    m.display_name,
    count(distinct s.performed_on) as visits,
    count(s.id)                    as sets,
    coalesce(sum((s.weight + case when s.count_bodyweight then s.bodyweight else 0 end) * s.reps)
             filter (where s.unit = 'lb'), 0) as volume_lb,
    coalesce(sum((s.weight + case when s.count_bodyweight then s.bodyweight else 0 end) * s.reps)
             filter (where s.unit = 'kg'), 0) as volume_kg
  from public.lift_challenges c
  join public.lift_challenge_entries en on en.challenge_id = c.id and en.deleted_at is null
  join private.members m on m.user_id = en.created_by and m.active
  left join public.lift_sets s
         on s.created_by = en.created_by
        and s.deleted_at is null
        and s.is_warmup is not true
        and s.performed_on between c.starts_on and c.ends_on
  where c.id = p_challenge
    and c.deleted_at is null
    and private.is_member()
  group by m.user_id, m.display_name;
$$;
revoke all on function public.challenge_standings(uuid) from public, anon;
grant execute on function public.challenge_standings(uuid) to authenticated;

-- ===========================================================================
-- Spreadsheet import: one call, up to 20,000 sets, one undoable batch.
-- Runs as the person importing, so every rule above still applies to every row.
-- The per-minute and per-day set limits are skipped for the rows of a batch
-- (the batch has its own: 20,000 sets, 3 batches a day, 100,000 live sets each),
-- and the audit log gets one line per batch instead of one per set.
--
-- p_rows: [{"exercise_id": "...", "performed_on": "2026-03-02", "weight": 135, "reps": 5,
--           "unit": "lb", "count_bodyweight": false, "bodyweight": null,
--           "is_warmup": null, "notes": null, "source_row": 17}, ...]
-- ===========================================================================
create or replace function private.log_bulk(p_table text, p_row_id text, p_action text, p_count int)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_log (user_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), p_table, p_row_id, p_action, null, jsonb_build_object('rows', p_count));
$$;
revoke all on function private.log_bulk(text, text, text, int) from public, anon;
grant execute on function private.log_bulk(text, text, text, int) to authenticated;

create or replace function public.import_sets(p_source text, p_rows jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  batch uuid := gen_random_uuid();
  n     int;
  live  int;
begin
  if not private.is_member() then
    raise exception 'Not allowed.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'The rows must be a list.';
  end if;
  n := jsonb_array_length(p_rows);
  if n < 1 or n > 20000 then
    raise exception 'An import can have 1 to 20,000 sets; this one has %.', n;
  end if;
  select count(*) into live from public.lift_sets where created_by = auth.uid() and deleted_at is null;
  if live + n > 100000 then
    raise exception 'This import would take you past 100,000 sets.';
  end if;

  -- The batch row goes through the normal limits (3 imports a day).
  insert into public.lift_import_batches (id, source_name, row_count)
  values (batch, left(btrim(coalesce(p_source, 'import')), 120), n);

  perform set_config('app.bulk_import', 'on', true);
  insert into public.lift_sets (exercise_id, performed_on, date_only, weight, reps, unit,
                                count_bodyweight, bodyweight, is_warmup, notes, import_batch_id, source_row)
  select r.exercise_id, r.performed_on, true, coalesce(r.weight, 0), r.reps, r.unit,
         coalesce(r.count_bodyweight, false), r.bodyweight, r.is_warmup, r.notes, batch, r.source_row
  from jsonb_to_recordset(p_rows) as r (exercise_id uuid, performed_on date, weight numeric, reps int, unit text,
                                        count_bodyweight boolean, bodyweight numeric, is_warmup boolean,
                                        notes text, source_row int);
  perform set_config('app.bulk_import', 'off', true);

  perform private.log_bulk('lift_sets', batch::text, 'IMPORT', n);
  return batch;
end;
$$;

create or replace function public.undo_import(p_batch uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n int;
begin
  if not private.is_member() then
    raise exception 'Not allowed.';
  end if;
  if not exists (select 1 from public.lift_import_batches b
                 where b.id = p_batch and b.created_by = auth.uid() and b.undone_at is null) then
    raise exception 'There is no import like that to undo.';
  end if;

  perform set_config('app.bulk_import', 'on', true);
  update public.lift_sets set deleted_at = now()
   where import_batch_id = p_batch and deleted_at is null;
  get diagnostics n = row_count;
  perform set_config('app.bulk_import', 'off', true);

  update public.lift_import_batches set undone_at = now() where id = p_batch;
  perform private.log_bulk('lift_sets', p_batch::text, 'UNDO IMPORT', n);
  return n;
end;
$$;

revoke all on function public.import_sets(text, jsonb) from public, anon;
revoke all on function public.undo_import(uuid)       from public, anon;
grant execute on function public.import_sets(text, jsonb) to authenticated;
grant execute on function public.undo_import(uuid)       to authenticated;
