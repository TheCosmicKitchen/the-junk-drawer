-- 13_blocks_days_bodyweight.sql
-- Applied as migration 12_blocks_days_bodyweight.
--
-- 1. Routines come in two kinds: a block (a small reusable chunk, like "Bench & triceps")
--    and a workout (what you actually do on a day, built from blocks). Same table, same rules.
-- 2. Workout days: put a workout on a date, and that day the app has it ready to follow.
--    Your own only; it can only point at a routine you can see.
-- 3. Bodyweight: a private weigh-in log. Nobody else can read it.
-- 4. Season comparisons beyond totals, for everyone in a season you can see:
--    how many times each person did each planned workout, and each person's best weight on the
--    plan's lifts. Still never individual sets.

-- 1 ------------------------------------------------------------------------------------------
alter table public.lift_templates add column if not exists kind text not null default 'workout';
alter table public.lift_templates drop constraint if exists lift_templates_kind_check;
alter table public.lift_templates add constraint lift_templates_kind_check check (kind in ('workout', 'block'));
grant insert (id, name, notes, is_shared, kind)             on public.lift_templates to authenticated;
grant update (name, notes, is_shared, kind, deleted_at)     on public.lift_templates to authenticated;

-- 2 ------------------------------------------------------------------------------------------
create table if not exists public.lift_workout_days (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.lift_templates (id) on delete cascade,
  on_date      date not null,
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists lift_workout_days_once
  on public.lift_workout_days (created_by, template_id, on_date) where deleted_at is null;
create index if not exists lift_workout_days_template on public.lift_workout_days (template_id);
create index if not exists lift_workout_days_owner_date on public.lift_workout_days (created_by, on_date);
alter table public.lift_workout_days enable row level security;

drop policy if exists "days: read"   on public.lift_workout_days;
drop policy if exists "days: add"    on public.lift_workout_days;
drop policy if exists "days: change" on public.lift_workout_days;
create policy "days: read" on public.lift_workout_days
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "days: add" on public.lift_workout_days
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and on_date between current_date - 7 and current_date + 366
    and exists (select 1 from public.lift_templates t where t.id = template_id and t.deleted_at is null
                and (t.created_by = (select auth.uid()) or t.is_shared)));
create policy "days: change" on public.lift_workout_days
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and on_date between current_date - 7 and current_date + 366);

revoke all on public.lift_workout_days from anon, authenticated;
grant select on public.lift_workout_days to authenticated;
grant insert (id, template_id, on_date) on public.lift_workout_days to authenticated;
grant update (on_date, deleted_at)      on public.lift_workout_days to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows)
values ('lift_workout_days', 30, 200, 1000)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_workout_days');

-- 3 ------------------------------------------------------------------------------------------
create table if not exists public.lift_bodyweight (
  id           uuid primary key default gen_random_uuid(),
  measured_on  date not null,
  weight       numeric(6,2) not null check (weight between 30 and 1000),
  unit         text not null check (unit in ('lb', 'kg')),
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists lift_bodyweight_owner_date on public.lift_bodyweight (created_by, measured_on);
alter table public.lift_bodyweight enable row level security;

drop policy if exists "bodyweight: read"   on public.lift_bodyweight;
drop policy if exists "bodyweight: add"    on public.lift_bodyweight;
drop policy if exists "bodyweight: change" on public.lift_bodyweight;
create policy "bodyweight: read" on public.lift_bodyweight
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "bodyweight: add" on public.lift_bodyweight
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and measured_on between date '2000-01-01' and current_date + 1);
create policy "bodyweight: change" on public.lift_bodyweight
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and measured_on between date '2000-01-01' and current_date + 1);

revoke all on public.lift_bodyweight from anon, authenticated;
grant select on public.lift_bodyweight to authenticated;
grant insert (id, measured_on, weight, unit)               on public.lift_bodyweight to authenticated;
grant update (measured_on, weight, unit, deleted_at)       on public.lift_bodyweight to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows)
values ('lift_bodyweight', 10, 30, 5000)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_bodyweight');

