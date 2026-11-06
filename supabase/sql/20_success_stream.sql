-- 20_success_stream.sql
-- Applied as migration 20_success_stream.
--
-- The crew feed is a stream of wins, with no reactions: PRs, clubs joined, season goals hit and
-- finished sessions. Props and comments (from 19) are dropped; they never held data. A win is
-- keyed by person, kind, day and title, so a heavier PR on the same lift the same day updates
-- its line instead of adding another.

drop table if exists public.lift_post_props;
drop table if exists public.lift_post_comments;
delete from private.limits where table_name in ('lift_post_props', 'lift_post_comments');

alter table public.lift_posts drop constraint if exists lift_posts_kind_check;
alter table public.lift_posts add constraint lift_posts_kind_check check (kind in ('session', 'pr', 'club', 'goal'));
drop index if exists public.lift_posts_one_per_day;
create unique index if not exists lift_posts_once on public.lift_posts (created_by, kind, performed_on, title) where deleted_at is null;

update private.limits set per_minute = 20, per_day = 80, max_live_rows = 5000 where table_name = 'lift_posts';
