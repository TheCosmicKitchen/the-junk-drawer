-- 37_lift_tests.sql
-- To be applied as migration 37_lift_tests. Then run:  select * from private.run_lift_tests();
--
-- The database half of the regression suite: the rules added since 06_policy_tests.sql, proved by
-- acting as each kind of user. Same shape as run_policy_tests(): every change is undone at the end,
-- so it's safe to run on the real project, as often as you like. Every row should say "pass" (or
-- "skip" when there's no second, non-admin member yet).
--
-- Covers: sets that aren't weight × reps (34), bests for holds and carries (34), plans and following
-- one (35), and every lift's last day for "last time" (36).

create or replace function private.run_lift_tests()
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
  r_who     text[] := '{}';
  r_test    text[] := '{}';
  r_exp     text[] := '{}';
  r_got     text[] := '{}';
  r_res     text[] := '{}';
  verdict   text;
  -- Test rows use fixed ids so later rows can point at earlier ones.
  ex   constant text := '''00000000-0000-4000-8000-0000000037e1''';
  tpl  constant text := '''00000000-0000-4000-8000-0000000037f1''';
  plan constant text := '(select id from public.lift_programs where name = ''zz test plan'')';
  doc  text;
begin
  select m.user_id into admin_id  from private.members m where m.is_admin and m.active order by m.added_at limit 1;
  select m.user_id into member_id from private.members m where not m.is_admin and m.active order by m.added_at limit 1;
  if admin_id is null then raise exception 'Add yourself to private.members as admin first.'; end if;

  -- A four-week plan on the member's own routine: Monday of weeks 1 and 2, build then deload, and
  -- the test lift climbing 75 → 85% then 60%.
  doc := format('{"v": 2, "kind": "plan", "weeks": 4, "workouts": [{"key": "a", "template_id": %s}], "schedule": "days", '
    || '"cells": [[1, 1, "a"], [2, 1, "a"]], "phases": [{"name": "Build", "from": 1, "to": 3, "kind": "build"}, {"name": "Easy", "from": 4, "to": 4, "kind": "deload"}], '
    || '"progression": [{"exercise_id": %s, "pct": [75, 80, 85, 60]}]}',
    replace(tpl, '''', '"'), replace(ex, '''', '"'));

  -- Everything inside this block is undone by the exception at the end.
  begin
    for t in
      select * from (values
        -- who,       aal,    expected, test,                                              sql
        ('admin',    'aal2', 'ok',      'catalogue: a timed hold to test with',            'insert into public.lift_exercises (id, name, log_type) values (' || ex || ', ''zz Test hold'', ''time'')'),

        -- Sets that aren't weight × reps (34)
        ('member',   'aal1', 'ok',      'sets: a hold logs a time with no reps',           'insert into public.lift_sets (exercise_id, weight, reps, duration_s, unit) values (' || ex || ', 0, null, 45, ''lb'')'),
        ('member',   'aal1', 'error',   'sets: a set must measure something',             'insert into public.lift_sets (exercise_id, weight, reps, unit) values (' || ex || ', 0, null, ''lb'')'),
        ('member',   'aal1', 'error',   'sets: negative weight needs bodyweight counted', 'insert into public.lift_sets (exercise_id, weight, reps, unit) values (' || ex || ', -30, 8, ''lb'')'),
        ('member',   'aal1', 'ok',      'sets: assisted (bodyweight minus 30) is fine',   'insert into public.lift_sets (exercise_id, weight, reps, unit, count_bodyweight, bodyweight) values (' || ex || ', -30, 8, ''lb'', true, 180)'),
        ('member',   'aal1', 'error',   'sets: effort is 1 to 10',                        'insert into public.lift_sets (exercise_id, weight, reps, unit, rpe) values (' || ex || ', 100, 5, ''lb'', 11)'),

        -- Bests for holds and carries (34)
        ('member',   'aal1', 'rows=1',  'feats: the hold is a best (longest 0:45)',       'select count(*) from public.lift_feat_rows where exercise_id = ' || ex || ' and metric = ''time'' and best = 45'),
        ('member',   'aal1', 'ok',      'feats: a longer hold',                           'insert into public.lift_sets (exercise_id, weight, reps, duration_s, unit) values (' || ex || ', 0, null, 70, ''lb'')'),
        ('member',   'aal1', 'rows=1',  'feats: the best moves up to 1:10',               'select count(*) from public.lift_feat_rows where exercise_id = ' || ex || ' and metric = ''time'' and best = 70'),
        ('admin',    'aal2', 'rows=0',  'feats: nobody else sees your bests',             'select count(*) from public.lift_feat_rows where exercise_id = ' || ex),

        -- Last time (36)
        ('member',   'aal1', 'rows=3',  'last time: your latest day of each lift',        'select count(*) from public.last_days_before(current_date + 1) where exercise_id = ' || ex),
        ('member',   'aal1', 'rows=0',  'last time: nothing from before you started',     'select count(*) from public.last_days_before(current_date) where exercise_id = ' || ex),
        ('admin',    'aal2', 'rows=0',  'last time: only ever your own sets',             'select count(*) from public.last_days_before(current_date + 1) where exercise_id = ' || ex),
        ('stranger', 'aal2', 'rows=0',  'last time: not on the list, nothing',            'select count(*) from public.last_days_before(current_date + 1)'),
        ('anon',     '',     'error',   'last time: logged out cannot ask',               'select count(*) from public.last_days_before(current_date)'),

        -- Plans (35)
        ('member',   'aal1', 'ok',      'plans: a routine to build on',                   'insert into public.lift_templates (id, name, kind) values (' || tpl || ', ''zz Push'', ''workout'')'),
        ('member',   'aal1', 'ok',      'plans: save a four-week plan',                   'insert into public.lift_programs (name, doc) values (''zz test plan'', ' || quote_literal(doc) || '::jsonb)'),
        ('member',   'aal1', 'error',   'plans: 40 weeks is too long',                    'insert into public.lift_programs (name, doc) values (''zz too long'', ' || quote_literal(doc) || '::jsonb || ''{"weeks": 40}'')'),
        ('member',   'aal1', 'error',   'plans: a deload must sit inside the weeks',      'insert into public.lift_programs (name, doc) values (''zz bad phase'', jsonb_set(' || quote_literal(doc) || '::jsonb, ''{phases,1,to}'', ''9''))'),
        ('admin',    'aal2', 'error',   'plans: can''t use someone''s private routine',  'insert into public.lift_programs (name, doc) values (''zz borrowed'', ' || quote_literal(doc) || '::jsonb)'),
        ('admin',    'aal2', 'rows=0',  'plans: an unshared plan is private',             'select count(*) from public.lift_programs where name = ''zz test plan'''),
        ('member',   'aal1', 'ok',      'following: start the plan',                      'insert into public.lift_plan_runs (program_id, starts_on) values (' || plan || ', current_date)'),
        ('member',   'aal1', 'error',   'following: one plan at a time',                  'insert into public.lift_plan_runs (program_id, starts_on) values (' || plan || ', current_date)'),
        ('admin',    'aal2', 'rows=0',  'following: nobody else sees what you follow',    'select count(*) from public.lift_plan_runs where created_by <> auth.uid()'),
        ('admin',    'aal2', 'error',   'following: can''t start someone''s private plan', 'insert into public.lift_plan_runs (program_id, starts_on) values ((select id from public.lift_programs p where p.created_by <> auth.uid() and not p.is_shared limit 1), current_date)'),
        ('member',   'aal1', 'ok',      'following: stop it',                             'update public.lift_plan_runs set ended_on = current_date where ended_on is null'),
        ('member',   'aal1', 'error',   'following: no starting months ahead',            'insert into public.lift_plan_runs (program_id, starts_on) values (' || plan || ', current_date + 90)'),
        ('member',   'aal1', 'ok',      'following: start it again',                      'insert into public.lift_plan_runs (program_id, starts_on) values (' || plan || ', current_date)'),
        ('member',   'aal1', 'error',   'following: can''t hard-delete a run',            'delete from public.lift_plan_runs')
      ) as v (who, aal, expected, label, sql)
    loop
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
          perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', t.aal)::text, true);
          perform set_config('role', 'authenticated', true);
        end if;

        if t.expected like 'rows=%' then
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

revoke all on function private.run_lift_tests() from public, anon, authenticated;
