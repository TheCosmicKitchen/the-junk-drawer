-- 05_checks.sql
-- A health check for the lockdown. Run it after setup, and again any time you
-- change something in the dashboard.
--
-- The first query should return NO ROWS. Every row it returns is a hole to fix,
-- with a short description of what's wrong. The queries after it are just
-- information.

select problem, detail from (

  -- Every table the Data API can see must have row level security on.
  select 'table without row level security' as problem, c.relname::text as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity

  union all
  -- Logged-out visitors must have no rights on anything.
  select 'logged-out visitors can ' || privilege_type, table_name::text
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'

  union all
  select 'logged-out visitors can run function', routine_schema || '.' || routine_name
  from information_schema.role_routine_grants
  where grantee in ('anon', 'PUBLIC') and routine_schema in ('public', 'private')

  union all
  -- Members must never be able to hard-delete or empty a table.
  select 'members can ' || privilege_type, table_name::text
  from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
    and privilege_type in ('DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')

  union all
  -- Members must have no table rights in the private schema.
  select 'members can touch private table', table_name::text
  from information_schema.role_table_grants
  where grantee in ('authenticated', 'anon', 'PUBLIC') and table_schema = 'private'

  union all
  -- Text only: no file storage at all.
  select 'storage bucket exists', name::text from storage.buckets

  union all
  -- Nothing broadcast over Realtime.
  select 'table is broadcast by Realtime', schemaname || '.' || tablename
  from pg_publication_tables where pubname = 'supabase_realtime'

  union all
  select 'GraphQL is still installed', extname::text from pg_extension where extname = 'pg_graphql'

  union all
  -- Every app table needs its guard, stamp and audit triggers.
  select 'missing trigger ' || t.tg, l.table_name
  from private.limits l
  cross join (values ('a_guard'), ('b_stamp'), ('z_audit')) as t (tg)
  where exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = l.table_name)
    and not exists (
      select 1 from pg_trigger tr
      join pg_class c on c.oid = tr.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = l.table_name and tr.tgname = t.tg)

  union all
  -- An app table with no limits row can't be written by members, which is
  -- safe but probably a mistake.
  select 'table has no limits row (members cannot write to it)', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from private.limits l where l.table_name = c.relname)

  union all
  -- Someone who can sign in but isn't on the list. Sign-ups should be off,
  -- so this means a setting changed or an account was made by mistake.
  select 'account not on the members list', coalesce(u.email, u.id::text)
  from auth.users u
  where not exists (select 1 from private.members m where m.user_id = u.id)

  union all
  select 'admin does not require an authenticator code', display_name
  from private.members where is_admin and active and not require_mfa

  union all
  -- Functions that run with extra rights must pin their search_path.
  select 'security definer function without a fixed search_path', n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')

) as holes
order by problem, detail;


-- ---------------------------------------------------------------------------
-- Information
-- ---------------------------------------------------------------------------

-- How full is the database? The app stops accepting writes at 400 MB (free plan: 500 MB).
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Who's on the list.
select display_name, is_admin, require_mfa, active, added_at from private.members order by added_at;

-- The last 50 changes, newest first.
select at, coalesce(m.display_name, 'dashboard') as who, table_name, action, row_id
from private.audit_log a left join private.members m on m.user_id = a.user_id
order by at desc limit 50;

-- Changes per person per day over the last week. A sudden spike is worth a look.
select date_trunc('day', at)::date as day, coalesce(m.display_name, 'dashboard') as who, count(*) as changes
from private.audit_log a left join private.members m on m.user_id = a.user_id
where at > now() - interval '7 days'
group by 1, 2 order by 1 desc, 3 desc;
