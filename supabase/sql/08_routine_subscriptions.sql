-- 08_routine_subscriptions.sql
-- Applied after 07 (as migration 06_routine_subscriptions).
--
-- Subscribing to someone else's shared routine: it shows in your list and follows
-- their edits (nothing is copied). Only your own subscriptions are visible or
-- changeable by you, and you can only subscribe to a routine that is currently
-- shared (or your own). If the owner stops sharing, it quietly drops out of view.
create table if not exists public.lift_routine_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.lift_templates (id) on delete cascade,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz   -- set = unsubscribed
);
create unique index if not exists lift_routine_subscriptions_once
  on public.lift_routine_subscriptions (template_id, created_by) where deleted_at is null;
alter table public.lift_routine_subscriptions enable row level security;

drop policy if exists "subs: read"   on public.lift_routine_subscriptions;
drop policy if exists "subs: add"    on public.lift_routine_subscriptions;
drop policy if exists "subs: change" on public.lift_routine_subscriptions;
create policy "subs: read" on public.lift_routine_subscriptions
  for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
create policy "subs: add" on public.lift_routine_subscriptions
  for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
              and exists (select 1 from public.lift_templates t
                          where t.id = template_id and t.deleted_at is null
                            and (t.is_shared or t.created_by = (select auth.uid()))));
create policy "subs: change" on public.lift_routine_subscriptions
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));

revoke all on public.lift_routine_subscriptions from anon, authenticated;
grant select on public.lift_routine_subscriptions to authenticated;
grant insert (id, template_id) on public.lift_routine_subscriptions to authenticated;
grant update (deleted_at)      on public.lift_routine_subscriptions to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows)
values ('lift_routine_subscriptions', 10, 50, 200)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;

select private.protect('public.lift_routine_subscriptions');

-- The routine designer saves as you go, so give routines more write headroom.
update private.limits set per_minute = 120, per_day = 1500 where table_name = 'lift_template_items';
update private.limits set per_minute = 30,  per_day = 300  where table_name = 'lift_templates';
