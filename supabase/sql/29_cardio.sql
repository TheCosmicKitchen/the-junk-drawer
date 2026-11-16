-- 29_cardio.sql
-- Applied as migration 29_cardio.
--
-- Minimal cardio logging. Cardio activities live in the exercise catalogue, marked kind = 'cardio'
-- (every existing exercise is 'strength'), so an entry always points at a catalogue row, never free
-- text. Each entry is one row: which activity, the day, minutes, and an optional distance. Your own
-- rows only, rate-limited and capped like everything else. A finished entry can post to the feed
-- as a 'cardio' win.
alter table public.lift_exercises
  add column if not exists kind text not null default 'strength' check (kind in ('strength', 'cardio'));

insert into public.lift_exercises (name, kind, created_by)
select n, 'cardio', null
from unnest(array['Walk', 'Run', 'Rowing machine', 'Bike', 'Elliptical', 'Stair climber', 'Swim']) as n
where not exists (select 1 from public.lift_exercises e where e.kind = 'cardio' and e.name = n and e.deleted_at is null);

create table if not exists public.lift_cardio (
  id             uuid primary key default gen_random_uuid(),
  exercise_id    uuid not null references public.lift_exercises (id),
  performed_on   date not null default current_date,
  minutes        numeric(5,1) not null check (minutes > 0 and minutes <= 600),
  distance       numeric(6,2) check (distance is null or (distance > 0 and distance <= 500)),
  distance_unit  text check (distance_unit is null or distance_unit in ('km', 'mi')),
  note           text check (note is null or char_length(note) <= 200),
  created_by     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_by     uuid,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  check ((distance is null) = (distance_unit is null))
);
create index if not exists lift_cardio_owner_day on public.lift_cardio (created_by, performed_on);
alter table public.lift_cardio enable row level security;

drop policy if exists "cardio: read" on public.lift_cardio;
drop policy if exists "cardio: add" on public.lift_cardio;
drop policy if exists "cardio: change" on public.lift_cardio;
create policy "cardio: read" on public.lift_cardio for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
-- New entries: a cardio activity from the catalogue, dated from a week back to tomorrow.
create policy "cardio: add" on public.lift_cardio for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and performed_on between current_date - 7 and current_date + 1
    and exists (select 1 from public.lift_exercises e where e.id = exercise_id and e.kind = 'cardio' and e.deleted_at is null));
create policy "cardio: change" on public.lift_cardio for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and performed_on <= current_date + 1
    and exists (select 1 from public.lift_exercises e where e.id = exercise_id and e.kind = 'cardio'));
revoke all on public.lift_cardio from anon, authenticated;
grant select on public.lift_cardio to authenticated;
grant insert (id, exercise_id, performed_on, minutes, distance, distance_unit, note) on public.lift_cardio to authenticated;
grant update (exercise_id, performed_on, minutes, distance, distance_unit, note, deleted_at) on public.lift_cardio to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows) values ('lift_cardio', 30, 200, 5000)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_cardio');

-- Cardio entries can post to the feed.
alter table public.lift_posts drop constraint if exists lift_posts_kind_check;
alter table public.lift_posts add constraint lift_posts_kind_check
  check (kind in ('session', 'pr', 'club', 'goal', 'record', 'quest', 'stamp', 'cardio'));
