-- 02_core.sql
-- The shared machinery every app table uses:
--   * private.members      the allowlist (the only people who can do anything)
--   * private.is_member()  / private.is_admin()   used inside every rule
--   * private.limits       per-table rate limits and row caps
--   * private.guard_write  trigger: rate limits, row caps, "database nearly full" brake
--   * private.stamp        trigger: who/when columns the browser can't fake
--   * private.audit_log    trigger: a record of every change, for undo and forensics
--   * public.me(), public.member_names()   the two things the browser may ask
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The allowlist. Being able to sign in is not enough; you also need a row here.
-- If sign-ups were ever switched back on by mistake, a stranger's new account
-- would have no row and therefore see and write nothing.
-- ---------------------------------------------------------------------------
create table if not exists private.members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  is_admin     boolean not null default false,
  require_mfa  boolean not null default false,  -- true = must have passed an authenticator-app check this session
  active       boolean not null default true,   -- set false to lock someone out instantly
  added_at     timestamptz not null default now()
);
alter table private.members enable row level security;  -- and no policies: app roles can't touch it at all
revoke all on private.members from public, anon, authenticated;

-- Hard cap on how many people can be active at once: you and two friends (see also 07, 09 and 16).
-- Raise the number here if the group grows.
create or replace function private.members_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from private.members where active) > 3 then
    raise exception 'The group is capped at 3 active members.';
  end if;
  return null;
end;
$$;
revoke all on function private.members_cap() from public, anon, authenticated;
drop trigger if exists members_cap on private.members;
create constraint trigger members_cap after insert or update on private.members
  for each row execute function private.members_cap();

-- Is the person making this request an active member (who has passed MFA, if
-- their row requires it)? SECURITY DEFINER so it can read the private table;
-- search_path = '' so nobody can trick it with look-alike functions.
create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.members m
    where m.user_id = auth.uid()
      and m.active
      and (not m.require_mfa or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.members m
    where m.user_id = auth.uid()
      and m.active
      and m.is_admin
      and (not m.require_mfa or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
  );
$$;

revoke all on function private.is_member() from public, anon;
revoke all on function private.is_admin()  from public, anon;
grant execute on function private.is_member() to authenticated;
grant execute on function private.is_admin()  to authenticated;

-- ---------------------------------------------------------------------------
-- Limits. One row per app table. A table with no row here can't be written by
-- members at all (guard_write refuses), so adding a table is a deliberate act.
--
-- Why these numbers: they're far above what a person typing on a phone can do,
-- and far below what fills the free plan's 500 MB. Worst case, one hijacked
-- account adds at most ~10 MB a day before hitting its daily caps.
-- ---------------------------------------------------------------------------
create table if not exists private.limits (
  table_name    text primary key,
  per_minute    int not null check (per_minute > 0),
  per_day       int not null check (per_day > 0),
  max_live_rows int not null check (max_live_rows > 0)   -- per person, not counting soft-deleted rows
);
alter table private.limits enable row level security;
revoke all on private.limits from public, anon, authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows) values
  ('lift_exercises',          30,  200,   1000),   -- admin only
  ('lift_exercise_aliases',   30,  200,   2000),   -- admin only
  ('lift_import_batches',      5,    6,    500),   -- 3 imports a day, plus room to undo them
  ('lift_sets',              120, 2000, 100000),   -- imports have their own allowance, see 03
  ('lift_seasons',            10,   50,    200),
  ('lift_season_goals',       20,  100,    500),
  ('lift_templates',          10,   50,    100),
  ('lift_template_items',     60,  300,   2000),
  ('lift_challenges',          5,   20,    200),
  ('lift_challenge_entries',  10,   50,    500),
  ('recipe_families',         10,   50,     50),
  ('recipes',                 20,  200,   2000)
on conflict (table_name) do update
  set per_minute = excluded.per_minute,
      per_day = excluded.per_day,
      max_live_rows = excluded.max_live_rows;
delete from private.limits where table_name = 'lift_workouts';   -- from the first draft

-- Recent writes per person, for the rate limits. Pruned as it goes, so it stays tiny.
create table if not exists private.write_events (
  user_id    uuid not null,
  table_name text not null,
  at         timestamptz not null default now()
);
create index if not exists write_events_user_at on private.write_events (user_id, table_name, at);
alter table private.write_events enable row level security;
revoke all on private.write_events from public, anon, authenticated;

-- BEFORE INSERT/UPDATE/DELETE on every app table (named a_guard so it runs first).
-- Requests from the dashboard or the secret key have no auth.uid() and skip it.
create or replace function private.guard_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  lim     private.limits;
  per_min int;
  per_day int;
  live    int;
