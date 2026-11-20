-- 33_fiona.sql
-- Applied as migration 33_fiona.
--
-- Room for Fiona: the hard limits go up by exactly one.
--   accounts: 4 -> 5 (John, Brandon, Cynthia, the Piroshki writer, Fiona)
--   active lifting members: 3 -> 4 (John, Brandon, Cynthia, Fiona)
-- Nothing else changes: an account can still only be created for an email on
-- private.invited_emails, and only people on private.members can read or write anything.
-- Her account is created from the Supabase dashboard (no password passes through code or chat);
-- her private.members row is added once the account exists.
--
-- Her email went onto private.invited_emails when this was applied, with the note 'Fiona'. It is
-- left out of this file on purpose: this repository is public. To invite someone (lower case):
--   insert into private.invited_emails (email, note) values ('them@example.com', 'Name');

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
  if (select count(*) from auth.users) >= 5 then
    raise exception 'This project is limited to 5 accounts.';
  end if;
  return new;
end;
$$;

create or replace function private.members_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from private.members where active) > 4 then
    raise exception 'The group is capped at 4 active members.';
  end if;
  return null;
end;
$$;
