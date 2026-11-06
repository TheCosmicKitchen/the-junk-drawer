-- 11_shared_seasons.sql
-- Applied as migration 10_shared_seasons.
--
-- Seasons can be shared. The other member can join one: it shows in their seasons with
-- the owner's goals, measured against their OWN sets. season_standings() returns totals
-- (never sets) for the owner and everyone who joined, to members only.

alter table public.lift_seasons add column if not exists is_shared boolean not null default false;

drop policy if exists "own: read" on public.lift_seasons;
drop policy if exists "seasons: read" on public.lift_seasons;
create policy "seasons: read" on public.lift_seasons
  for select to authenticated
  using ((select private.is_member()) and (
    created_by = (select auth.uid()) or (is_shared and deleted_at is null)));

drop policy if exists "own goals: read" on public.lift_season_goals;
drop policy if exists "goals: read" on public.lift_season_goals;
create policy "goals: read" on public.lift_season_goals
  for select to authenticated
  using ((select private.is_member()) and (
    created_by = (select auth.uid())
    or exists (select 1 from public.lift_seasons s where s.id = season_id and s.is_shared and s.deleted_at is null)));

grant insert (id, name, starts_on, ends_on, is_shared)          on public.lift_seasons to authenticated;
grant update (name, starts_on, ends_on, is_shared, deleted_at)  on public.lift_seasons to authenticated;

create table if not exists public.lift_season_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.lift_seasons (id) on delete cascade,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz   -- set = left the season
);
create unique index if not exists lift_season_subscriptions_once
  on public.lift_season_subscriptions (season_id, created_by) where deleted_at is null;
create index if not exists lift_season_subscriptions_season on public.lift_season_subscriptions (season_id);
alter table public.lift_season_subscriptions enable row level security;

drop policy if exists "season subs: read"   on public.lift_season_subscriptions;
drop policy if exists "season subs: join"   on public.lift_season_subscriptions;
drop policy if exists "season subs: change" on public.lift_season_subscriptions;
create policy "season subs: read" on public.lift_season_subscriptions
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "season subs: join" on public.lift_season_subscriptions
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
              and exists (select 1 from public.lift_seasons s
                          where s.id = season_id and s.deleted_at is null and s.is_shared and s.created_by <> (select auth.uid())));
create policy "season subs: change" on public.lift_season_subscriptions
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));

revoke all on public.lift_season_subscriptions from anon, authenticated;
grant select on public.lift_season_subscriptions to authenticated;
grant insert (id, season_id) on public.lift_season_subscriptions to authenticated;
grant update (deleted_at)    on public.lift_season_subscriptions to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows)
values ('lift_season_subscriptions', 10, 50, 200)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_season_subscriptions');

create or replace function public.season_standings(p_season uuid)
returns table (user_id uuid, display_name text, visits bigint, sets bigint, volume_lb numeric, volume_kg numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.lift_seasons
    where id = p_season and deleted_at is null
      and (is_shared or created_by = auth.uid())
      and private.is_member()
  ), people as (
    select s.created_by as uid from s
    union
    select sub.created_by from public.lift_season_subscriptions sub join s on sub.season_id = s.id where sub.deleted_at is null
  )
  select m.user_id, m.display_name,
         count(distinct x.performed_on), count(x.id),
         coalesce(sum((x.weight + case when x.count_bodyweight then x.bodyweight else 0 end) * x.reps) filter (where x.unit = 'lb'), 0),
         coalesce(sum((x.weight + case when x.count_bodyweight then x.bodyweight else 0 end) * x.reps) filter (where x.unit = 'kg'), 0)
  from people p
  join private.members m on m.user_id = p.uid and m.active
  cross join s
  left join public.lift_sets x on x.created_by = p.uid and x.deleted_at is null and x.is_warmup is not true
        and x.performed_on between s.starts_on and s.ends_on
  group by m.user_id, m.display_name;
$$;
revoke all on function public.season_standings(uuid) from public, anon;
grant execute on function public.season_standings(uuid) to authenticated;
