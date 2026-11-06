-- 18_per_person_weights.sql
-- Applied as migration 18_per_person_weights.
--
-- Routines and blocks stop storing weights. A step is exercise, sets, reps, optional rest and an
-- optional note, plus a weight RULE that each person applies to their own history when they log:
--   last         same as your last working weight for that lift (adjusted through your estimated
--                1-rep max when the rep count differs). load_value is 0.
--   progress     like last, plus load_value (e.g. 5 lb) when you hit every rep last time.
--   percent_1rm  load_value percent of your best estimated 1-rep max (already per person).
-- Every old "fixed" step becomes "last": the weight it stored was its author's, which is exactly
-- what the author's own lookup now returns, and everyone else gets their own.

alter table public.lift_template_items drop constraint if exists lift_template_load;
alter table public.lift_template_items drop constraint if exists lift_template_items_load_mode_check;

update public.lift_template_items set load_mode = 'last', load_value = 0 where load_mode = 'fixed';

alter table public.lift_template_items alter column load_mode set default 'last';
alter table public.lift_template_items alter column load_value set default 0;
alter table public.lift_template_items add constraint lift_template_items_load_mode_check check (load_mode in ('last', 'progress', 'percent_1rm'));
alter table public.lift_template_items add constraint lift_template_load check (
     (load_mode = 'last'        and load_value = 0)
  or (load_mode = 'progress'    and load_value > 0 and load_value <= 50)
  or (load_mode = 'percent_1rm' and load_value >= 1 and load_value <= 150));

alter table public.lift_template_items add column if not exists note text;
alter table public.lift_template_items drop constraint if exists lift_template_items_note_check;
alter table public.lift_template_items add constraint lift_template_items_note_check check (note is null or char_length(note) <= 200);

grant insert (id, template_id, exercise_id, position, sets, reps, load_mode, load_value, unit, rest_s, note) on public.lift_template_items to authenticated;
grant update (exercise_id, position, sets, reps, load_mode, load_value, unit, rest_s, note, deleted_at)     on public.lift_template_items to authenticated;
