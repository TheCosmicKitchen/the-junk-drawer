-- 23_recipe_box.sql
-- Applied as migration 23_recipe_box.
--
-- Turns the recipe tables from 04 into something the recipe box pages actually use:
--
--   * review notes   when the admin sends a recipe back, they can say why (recipes.review_note).
--                    Only the admin can write it; it's cleared when the recipe is approved or
--                    when the author sends it in again.
--   * admin imports  the admin may add a recipe straight in as "approved", so the recipes
--                    already in the site's family files can be copied into the database once
--                    (the review page does this). Members still add drafts or submissions only.
--   * "I made this"  public.recipe_cooks: a member logs that they cooked a recipe, with an
--                    optional short note ("used half the salt"). The crew sees everyone's.
--                    Keyed by family + link name rather than by row id, so it keeps working for
--                    a recipe whether it lives in the database, a family file, or both.
--
-- Same rules as everything else: members only, own rows only, no hard deletes, rate limits,
-- row caps, the "nearly full" brake, and the audit log (private.protect).
-- Tests: select * from private.run_recipe_tests();  Every row should say "pass".

-- ---------------------------------------------------------------------------
-- Review notes
-- ---------------------------------------------------------------------------
alter table public.recipes add column if not exists review_note text;
alter table public.recipes drop constraint if exists recipes_review_note_size;
alter table public.recipes add constraint recipes_review_note_size
  check (review_note is null or char_length(review_note) <= 500);

create or replace function private.recipe_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin boolean := auth.uid() is null or private.is_admin();   -- dashboard counts as admin
begin
  if tg_op = 'UPDATE' and not admin and old.status = 'approved'
     and (new.title, new.body, new.slug, new.family_id) is distinct from (old.title, old.body, old.slug, old.family_id) then
    new.status := 'submitted';
  end if;

  if new.status = 'approved' and not admin then
    raise exception 'Only the admin can approve a recipe.';
  end if;

  -- Only the admin writes review notes. A member sending it in again clears the old note.
  if not admin then
    if tg_op = 'INSERT' then
      new.review_note := null;
    elsif new.status = 'submitted' and old.status is distinct from 'submitted' then
      new.review_note := null;
    else
      new.review_note := old.review_note;
    end if;
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_by := auth.uid();
    new.approved_at := now();
    new.review_note := null;
  elsif new.status <> 'approved' then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.recipe_status() from public, anon, authenticated;

-- The admin may add a recipe already approved (copying the family files in).
drop policy if exists "recipes: members add" on public.recipes;
create policy "recipes: members add" on public.recipes
  for insert to authenticated
  with check (
    (select private.is_member())
    and created_by = (select auth.uid())
    and (status in ('draft', 'submitted') or (select private.is_admin()))
    and exists (select 1 from public.recipe_families f where f.id = family_id and f.deleted_at is null)
  );

grant update (review_note) on public.recipes to authenticated;

-- ---------------------------------------------------------------------------
-- "I made this"
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_cooks (
  id          uuid primary key default gen_random_uuid(),
  family_id   text not null references public.recipe_families (id),
  slug        text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  cooked_on   date not null default current_date check (cooked_on >= date '2000-01-01'),
  note        text check (note is null or char_length(note) <= 280),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists recipe_cooks_by_recipe on public.recipe_cooks (family_id, slug, cooked_on desc);
create index if not exists recipe_cooks_by_person on public.recipe_cooks (created_by);
alter table public.recipe_cooks enable row level security;

drop policy if exists "cooks: members read" on public.recipe_cooks;
drop policy if exists "cooks: members add"  on public.recipe_cooks;
drop policy if exists "cooks: own changes"  on public.recipe_cooks;
create policy "cooks: members read" on public.recipe_cooks
  for select to authenticated
  using ((select private.is_member()) and (deleted_at is null or created_by = (select auth.uid())));
create policy "cooks: members add" on public.recipe_cooks
  for insert to authenticated
  with check (
    (select private.is_member())
    and created_by = (select auth.uid())
    and cooked_on <= current_date + 1
    and exists (select 1 from public.recipe_families f where f.id = family_id and f.deleted_at is null)
  );
create policy "cooks: own changes" on public.recipe_cooks
  for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()) and cooked_on <= current_date + 1);
-- No delete policy: "delete" means setting deleted_at.

revoke all on public.recipe_cooks from anon, authenticated;
grant select on public.recipe_cooks to authenticated;
grant insert (id, family_id, slug, cooked_on, note) on public.recipe_cooks to authenticated;
grant update (cooked_on, note, deleted_at)          on public.recipe_cooks to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows)
values ('recipe_cooks', 10, 60, 5000)
on conflict (table_name) do nothing;

select private.protect('public.recipe_cooks');