begin
  if uid is null then
    return coalesce(new, old);
  end if;

  -- The row rules refuse non-members too; this just stops them earlier, before any counting.
  if not private.is_member() then
    raise exception 'Not allowed.';
  end if;

  -- Rows written by import_sets()/undo_import() in 03: that call has its own
  -- allowance (20,000 sets a batch, 3 batches a day), checked there.
  if tg_table_name = 'lift_sets' and current_setting('app.bulk_import', true) = 'on' then
    return coalesce(new, old);
  end if;

  select * into lim from private.limits where table_name = tg_table_name;
  if not found then
    raise exception 'Writing to % is not allowed.', tg_table_name;
  end if;

  -- The brake: stop every member write well before the free plan's 500 MB.
  -- Reading still works; the admin decides what to clear out.
  if pg_database_size(current_database()) > 400 * 1024 * 1024 then
    raise exception 'The database is nearly full, so saving is paused. Ask the admin.';
  end if;

  select count(*) filter (where at > now() - interval '1 minute'),
         count(*)
    into per_min, per_day
    from private.write_events
   where user_id = uid
     and table_name = tg_table_name
     and at > now() - interval '1 day';

  if per_min >= lim.per_minute then
    raise exception 'Too many changes in a minute. Wait a moment and try again.';
  end if;
  if per_day >= lim.per_day then
    raise exception 'Daily limit reached for %. It resets within 24 hours.', tg_table_name;
  end if;

  if tg_op = 'INSERT' then
    execute format(
      'select count(*) from public.%I where created_by = $1 and deleted_at is null',
      tg_table_name)
      into live
      using uid;
    if live >= lim.max_live_rows then
      raise exception 'You have reached the limit of % rows in %.', lim.max_live_rows, tg_table_name;
    end if;
  end if;

  insert into private.write_events (user_id, table_name) values (uid, tg_table_name);
  delete from private.write_events where user_id = uid and at < now() - interval '2 days';

  return coalesce(new, old);
end;
$$;

-- BEFORE INSERT/UPDATE (named b_stamp). The browser can't choose who created a
-- row or when, and can't hand a row over to someone else.
create or replace function private.stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);  -- dashboard inserts must set it themselves
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log: every insert, update and delete, with the row before and after.
-- Lets you see exactly what a hijacked account did, and put things back.
-- ---------------------------------------------------------------------------
create table if not exists private.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,                -- null = dashboard / secret key
  table_name text not null,
  row_id     text,
  action     text not null,
  old_row    jsonb,
  new_row    jsonb
);
create index if not exists audit_log_at on private.audit_log (at);
create index if not exists audit_log_user on private.audit_log (user_id, at);
alter table private.audit_log enable row level security;
revoke all on private.audit_log from public, anon, authenticated;

-- AFTER INSERT/UPDATE/DELETE (named z_audit so it runs last).
create or replace function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid text;
begin
  -- A bulk import or undo is logged once for the whole batch, not per set.
  if current_setting('app.bulk_import', true) = 'on' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    rid := (to_jsonb(old) ->> 'id');
    insert into private.audit_log (user_id, table_name, row_id, action, old_row, new_row)
    values (auth.uid(), tg_table_name, rid, tg_op, to_jsonb(old), null);
  elsif tg_op = 'UPDATE' then
    rid := (to_jsonb(new) ->> 'id');
    insert into private.audit_log (user_id, table_name, row_id, action, old_row, new_row)
    values (auth.uid(), tg_table_name, rid, tg_op, to_jsonb(old), to_jsonb(new));
  else
    rid := (to_jsonb(new) ->> 'id');
    insert into private.audit_log (user_id, table_name, row_id, action, old_row, new_row)
    values (auth.uid(), tg_table_name, rid, tg_op, null, to_jsonb(new));
  end if;
  return null;
end;
$$;

-- Trigger functions are only ever fired by Postgres, never called directly.
revoke all on function private.guard_write() from public, anon, authenticated;
revoke all on function private.stamp()       from public, anon, authenticated;
revoke all on function private.audit()       from public, anon, authenticated;

-- One call that attaches all three triggers to an app table, so 03 and 04
-- can't forget one.
create or replace function private.protect(tbl regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('drop trigger if exists a_guard on %s', tbl);
  execute format('create trigger a_guard before insert or update or delete on %s for each row execute function private.guard_write()', tbl);
  execute format('drop trigger if exists b_stamp on %s', tbl);
  execute format('create trigger b_stamp before insert or update on %s for each row execute function private.stamp()', tbl);
  execute format('drop trigger if exists z_audit on %s', tbl);
  execute format('create trigger z_audit after insert or update or delete on %s for each row execute function private.audit()', tbl);
end;
$$;
revoke all on function private.protect(regclass) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The only two functions the browser can call.
-- ---------------------------------------------------------------------------

-- "Am I in, and do I still need my authenticator code?" Used by the login page.
create or replace function public.me()
returns table (display_name text, is_admin boolean, mfa_required boolean, mfa_ok boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.display_name,
         m.is_admin,
         m.require_mfa,
         (not m.require_mfa or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
  from private.members m
  where m.user_id = auth.uid()
    and m.active;
$$;

-- Names to show next to shared recipes ("added by Rosa"). Members only.
create or replace function public.member_names()
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.display_name
  from private.members m
  where private.is_member();
$$;

revoke all on function public.me()           from public, anon;
revoke all on function public.member_names() from public, anon;
grant execute on function public.me()           to authenticated;
grant execute on function public.member_names() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin chores, run by hand from the SQL editor (never callable from the app).
-- ---------------------------------------------------------------------------

-- Trim the audit log. Default keeps 180 days.
create or replace function private.prune_audit(keep interval default interval '180 days')
returns bigint
language sql
set search_path = ''
as $$
  with gone as (delete from private.audit_log where at < now() - keep returning 1)
  select count(*) from gone;
$$;
revoke all on function private.prune_audit(interval) from public, anon, authenticated;
