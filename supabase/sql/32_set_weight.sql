-- 32_set_weight.sql
-- To be applied as migration 32_set_weight.
--
-- Brings back a set weight on a workout step ("Bench 185"), as load_mode 'fixed'.
-- 18_per_person_weights took the old fixed weights out because a shared routine
-- with one person's numbers is wrong for everyone else. The app keeps that rule:
-- a set weight only applies to the person whose routine it is. Anyone else
-- following, subscribing or copying it gets their own last weight, and shared
-- programs never carry one (27_program_doc_shape still refuses 'fixed').
--
-- load_value is the weight in the step's unit, 0 to 2000 (0 = bodyweight only).

alter table public.lift_template_items drop constraint if exists lift_template_items_load_mode_check;
alter table public.lift_template_items add constraint lift_template_items_load_mode_check
  check (load_mode in ('last', 'progress', 'percent_1rm', 'fixed'));

alter table public.lift_template_items drop constraint if exists lift_template_load;
alter table public.lift_template_items add constraint lift_template_load check (
     (load_mode = 'last'        and load_value = 0)
  or (load_mode = 'progress'    and load_value > 0 and load_value <= 50)
  or (load_mode = 'percent_1rm' and load_value >= 1 and load_value <= 150)
  or (load_mode = 'fixed'       and load_value >= 0 and load_value <= 2000));
