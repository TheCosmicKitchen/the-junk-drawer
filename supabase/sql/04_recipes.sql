-- 04_recipes.sql
-- The family recipe box, shared between members, never public.
--
--   recipe_families   one row per family ("Our Kitchen"). Only the admin adds or renames them.
--   recipes          one row per recipe. Members add and edit their own; the admin approves.
--
-- Status flow:  draft -> submitted -> approved   (or archived)
--   draft      only the author (and admin) can see it
--   submitted  every member can see it; waiting for the admin
--   approved   checked by the admin; this is what gets exported to the public site via git
--   A member editing an approved recipe sends it back to "submitted" automatically,
--   so nothing reaches the public site without the admin seeing the latest text.
--
-- Run after 01 and 02. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- What a recipe body may contain. Only these fields, only text and numbers,
-- every one with a size limit, and the video can only be a YouTube link.
-- That keeps the table to "recipes" and nothing else: no files, no arbitrary
-- links, no blobs smuggled into a spare field.
--
-- Body shape (matches the recipe box's JSON files, except ingredients):
--   from, unit, time        short strings
--   serves                  whole number 1..1000
--   video                   https YouTube link
--   tags                    up to 12 short strings
--   intro, notes            up to 3000 characters
--   ingredients             LIST of groups: [{"name": "Dough", "items": ["1 cup milk", ...]}, ...]
--                           (a list, not an object, because jsonb would re-sort object keys
--                           and lose the group order; the app converts to/from the file format)
--   steps                   up to 60 strings of up to 2000 characters
-- ---------------------------------------------------------------------------
create or replace function private.valid_recipe_body(b jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  g jsonb;
  v jsonb;
begin
  if b is null or jsonb_typeof(b) <> 'object' or pg_column_size(b) > 24000 then
    return false;
  end if;

  for k in select jsonb_object_keys(b) loop
    if k not in ('from', 'serves', 'unit', 'time', 'video', 'tags', 'intro', 'ingredients', 'steps', 'notes') then
      return false;
    end if;
  end loop;

  -- short strings
  foreach k in array array['from', 'unit', 'time'] loop
    if b ? k and (jsonb_typeof(b -> k) <> 'string' or char_length(b ->> k) > 80) then
      return false;
    end if;
  end loop;
  -- long strings
  foreach k in array array['intro', 'notes'] loop
    if b ? k and (jsonb_typeof(b -> k) <> 'string' or char_length(b ->> k) > 3000) then
      return false;
    end if;
  end loop;

  if b ? 'serves' and (jsonb_typeof(b -> 'serves') <> 'number'
                       or (b ->> 'serves')::numeric not between 1 and 1000
                       or (b ->> 'serves')::numeric <> trunc((b ->> 'serves')::numeric)) then
    return false;
  end if;

  if b ? 'video' and (jsonb_typeof(b -> 'video') <> 'string'
                      or char_length(b ->> 'video') > 200
                      or (b ->> 'video') !~ '^https://((www|m)\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)/[A-Za-z0-9_?=&/.%-]+$') then
    return false;
  end if;

  if b ? 'tags' then
    if jsonb_typeof(b -> 'tags') <> 'array' or jsonb_array_length(b -> 'tags') > 12 then return false; end if;
    for v in select jsonb_array_elements(b -> 'tags') loop
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') not between 1 and 30 then return false; end if;
    end loop;
  end if;

  if b ? 'ingredients' then
    if jsonb_typeof(b -> 'ingredients') <> 'array' or jsonb_array_length(b -> 'ingredients') > 20 then return false; end if;
    for g in select jsonb_array_elements(b -> 'ingredients') loop
      if jsonb_typeof(g) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(g) loop
        if k not in ('name', 'items') then return false; end if;
      end loop;
      if g ? 'name' and (jsonb_typeof(g -> 'name') <> 'string' or char_length(g ->> 'name') > 60) then return false; end if;
      if jsonb_typeof(g -> 'items') is distinct from 'array' or jsonb_array_length(g -> 'items') > 100 then return false; end if;
      for v in select jsonb_array_elements(g -> 'items') loop
        if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') not between 1 and 200 then return false; end if;
      end loop;
    end loop;
  end if;

  if b ? 'steps' then
    if jsonb_typeof(b -> 'steps') <> 'array' or jsonb_array_length(b -> 'steps') > 60 then return false; end if;
    for v in select jsonb_array_elements(b -> 'steps') loop
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') not between 1 and 2000 then return false; end if;
    end loop;
  end if;

  return true;
end;
$$;

-- A recipe can only leave "draft" once it has at least one ingredient and one step.
create or replace function private.recipe_complete(b jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_array_length(b -> 'steps'), 0) > 0
     and exists (
       select 1 from jsonb_array_elements(coalesce(b -> 'ingredients', '[]'::jsonb)) g
       where jsonb_array_length(g -> 'items') > 0
     );
$$;

-- Used inside CHECK constraints, so the signed-in role needs to be able to run them.
revoke all on function private.valid_recipe_body(jsonb) from public, anon;
revoke all on function private.recipe_complete(jsonb)   from public, anon;
grant execute on function private.valid_recipe_body(jsonb) to authenticated;
grant execute on function private.recipe_complete(jsonb)   to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_families (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),   -- also the file name: data/<id>.json
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  about       text check (char_length(about) <= 200),
  created_by  uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  family_id    text not null references public.recipe_families (id),
  slug         text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),  -- the "link name" in the recipe box
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  body         jsonb not null default '{}'::jsonb check (private.valid_recipe_body(body)),
  status       text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'archived')),
  approved_by  uuid,
  approved_at  timestamptz,
  created_by   uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint recipes_complete_unless_draft check (status = 'draft' or private.recipe_complete(body))
);
create unique index if not exists recipes_unique_slug
  on public.recipes (family_id, slug) where deleted_at is null;
