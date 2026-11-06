-- 03_lifting.sql
-- Weightlifting tracker. Completely private: each person sees and changes only
-- their own exercises, workouts and sets. Nobody else (not even other members)
-- can read them; the admin can, from the dashboard.
--
--   lift_exercises   your list of lifts ("Back squat", "Bench press")
--   lift_workouts    one row per session (a date, kg or lb, bodyweight, notes)
--   lift_sets        the sets in a session (exercise, weight, reps, effort)
--   lift_bests       a view: heaviest set and estimated 1-rep max per exercise
--
-- Nothing is ever hard-deleted from the app: "delete" sets deleted_at, so a
-- mistake (or a hijacked account) can be undone.
--
-- Run after 01 and 02. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.lift_exercises (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  kind        text not null default 'barbell'
              check (kind in ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other')),
  notes       text check (char_length(notes) <= 300),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists lift_exercises_unique_name
  on public.lift_exercises (created_by, lower(btrim(name))) where deleted_at is null;

create table if not exists public.lift_workouts (
  id           uuid primary key default gen_random_uuid(),
  performed_on date not null default current_date
               check (performed_on between date '2000-01-01' and date '2100-01-01'),
  unit         text not null default 'kg' check (unit in ('kg', 'lb')),
  bodyweight   numeric(5, 1) check (bodyweight between 20 and 400),
  notes        text check (char_length(notes) <= 1000),
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists lift_workouts_by_person on public.lift_workouts (created_by, performed_on desc);

create table if not exists public.lift_sets (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.lift_workouts (id) on delete cascade,
  exercise_id  uuid not null references public.lift_exercises (id) on delete cascade,
  position     smallint not null default 1 check (position between 1 and 200),
  weight       numeric(6, 2) not null default 0 check (weight between 0 and 1500),  -- in the workout's unit
  reps         smallint not null check (reps between 0 and 1000),
  rpe          numeric(3, 1) check (rpe between 1 and 10),                            -- effort, optional
  is_warmup    boolean not null default false,
  notes        text check (char_length(notes) <= 200),
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists lift_sets_by_workout  on public.lift_sets (workout_id, position);
create index if not exists lift_sets_by_exercise on public.lift_sets (created_by, exercise_id);

-- ---------------------------------------------------------------------------
-- Rules (row level security)
-- ---------------------------------------------------------------------------
alter table public.lift_exercises enable row level security;
alter table public.lift_workouts  enable row level security;
alter table public.lift_sets      enable row level security;

-- Exercises and workouts: your own rows only. Soft-deleted rows stay visible
-- to their owner so the app can offer "undo".
drop policy if exists "own exercises: read"   on public.lift_exercises;
drop policy if exists "own exercises: add"    on public.lift_exercises;
drop policy if exists "own exercises: change" on public.lift_exercises;
create policy "own exercises: read" on public.lift_exercises
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "own exercises: add" on public.lift_exercises
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid()));
create policy "own exercises: change" on public.lift_exercises
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));

drop policy if exists "own workouts: read"   on public.lift_workouts;
drop policy if exists "own workouts: add"    on public.lift_workouts;
drop policy if exists "own workouts: change" on public.lift_workouts;
create policy "own workouts: read" on public.lift_workouts
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "own workouts: add" on public.lift_workouts
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid()));
create policy "own workouts: change" on public.lift_workouts
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));

-- Sets: your own, and only inside your own workout, using your own exercise.
-- (Stops someone attaching sets to another person's workout by guessing an id.)
drop policy if exists "own sets: read"   on public.lift_sets;
drop policy if exists "own sets: add"    on public.lift_sets;
drop policy if exists "own sets: change" on public.lift_sets;
create policy "own sets: read" on public.lift_sets
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "own sets: add" on public.lift_sets
  for insert to authenticated
  with check (
    (select private.is_member())
    and created_by = (select auth.uid())
    and exists (select 1 from public.lift_workouts w
                where w.id = workout_id and w.created_by = (select auth.uid()))
    and exists (select 1 from public.lift_exercises e
                where e.id = exercise_id and e.created_by = (select auth.uid()))
  );
create policy "own sets: change" on public.lift_sets
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check (
    (select private.is_member())
    and created_by = (select auth.uid())
    and exists (select 1 from public.lift_workouts w
                where w.id = workout_id and w.created_by = (select auth.uid()))
    and exists (select 1 from public.lift_exercises e
                where e.id = exercise_id and e.created_by = (select auth.uid()))
  );

-- No delete policy on purpose: hard deletes are refused. "Delete" in the app
-- means setting deleted_at.

-- ---------------------------------------------------------------------------
-- What the browser may touch, column by column. Who-and-when columns are left
-- out: the stamp trigger fills them in, and the browser can't even send them.
-- ---------------------------------------------------------------------------
revoke all on public.lift_exercises, public.lift_workouts, public.lift_sets from anon, authenticated;

grant select on public.lift_exercises to authenticated;
grant insert (id, name, kind, notes)              on public.lift_exercises to authenticated;
grant update (name, kind, notes, deleted_at)      on public.lift_exercises to authenticated;

grant select on public.lift_workouts to authenticated;
grant insert (id, performed_on, unit, bodyweight, notes)              on public.lift_workouts to authenticated;
grant update (performed_on, unit, bodyweight, notes, deleted_at)      on public.lift_workouts to authenticated;

grant select on public.lift_sets to authenticated;
grant insert (id, workout_id, exercise_id, position, weight, reps, rpe, is_warmup, notes)          on public.lift_sets to authenticated;
grant update (exercise_id, position, weight, reps, rpe, is_warmup, notes, deleted_at)               on public.lift_sets to authenticated;

-- Rate limits, row caps, who/when stamps and the audit log.
select private.protect('public.lift_exercises');
select private.protect('public.lift_workouts');
select private.protect('public.lift_sets');

-- ---------------------------------------------------------------------------
-- Personal bests. security_invoker means the view runs with the reader's own
-- rights, so the rules above still apply and you only ever see your own.
-- Weights are converted to kg so kg and lb sessions compare fairly.
-- Estimated 1-rep max uses the Epley formula, only from sets of 1 to 12 reps.
-- ---------------------------------------------------------------------------
create or replace view public.lift_bests
with (security_invoker = true)
as
select
  e.id   as exercise_id,
  e.name as exercise,
  max(s.weight * case w.unit when 'lb' then 0.45359237 else 1 end) as heaviest_kg,
  max(s.weight * case w.unit when 'lb' then 0.45359237 else 1 end * (1 + s.reps / 30.0))
    filter (where s.reps between 1 and 12) as est_1rm_kg,
  max(w.performed_on) as last_done,
  count(*) as sets
from public.lift_sets s
join public.lift_workouts  w on w.id = s.workout_id
join public.lift_exercises e on e.id = s.exercise_id
where s.deleted_at is null
  and w.deleted_at is null
  and e.deleted_at is null
  and not s.is_warmup
group by e.id, e.name;

revoke all on public.lift_bests from anon, authenticated;
grant select on public.lift_bests to authenticated;
