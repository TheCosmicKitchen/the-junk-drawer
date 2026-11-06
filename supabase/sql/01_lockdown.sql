-- 01_lockdown.sql
-- Run first, in the Supabase SQL editor, on a brand-new project.
--
-- Goal: start from "nobody can do anything" and grant back only what each
-- table needs, one column at a time, later in 03 and 04.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Logged-out visitors (the "anon" role) get nothing, now or later.
--    The publishable/anon key in the web page is public by design; with these
--    revokes it can't read or write a single row. Every request has to come
--    from a signed-in member.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Supabase normally grants every new table in "public" to anon and
-- authenticated automatically. Turn that off for tables, sequences and
-- functions made by the postgres role (which is who runs the SQL editor),
-- so a table only becomes reachable when a later file grants it on purpose.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- Postgres also lets everyone ("public") run new functions by default. Stop that too.
alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- 2. Turn off the GraphQL API. Nothing here uses it, so it's just one more door.
--    (Afterwards, in Project Settings > Data API, remove "graphql_public" from
--    the exposed schemas if it's still listed.)
-- ---------------------------------------------------------------------------
drop extension if exists pg_graphql;

-- ---------------------------------------------------------------------------
-- 3. A private schema for the bookkeeping tables (members list, audit log,
--    rate counters). It is NOT exposed through the Data API, and no app role
--    gets any table rights in it. Signed-in users get USAGE only so the rules
--    in 03/04 can call the helper functions that live here.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Safety net: switch row level security on for any new table created in
--    "public", even if a later file forgot to. Without RLS a granted table is
--    readable by every signed-in user.
--
--    If this block errors with a permissions message, skip it: 05_checks.sql
--    also lists any public table without RLS, so you'll still catch it.
-- ---------------------------------------------------------------------------
create or replace function private.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', cmd.object_identity);
  end loop;
end;
$$;

drop event trigger if exists rls_auto_enable;
create event trigger rls_auto_enable
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.rls_auto_enable();

-- Storage, Realtime and Edge Functions need nothing here: this project never
-- creates a storage bucket, never adds a table to the realtime publication,
-- and never deploys a function. 05_checks.sql confirms all three stay empty.
