-- 22_piroshki.sql
-- Applied as migration 22_piroshki.
--
-- Words for Piroshki (the NaNoWriMo tracker) can keep one person's progress here, so the crew
-- can follow along.
--
--   * One writer, ever: private.piroshki_writer holds a single row (the admin fills it in).
--     That account can save its own progress and nothing else. It is NOT on private.members,
--     so it can't see or touch any lifting data.
--   * Readers: the crew (private.members) and the writer. Logged-out visitors still get nothing.
--   * One row per year, at most 8 KB of JSON, rate limited, audited, and stopped by the same
--     "database nearly full" brake as everything else. No deletes from the browser.
--   * The account limit goes from 3 to 4, so the writer fits alongside John, Brandon and Cynthia.
--
-- Afterwards, to make someone the writer (dashboard SQL editor):
--   insert into private.invited_emails (email) values ('friend@example.com');
--   -- Authentication > Users > Add user > Create new user (email + a temporary password, auto-confirm)
--   insert into private.piroshki_writer (user_id, display_name)
--     select id, 'Their name' from auth.users where email = 'friend@example.com';

-- ---------------------------------------------------------------------------
-- The single writer
-- ---------------------------------------------------------------------------
create table if not exists private.piroshki_writer (
  only_one     boolean primary key default true check (only_one),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40)
);
alter table private.piroshki_writer enable row level security;
revoke all on private.piroshki_writer from public, anon, authenticated;

create or replace function private.is_piroshki_writer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.piroshki_writer w where w.user_id = auth.uid());
$$;
revoke all on function private.is_piroshki_writer() from public, anon;
grant execute on function private.is_piroshki_writer() to authenticated;

