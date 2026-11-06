-- 14_catalog_cleanup_and_rest.sql
-- Applied as migrations 13_exercise_merges and 14_step_rest (plus a one-off data step).
--
-- 1. Exercise cleanup (data, run once, already applied): 249 spreadsheet spellings were merged
--    into 90 lifts ("Bench", "Benchpress", "Bench Press 145lbs" -> "Bench Press"). Old names are
--    kept as search aliases; rows named "... warm up" became warm-up sets of the real lift.
--    Every merge is logged in private.exercise_merges (old id/name, new id/name, and the set ids
--    that were turned into warm-ups), so any one can be undone by pointing those sets back.
--    The merge list lives with the import tooling, not in this public repo.
-- 2. TheLift's exercise names were added as aliases, and 10 lifts its starters use were added.
-- 3. Routine steps get an optional rest time, used by the rest timer.

create table if not exists private.exercise_merges (
  id bigint generated always as identity primary key,
  old_id uuid not null, old_name text not null, new_id uuid not null, new_name text not null,
  warmup_set_ids uuid[] not null default '{}', merged_at timestamptz not null default now()
);
alter table private.exercise_merges enable row level security;
revoke all on private.exercise_merges from public, anon, authenticated;

alter table public.lift_template_items add column if not exists rest_s smallint;
alter table public.lift_template_items drop constraint if exists lift_template_items_rest_check;
alter table public.lift_template_items add constraint lift_template_items_rest_check check (rest_s is null or rest_s between 0 and 900);
grant insert (id, template_id, exercise_id, position, sets, reps, load_mode, load_value, unit, rest_s) on public.lift_template_items to authenticated;
grant update (exercise_id, position, sets, reps, load_mode, load_value, unit, rest_s, deleted_at) on public.lift_template_items to authenticated;
