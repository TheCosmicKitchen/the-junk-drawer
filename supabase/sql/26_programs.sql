-- 26_programs.sql
-- Applied as migration 26_programs.
--
-- Programs anyone in the crew designs in the app: one row per program, the whole program kept as
-- a document (its weeks, a short note, its workouts as exercise snapshots, and which day each one
-- goes on). Yours to change; the crew can read it once you share it, and anyone can add a shared
-- program to their own week (that copies its workouts into their routines; this row never changes).
-- Rate limits and row caps apply like everywhere else.
create table if not exists public.lift_programs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  doc         jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) <= 32000),
  is_shared   boolean not null default false,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists lift_programs_owner on public.lift_programs (created_by);
alter table public.lift_programs enable row level security;

drop policy if exists "programs: read" on public.lift_programs;
drop policy if exists "programs: add" on public.lift_programs;
drop policy if exists "programs: change" on public.lift_programs;
create policy "programs: read" on public.lift_programs for select to authenticated
  using ((select private.is_member()) and (created_by = (select auth.uid()) or (is_shared and deleted_at is null)));
create policy "programs: add" on public.lift_programs for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid()));
create policy "programs: change" on public.lift_programs for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));
revoke all on public.lift_programs from anon, authenticated;
grant select on public.lift_programs to authenticated;
grant insert (id, name, doc, is_shared)          on public.lift_programs to authenticated;
grant update (name, doc, is_shared, deleted_at)  on public.lift_programs to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows) values ('lift_programs', 20, 200, 500)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_programs');
