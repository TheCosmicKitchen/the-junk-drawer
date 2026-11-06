-- 07_two_accounts_and_shared_routines.sql
-- Applied after 01-04 (as migration 05_two_accounts_and_shared_routines).
--
-- 1. Hard limit on accounts and active members (2 at first; raised to 3 in 16_three_accounts.sql).
-- 2. Routines (lift_templates) can be shared: the other member can see and follow
--    them, read-only, and copy one to make their own version.

-- ---------------------------------------------------------------------------
-- 1. A fixed number of accounts, full stop (now 3).
-- Refuses to create a third account at all, whoever asks (a sign-up switched back on
-- by mistake, the dashboard, the admin API). The lock makes two simultaneous
-- sign-ups wait for each other, so they can't both slip under the limit.
-- To allow more one day: change the number here, in 09 and in private.members_cap().
-- It also checks the invite list (09), so re-running this file keeps that check.
-- ---------------------------------------------------------------------------
create table if not exists private.invited_emails (
  email      text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  note       text,
  added_at   timestamptz not null default now()
);
alter table private.invited_emails enable row level security;
revoke all on private.invited_emails from public, anon, authenticated;

create or replace function private.accounts_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(727274);
  if new.email is null or not exists (select 1 from private.invited_emails i where i.email = lower(btrim(new.email))) then
    raise exception 'This email hasn''t been invited.';
  end if;
  if (select count(*) from auth.users) >= 3 then
    raise exception 'This project is limited to 3 accounts.';
  end if;
  return new;
end;
$$;
revoke all on function private.accounts_cap() from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;   -- Supabase's auth service runs the trigger
grant execute on function private.accounts_cap() to supabase_auth_admin;
drop trigger if exists accounts_cap on auth.users;
create trigger accounts_cap before insert on auth.users
  for each row execute function private.accounts_cap();

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

-- ---------------------------------------------------------------------------
-- 2. Shared routines. Still only the owner can change a routine or its items
--    (the "own: add/change" and "own items: add/change" rules from 03 stay).
-- ---------------------------------------------------------------------------
alter table public.lift_templates add column if not exists is_shared boolean not null default false;

drop policy if exists "own: read" on public.lift_templates;
drop policy if exists "templates: read" on public.lift_templates;
create policy "templates: read" on public.lift_templates
  for select to authenticated
  using ((select private.is_member()) and (
    created_by = (select auth.uid()) or (is_shared and deleted_at is null)));

drop policy if exists "own items: read" on public.lift_template_items;
drop policy if exists "items: read" on public.lift_template_items;
create policy "items: read" on public.lift_template_items
  for select to authenticated
  using ((select private.is_member()) and (
    created_by = (select auth.uid())
    or exists (select 1 from public.lift_templates t
               where t.id = template_id and t.is_shared and t.deleted_at is null)));

grant insert (id, name, notes, is_shared)              on public.lift_templates to authenticated;
grant update (name, notes, is_shared, deleted_at)      on public.lift_templates to authenticated;
