-- 15_season_achievements.sql
-- Applied as migration 15_season_achievements.
--
-- Season goals ("achievements") get two more kinds and become something anyone in a season can add:
--   visits   show up N times                       (unit null)
--   volume   move N lb / kg                        (unit set)
--   lift     lift N lb / kg on one exercise        (exercise_id + unit set)
--   workout  do one workout N times                (template_id set; a day counts when it covers
--                                                   at least half of the workout's exercises)
-- A goal written by the season's owner is a season goal that applies to everyone in it. A goal written
-- by someone who joined is their own; everyone in the season can see it. Only the writer changes it.
-- The head-to-head now also compares goal lifts and goal workouts, not only the planned ones.

alter table public.lift_season_goals add column if not exists exercise_id uuid references public.lift_exercises (id);
alter table public.lift_season_goals add column if not exists template_id uuid references public.lift_templates (id) on delete cascade;
create index if not exists lift_season_goals_exercise on public.lift_season_goals (exercise_id);
create index if not exists lift_season_goals_template on public.lift_season_goals (template_id);

alter table public.lift_season_goals drop constraint if exists lift_season_goals_metric_check;
alter table public.lift_season_goals add constraint lift_season_goals_metric_check check (metric in ('visits', 'volume', 'lift', 'workout'));
alter table public.lift_season_goals drop constraint if exists lift_goals_unit;
alter table public.lift_season_goals add constraint lift_goals_unit check (
     (metric = 'visits'  and unit is null     and exercise_id is null     and template_id is null)
  or (metric = 'volume'  and unit is not null and exercise_id is null     and template_id is null)
  or (metric = 'lift'    and unit is not null and exercise_id is not null and template_id is null)
  or (metric = 'workout' and unit is null     and exercise_id is null     and template_id is not null));

drop policy if exists "own goals: add" on public.lift_season_goals;
create policy "own goals: add" on public.lift_season_goals
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_seasons s where s.id = season_id and s.deleted_at is null
                and (s.created_by = (select auth.uid())
                     or (s.is_shared and exists (select 1 from public.lift_season_subscriptions sub
                                                 where sub.season_id = s.id and sub.created_by = (select auth.uid()) and sub.deleted_at is null))))
    and (template_id is null or exists (select 1 from public.lift_templates t where t.id = template_id and t.deleted_at is null
                                        and (t.created_by = (select auth.uid()) or t.is_shared))));
drop policy if exists "own goals: change" on public.lift_season_goals;
create policy "own goals: change" on public.lift_season_goals
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));

grant insert (id, season_id, name, metric, target, unit, exercise_id, template_id) on public.lift_season_goals to authenticated;

-- Head-to-head: include goal workouts and goal lifts.
create or replace function public.season_workouts(p_season uuid)
returns table (user_id uuid, display_name text, template_id uuid, times bigint)
language sql stable security definer set search_path = ''
as $$
  with pp as (select * from private.season_people(p_season)),
  plan as (
    select p.template_id from public.lift_season_plan p where p.season_id = p_season and p.deleted_at is null
    union
    select g.template_id from public.lift_season_goals g where g.season_id = p_season and g.deleted_at is null and g.template_id is not null
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

create or replace function public.season_bests(p_season uuid)
returns table (user_id uuid, display_name text, exercise_id uuid, best_weight numeric, reps int, unit text)
language sql stable security definer set search_path = ''
as $$
  with pp as (select * from private.season_people(p_season)),
  sets as (
    select x.* from public.lift_sets x join pp on pp.uid = x.created_by
    where x.deleted_at is null and x.is_warmup is not true and x.weight > 0 and x.performed_on between pp.starts_on and pp.ends_on
  ), planned as (
    select i.exercise_id from public.lift_season_plan p
    join public.lift_template_items i on i.template_id = p.template_id and i.deleted_at is null
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
