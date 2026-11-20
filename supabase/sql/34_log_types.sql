-- 34_log_types.sql
-- To be applied as migration 34_log_types.
--
-- Lifts that aren't weight × reps. Every set type the established trackers use (Hevy, Strong,
-- Plates) is a mix of four measurements: load, reps, time and distance. So instead of a migration
-- per kind of exercise, a set can now carry all four, filled in as they apply:
--
--   weight × reps          bench press               weight, reps          (as before)
--   bodyweight / weighted  pull-ups, BW+25 dips      reps, bodyweight      (as before)
--   assisted               band pull-ups, BW−30      reps, weight < 0      (new: weight may go negative on bodyweight sets)
--   time                   plank, dead hang          duration_s, weight optional
--   distance               farmer's carry, sled      distance_m, weight optional, duration_s optional
--
-- Each exercise says which it is (lift_exercises.log_type: reps, time or distance); the app maps that
-- type to its logger. Effort (RPE 1–10) can go on any set. Routine steps get time and distance
-- targets the same way. Volume stays weight × reps, so carries and holds don't skew "pounds moved"
-- (every total already sums weight × reps, which skips a set with no reps). Their bests (longest,
-- farthest, heaviest) go in a small table of their own, kept by the same trigger as the rep bests.

-- ---------------------------------------------------------------------------
-- Exercises: how each is measured. Only admins can change the catalogue (existing policy).
-- ---------------------------------------------------------------------------
alter table public.lift_exercises add column if not exists log_type text not null default 'reps';
alter table public.lift_exercises drop constraint if exists lift_exercises_log_type_check;
alter table public.lift_exercises add constraint lift_exercises_log_type_check check (log_type in ('reps', 'time', 'distance'));
grant insert (log_type), update (log_type) on public.lift_exercises to authenticated;

update public.lift_exercises set log_type = 'distance' where name = 'Farmer''s Carry' and kind = 'strength' and deleted_at is null;
insert into public.lift_exercises (name, kind, log_type, supports_bodyweight, created_by)
select n, 'strength', t, bw, null
from (values ('Plank', 'time', true), ('Side Plank', 'time', true), ('Dead Hang', 'time', true), ('Wall Sit', 'time', true),
             ('Hollow Hold', 'time', true), ('L-Sit', 'time', true), ('Suitcase Carry', 'distance', false), ('Sled Push', 'distance', false)) as v(n, t, bw)
where not exists (select 1 from public.lift_exercises e where lower(e.name) = lower(v.n) and e.deleted_at is null);

-- ---------------------------------------------------------------------------
-- Sets: reps become optional; time, distance and effort join them.
-- ---------------------------------------------------------------------------
alter table public.lift_sets alter column reps drop not null;
alter table public.lift_sets add column if not exists duration_s integer;
alter table public.lift_sets add column if not exists distance_m numeric(8,2);
alter table public.lift_sets add column if not exists rpe numeric(3,1);
alter table public.lift_sets drop constraint if exists lift_sets_duration_check;
alter table public.lift_sets add constraint lift_sets_duration_check check (duration_s is null or duration_s between 1 and 86400);
alter table public.lift_sets drop constraint if exists lift_sets_distance_check;
alter table public.lift_sets add constraint lift_sets_distance_check check (distance_m is null or (distance_m > 0 and distance_m <= 100000));
alter table public.lift_sets drop constraint if exists lift_sets_rpe_check;
alter table public.lift_sets add constraint lift_sets_rpe_check check (rpe is null or (rpe between 1 and 10 and rpe * 2 = round(rpe * 2)));
-- Every set measures something.
alter table public.lift_sets drop constraint if exists lift_sets_measured;
alter table public.lift_sets add constraint lift_sets_measured check (reps is not null or duration_s is not null or distance_m is not null);
-- Assisted: a negative load, only on a bodyweight set and never more than the bodyweight itself.
alter table public.lift_sets drop constraint if exists lift_sets_weight_check;
alter table public.lift_sets add constraint lift_sets_weight_check check (
  weight between -1000 and 2000 and (weight >= 0 or (count_bodyweight and weight + bodyweight >= 0)));

grant insert (duration_s, distance_m, rpe), update (duration_s, distance_m, rpe) on public.lift_sets to authenticated;