create index if not exists recipes_by_status on public.recipes (status, family_id);

-- ---------------------------------------------------------------------------
-- Approval bookkeeping (named c_status: runs after a_guard and b_stamp).
-- Only the admin can approve; a member's edit of an approved recipe sends it
-- back for review; approving records who and when.
-- ---------------------------------------------------------------------------
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

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif new.status <> 'approved' then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.recipe_status() from public, anon, authenticated;

drop trigger if exists c_status on public.recipes;
create trigger c_status before insert or update on public.recipes
  for each row execute function private.recipe_status();

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
alter table public.recipe_families enable row level security;
alter table public.recipes         enable row level security;

drop policy if exists "families: members read"  on public.recipe_families;
drop policy if exists "families: admin adds"    on public.recipe_families;
drop policy if exists "families: admin changes" on public.recipe_families;
create policy "families: members read" on public.recipe_families
  for select to authenticated
  using ((select private.is_member()) and (deleted_at is null or (select private.is_admin())));
create policy "families: admin adds" on public.recipe_families
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy "families: admin changes" on public.recipe_families
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Reading: everything that's been shared, plus your own drafts and your own
-- deleted rows (for undo). The admin sees everything.
drop policy if exists "recipes: members read"   on public.recipes;
drop policy if exists "recipes: members add"    on public.recipes;
drop policy if exists "recipes: author or admin changes" on public.recipes;
create policy "recipes: members read" on public.recipes
  for select to authenticated
  using (
    (select private.is_member())
    and (
      (deleted_at is null and status in ('submitted', 'approved'))
      or created_by = (select auth.uid())
      or (select private.is_admin())
    )
  );
create policy "recipes: members add" on public.recipes
  for insert to authenticated
  with check (
    (select private.is_member())
    and created_by = (select auth.uid())
    and status in ('draft', 'submitted')
    and exists (select 1 from public.recipe_families f where f.id = family_id and f.deleted_at is null)
  );
create policy "recipes: author or admin changes" on public.recipes
  for update to authenticated
  using (
    (select private.is_member())
    and (created_by = (select auth.uid()) or (select private.is_admin()))
  )
  with check (
    (select private.is_member())
    and (created_by = (select auth.uid()) or (select private.is_admin()))
    and exists (select 1 from public.recipe_families f where f.id = family_id and f.deleted_at is null)
  );
-- No delete policy: "delete" means setting deleted_at.

revoke all on public.recipe_families, public.recipes from anon, authenticated;

grant select on public.recipe_families to authenticated;
grant insert (id, name, about)             on public.recipe_families to authenticated;  -- the rule above limits this to the admin
grant update (name, about, deleted_at)     on public.recipe_families to authenticated;

grant select on public.recipes to authenticated;
grant insert (id, family_id, slug, title, body, status)               on public.recipes to authenticated;
grant update (family_id, slug, title, body, status, deleted_at)       on public.recipes to authenticated;

select private.protect('public.recipe_families');
select private.protect('public.recipes');

-- ---------------------------------------------------------------------------
-- Starting data: the two families already in the repo. created_by has to be
-- set by hand here because the SQL editor isn't a signed-in user, so this
-- uses the admin's id from private.members. Run 04 after you've added
-- yourself to private.members (step 6 of the runbook), or run just this block again then.
-- ---------------------------------------------------------------------------
insert into public.recipe_families (id, name, about, created_by)
select f.id, f.name, f.about, m.user_id
from (values
  ('our-kitchen',    'Our Kitchen',    'Sample family to show the format. Rename it or replace it with a real one.'),
  ('example-family', 'Example Family', 'A second sample family, so the family filter has something to filter.')
) as f (id, name, about)
cross join lateral (select user_id from private.members where is_admin order by added_at limit 1) m
on conflict (id) do nothing;