-- ---------------------------------------------------------------------------
-- Tests. Acts as the admin (with and without the code), a member, a stranger and a
-- logged-out visitor, and undoes everything at the end.
-- ---------------------------------------------------------------------------
create or replace function private.run_recipe_tests()
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
  k         int;
  r         text[] := '{}';
  rec       constant text := '''00000000-0000-4000-8000-0000000000d1''';
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
        (1,  'anon',     'aal1', 'can''t read cooks',                    'select count(*) from public.recipe_cooks',                                                         'error'),
        (2,  'member',   'aal1', 'adds a draft',                         'insert into public.recipes (id, family_id, slug, title, body) values (' || rec || ', ''our-kitchen'', ''test-buns'', ''Test Buns'', ' || body || ')', 'ok'),
        (3,  'member',   'aal1', 'can''t write a review note',           'update public.recipes set review_note = ''self-approved'' where id = ' || rec,                    'ok'),
        (4,  'member',   'aal1', '...the note was ignored',              'select count(*) from public.recipes where id = ' || rec || ' and review_note is null',            '1'),
        (5,  'member',   'aal1', 'can''t add one already approved',      'insert into public.recipes (family_id, slug, title, body, status) values (''our-kitchen'', ''sneak'', ''S'', ' || body || ', ''approved'')', 'error'),
        (6,  'member',   'aal1', 'sends it in',                          'update public.recipes set status = ''submitted'' where id = ' || rec,                             'ok'),
        (7,  'admin',    'aal2', 'sends it back with a note',            'update public.recipes set status = ''draft'', review_note = ''Which flour?'' where id = ' || rec, 'ok'),
        (8,  'member',   'aal1', 'sees the note',                        'select count(*) from public.recipes where id = ' || rec || ' and review_note = ''Which flour?''', '1'),
        (9,  'member',   'aal1', 'edits the draft, note stays',          'update public.recipes set title = ''Test Buns 2'' where id = ' || rec,                            'ok'),
        (10, 'member',   'aal1', '...still there',                       'select count(*) from public.recipes where id = ' || rec || ' and review_note is not null',        '1'),
        (11, 'member',   'aal1', 'sends it in again',                    'update public.recipes set status = ''submitted'' where id = ' || rec,                             'ok'),
        (12, 'member',   'aal1', '...which clears the note',             'select count(*) from public.recipes where id = ' || rec || ' and review_note is null',            '1'),
        (13, 'admin',    'aal1', 'without the code can''t approve',      'update public.recipes set status = ''approved'' where id = ' || rec || ' returning 1',            'error'),
        (14, 'admin',    'aal2', 'approves it',                          'update public.recipes set status = ''approved'' where id = ' || rec,                              'ok'),
        (15, 'admin',    'aal2', 'adds one already approved',            'insert into public.recipes (family_id, slug, title, body, status) values (''our-kitchen'', ''test-import'', ''Imported'', ' || body || ', ''approved'')', 'ok'),
        (16, 'member',   'aal1', 'sees the imported one',                'select count(*) from public.recipes where slug = ''test-import'' and approved_at is not null',     '1'),
        (17, 'member',   'aal1', 'can''t edit someone else''s',          'update public.recipes set title = ''Mine now'' where slug = ''test-import'' returning 1',         'error'),
        (18, 'member',   'aal1', 'logs a cook',                          'insert into public.recipe_cooks (id, family_id, slug, note) values (''00000000-0000-4000-8000-0000000000d2'', ''our-kitchen'', ''test-buns'', ''Less salt.'')', 'ok'),
        (19, 'admin',    'aal2', 'sees the crew''s cooks',               'select count(*) from public.recipe_cooks where id = ''00000000-0000-4000-8000-0000000000d2''',   '1'),
        (20, 'admin',    'aal2', 'can''t change someone else''s cook',   'update public.recipe_cooks set note = ''x'' where id = ''00000000-0000-4000-8000-0000000000d2'' returning 1', 'error'),
        (21, 'stranger', 'aal2', 'sees no cooks',                        'select count(*) from public.recipe_cooks',                                                         '0'),
        (22, 'stranger', 'aal2', 'can''t log a cook',                    'insert into public.recipe_cooks (family_id, slug) values (''our-kitchen'', ''test-buns'')',      'error'),
        (23, 'member',   'aal1', 'can''t log a cook in the future',      'insert into public.recipe_cooks (family_id, slug, cooked_on) values (''our-kitchen'', ''test-buns'', current_date + 5)', 'error'),
        (24, 'member',   'aal1', 'can''t log for a missing family',      'insert into public.recipe_cooks (family_id, slug) values (''nobody'', ''test-buns'')',            'error'),
        (25, 'member',   'aal1', 'can''t write a long note',             'insert into public.recipe_cooks (family_id, slug, note) values (''our-kitchen'', ''test-buns'', repeat(''x'', 281))', 'error'),
        (26, 'member',   'aal1', 'can''t hard-delete a cook',            'delete from public.recipe_cooks where id = ''00000000-0000-4000-8000-0000000000d2''',             'error'),
        (27, 'member',   'aal1', 'removes their own cook',               'update public.recipe_cooks set deleted_at = now() where id = ''00000000-0000-4000-8000-0000000000d2''', 'ok'),
        (28, 'admin',    'aal2', '...which the crew no longer sees',     'select count(*) from public.recipe_cooks where id = ''00000000-0000-4000-8000-0000000000d2''',   '0')
      ) v(n, who, aal, test, sql, expected)
    loop
      uid := case t.who when 'admin' then admin_id when 'member' then member_id when 'stranger' then stranger end;
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
revoke all on function private.run_recipe_tests() from public, anon, authenticated;
