-- 31_supersets_linked_blocks.sql
-- Applied as migration 31_supersets_linked_blocks.
--
-- Two additions to workout steps:
--
-- 1. Supersets. with_next = true pairs a step with the one after it, so a run of paired steps is
--    done back and forth (A1, A2, A1, A2...).
--
-- 2. Linked blocks. A step can point at a block (block_id) instead of an exercise. The app draws
--    the block's steps in its place, so changing the block changes every workout that uses it.
--    Rules, checked here and not just in the app:
--      - a step is either an exercise or a block, never both or neither;
--      - only a workout can link a block (a block can't contain blocks, so no loops);
--      - the block must be a block you can see: your own, or one the crew shares.
--    Steps that link a block keep the usual caps (100 per routine, 2000 live steps per person).

alter table public.lift_template_items add column if not exists with_next boolean not null default false;
alter table public.lift_template_items add column if not exists block_id uuid references public.lift_templates (id);
alter table public.lift_template_items alter column exercise_id drop not null;

alter table public.lift_template_items drop constraint if exists lift_template_items_step_kind;
alter table public.lift_template_items add constraint lift_template_items_step_kind
  check ((exercise_id is null) <> (block_id is null));
alter table public.lift_template_items drop constraint if exists lift_template_items_not_self;
alter table public.lift_template_items add constraint lift_template_items_not_self
  check (block_id is null or block_id <> template_id);

create index if not exists lift_template_items_block on public.lift_template_items (block_id) where block_id is not null;

-- Can this person link that block into that routine?
create or replace function private.can_link_block(p_template uuid, p_block uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.lift_templates w
                 where w.id = p_template and w.kind = 'workout' and w.deleted_at is null)
     and exists (select 1 from public.lift_templates b
                 where b.id = p_block and b.kind = 'block' and b.deleted_at is null
                   and (b.created_by = (select auth.uid()) or b.is_shared));
$$;
revoke all on function private.can_link_block(uuid, uuid) from public;
grant execute on function private.can_link_block(uuid, uuid) to authenticated;

drop policy if exists "own items: add" on public.lift_template_items;
create policy "own items: add" on public.lift_template_items
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_templates t where t.id = template_id and t.created_by = (select auth.uid()))
    and (
      (exercise_id is not null and exists (select 1 from public.lift_exercises e where e.id = exercise_id and e.deleted_at is null))
      or (block_id is not null and private.can_link_block(template_id, block_id))
    ));

drop policy if exists "own items: change" on public.lift_template_items;
create policy "own items: change" on public.lift_template_items
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_templates t where t.id = template_id and t.created_by = (select auth.uid()))
    and (block_id is null or private.can_link_block(template_id, block_id)));

grant insert (id, template_id, exercise_id, block_id, position, sets, reps, load_mode, load_value, unit, rest_s, note, with_next) on public.lift_template_items to authenticated;
grant update (exercise_id, position, sets, reps, load_mode, load_value, unit, rest_s, note, with_next, deleted_at)       on public.lift_template_items to authenticated;

-- Season head-to-heads and bests count the lifts inside linked blocks too.
create or replace function private.routine_lifts()
returns table (template_id uuid, exercise_id uuid)
language sql stable security definer set search_path = ''
as $$
  select i.template_id, i.exercise_id from public.lift_template_items i
  where i.deleted_at is null and i.exercise_id is not null
  union
  select r.template_id, b.exercise_id from public.lift_template_items r
  join public.lift_template_items b on b.template_id = r.block_id and b.deleted_at is null and b.exercise_id is not null
  where r.deleted_at is null and r.block_id is not null;
$$;
revoke all on function private.routine_lifts() from public;

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
    select distinct i.template_id, i.exercise_id from private.routine_lifts() i join plan using (template_id)
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
