-- 06_policy_tests.sql
-- Proves the rules work by acting as each kind of user and trying things that
-- should and shouldn't be allowed. Every change it makes is undone at the end,
-- so it's safe to run on the real project, as often as you like.
--
-- Needs: you in private.members as admin (with require_mfa on), and ideally a
-- second, non-admin member. Tests that need the second member are skipped
-- until one exists.
--
-- Run the whole file. The result table should say "pass" (or "skip") on every row.

create or replace function private.run_policy_tests()
returns table (n int, who text, test text, expected text, got text, result text)
language plpgsql
set search_path = ''
as $$
declare
  admin_id  uuid;
  member_id uuid;
  stranger  uuid := gen_random_uuid();   -- signed in, but not on the members list
  t         record;
  uid       uuid;
  cnt       bigint;
  g         text;
  i         int := 0;
  r_who     text[] := '{}';
  r_test    text[] := '{}';
  r_exp     text[] := '{}';
  r_got     text[] := '{}';
  r_res     text[] := '{}';
  verdict   text;
begin
  select m.user_id into admin_id  from private.members m where m.is_admin and m.active order by m.added_at limit 1;
  select m.user_id into member_id from private.members m where not m.is_admin and m.active order by m.added_at limit 1;
  if admin_id is null then
    raise exception 'Add yourself to private.members as admin first (runbook step 6).';
  end if;

  -- Everything inside this block is undone by the exception at the end.
  begin
    for t in
      select * from (values
        -- who,        aal,   expected,  test,                                         sql
        ('anon',      '',     'error',   'logged-out: read recipes',                   'select count(*) from public.recipes'),
        ('anon',      '',     'error',   'logged-out: read sets',                      'select count(*) from public.lift_sets'),
        ('anon',      '',     'error',   'logged-out: call me()',                      'select count(*) from public.me()'),
        ('anon',      '',     'error',   'logged-out: add a family',                   'insert into public.recipe_families (id, name) values (''x'', ''X'')'),
        ('stranger',  'aal2', 'rows=0',  'not on the list: sees no families',          'select count(*) from public.recipe_families'),
        ('stranger',  'aal2', 'error',   'not on the list: add a season',              'insert into public.lift_seasons (name, starts_on, ends_on) values (''X'', current_date, current_date)'),
        ('stranger',  'aal2', 'rows=0',  'not on the list: me() is empty',             'select count(*) from public.me()'),
        ('admin',     'aal1', 'rows=0',  'admin without code: sees nothing',           'select count(*) from public.recipe_families'),
        ('admin',     'aal2', 'some',    'admin with code: sees families',             'select count(*) from public.recipe_families'),
        ('admin',     'aal2', 'ok',      'catalogue: admin adds an exercise',          'insert into public.lift_exercises (id, name) values (''00000000-0000-4000-8000-0000000000e1'', ''Test squat'')'),
        ('member',    'aal1', 'error',   'catalogue: member cannot add one',           'insert into public.lift_exercises (name) values (''Sneaky lift'')'),
        ('member',    'aal1', 'rows=0',  'catalogue: member cannot rename one',        'with u as (update public.lift_exercises set name = ''Renamed'' where id = ''00000000-0000-4000-8000-0000000000e1'' returning 1) select count(*) from u'),
        ('member',    'aal1', 'rows=1',  'catalogue: member sees it',                  'select count(*) from public.lift_exercises where id = ''00000000-0000-4000-8000-0000000000e1'''),
        ('member',    'aal1', 'ok',      'sets: log a set',                            'insert into public.lift_sets (id, exercise_id, weight, reps, unit) values (''00000000-0000-4000-8000-0000000000b1'', ''00000000-0000-4000-8000-0000000000e1'', 135, 5, ''lb'')'),
        ('member',    'aal1', 'ok',      'sets: log one with bodyweight counted',      'insert into public.lift_sets (id, exercise_id, weight, reps, unit, count_bodyweight, bodyweight) values (''00000000-0000-4000-8000-0000000000b2'', ''00000000-0000-4000-8000-0000000000e1'', 0, 10, ''lb'', true, 180)'),
        ('member',    'aal1', 'rows=1',  'sets: today shows up in lift_days',          'select count(*) from public.lift_days where performed_on = current_date and volume_lb = 2475'),
        ('member',    'aal1', 'rows=2',  'sets: lift_bests has both rep counts',       'select count(*) from public.lift_bests where exercise_id = ''00000000-0000-4000-8000-0000000000e1'''),
        ('member',    'aal1', 'error',   'sets: impossible weight refused',            'insert into public.lift_sets (exercise_id, weight, reps, unit) values (''00000000-0000-4000-8000-0000000000e1'', 99999, 5, ''lb'')'),
        ('member',    'aal1', 'error',   'sets: counted bodyweight needs a value',     'insert into public.lift_sets (exercise_id, reps, unit, count_bodyweight) values (''00000000-0000-4000-8000-0000000000e1'', 5, ''lb'', true)'),
        ('member',    'aal1', 'error',   'sets: cannot set who created a row',         'insert into public.lift_sets (exercise_id, reps, unit, created_by) values (''00000000-0000-4000-8000-0000000000e1'', 5, ''lb'', gen_random_uuid())'),
        ('admin',     'aal2', 'rows=0',  'sets: admin cannot see a member''s sets',    'select count(*) from public.lift_sets where id = ''00000000-0000-4000-8000-0000000000b1'''),
        ('member',    'aal1', 'error',   'sets: cannot hard-delete',                   'delete from public.lift_sets where id = ''00000000-0000-4000-8000-0000000000b1'''),
        ('member',    'aal1', 'ok',      'sets: soft-delete one',                      'update public.lift_sets set deleted_at = now() where id = ''00000000-0000-4000-8000-0000000000b1'''),
        ('member',    'aal1', 'rows=1',  'sets: deleted set still visible (undo)',     'select count(*) from public.lift_sets where id = ''00000000-0000-4000-8000-0000000000b1'' and deleted_at is not null'),
        ('member',    'aal1', 'ok',      'seasons: add a season',                      'insert into public.lift_seasons (id, name, starts_on, ends_on) values (''00000000-0000-4000-8000-0000000000d1'', ''Test block'', current_date - 7, current_date + 7)'),
        ('member',    'aal1', 'error',   'seasons: volume goal needs a unit',          'insert into public.lift_season_goals (season_id, name, metric, target) values (''00000000-0000-4000-8000-0000000000d1'', ''Big'', ''volume'', 100000)'),
        ('member',    'aal1', 'ok',      'seasons: add a visits goal',                 'insert into public.lift_season_goals (season_id, name, metric, target) values (''00000000-0000-4000-8000-0000000000d1'', ''Show up'', ''visits'', 20)'),
        ('member',    'aal1', 'ok',      'import: 3 sets in one batch',                'select public.import_sets(''test.csv'', ''[{"exercise_id": "00000000-0000-4000-8000-0000000000e1", "performed_on": "2026-01-05", "weight": 95, "reps": 8, "unit": "lb", "source_row": 2}, {"exercise_id": "00000000-0000-4000-8000-0000000000e1", "performed_on": "2026-01-05", "weight": 95, "reps": 8, "unit": "lb", "source_row": 3}, {"exercise_id": "00000000-0000-4000-8000-0000000000e1", "performed_on": "2026-01-07", "weight": 100, "reps": 6, "unit": "lb", "is_warmup": null, "source_row": 4}]''::jsonb)'),
        ('member',    'aal1', 'rows=3',  'import: rows tagged with their batch',       'select count(*) from public.lift_sets where import_batch_id is not null and deleted_at is null and date_only and exercise_id = ''00000000-0000-4000-8000-0000000000e1'''),
        ('member',    'aal1', 'ok',      'import: undo it',                            'select public.undo_import((select id from public.lift_import_batches order by created_at desc limit 1))'),
        ('member',    'aal1', 'rows=0',  'import: undone sets are gone',               'select count(*) from public.lift_sets where import_batch_id is not null and deleted_at is null and exercise_id = ''00000000-0000-4000-8000-0000000000e1'''),
        ('member',    'aal1', 'ok',      'routines: member makes one',                 'insert into public.lift_templates (id, name) values (''00000000-0000-4000-8000-0000000000f1'', ''Push day'')'),
        ('member',    'aal1', 'ok',      'routines: adds an exercise to it',           'insert into public.lift_template_items (template_id, exercise_id, sets, reps) values (''00000000-0000-4000-8000-0000000000f1'', ''00000000-0000-4000-8000-0000000000e1'', 3, 8)'),
        ('admin',     'aal2', 'rows=0',  'routines: unshared one is private',          'select count(*) from public.lift_templates where id = ''00000000-0000-4000-8000-0000000000f1'''),
        ('member',    'aal1', 'ok',      'routines: member shares it',                 'update public.lift_templates set is_shared = true where id = ''00000000-0000-4000-8000-0000000000f1'''),
        ('admin',     'aal2', 'rows=1',  'routines: shared one is visible',            'select count(*) from public.lift_templates where id = ''00000000-0000-4000-8000-0000000000f1'''),
        ('admin',     'aal2', 'rows=1',  'routines: and its exercises',                'select count(*) from public.lift_template_items where template_id = ''00000000-0000-4000-8000-0000000000f1'''),
        ('admin',     'aal2', 'rows=0',  'routines: but it isn''t editable by others', 'with u as (update public.lift_templates set name = ''Mine now'' where id = ''00000000-0000-4000-8000-0000000000f1'' returning 1) select count(*) from u'),
        ('admin',     'aal2', 'error',   'routines: others can''t add to it',          'insert into public.lift_template_items (template_id, exercise_id) values (''00000000-0000-4000-8000-0000000000f1'', ''00000000-0000-4000-8000-0000000000e1'')'),
        ('admin',     'aal2', 'ok',      'routines: subscribe to a shared one',        'insert into public.lift_routine_subscriptions (template_id) values (''00000000-0000-4000-8000-0000000000f1'')'),
        ('member',    'aal1', 'rows=0',  'routines: subscriptions are private',        'select count(*) from public.lift_routine_subscriptions'),
        ('member',    'aal1', 'ok',      'routines: member makes a private one',       'insert into public.lift_templates (id, name) values (''00000000-0000-4000-8000-0000000000f2'', ''Secret'')'),
        ('admin',     'aal2', 'error',   'routines: can''t subscribe to a private one', 'insert into public.lift_routine_subscriptions (template_id) values (''00000000-0000-4000-8000-0000000000f2'')'),
        ('member',    'aal1', 'ok',      'challenge: start one',                       'insert into public.lift_challenges (id, name, starts_on, ends_on, metric) values (''00000000-0000-4000-8000-0000000000a1'', ''Test month'', current_date - 30, current_date + 30, ''volume_lb'')'),
        ('member',    'aal1', 'ok',      'challenge: join it',                         'insert into public.lift_challenge_entries (challenge_id) values (''00000000-0000-4000-8000-0000000000a1'')'),
        ('admin',     'aal2', 'rows=1',  'challenge: totals only, bodyweight counted', 'select count(*) from public.challenge_standings(''00000000-0000-4000-8000-0000000000a1'') where volume_lb = 1800 and visits = 1'),
        ('stranger',  'aal2', 'rows=0',  'challenge: outsider gets no standings',      'select count(*) from public.challenge_standings(''00000000-0000-4000-8000-0000000000a1'')'),
        ('anon',      '',     'error',   'challenge: logged-out cannot ask',           'select count(*) from public.challenge_standings(''00000000-0000-4000-8000-0000000000a1'')'),
        ('member',    'aal1', 'error',   'recipe: unknown field refused',              'insert into public.recipes (family_id, slug, title, body) values (''our-kitchen'', ''t1'', ''T'', ''{"payload": "x"}'')'),
        ('member',    'aal1', 'error',   'recipe: non-YouTube link refused',           'insert into public.recipes (family_id, slug, title, body) values (''our-kitchen'', ''t2'', ''T'', ''{"video": "https://example.com/x"}'')'),
        ('member',    'aal1', 'error',   'recipe: huge step refused',                  'insert into public.recipes (family_id, slug, title, body) values (''our-kitchen'', ''t3'', ''T'', jsonb_build_object(''steps'', jsonb_build_array(repeat(''x'', 2001))))'),
        ('member',    'aal1', 'error',   'recipe: empty one cannot be submitted',      'insert into public.recipes (family_id, slug, title, status) values (''our-kitchen'', ''t4'', ''T'', ''submitted'')'),
        ('member',    'aal1', 'ok',      'recipe: member adds a draft',                'insert into public.recipes (id, family_id, slug, title, body) values (''00000000-0000-4000-8000-0000000000c1'', ''our-kitchen'', ''test-rolls'', ''Test Rolls'', ''{"ingredients": [{"name": "", "items": ["1 cup flour"]}], "steps": ["Mix."], "video": "https://www.youtube.com/watch?v=hOen7VmSNPU"}'')'),
        ('stranger',  'aal2', 'rows=0',  'recipe: outsider cannot see it',             'select count(*) from public.recipes where id = ''00000000-0000-4000-8000-0000000000c1'''),
        ('admin',     'aal2', 'rows=1',  'recipe: admin sees the draft',               'select count(*) from public.recipes where id = ''00000000-0000-4000-8000-0000000000c1'''),
        ('member',    'aal1', 'error',   'recipe: member cannot approve',              'update public.recipes set status = ''approved'' where id = ''00000000-0000-4000-8000-0000000000c1'''),
        ('member',    'aal1', 'ok',      'recipe: member submits it',                  'update public.recipes set status = ''submitted'' where id = ''00000000-0000-4000-8000-0000000000c1'''),
        ('admin',     'aal2', 'ok',      'recipe: admin approves it',                  'update public.recipes set status = ''approved'' where id = ''00000000-0000-4000-8000-0000000000c1'''),
        ('member',    'aal1', 'ok',      'recipe: member edits approved recipe',       'update public.recipes set title = ''Test Rolls 2'' where id = ''00000000-0000-4000-8000-0000000000c1'''),
        ('admin',     'aal2', 'rows=1',  'recipe: that edit sent it back for review',  'select count(*) from public.recipes where id = ''00000000-0000-4000-8000-0000000000c1'' and status = ''submitted'' and approved_at is null'),
        ('member',    'aal1', 'rows=0',  'family: member cannot rename one',           'with u as (update public.recipe_families set name = ''Hacked'' where id = ''our-kitchen'' returning 1) select count(*) from u'),
        ('member',    'aal1', 'error',   'family: member cannot add one',              'insert into public.recipe_families (id, name) values (''sneaky'', ''Sneaky'')'),
        ('member',    'aal1', 'error',   'rate limit: 40 seasons at once refused',     'insert into public.lift_seasons (name, starts_on, ends_on) select ''Rate test '' || g, current_date, current_date from generate_series(1, 40) g')
      ) as v (who, aal, expected, label, sql)
    loop
      i := i + 1;
      if t.who = 'member' and member_id is null then
        r_who := r_who || t.who; r_test := r_test || t.label; r_exp := r_exp || t.expected;
        r_got := r_got || 'no second member yet'::text; r_res := r_res || 'skip'::text;
        continue;
      end if;
      uid := case t.who when 'admin' then admin_id when 'member' then member_id when 'stranger' then stranger end;

      begin
        execute 'reset role';
        if t.who = 'anon' then
          perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
          perform set_config('role', 'anon', true);
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', uid, 'role', 'authenticated', 'aal', t.aal)::text, true);
          perform set_config('role', 'authenticated', true);
        end if;

        if t.expected like 'rows=%' or t.expected = 'some' then
          execute t.sql into cnt;
          g := 'rows=' || cnt;
        else
          execute t.sql;
          g := 'ok';
        end if;
      exception when others then
        g := 'error: ' || sqlerrm;
      end;
      execute 'reset role';

      verdict := case
        when t.expected = 'error' then case when g like 'error%' then 'pass' else 'FAIL' end
        when t.expected = 'some'  then case when g like 'rows=%' and g <> 'rows=0' then 'pass' else 'FAIL' end
        else case when g = t.expected then 'pass' else 'FAIL' end
      end;
      r_who := r_who || t.who; r_test := r_test || t.label; r_exp := r_exp || t.expected;
      r_got := r_got || g; r_res := r_res || verdict;
    end loop;

    raise exception using errcode = 'P0999', message = 'undo all test changes';
  exception when sqlstate 'P0999' then
    null;   -- everything the tests wrote is now rolled back
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  return query
    select k, r_who[k], r_test[k], r_exp[k], r_got[k], r_res[k]
    from generate_subscripts(r_test, 1) as k;
end;
$$;

revoke all on function private.run_policy_tests() from public, anon, authenticated;

select * from private.run_policy_tests();
