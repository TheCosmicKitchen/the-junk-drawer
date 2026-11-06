-- 17_season_daily.sql
-- Applied as migration 17_season_daily.
--
-- Day-by-day totals for everyone in a season, for the season's race chart and weekly bars:
-- sets and volume per person per day, inside the season's dates. Same audience as
-- season_standings (the owner and everyone who joined, members only), and still totals only:
-- no exercises, weights or reps leave the database.

create or replace function public.season_daily(p_season uuid)
returns table (user_id uuid, display_name text, performed_on date, sets bigint, volume_lb numeric, volume_kg numeric)
language sql stable security definer set search_path = ''
as $$
  select pp.uid, pp.display_name, x.performed_on, count(*),
         coalesce(sum((x.weight + case when x.count_bodyweight then x.bodyweight else 0 end) * x.reps) filter (where x.unit = 'lb'), 0),
         coalesce(sum((x.weight + case when x.count_bodyweight then x.bodyweight else 0 end) * x.reps) filter (where x.unit = 'kg'), 0)
  from private.season_people(p_season) pp
  join public.lift_sets x on x.created_by = pp.uid and x.deleted_at is null and x.is_warmup is not true
       and x.performed_on between pp.starts_on and pp.ends_on
  group by pp.uid, pp.display_name, x.performed_on;
$$;
revoke all on function public.season_daily(uuid) from public, anon;
grant execute on function public.season_daily(uuid) to authenticated;
