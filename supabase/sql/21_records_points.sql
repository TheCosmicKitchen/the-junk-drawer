-- 21_records_points.sql
-- Applied as migration 21_records_points.
--
-- 1. Crew records: for every lift, who holds the crew's best estimated 1-rep max (Epley, sets of
--    12 reps or fewer, kg counted as lb) and with which set. Members only; best sets only, the
--    same level of detail seasons already share.
-- 2. Season points: a season can be scored in points instead of pounds, e.g.
--    {"day": 1, "pr": 3, "workout": 5}: per gym day, per PR set in the season, per planned workout
--    done. season_prs() counts each person's PRs inside a season (a rep count's best beaten).
-- 3. Two more kinds of wins in the stream: a crew record changing hands, and a weekly quest done.

create or replace function public.crew_records()
returns table (exercise_id uuid, user_id uuid, display_name text, weight numeric, reps int, unit text, e1rm_lb numeric, performed_on date, lifters bigint)
language sql stable security definer set search_path = ''
as $$
  with sets as (
    select x.exercise_id, x.created_by, m.display_name, x.weight, x.reps, x.unit, x.performed_on,
           x.weight * (1 + x.reps / 30.0) * (case when x.unit = 'kg' then 2.20462262 else 1 end) as e1
    from public.lift_sets x
    join private.members m on m.user_id = x.created_by and m.active
    where private.is_member() and x.deleted_at is null and x.is_warmup is not true and x.weight > 0 and x.reps between 1 and 12
  ), lifters as (
    select exercise_id, count(distinct created_by) n from sets group by 1
  ), ranked as (
    select s.*, l.n, row_number() over (partition by s.exercise_id order by s.e1 desc, s.performed_on) rn
    from sets s join lifters l using (exercise_id)
  )
  select exercise_id, created_by, display_name, weight, reps, unit, round(e1, 1), performed_on, n from ranked where rn = 1;
$$;
revoke all on function public.crew_records() from public, anon;
grant execute on function public.crew_records() to authenticated;

alter table public.lift_seasons add column if not exists points jsonb;
alter table public.lift_seasons drop constraint if exists lift_seasons_points_check;
alter table public.lift_seasons add constraint lift_seasons_points_check check (
  points is null or (jsonb_typeof(points) = 'object' and pg_column_size(points) <= 200));
grant insert (id, name, starts_on, ends_on, is_shared, points)         on public.lift_seasons to authenticated;
grant update (name, starts_on, ends_on, is_shared, points, deleted_at) on public.lift_seasons to authenticated;

create or replace function public.season_prs(p_season uuid)
returns table (user_id uuid, prs bigint)
language sql stable security definer set search_path = ''
as $$
  with pp as (select * from private.season_people(p_season)),
  best as (
    select x.created_by uid, x.exercise_id, x.unit, x.reps,
           max(x.weight) filter (where x.performed_on < pp.starts_on) before_w,
           max(x.weight) filter (where x.performed_on between pp.starts_on and pp.ends_on) during_w
    from public.lift_sets x join pp on pp.uid = x.created_by
    where x.deleted_at is null and x.is_warmup is not true and x.performed_on <= pp.ends_on
    group by 1, 2, 3, 4
  )
  select pp.uid, (select count(*) from best b where b.uid = pp.uid and b.before_w is not null and b.during_w > b.before_w)
  from pp;
$$;
revoke all on function public.season_prs(uuid) from public, anon;
grant execute on function public.season_prs(uuid) to authenticated;

alter table public.lift_posts drop constraint if exists lift_posts_kind_check;
alter table public.lift_posts add constraint lift_posts_kind_check check (kind in ('session', 'pr', 'club', 'goal', 'record', 'quest'));
