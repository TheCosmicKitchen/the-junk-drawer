-- 36_last_days.sql
-- To be applied as migration 36_last_days.
--
-- "Last time" without a wait. The phone keeps your last 120 days of sets. For a lift you last did
-- before that, opening it used to ask the server for that one lift: two round trips (the browser's
-- permission check, then the query) every time, and the same two to learn you've never done a lift.
-- Now the app asks once, at startup, for every lift's most recent day before the 120 days, so
-- opening any lift has its last time already.
--
-- Runs as the caller (security invoker), so row-level security on lift_sets applies: you only ever
-- get your own sets, and only as a member. Read-only.
create or replace function public.last_days_before(p_before date)
returns setof public.lift_sets
language sql
stable
security invoker
set search_path = ''
as $$
  select s.*
  from public.lift_sets s
  join (select exercise_id, max(performed_on) as d
          from public.lift_sets
         where deleted_at is null and performed_on < p_before
         group by exercise_id) m
    on m.exercise_id = s.exercise_id and m.d = s.performed_on
  where s.deleted_at is null
  order by s.exercise_id, s.logged_at;
$$;
revoke all on function public.last_days_before(date) from public, anon;
grant execute on function public.last_days_before(date) to authenticated;