-- ---------------------------------------------------------------------------
-- The progress itself: the tracker's own state (stories, goals, words per day) as JSON.
-- ---------------------------------------------------------------------------
create table if not exists public.piroshki_progress (
  id         uuid primary key default gen_random_uuid(),
  year       int  not null unique check (year between 2024 and 2100),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 8000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.piroshki_progress enable row level security;
revoke all on public.piroshki_progress from public, anon, authenticated;
grant select (id, year, data, updated_at) on public.piroshki_progress to authenticated;
grant insert (year, data)                 on public.piroshki_progress to authenticated;
grant update (data)                       on public.piroshki_progress to authenticated;

drop policy if exists piroshki_read   on public.piroshki_progress;
drop policy if exists piroshki_add    on public.piroshki_progress;
drop policy if exists piroshki_change on public.piroshki_progress;
create policy piroshki_read on public.piroshki_progress for select to authenticated
  using ((select private.is_member()) or (select private.is_piroshki_writer()));
create policy piroshki_add on public.piroshki_progress for insert to authenticated
  with check ((select private.is_piroshki_writer()) and created_by = (select auth.uid()));
create policy piroshki_change on public.piroshki_progress for update to authenticated
  using ((select private.is_piroshki_writer())) with check ((select private.is_piroshki_writer()));

-- The usual guard (private.guard_write) only lets crew members write, so this table gets its own:
-- the writer only, the same rate limits from private.limits, the same storage brake.
insert into private.limits (table_name, per_minute, per_day, max_live_rows)
values ('piroshki_progress', 30, 500, 10)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;

create or replace function private.piroshki_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  lim     private.limits;
  per_min int;
  per_day int;
begin
  if uid is null then
    return coalesce(new, old);   -- dashboard / secret key
  end if;
  if tg_op = 'DELETE' or not private.is_piroshki_writer() then
    raise exception 'Not allowed.';
  end if;
  select * into lim from private.limits where table_name = tg_table_name;
  if pg_database_size(current_database()) > 400 * 1024 * 1024 then
    raise exception 'The database is nearly full, so saving is paused. Ask the admin.';
  end if;
  select count(*) filter (where at > now() - interval '1 minute'), count(*)
    into per_min, per_day
    from private.write_events
   where user_id = uid and table_name = tg_table_name and at > now() - interval '1 day';
  if per_min >= lim.per_minute then
    raise exception 'Too many changes in a minute. Wait a moment and try again.';
  end if;
  if per_day >= lim.per_day then
    raise exception 'Daily limit reached. It resets within 24 hours.';
  end if;
  insert into private.write_events (user_id, table_name) values (uid, tg_table_name);
  delete from private.write_events where user_id = uid and at < now() - interval '2 days';
  return new;
end;
$$;
revoke all on function private.piroshki_guard() from public, anon, authenticated;

drop trigger if exists a_guard on public.piroshki_progress;
create trigger a_guard before insert or update or delete on public.piroshki_progress
  for each row execute function private.piroshki_guard();
drop trigger if exists b_stamp on public.piroshki_progress;
create trigger b_stamp before insert or update on public.piroshki_progress
  for each row execute function private.stamp();
drop trigger if exists z_audit on public.piroshki_progress;
create trigger z_audit after insert or update or delete on public.piroshki_progress
  for each row execute function private.audit();

-- What the page needs to know: can I write, can I read, and whose progress is it.
create or replace function public.piroshki_access()
returns table (can_write boolean, can_read boolean, writer_name text)
language sql stable security definer set search_path = ''
as $$
  select private.is_piroshki_writer(),
         private.is_member() or private.is_piroshki_writer(),
         case when private.is_member() or private.is_piroshki_writer()
              then (select w.display_name from private.piroshki_writer w) end;
$$;
revoke all on function public.piroshki_access() from public, anon;
grant execute on function public.piroshki_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Room for one more account (the writer). Still invite-only.
-- ---------------------------------------------------------------------------
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
  if (select count(*) from auth.users) >= 4 then
    raise exception 'This project is limited to 4 accounts.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tests: select * from private.run_piroshki_tests();  Every row should say "pass".
-- Borrows the first non-admin member as a stand-in writer; everything is undone at the end.
-- ---------------------------------------------------------------------------
create or replace function private.run_piroshki_tests()
returns table (n int, who text, test text, expected text, got text, result text)
language plpgsql
set search_path = ''
as $$
declare
  admin_id  uuid;
  member_id uuid;
  stranger  uuid := gen_random_uuid();
  t         record;
  uid       uuid;
  cnt       bigint;
  g         text;
  i         int := 0;
  r         text[] := '{}';
begin
  select m.user_id into admin_id  from private.members m where m.is_admin and m.active order by m.added_at limit 1;
  select m.user_id into member_id from private.members m where not m.is_admin and m.active order by m.added_at limit 1;
  if admin_id is null or member_id is null then
    raise exception 'Needs an admin and a second member on private.members.';
  end if;
  begin
    delete from private.piroshki_writer;
    insert into private.piroshki_writer (user_id, display_name) values (member_id, 'Test writer');
    for t in
      select * from (values
        (1,  'anon',     'can''t read progress',               'select count(*) from public.piroshki_progress',                                   'error'),
        (2,  'stranger', 'sees no progress',                   'select count(*) from public.piroshki_progress',                                   '0'),
        (3,  'stranger', 'can''t save progress',               'insert into public.piroshki_progress (year, data) values (2099, ''{}'')',        'error'),
        (4,  'stranger', 'isn''t told whose it is',            'select count(*) from public.piroshki_access() where writer_name is not null',     '0'),
        (5,  'writer',   'can save progress',                  'insert into public.piroshki_progress (year, data) values (2099, ''{"a":1}'')',   'ok'),
        (6,  'writer',   'can update it',                      'update public.piroshki_progress set data = ''{"a":2}'' where year = 2099',       'ok'),
        (7,  'writer',   'reads it back',                      'select count(*) from public.piroshki_progress where data = ''{"a":2}''',          '1'),
        (8,  'writer',   'can''t delete it',                   'delete from public.piroshki_progress where year = 2099',                          'error'),
        (9,  'writer',   'can''t change who made it',          'update public.piroshki_progress set created_by = null where year = 2099',        'error'),
        (10, 'writer',   'can''t store more than 8 KB',        'insert into public.piroshki_progress (year, data) values (2098, (select jsonb_object_agg(k::text, md5(k::text)) from generate_series(1, 400) k))', 'error'),
        (11, 'writer',   'is told they can write',             'select count(*) from public.piroshki_access() where can_write',                  '1'),
        (12, 'admin',    'reads the writer''s progress',       'select count(*) from public.piroshki_progress where year = 2099',                 '1'),
        (13, 'admin',    'can''t save progress',               'insert into public.piroshki_progress (year, data) values (2097, ''{}'')',        'error'),
        (14, 'admin',    'can''t change the writer''s progress', 'update public.piroshki_progress set data = ''{}'' where year = 2099 returning 1', 'error'),
        (15, 'admin',    'sees whose it is, read-only',        'select count(*) from public.piroshki_access() where can_read and not can_write and writer_name = ''Test writer''', '1')
      ) v(n, who, test, sql, expected)
    loop
      uid := case t.who when 'admin' then admin_id when 'writer' then member_id when 'stranger' then stranger end;
      execute 'reset role';
      if t.who = 'anon' then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('role', 'anon', true);
      else
        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
        perform set_config('role', 'authenticated', true);
      end if;
      begin
        if t.sql like 'select%' then
          execute t.sql into cnt; g := cnt::text;
        else
          cnt := null;
          if t.sql like '%returning 1' then execute t.sql into cnt; else execute t.sql; cnt := 1; end if;
          g := case when cnt is null then 'error' else 'ok' end;   -- a "returning 1" that matched no row was refused
        end if;
      exception when others then g := 'error';
      end;
      execute 'reset role';
      i := i + 1;
      r := r || array[t.n::text, t.who, t.test, t.expected, g];
    end loop;
    raise exception 'undo';
  exception when others then
    if sqlerrm <> 'undo' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  for k in 0 .. i - 1 loop
    n := r[k * 5 + 1]::int; who := r[k * 5 + 2]; test := r[k * 5 + 3]; expected := r[k * 5 + 4]; got := r[k * 5 + 5];
    result := case when expected = got then 'pass' else 'FAIL' end;
    return next;
  end loop;
end;
$$;
revoke all on function private.run_piroshki_tests() from public, anon, authenticated;
