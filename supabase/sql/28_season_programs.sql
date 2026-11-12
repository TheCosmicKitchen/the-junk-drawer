-- 28_season_programs.sql
-- Applied as migration 28_season_programs.
--
-- A season is a group lifting over the same dates; each person in it may follow a program, or none.
-- Being in a season is a row in lift_season_subscriptions, and it now carries the program you're on.
-- The season's creator can have a row too (to hold their program); before, only others could join.
-- The program has to be one you can read (yours, or one the crew shared).
alter table public.lift_season_subscriptions
  add column if not exists program_id uuid references public.lift_programs (id) on delete set null;
grant insert (program_id) on public.lift_season_subscriptions to authenticated;
grant update (program_id) on public.lift_season_subscriptions to authenticated;

drop policy if exists "season subs: join" on public.lift_season_subscriptions;
create policy "season subs: join" on public.lift_season_subscriptions for insert to authenticated
  with check (
    (select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_seasons s where s.id = season_id and s.deleted_at is null
                and (s.is_shared or s.created_by = (select auth.uid())))
    and (program_id is null or exists (select 1 from public.lift_programs p where p.id = program_id and p.deleted_at is null
                and (p.created_by = (select auth.uid()) or p.is_shared))));

drop policy if exists "season subs: change" on public.lift_season_subscriptions;
create policy "season subs: change" on public.lift_season_subscriptions for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check (
    (select private.is_member()) and created_by = (select auth.uid())
    and (program_id is null or exists (select 1 from public.lift_programs p where p.id = program_id and p.deleted_at is null
                and (p.created_by = (select auth.uid()) or p.is_shared))));

-- Who's on what in a season: each person's program (its name, and how many days a week it plans).
-- Same people and same access rule as season_standings. A private program shows as "their own program".
create or replace function public.season_programs(p_season uuid)
returns table (user_id uuid, program_id uuid, program_name text, days_a_week int)
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
  )
  select sub.created_by, p.id,
         case when p.is_shared or p.created_by = auth.uid() then p.name else 'their own program' end,
         coalesce(jsonb_array_length(p.doc->'days'), 0)
  from s
  join public.lift_season_subscriptions sub on sub.season_id = s.id and sub.deleted_at is null
  join private.members m on m.user_id = sub.created_by and m.active
  left join public.lift_programs p on p.id = sub.program_id and p.deleted_at is null;
$$;
revoke all on function public.season_programs(uuid) from public, anon;
grant execute on function public.season_programs(uuid) to authenticated;
