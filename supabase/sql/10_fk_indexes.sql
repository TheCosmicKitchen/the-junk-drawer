-- 10_fk_indexes.sql
-- Applied as migration 09_fk_indexes. Indexes for the foreign keys the app actually
-- follows (flagged by Supabase's performance advisor). Harmless to re-run.
create index if not exists lift_sets_exercise           on public.lift_sets (exercise_id);
create index if not exists lift_season_goals_season     on public.lift_season_goals (season_id);
create index if not exists lift_template_items_exercise on public.lift_template_items (exercise_id);