-- ---------------------------------------------------------------------------
-- Routine steps: time and distance targets.
-- ---------------------------------------------------------------------------
alter table public.lift_template_items alter column reps drop not null;
alter table public.lift_template_items add column if not exists duration_s integer;
alter table public.lift_template_items add column if not exists distance_m numeric(8,2);
alter table public.lift_template_items drop constraint if exists lift_template_items_duration_check;
alter table public.lift_template_items add constraint lift_template_items_duration_check check (duration_s is null or duration_s between 1 and 86400);
alter table public.lift_template_items drop constraint if exists lift_template_items_distance_check;
alter table public.lift_template_items add constraint lift_template_items_distance_check check (distance_m is null or (distance_m > 0 and distance_m <= 100000));
-- A step is a linked block, or it measures something.
alter table public.lift_template_items drop constraint if exists lift_template_items_measured;
alter table public.lift_template_items add constraint lift_template_items_measured check (
  block_id is not null or reps is not null or duration_s is not null or distance_m is not null);

grant insert (duration_s, distance_m), update (duration_s, distance_m) on public.lift_template_items to authenticated;

-- ---------------------------------------------------------------------------
-- Bests for sets without reps: longest time, farthest distance, heaviest load, per exercise.
-- Read-only for everyone; only the trigger writes. Units: 's' for time, 'm' for distance, and
-- 'lb' or 'kg' for load.
-- ---------------------------------------------------------------------------
create table if not exists public.lift_feat_rows (
  created_by  uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.lift_exercises (id),
  metric      text not null check (metric in ('time', 'distance', 'load')),
  unit        text not null check (unit in ('s', 'm', 'lb', 'kg')),
  best        numeric(10,2) not null,
  first_on    date not null,
  primary key (created_by, exercise_id, metric, unit)
);
alter table public.lift_feat_rows enable row level security;
drop policy if exists "feats: read" on public.lift_feat_rows;
create policy "feats: read" on public.lift_feat_rows for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
revoke all on public.lift_feat_rows from anon, authenticated;
grant select on public.lift_feat_rows to authenticated;

create or replace view public.lift_feats with (security_invoker = true) as
select exercise_id, metric, unit, best, first_on from public.lift_feat_rows;
revoke all on public.lift_feats from anon, authenticated;
grant select on public.lift_feats to authenticated;

