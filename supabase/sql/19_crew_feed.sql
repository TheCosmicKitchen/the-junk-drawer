-- 19_crew_feed.sql
-- Applied as migration 19_crew_feed.
--
-- The crew feed. A post is a session summary someone chose to share from their session recap:
-- a title, small totals (pounds, sets, minutes, exercise count, PR lines) and an optional note.
-- Never individual sets. One session post per person per day (sharing again updates it).
-- Everyone in the crew can read posts, give a 👊 prop and leave a one-line comment; only the
-- author changes or removes their own post, prop or comment. Rate limits and row caps apply.

create table if not exists public.lift_posts (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'session' check (kind in ('session')),
  performed_on  date not null,
  title         text not null check (char_length(btrim(title)) between 1 and 80),
  summary       jsonb not null default '{}' check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 4000),
  note          text check (note is null or char_length(note) <= 200),
  created_by    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create unique index if not exists lift_posts_one_per_day on public.lift_posts (created_by, kind, performed_on) where deleted_at is null;
create index if not exists lift_posts_recent on public.lift_posts (created_at desc);
alter table public.lift_posts enable row level security;

create table if not exists public.lift_post_props (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.lift_posts (id) on delete cascade,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists lift_post_props_once on public.lift_post_props (post_id, created_by) where deleted_at is null;
create index if not exists lift_post_props_post on public.lift_post_props (post_id);
alter table public.lift_post_props enable row level security;

create table if not exists public.lift_post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.lift_posts (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 200),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists lift_post_comments_post on public.lift_post_comments (post_id);
alter table public.lift_post_comments enable row level security;

-- posts
drop policy if exists "posts: read" on public.lift_posts;
drop policy if exists "posts: add" on public.lift_posts;
drop policy if exists "posts: change" on public.lift_posts;
create policy "posts: read" on public.lift_posts for select to authenticated
  using ((select private.is_member()) and (deleted_at is null or created_by = (select auth.uid())));
create policy "posts: add" on public.lift_posts for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid()) and performed_on between current_date - 7 and current_date + 1);
create policy "posts: change" on public.lift_posts for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));
revoke all on public.lift_posts from anon, authenticated;
grant select on public.lift_posts to authenticated;
grant insert (id, kind, performed_on, title, summary, note) on public.lift_posts to authenticated;
grant update (title, summary, note, deleted_at)             on public.lift_posts to authenticated;

-- props
drop policy if exists "props: read" on public.lift_post_props;
drop policy if exists "props: add" on public.lift_post_props;
drop policy if exists "props: change" on public.lift_post_props;
create policy "props: read" on public.lift_post_props for select to authenticated
  using ((select private.is_member()));
create policy "props: add" on public.lift_post_props for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_posts p where p.id = post_id and p.deleted_at is null));
create policy "props: change" on public.lift_post_props for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));
revoke all on public.lift_post_props from anon, authenticated;
grant select on public.lift_post_props to authenticated;
grant insert (id, post_id) on public.lift_post_props to authenticated;
grant update (deleted_at)  on public.lift_post_props to authenticated;

-- comments
drop policy if exists "comments: read" on public.lift_post_comments;
drop policy if exists "comments: add" on public.lift_post_comments;
drop policy if exists "comments: change" on public.lift_post_comments;
create policy "comments: read" on public.lift_post_comments for select to authenticated
  using ((select private.is_member()) and deleted_at is null);
create policy "comments: add" on public.lift_post_comments for insert to authenticated
  with check ((select private.is_member()) and created_by = (select auth.uid())
    and exists (select 1 from public.lift_posts p where p.id = post_id and p.deleted_at is null));
create policy "comments: change" on public.lift_post_comments for update to authenticated
  using ((select private.is_member()) and created_by = (select auth.uid()))
  with check ((select private.is_member()) and created_by = (select auth.uid()));
revoke all on public.lift_post_comments from anon, authenticated;
grant select on public.lift_post_comments to authenticated;
grant insert (id, post_id, body) on public.lift_post_comments to authenticated;
grant update (deleted_at)        on public.lift_post_comments to authenticated;

insert into private.limits (table_name, per_minute, per_day, max_live_rows) values
  ('lift_posts', 10, 40, 2000), ('lift_post_props', 30, 300, 20000), ('lift_post_comments', 10, 100, 5000)
on conflict (table_name) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, max_live_rows = excluded.max_live_rows;
select private.protect('public.lift_posts');
select private.protect('public.lift_post_props');
select private.protect('public.lift_post_comments');