-- 4 ------------------------------------------------------------------------------------------
-- Who is in a season the caller can see: the owner plus everyone who joined (active members only).
create or replace function private.season_people(p_season uuid)
returns table (uid uuid, display_name text, starts_on date, ends_on date)
language sql stable security definer set search_path = ''
as $$
  with s as (
    select * from public.lift_seasons
    where id = p_season and deleted_at is null
      and (is_shared or created_by = auth.uid())
      and private.is_member()
  ), people as (
    select s.created_by as uid from s
    union
    select sub.created_by from public.lift_season_subscriptions sub join s on sub.season_id = s.id where sub.deleted_at is null
  )
  select m.user_id, m.display_name, s.starts_on, s.ends_on
  from people p join private.members m on m.user_id = p.uid and m.active cross join s;
$$;
revoke all on function private.season_people(uuid) from public, anon, authenticated;

-- Times each person did each planned workout: a day counts when it covers at least half of the
-- workout's distinct exercises (the same rule the app uses to work out the rotation).
create or replace function public.season_workouts(p_season uuid)
returns table (user_id uuid, display_name text, template_id uuid, times bigint)
language sql stable security definer set search_path = ''
as $$
  with pp as (select * from private.season_people(p_season)),
  plan as (
    select distinct p.template_id from public.lift_season_plan p
    where p.season_id = p_season and p.deleted_at is null
  ), wex as (
    select distinct i.template_id, i.exercise_id from public.lift_template_items i join plan using (template_id) where i.deleted_at is null
  ), wsize as (select template_id, count(*) n from wex group by 1),
  days as (
    select distinct x.created_by uid, x.performed_on, x.exercise_id
    from public.lift_sets x join pp on pp.uid = x.created_by
    where x.deleted_at is null and x.is_warmup is not true and x.performed_on between pp.starts_on and pp.ends_on
  ), hits as (
    select d.uid, d.performed_on, w.template_id, count(*) n
    from days d join wex w on w.exercise_id = d.exercise_id group by 1, 2, 3
  )
  select pp.uid, pp.display_name, ws.template_id,
         (select count(*) from hits h where h.uid = pp.uid and h.template_id = ws.template_id and h.n * 2 >= ws.n)
  from pp cross join wsize ws;
$$;
revoke all on function public.season_workouts(uuid) from public, anon;
grant execute on function public.season_workouts(uuid) to authenticated;

-- Each person's heaviest working set on the season's key lifts: the exercises in its plan, or
-- if it has no plan, the lifts at least two people did, most-trained first (up to 12).
create or replace function public.season_bests(p_season uuid)
returns table (user_id uuid, display_name text, exercise_id uuid, best_weight numeric, reps int, unit text)
language sql stable security definer set search_path = ''
as $$
  with pp as (select * from private.season_people(p_season)),
  sets as (
    select x.* from public.lift_sets x join pp on pp.uid = x.created_by
    where x.deleted_at is null and x.is_warmup is not true and x.weight > 0 and x.performed_on between pp.starts_on and pp.ends_on
  ), planned as (
    select distinct i.exercise_id from public.lift_season_plan p
    join public.lift_template_items i on i.template_id = p.template_id and i.deleted_at is null
    where p.season_id = p_season and p.deleted_at is null
  ), common as (
    select exercise_id from sets group by 1 having count(distinct created_by) >= 2 order by count(*) desc limit 12
  ), lifts as (
    select exercise_id from planned
    union all
    select exercise_id from common where not exists (select 1 from planned)
  ), ranked as (
    select s.created_by, s.exercise_id, s.weight, s.reps, s.unit,
           row_number() over (partition by s.created_by, s.exercise_id, s.unit order by s.weight desc, s.reps desc) rn
    from sets s where s.exercise_id in (select exercise_id from lifts)
  )
  select pp.uid, pp.display_name, r.exercise_id, r.weight, r.reps, r.unit
  from ranked r join pp on pp.uid = r.created_by where r.rn = 1;
$$;
revoke all on function public.season_bests(uuid) from public, anon;
grant execute on function public.season_bests(uuid) to authenticated;
