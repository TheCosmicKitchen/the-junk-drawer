-- 30_bests_table.sql
-- Applied as migration 30_bests_table.
--
-- Personal bests without reading every set. lift_bests used to be a view that sorted all of your
-- sets on every app open (2.3 s at 100,000 sets in a stress test). Now each person's bests live in
-- a small table, one row per exercise, unit and rep count, kept up to date by a trigger on
-- lift_sets: a new set can only raise a best, so inserts are a single upsert; an edit or a delete
-- recomputes just the one or two bests it touched. lift_bests keeps its name and columns, so the
-- app doesn't change.
create table if not exists public.lift_best_rows (
  created_by      uuid not null references auth.users (id) on delete cascade,
  exercise_id     uuid not null references public.lift_exercises (id),
  unit            text not null,
  reps            smallint not null,
  heaviest        numeric(7,2) not null,   -- same type as lift_sets.weight
  first_lifted_on date not null,
  primary key (created_by, exercise_id, unit, reps)
);
alter table public.lift_best_rows enable row level security;
drop policy if exists "bests: read" on public.lift_best_rows;
create policy "bests: read" on public.lift_best_rows for select to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()));
-- Read only for everyone: only the trigger below writes here.
revoke all on public.lift_best_rows from anon, authenticated;
grant select on public.lift_best_rows to authenticated;

-- One best, worked out again from the sets (an indexed look at one person's one exercise).
create or replace function private.refresh_best(p_user uuid, p_ex uuid, p_unit text, p_reps smallint)
returns void language plpgsql security definer set search_path = '' as $$
declare b record;
begin
  select s.weight, s.performed_on into b
  from public.lift_sets s
  where s.created_by = p_user and s.exercise_id = p_ex and s.unit = p_unit and s.reps = p_reps
    and s.deleted_at is null and s.is_warmup is not true
  order by s.weight desc, s.performed_on
  limit 1;
  if not found then
    delete from public.lift_best_rows where created_by = p_user and exercise_id = p_ex and unit = p_unit and reps = p_reps;
  else
    insert into public.lift_best_rows as r (created_by, exercise_id, unit, reps, heaviest, first_lifted_on)
    values (p_user, p_ex, p_unit, p_reps, b.weight, b.performed_on)
    on conflict (created_by, exercise_id, unit, reps) do update
      set heaviest = excluded.heaviest, first_lifted_on = excluded.first_lifted_on
      where (r.heaviest, r.first_lifted_on) is distinct from (excluded.heaviest, excluded.first_lifted_on);
  end if;
end $$;
revoke all on function private.refresh_best(uuid, uuid, text, smallint) from public, anon, authenticated;

create or replace function private.keep_bests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- A new working set can only raise a best (or tie it on an earlier day).
    if new.deleted_at is null and new.is_warmup is not true then
      insert into public.lift_best_rows as r (created_by, exercise_id, unit, reps, heaviest, first_lifted_on)
      values (new.created_by, new.exercise_id, new.unit, new.reps, new.weight, new.performed_on)
      on conflict (created_by, exercise_id, unit, reps) do update
        set heaviest = excluded.heaviest, first_lifted_on = excluded.first_lifted_on
        where excluded.heaviest > r.heaviest or (excluded.heaviest = r.heaviest and excluded.first_lifted_on < r.first_lifted_on);
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and (old.created_by, old.exercise_id, old.unit, old.reps, old.weight, old.performed_on, old.deleted_at, old.is_warmup)
      is not distinct from (new.created_by, new.exercise_id, new.unit, new.reps, new.weight, new.performed_on, new.deleted_at, new.is_warmup) then
    return null;   -- a note or a time changed: no best moves
  end if;
  perform private.refresh_best(old.created_by, old.exercise_id, old.unit, old.reps);
  if tg_op = 'UPDATE' and (old.created_by, old.exercise_id, old.unit, old.reps) is distinct from (new.created_by, new.exercise_id, new.unit, new.reps) then
    perform private.refresh_best(new.created_by, new.exercise_id, new.unit, new.reps);
  end if;
  return null;
end $$;
revoke all on function private.keep_bests() from public, anon, authenticated;

drop trigger if exists y_bests on public.lift_sets;
create trigger y_bests after insert or update or delete on public.lift_sets
  for each row execute function private.keep_bests();

-- Fill it from everything already logged.
insert into public.lift_best_rows (created_by, exercise_id, unit, reps, heaviest, first_lifted_on)
select distinct on (created_by, exercise_id, unit, reps) created_by, exercise_id, unit, reps, weight, performed_on
from public.lift_sets
where deleted_at is null and is_warmup is not true
order by created_by, exercise_id, unit, reps, weight desc, performed_on
on conflict (created_by, exercise_id, unit, reps) do nothing;

-- Same name and columns as before; now a straight read of your own rows.
create or replace view public.lift_bests with (security_invoker = true) as
select exercise_id, unit, reps, heaviest, first_lifted_on
from public.lift_best_rows;
revoke all on public.lift_bests from anon, authenticated;
grant select on public.lift_bests to authenticated;
