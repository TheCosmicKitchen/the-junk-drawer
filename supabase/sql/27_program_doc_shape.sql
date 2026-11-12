-- 27_program_doc_shape.sql
-- Applied as migration 27_program_doc_shape.
--
-- A program's document must be built from the exercise catalogue, never free text: every step
-- names an exercise by its id in lift_exercises, with sets, reps and the rest in range, and no
-- fields beyond the known ones. The only free text is labels (the program's note, a workout's
-- name, a step's note), each length-capped. Checked on every insert and update.
create or replace function private.program_doc_problem(d jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w jsonb; s jsonb; day jsonb; keys text[] := '{}'; k text;
begin
  if jsonb_typeof(d) <> 'object' then return 'not an object'; end if;
  if exists (select 1 from jsonb_object_keys(d) x where x not in ('v', 'kind', 'weeks', 'about', 'workouts', 'days')) then return 'unknown field'; end if;
  if coalesce(d->>'kind', '') <> 'program' then return 'kind must be program'; end if;
  if jsonb_typeof(d->'weeks') <> 'number' or (d->>'weeks')::numeric not between 1 and 52 then return 'weeks must be 1 to 52'; end if;
  if d ? 'about' and jsonb_typeof(d->'about') not in ('string', 'null') or char_length(coalesce(d->>'about', '')) > 200 then return 'about too long'; end if;
  if jsonb_typeof(d->'workouts') <> 'array' or jsonb_array_length(d->'workouts') not between 1 and 7 then return 'one to seven workouts'; end if;
  for w in select * from jsonb_array_elements(d->'workouts') loop
    if jsonb_typeof(w) <> 'object' or exists (select 1 from jsonb_object_keys(w) x where x not in ('key', 'name', 'steps')) then return 'bad workout'; end if;
    k := w->>'key';
    if k is null or k !~ '^[a-z0-9]{1,12}$' or k = any(keys) then return 'bad workout key'; end if;
    keys := keys || k;
    if char_length(btrim(coalesce(w->>'name', ''))) not between 1 and 60 then return 'workout name 1 to 60 characters'; end if;
    if jsonb_typeof(w->'steps') <> 'array' or jsonb_array_length(w->'steps') not between 1 and 30 then return 'one to thirty steps a workout'; end if;
    for s in select * from jsonb_array_elements(w->'steps') loop
      if jsonb_typeof(s) <> 'object' or exists (select 1 from jsonb_object_keys(s) x where x not in ('exercise_id', 'sets', 'reps', 'load_mode', 'load_value', 'unit', 'rest_s', 'note')) then return 'bad step'; end if;
      -- the exercise: an id from the catalogue, nothing else
      if coalesce(s->>'exercise_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists (select 1 from public.lift_exercises e where e.id = (s->>'exercise_id')::uuid) then return 'exercise not in the catalogue'; end if;
      if jsonb_typeof(s->'sets') <> 'number' or (s->>'sets')::numeric not between 1 and 20 or (s->>'sets')::numeric % 1 <> 0 then return 'sets must be a whole number, 1 to 20'; end if;
      if jsonb_typeof(s->'reps') <> 'number' or (s->>'reps')::numeric not between 1 and 100 or (s->>'reps')::numeric % 1 <> 0 then return 'reps must be a whole number, 1 to 100'; end if;
      if s ? 'load_mode' and jsonb_typeof(s->'load_mode') <> 'null' and s->>'load_mode' not in ('last', 'progress', 'percent_1rm') then return 'bad load mode'; end if;
      if s ? 'load_value' and jsonb_typeof(s->'load_value') not in ('number', 'null') or coalesce((s->>'load_value')::numeric, 0) not between 0 and 2000 then return 'bad load value'; end if;
      if s ? 'unit' and jsonb_typeof(s->'unit') <> 'null' and s->>'unit' not in ('lb', 'kg') then return 'bad unit'; end if;
      if s ? 'rest_s' and jsonb_typeof(s->'rest_s') not in ('number', 'null') or coalesce((s->>'rest_s')::numeric, 0) not between 0 and 900 then return 'bad rest'; end if;
      if s ? 'note' and jsonb_typeof(s->'note') not in ('string', 'null') or char_length(coalesce(s->>'note', '')) > 200 then return 'step note too long'; end if;
    end loop;
  end loop;
  if jsonb_typeof(d->'days') <> 'array' or jsonb_array_length(d->'days') > 7 then return 'days must be a list of up to seven'; end if;
  for day in select * from jsonb_array_elements(d->'days') loop
    if jsonb_typeof(day) <> 'array' or jsonb_array_length(day) <> 2 or jsonb_typeof(day->0) <> 'number'
      or (day->>0)::numeric not in (0, 1, 2, 3, 4, 5, 6) or not ((day->>1) = any(keys)) then return 'bad day'; end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.program_doc_problem(jsonb) from public, anon, authenticated;

create or replace function private.check_program_doc()
returns trigger
language plpgsql
set search_path = ''
as $$
declare why text;
begin
  why := private.program_doc_problem(new.doc);
  if why is not null then raise exception 'That program can''t be saved: %', why using errcode = 'check_violation'; end if;
  return new;
end;
$$;
revoke all on function private.check_program_doc() from public, anon, authenticated;

drop trigger if exists b_doc_shape on public.lift_programs;
create trigger b_doc_shape before insert or update of doc on public.lift_programs
  for each row execute function private.check_program_doc();
