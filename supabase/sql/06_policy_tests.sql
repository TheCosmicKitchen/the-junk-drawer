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
        ('anon',      '',     'error',   'logged-out: read workouts',                  'select count(*) from public.lift_workouts'),
        ('anon',      '',     'error',   'logged-out: call me()',                      'select count(*) from public.me()'),
        ('anon',      '',     'error',   'logged-out: add a family',                   'insert into public.recipe_families (id, name) values (''x'', ''X'')'),
        ('stranger',  'aal2', 'rows=0',  'not on the list: sees no families',          'select count(*) from public.recipe_families'),
        ('stranger',  'aal2', 'error',   'not on the list: add a workout',             'insert into public.lift_workouts (id) values (''00000000-0000-4000-8000-0000000000f1'')'),
        ('stranger',  'aal2', 'rows=0',  'not on the list: me() is empty',             'select count(*) from public.me()'),
        ('admin',     'aal1', 'rows=0',  'admin without code: sees nothing',           'select count(*) from public.recipe_families'),
        ('admin',     'aal2', 'some',    'admin with code: sees families',             'select count(*) from public.recipe_families'),
        ('member',    'aal1', 'ok',      'member: add an exercise',                    'insert into public.lift_exercises (id, name) values (''00000000-0000-4000-8000-0000000000e1'', ''Test squat'')'),
        ('member',    'aal1', 'ok',      'member: add a workout',                      'insert into public.lift_workouts (id) values (''00000000-0000-4000-8000-0000000000a1'')'),
        ('member',    'aal1', 'ok',      'member: add a set',                          'insert into public.lift_sets (id, workout_id, exercise_id, weight, reps) values (''00000000-0000-4000-8000-0000000000b1'', ''00000000-0000-4000-8000-0000000000a1'', ''00000000-0000-4000-8000-0000000000e1'', 100, 5)'),
        ('member',    'aal1', 'rows=1',  'member: sees own personal best',             'select count(*) from public.lift_bests'),
        ('member',    'aal1', 'error',   'member: impossible weight refused',          'insert into public.lift_sets (workout_id, exercise_id, weight, reps) values (''00000000-0000-4000-8000-0000000000a1'', ''00000000-0000-4000-8000-0000000000e1'', 99999, 5)'),
        ('admin',     'aal2', 'rows=0',  'admin: cannot see a member''s workouts',     'select count(*) from public.lift_workouts where id = ''00000000-0000-4000-8000-0000000000a1'''),
        ('admin',     'aal2', 'ok',      'admin: add own exercise',                    'insert into public.lift_exercises (id, name) values (''00000000-0000-4000-8000-0000000000e2'', ''Admin bench'')'),
        ('admin',     'aal2', 'error',   'admin: cannot add a set to member''s workout', 'insert into public.lift_sets (workout_id, exercise_id, reps) values (''00000000-0000-4000-8000-0000000000a1'', ''00000000-0000-4000-8000-0000000000e2'', 5)'),
        ('member',    'aal1', 'error',   'member: cannot set who created a row',       'insert into public.lift_workouts (id, created_by) values (''00000000-0000-4000-8000-0000000000a2'', gen_random_uuid())'),
        ('member',    'aal1', 'error',   'member: cannot hard-delete',                 'delete from public.lift_sets where id = ''00000000-0000-4000-8000-0000000000b1'''),
        ('member',    'aal1', 'ok',      'member: soft-delete a set',                  'update public.lift_sets set deleted_at = now() where id = ''00000000-0000-4000-8000-0000000000b1'''),
        ('member',    'aal1', 'rows=1',  'member: still sees own deleted set (undo)',  'select count(*) from public.lift_sets where id = ''00000000-0000-4000-8000-0000000000b1'' and deleted_at is not null'),
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
        ('member',    'aal1', 'error',   'rate limit: 40 exercises at once refused',   'insert into public.lift_exercises (name) select ''Rate test '' || g from generate_series(1, 40) g')
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
