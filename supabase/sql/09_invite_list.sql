-- 09_invite_list.sql
-- Applied after 08 (as migration 07_invite_list).
--
-- Only invited emails can ever get an account. The project URL and publishable key
-- are public (they're in the web page), so without this anyone could call the
-- sign-up endpoint and use up the two account slots, even though they'd see nothing.
-- This check sits in the database, so it holds even if sign-ups are switched on.
--
-- Invite someone (lower case):
--   insert into private.invited_emails (email, note) values ('them@example.com', 'Brandon');
--
-- Tested: a stranger's sign-up through the public /auth/v1/signup endpoint is refused
-- with "This email hasn't been invited." (HTTP 500), and no account is created.

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
  if (select count(*) from auth.users) >= 2 then
    raise exception 'This project is limited to 2 accounts.';
  end if;
  return new;
end;
$$;
