-- 16_three_accounts.sql
-- Applied as migration 16_three_accounts.
--
-- The hard limit goes from 2 accounts to 3 (John, Brandon, Cynthia). Nothing else changes: an
-- account can still only be created for an email on private.invited_emails, and only people on
-- private.members can read or write anything. 02, 07 and 09 now say 3 as well, so re-running
-- them doesn't drop the limit back to 2.

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
