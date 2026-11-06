-- 12_season_plan.sql
-- Applied as migration 11_season_plan.
--
-- A season can be planned around routines: an ordered list of routines, each optionally
-- pinned to days of the week. The app uses it to suggest today's routine. Only the season's
-- owner edits the plan; anyone who can see the season (owner, or members when it's shared)
-- can read it. A plan entry can only point at a routine the owner can see (their own or a
-- shared one), so a plan can't be used to peek at someone's private routine.

create table if not exists public.lift_season_plan (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.lift_seasons (id) on delete cascade,
  template_id  uuid not null references public.lift_templates (id) on delete cascade,
  position     int  not null default 1 check (position between 1 and 100),
  weekdays     smallint not null default 0 check (weekdays between 0 and 127),  -- bit 0 = Sunday … bit 6 = Saturday; 0 = in rotation
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists lift_season_plan_season   on public.lift_season_plan (season_id);
create index if not exists lift_season_plan_template on public.lift_season_plan (template_id);
create index if not exists lift_season_plan_owner    on public.lift_season_plan (created_by);
alter table public.lift_season_plan enable row level security;

drop policy if exists "plan: read"   on public.lift_season_plan;
drop policy if exists "plan: add"    on public.lift_season_plan;
drop policy if exists "plan: change" on public.lift_season_plan;
create policy "plan: read" on public.lift_season_plan
  for select to authenticated
  using ((select private.is_member()) and (
    created_by = (select auth.uid())
    or exists (select 1 from public.lift_seasons s where s.id = season_id and s.is_shared and s.deleted_at is null)));
create policy "plan: add" on public.lift_season_plan
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_seasons s where s.id = season_id and s.created_by = (select auth.uid()) and s.deleted_at is null)
    and exists (select 1 from public.lift_templates t where t.id = template_id and t.deleted_at is null
                and (t.created_by = (select auth.uid()) or t.is_shared)));
create policy "plan: change" on public.lift_season_plan
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));

revoke all on public.lift_season_plan from anon, authenticated;
grant select on public.lift_season_plan to authenticated;
grant insert (id, season_id, template_id, position, weekdays) on public.lift_season_plan to authenticated;
grant update (position, weekdays, deleted_at)                 on public.lift_season_plan to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows)
values ('lift_season_plan', 30, 200, 300)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_season_plan');
