-- 35_plans.sql
-- To be applied as migration 35_plans.
--
-- Plans: a program you design week by week, and following one week by week.
--
-- 1. Plan documents. A plan lives in lift_programs like the older programs (same sharing, limits
--    and audit), as a version 2 document. Version 1 (one repeating week of copied workouts) keeps
--    working untouched. A version 2 plan points at routines instead of copying them:
--      v: 2, kind: 'plan', weeks: 1–16, about,
--      workouts:    [{ key, template_id }]            routines it uses (yours, or shared), up to 10
--      schedule:    'days' | 'order'
--      cells:       [[week, weekday, key], ...]      'days': what's on each day of each week
--      order:       [key, ...], per_week: 1–7        'order': workouts take turns, so many a week
--      phases:      [{ name, from, to, kind }]       kind: build, push, peak or deload; up to 8
--      progression: [{ exercise_id, pct: [...] }]    a lift's % of best, one per week; up to 8 lifts
--    The trigger also checks every routine it points at is a live workout its author can see.
--
-- 2. Plan runs: who is following which plan since when (one at a time per person). The week you're
--    in is counted from starts_on. Your own rows only; ending a run keeps it for history.

-- ---------------------------------------------------------------------------
-- Plan documents
-- ---------------------------------------------------------------------------
create or replace function private.plan_doc_problem(d jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w jsonb; c jsonb; p jsonb; pr jsonb; keys text[] := '{}'; k text; weeks int; n int;
begin
  if exists (select 1 from jsonb_object_keys(d) x where x not in ('v', 'kind', 'weeks', 'about', 'workouts', 'schedule', 'cells', 'order', 'per_week', 'phases', 'progression')) then return 'unknown field'; end if;
  if coalesce(d->>'kind', '') <> 'plan' then return 'kind must be plan'; end if;
  if jsonb_typeof(d->'weeks') <> 'number' or (d->>'weeks')::numeric not between 1 and 16 or (d->>'weeks')::numeric % 1 <> 0 then return 'weeks must be 1 to 16'; end if;
  weeks := (d->>'weeks')::int;
  if d ? 'about' and jsonb_typeof(d->'about') not in ('string', 'null') or char_length(coalesce(d->>'about', '')) > 200 then return 'about too long'; end if;
  if jsonb_typeof(d->'workouts') <> 'array' or jsonb_array_length(d->'workouts') not between 1 and 10 then return 'one to ten workouts'; end if;
  for w in select * from jsonb_array_elements(d->'workouts') loop
    if jsonb_typeof(w) <> 'object' or exists (select 1 from jsonb_object_keys(w) x where x not in ('key', 'template_id')) then return 'bad workout'; end if;
    k := w->>'key';
    if k is null or k !~ '^[a-z0-9]{1,12}$' or k = any(keys) then return 'bad workout key'; end if;
    keys := keys || k;
    if coalesce(w->>'template_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'bad routine'; end if;
  end loop;
  if coalesce(d->>'schedule', '') not in ('days', 'order') then return 'schedule must be days or order'; end if;
  if d->>'schedule' = 'days' then
    if jsonb_typeof(d->'cells') <> 'array' or jsonb_array_length(d->'cells') not between 1 and 112 then return 'put at least one workout on a day'; end if;
    for c in select * from jsonb_array_elements(d->'cells') loop
      if jsonb_typeof(c) <> 'array' or jsonb_array_length(c) <> 3 or jsonb_typeof(c->0) <> 'number' or jsonb_typeof(c->1) <> 'number'
        or (c->>0)::numeric not between 1 and weeks or (c->>0)::numeric % 1 <> 0 or (c->>1)::numeric not in (0, 1, 2, 3, 4, 5, 6)
        or not ((c->>2) = any(keys)) then return 'bad day'; end if;
    end loop;
  else
    if jsonb_typeof(d->'order') <> 'array' or jsonb_array_length(d->'order') not between 1 and 10 then return 'list the workouts in order'; end if;
    if exists (select 1 from jsonb_array_elements_text(d->'order') o where not (o = any(keys))) then return 'bad order'; end if;
    if jsonb_typeof(d->'per_week') <> 'number' or (d->>'per_week')::numeric not between 1 and 7 or (d->>'per_week')::numeric % 1 <> 0 then return 'per week must be 1 to 7'; end if;
  end if;
  if d ? 'phases' then
    if jsonb_typeof(d->'phases') <> 'array' or jsonb_array_length(d->'phases') > 8 then return 'up to eight phases'; end if;
    for p in select * from jsonb_array_elements(d->'phases') loop
      if jsonb_typeof(p) <> 'object' or exists (select 1 from jsonb_object_keys(p) x where x not in ('name', 'from', 'to', 'kind')) then return 'bad phase'; end if;
      if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 20 then return 'phase name 1 to 20 characters'; end if;
      if coalesce(p->>'kind', '') not in ('build', 'push', 'peak', 'deload') then return 'bad phase kind'; end if;
      if jsonb_typeof(p->'from') <> 'number' or jsonb_typeof(p->'to') <> 'number' or (p->>'from')::numeric not between 1 and weeks
        or (p->>'to')::numeric not between (p->>'from')::numeric and weeks then return 'bad phase weeks'; end if;
    end loop;
  end if;
  if d ? 'progression' then
    if jsonb_typeof(d->'progression') <> 'array' or jsonb_array_length(d->'progression') > 8 then return 'up to eight lifts with a progression'; end if;
    for pr in select * from jsonb_array_elements(d->'progression') loop
      if jsonb_typeof(pr) <> 'object' or exists (select 1 from jsonb_object_keys(pr) x where x not in ('exercise_id', 'pct')) then return 'bad progression'; end if;
      if coalesce(pr->>'exercise_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists (select 1 from public.lift_exercises e where e.id = (pr->>'exercise_id')::uuid) then return 'progression lift not in the catalogue'; end if;
      if jsonb_typeof(pr->'pct') <> 'array' or jsonb_array_length(pr->'pct') <> weeks then return 'one % for each week'; end if;
      select count(*) into n from jsonb_array_elements(pr->'pct') v where jsonb_typeof(v) <> 'number' or v::text::numeric not between 30 and 110;
      if n > 0 then return 'each % must be 30 to 110'; end if;
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.plan_doc_problem(jsonb) from public, anon, authenticated;

-- Version 2 documents are plans; anything else is checked as before.
create or replace function private.check_program_doc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare why text;
begin
  if new.doc->>'v' = '2' then
    why := private.plan_doc_problem(new.doc);
    -- Every routine it points at: a live workout that its author owns, or one shared with the crew.
    if why is null and exists (
      select 1 from jsonb_array_elements(new.doc->'workouts') w
      where not exists (select 1 from public.lift_templates t where t.id = (w->>'template_id')::uuid and t.deleted_at is null
                          and t.kind = 'workout' and (t.created_by = new.created_by or t.is_shared))) then
      why := 'a workout it uses is gone or not shared';
    end if;
  else
    why := private.program_doc_problem(new.doc);
  end if;
  if why is not null then raise exception 'That plan can''t be saved: %', why using errcode = 'check_violation'; end if;
  return new;
end;
$$;
revoke all on function private.check_program_doc() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Plan runs
-- ---------------------------------------------------------------------------
create table if not exists public.lift_plan_runs (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.lift_programs (id),
  starts_on   date not null,
  ended_on    date,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (ended_on is null or ended_on >= starts_on)
);
-- One plan at a time.
create unique index if not exists lift_plan_runs_one_live on public.lift_plan_runs (created_by) where ended_on is null and deleted_at is null;
create index if not exists lift_plan_runs_program on public.lift_plan_runs (program_id);
alter table public.lift_plan_runs enable row level security;

drop policy if exists "plan runs: read" on public.lift_plan_runs;
drop policy if exists "plan runs: add" on public.lift_plan_runs;
drop policy if exists "plan runs: change" on public.lift_plan_runs;
create policy "plan runs: read" on public.lift_plan_runs for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
-- Start a plan you can see (yours, or shared), from eight weeks back to two months ahead.
create policy "plan runs: add" on public.lift_plan_runs for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and starts_on between current_date - 56 and current_date + 60
    and exists (select 1 from public.lift_programs p where p.id = program_id and p.deleted_at is null
                and p.doc->>'v' = '2' and (p.created_by = (select auth.uid()) or p.is_shared)));
create policy "plan runs: change" on public.lift_plan_runs for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()) and starts_on between current_date - 400 and current_date + 60);
revoke all on public.lift_plan_runs from anon, authenticated;
grant select on public.lift_plan_runs to authenticated;
grant insert (id, program_id, starts_on) on public.lift_plan_runs to authenticated;
grant update (starts_on, ended_on, deleted_at) on public.lift_plan_runs to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows) values ('lift_plan_runs', 20, 100, 200)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_plan_runs');
