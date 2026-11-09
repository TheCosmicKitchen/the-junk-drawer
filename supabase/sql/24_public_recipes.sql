-- 24_public_recipes.sql
-- Applied as migration 24_public_recipes.
--
-- The recipes aren't secret: once the admin approves one, anyone with the link can read it,
-- signed in or not. This is the one deliberate exception to "logged-out visitors get nothing"
-- (01_lockdown.sql), and it is as narrow as it can be:
--
--   * logged-out visitors (anon) can READ approved, not-removed recipes, and the families
--   * only the columns the page needs: not who wrote it, who approved it, or any timestamps
--     that would show who was active when
--   * drafts, recipes waiting for review, removed recipes, "I made this" notes, member names
--     and everything to do with lifting stay crew-only
--   * no writes of any kind; rate limits and the rest are unchanged
--
-- Tests: select * from private.run_public_recipe_tests();  Every row should say "pass".

grant select (id, family_id, slug, title, body, status) on public.recipes to anon;
grant select (id, name, about)                          on public.recipe_families to anon;

drop policy if exists "recipes: anyone reads approved" on public.recipes;
create policy "recipes: anyone reads approved" on public.recipes
  for select to anon
  using (status = 'approved' and deleted_at is null);

drop policy if exists "families: anyone reads" on public.recipe_families;
create policy "families: anyone reads" on public.recipe_families
  for select to anon
  using (deleted_at is null);

-- 06's test "logged-out: read recipes -> error" no longer holds; it now checks that a
-- logged-out visitor can't see who wrote a recipe instead (06_policy_tests.sql is updated to match).
do $$
declare
  d   text;
  old constant text := $q$('anon',      '',     'error',   'logged-out: read recipes',                   'select count(*) from public.recipes'),$q$;
  new constant text := $q$('anon',      '',     'error',   'logged-out: see who wrote a recipe',         'select count(created_by) from public.recipes'),$q$;
begin
  select pg_get_functiondef('private.run_policy_tests()'::regprocedure) into d;
  if position(old in d) = 0 and position(new in d) = 0 then
    raise exception 'run_policy_tests() does not have the expected test row; update it by hand.';
  end if;
  execute replace(d, old, new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tests: what a logged-out visitor can and can't see. Everything is undone at the end.
-- ---------------------------------------------------------------------------
create or replace function private.run_public_recipe_tests()
returns table (n int, who text, test text, expected text, got text, result text)
language plpgsql
set search_path = ''
as $$
declare
  admin_id  uuid;
  member_id uuid;
  t         record;
  uid       uuid;
  cnt       bigint;
  g         text;
  i         int := 0;
  k         int;
  r         text[] := '{}';
  body      constant text := '''{"ingredients": [{"name": "", "items": ["1 cup flour"]}], "steps": ["Mix."]}''';
begin
  select m.user_id into admin_id  from private.members m where m.is_admin and m.active order by m.added_at limit 1;
  select m.user_id into member_id from private.members m where not m.is_admin and m.active order by m.added_at limit 1;
  if admin_id is null or member_id is null then
    raise exception 'Needs an admin and a second member on private.members.';
  end if;
  begin
    for t in
      select * from (values
        (1,  'member', 'aal1', 'adds a draft',                       'insert into public.recipes (family_id, slug, title, body) values (''our-kitchen'', ''pt-draft'', ''Draft'', ' || body || ')', 'ok'),
        (2,  'member', 'aal1', 'sends one in for review',            'insert into public.recipes (family_id, slug, title, body, status) values (''our-kitchen'', ''pt-waiting'', ''Waiting'', ' || body || ', ''submitted'')', 'ok'),
        (3,  'admin',  'aal2', 'adds an approved one',               'insert into public.recipes (family_id, slug, title, body, status) values (''our-kitchen'', ''pt-approved'', ''Approved'', ' || body || ', ''approved'')', 'ok'),
        (4,  'admin',  'aal2', 'adds another approved one',          'insert into public.recipes (family_id, slug, title, body, status) values (''our-kitchen'', ''pt-gone'', ''Gone'', ' || body || ', ''approved'')', 'ok'),
        (4,  'admin',  'aal2', '...and removes it',                  'update public.recipes set deleted_at = now() where slug = ''pt-gone''',                     'ok'),
        (5,  'anon',   '',     'reads the approved recipe',          'select count(*) from public.recipes where slug = ''pt-approved''',                          '1'),
        (6,  'anon',   '',     'reads its title and body',           'select count(*) from public.recipes where slug = ''pt-approved'' and title = ''Approved'' and body ? ''steps''', '1'),
        (7,  'anon',   '',     'doesn''t see the draft',             'select count(*) from public.recipes where slug = ''pt-draft''',                             '0'),
        (8,  'anon',   '',     'doesn''t see one waiting for review','select count(*) from public.recipes where slug = ''pt-waiting''',                           '0'),
        (9,  'anon',   '',     'doesn''t see a removed one',         'select count(*) from public.recipes where slug = ''pt-gone''',                              '0'),
        (10, 'anon',   '',     'can''t see who wrote it',            'select count(created_by) from public.recipes',                                               'error'),
        (11, 'anon',   '',     'can''t see who approved it',         'select count(approved_by) from public.recipes',                                              'error'),
        (12, 'anon',   '',     'can''t see when it changed',         'select count(updated_at) from public.recipes',                                               'error'),
        (13, 'anon',   '',     'can''t see review notes',            'select count(review_note) from public.recipes',                                              'error'),
        (14, 'anon',   '',     'can''t add a recipe',                'insert into public.recipes (family_id, slug, title, body) values (''our-kitchen'', ''pt-x'', ''X'', ' || body || ')', 'error'),
        (15, 'anon',   '',     'can''t change a recipe',             'update public.recipes set title = ''Hacked'' where slug = ''pt-approved'' returning 1',    'error'),
        (16, 'anon',   '',     'can''t remove a recipe',             'delete from public.recipes where slug = ''pt-approved''',                                    'error'),
        (17, 'anon',   '',     'reads the families',                 'select count(*) from public.recipe_families where id = ''our-kitchen''',                     '1'),
        (18, 'anon',   '',     'can''t see who made a family',       'select count(created_by) from public.recipe_families',                                       'error'),
        (19, 'anon',   '',     'can''t add a family',                'insert into public.recipe_families (id, name) values (''pt-fam'', ''X'')',                   'error'),
        (20, 'anon',   '',     'can''t read "I made this"',          'select count(*) from public.recipe_cooks',                                                   'error'),
        (21, 'anon',   '',     'can''t read lifting',                'select count(*) from public.lift_sets',                                                      'error'),
        (22, 'anon',   '',     'can''t ask for member names',        'select count(*) from public.member_names()',                                                 'error')
      ) v(n, who, aal, test, sql, expected)
    loop
      uid := case t.who when 'admin' then admin_id when 'member' then member_id end;
      execute 'reset role';
      if t.who = 'anon' then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('role', 'anon', true);
      else
        perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', t.aal)::text, true);
        perform set_config('role', 'authenticated', true);
      end if;
      begin
        if t.sql like 'select%' then
          execute t.sql into cnt; g := cnt::text;
        else
          cnt := null;
          if t.sql like '%returning 1' then execute t.sql into cnt; else execute t.sql; cnt := 1; end if;
          g := case when cnt is null then 'error' else 'ok' end;
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
revoke all on function private.run_public_recipe_tests() from public, anon, authenticated;