-- One person's one exercise, worked out again from the sets.
create or replace function private.refresh_feats(p_user uuid, p_ex uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.lift_feat_rows where created_by = p_user and exercise_id = p_ex;
  insert into public.lift_feat_rows (created_by, exercise_id, metric, unit, best, first_on)
  select distinct on (metric, unit) p_user, p_ex, metric, unit, val, performed_on
  from (
    select 'time' metric, 's' unit, s.duration_s::numeric val, s.performed_on from public.lift_sets s
      where s.created_by = p_user and s.exercise_id = p_ex and s.reps is null and s.duration_s is not null and s.distance_m is null and s.deleted_at is null and s.is_warmup is not true
    union all
    select 'distance', 'm', s.distance_m, s.performed_on from public.lift_sets s
      where s.created_by = p_user and s.exercise_id = p_ex and s.reps is null and s.distance_m is not null and s.deleted_at is null and s.is_warmup is not true
    union all
    select 'load', s.unit, s.weight, s.performed_on from public.lift_sets s
      where s.created_by = p_user and s.exercise_id = p_ex and s.reps is null and s.weight > 0 and s.deleted_at is null and s.is_warmup is not true
  ) x
  order by metric, unit, val desc, performed_on;
end $$;
revoke all on function private.refresh_feats(uuid, uuid) from public, anon, authenticated;

-- A new set can only raise a best (or tie it on an earlier day).
create or replace function private.raise_feat(p_user uuid, p_ex uuid, p_metric text, p_unit text, p_val numeric, p_on date)
returns void language sql security definer set search_path = '' as $$
  insert into public.lift_feat_rows as r (created_by, exercise_id, metric, unit, best, first_on)
  values (p_user, p_ex, p_metric, p_unit, p_val, p_on)
  on conflict (created_by, exercise_id, metric, unit) do update
    set best = excluded.best, first_on = excluded.first_on
    where excluded.best > r.best or (excluded.best = r.best and excluded.first_on < r.first_on);
$$;
revoke all on function private.raise_feat(uuid, uuid, text, text, numeric, date) from public, anon, authenticated;

-- The bests trigger, now for both kinds of set. A set with reps keeps its rep best as before
-- (assisted sets included: less assistance is a higher, better load); one without goes to the feats.
create or replace function private.keep_bests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null and new.is_warmup is not true then
      if new.reps is not null then
        insert into public.lift_best_rows as r (created_by, exercise_id, unit, reps, heaviest, first_lifted_on)
        values (new.created_by, new.exercise_id, new.unit, new.reps, new.weight, new.performed_on)
        on conflict (created_by, exercise_id, unit, reps) do update
          set heaviest = excluded.heaviest, first_lifted_on = excluded.first_lifted_on
          where excluded.heaviest > r.heaviest or (excluded.heaviest = r.heaviest and excluded.first_lifted_on < r.first_lifted_on);
      else
        -- Time is the measure of a hold; on a carry it's just how long the distance took.
        if new.duration_s is not null and new.distance_m is null then perform private.raise_feat(new.created_by, new.exercise_id, 'time', 's', new.duration_s, new.performed_on); end if;
        if new.distance_m is not null then perform private.raise_feat(new.created_by, new.exercise_id, 'distance', 'm', new.distance_m, new.performed_on); end if;
        if new.weight > 0 then perform private.raise_feat(new.created_by, new.exercise_id, 'load', new.unit, new.weight, new.performed_on); end if;
      end if;
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and (old.created_by, old.exercise_id, old.unit, old.reps, old.weight, old.performed_on, old.deleted_at, old.is_warmup, old.duration_s, old.distance_m)
      is not distinct from (new.created_by, new.exercise_id, new.unit, new.reps, new.weight, new.performed_on, new.deleted_at, new.is_warmup, new.duration_s, new.distance_m) then
    return null;   -- a note, a time of day or the effort changed: no best moves
  end if;
  if old.reps is not null then perform private.refresh_best(old.created_by, old.exercise_id, old.unit, old.reps);
  else perform private.refresh_feats(old.created_by, old.exercise_id); end if;
  if tg_op = 'UPDATE' and (old.created_by, old.exercise_id, old.unit, old.reps) is distinct from (new.created_by, new.exercise_id, new.unit, new.reps) then
    if new.reps is not null then perform private.refresh_best(new.created_by, new.exercise_id, new.unit, new.reps);
    else perform private.refresh_feats(new.created_by, new.exercise_id); end if;
  end if;
  return null;
end $$;
revoke all on function private.keep_bests() from public, anon, authenticated;

-- Season bests list the heaviest set at a rep count: sets without reps aren't in it.
create or replace function public.season_bests(p_season uuid)
returns table (user_id uuid, display_name text, exercise_id uuid, best_weight numeric, reps int, unit text)
language sql stable security definer set search_path = ''
as $$
  with pp as (select * from private.season_people(p_season)),
  sets as (
    select x.* from public.lift_sets x join pp on pp.uid = x.created_by
    where x.deleted_at is null and x.is_warmup is not true and x.weight > 0 and x.reps is not null and x.performed_on between pp.starts_on and pp.ends_on
  ), planned as (
    select i.exercise_id from public.lift_season_plan p
    join private.routine_lifts() i on i.template_id = p.template_id
    where p.season_id = p_season and p.deleted_at is null
    union
    select g.exercise_id from public.lift_season_goals g where g.season_id = p_season and g.deleted_at is null and g.exercise_id is not null
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

-- Programs: a step can be timed or measured in distance too. Same checks as 27_program_doc_shape,
-- except the measures: reps (1–100), duration_s (1–86400) and distance_m (up to 100,000), at least one.
create or replace function private.program_doc_problem(d jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w jsonb; s jsonb; day jsonb; keys text[] := '{}'; k text;
begin
  if jsonb_typeof(d) <> 'object' then return 'not an object'; end if;
  if exists (select 1 from jsonb_object_keys(d) x where x not in ('v', 'kind', 'weeks', 'about', 'workouts', 'days')) then return 'unknown field'; end if;
  if coalesce(d->>'kind', '') <> 'program' then return 'kind must be program'; end if;
  if jsonb_typeof(d->'weeks') <> 'number' or (d->>'weeks')::numeric not between 1 and 52 then return 'weeks must be 1 to 52'; end if;
  if d ? 'about' and jsonb_typeof(d->'about') not in ('string', 'null') or char_length(coalesce(d->>'about', '')) > 200 then return 'about too long'; end if;
  if jsonb_typeof(d->'workouts') <> 'array' or jsonb_array_length(d->'workouts') not between 1 and 7 then return 'one to seven workouts'; end if;
  for w in select * from jsonb_array_elements(d->'workouts') loop
    if jsonb_typeof(w) <> 'object' or exists (select 1 from jsonb_object_keys(w) x where x not in ('key', 'name', 'steps')) then return 'bad workout'; end if;
    k := w->>'key';
    if k is null or k !~ '^[a-z0-9]{1,12}$' or k = any(keys) then return 'bad workout key'; end if;
    keys := keys || k;
    if char_length(btrim(coalesce(w->>'name', ''))) not between 1 and 60 then return 'workout name 1 to 60 characters'; end if;
    if jsonb_typeof(w->'steps') <> 'array' or jsonb_array_length(w->'steps') not between 1 and 30 then return 'one to thirty steps a workout'; end if;
    for s in select * from jsonb_array_elements(w->'steps') loop
      if jsonb_typeof(s) <> 'object' or exists (select 1 from jsonb_object_keys(s) x where x not in ('exercise_id', 'sets', 'reps', 'duration_s', 'distance_m', 'load_mode', 'load_value', 'unit', 'rest_s', 'note')) then return 'bad step'; end if;
      if coalesce(s->>'exercise_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists (select 1 from public.lift_exercises e where e.id = (s->>'exercise_id')::uuid) then return 'exercise not in the catalogue'; end if;
      if jsonb_typeof(s->'sets') <> 'number' or (s->>'sets')::numeric not between 1 and 20 or (s->>'sets')::numeric % 1 <> 0 then return 'sets must be a whole number, 1 to 20'; end if;
      if coalesce(jsonb_typeof(s->'reps'), 'null') = 'null' and coalesce(jsonb_typeof(s->'duration_s'), 'null') = 'null' and coalesce(jsonb_typeof(s->'distance_m'), 'null') = 'null' then return 'a step needs reps, a time or a distance'; end if;
      if coalesce(jsonb_typeof(s->'reps'), 'null') <> 'null' and (jsonb_typeof(s->'reps') <> 'number' or (s->>'reps')::numeric not between 1 and 100 or (s->>'reps')::numeric % 1 <> 0) then return 'reps must be a whole number, 1 to 100'; end if;
      if coalesce(jsonb_typeof(s->'duration_s'), 'null') <> 'null' and (jsonb_typeof(s->'duration_s') <> 'number' or (s->>'duration_s')::numeric not between 1 and 86400 or (s->>'duration_s')::numeric % 1 <> 0) then return 'bad time'; end if;
      if coalesce(jsonb_typeof(s->'distance_m'), 'null') <> 'null' and (jsonb_typeof(s->'distance_m') <> 'number' or (s->>'distance_m')::numeric <= 0 or (s->>'distance_m')::numeric > 100000) then return 'bad distance'; end if;
      if s ? 'load_mode' and jsonb_typeof(s->'load_mode') <> 'null' and s->>'load_mode' not in ('last', 'progress', 'percent_1rm') then return 'bad load mode'; end if;
      if s ? 'load_value' and jsonb_typeof(s->'load_value') not in ('number', 'null') or coalesce((s->>'load_value')::numeric, 0) not between 0 and 2000 then return 'bad load value'; end if;
      if s ? 'unit' and jsonb_typeof(s->'unit') <> 'null' and s->>'unit' not in ('lb', 'kg') then return 'bad unit'; end if;
      if s ? 'rest_s' and jsonb_typeof(s->'rest_s') not in ('number', 'null') or coalesce((s->>'rest_s')::numeric, 0) not between 0 and 900 then return 'bad rest'; end if;
      if s ? 'note' and jsonb_typeof(s->'note') not in ('string', 'null') or char_length(coalesce(s->>'note', '')) > 200 then return 'step note too long'; end if;
    end loop;
  end loop;
  if jsonb_typeof(d->'days') <> 'array' or jsonb_array_length(d->'days') > 7 then return 'days must be a list of up to seven'; end if;
  for day in select * from jsonb_array_elements(d->'days') loop
    if jsonb_typeof(day) <> 'array' or jsonb_array_length(day) <> 2 or jsonb_typeof(day->0) <> 'number'
      or (day->>0)::numeric not in (0, 1, 2, 3, 4, 5, 6) or not ((day->>1) = any(keys)) then return 'bad day'; end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.program_doc_problem(jsonb) from public, anon, authenticated;
