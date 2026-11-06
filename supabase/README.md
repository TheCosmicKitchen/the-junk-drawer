# Supabase for the junk drawer

A private, text-only database for **a weightlifting tracker** and **the family recipe box**, used by a small crew (hard limit: 3 accounts), on Supabase's free plan.

## Status (Nov 2026)

- Project `junk-drawer` (`tjavdrqrhhvzdptlbbfv`, us-east-1) exists in the free **TheCosmicKitchen** organisation.
- Every file in `sql/` up to `16_three_accounts.sql` is applied (each file's header names the migration it went in as).
- Accounts: John (admin) and Brandon are in. **Cynthia is next**: the limit is now 3 (`16_three_accounts.sql`); she still needs the invite steps in step 6.
- The exercise catalogue started from the Sisyfitness list and the spreadsheet import, then was cleaned up to 237 lifts (`14_catalog_cleanup_and_rest.sql`). The seed and merge lists aren't in this repo, because they come from private sources.
- `06_policy_tests.sql` passes 63/63. Supabase's security advisor only flags things that are deliberate (private tables with no policies; the functions members are meant to call; leaked-password protection, a dashboard switch).
- The web app is in [`../lift/`](../lift/). Try it without an account at `lift/?demo`.

## The constraints this is built around

1. **Text only.** No images, no file uploads.
2. **As locked down as possible.** About five people, nobody else.
3. **No way to be charged.**
4. **Resilient to a hijacked account**: someone using a stolen login to host something illegal, or to run up costs.

## How each worry is handled

| Worry | What stops it |
|---|---|
| Getting a bill | Free plan, in its own organisation, **with no payment method ever added**. Supabase's cost-control docs: *"you will not be charged while using the Free Plan."* Going over a limit restricts or pauses the project; it never bills. The only way to a bill is someone getting into **your Supabase account** and upgrading, so that account (and GitHub) get two-factor sign-in. |
| Strangers getting in | Sign-ups off. You create the accounts. Every rule also checks an **allowlist** (`private.members`), so even an account that somehow exists can't see or write anything unless you've added it. |
| Hosting files or images | No storage bucket, ever. 05_checks.sql shouts if one appears. |
| Hosting text for the world | Nothing is readable without signing in: logged-out visitors (the public key in the web page) have no rights on anything. Recipes only reach the public site when *you* commit them to git. |
| Smuggling content into recipes | Recipes accept only known fields, only text and numbers, with size limits on everything, and the only link allowed is a YouTube one. |
| Spamming email through the project | Email sign-in is off; people sign in with passwords you set. The project never sends email. |
| Filling the database | Per-person rate limits (per minute and per day), row caps, size limits on every text field, and a brake that stops all member writes at 400 MB (free plan: 500 MB). |
| Vandalism | People can only change their own rows. Nothing is hard-deleted from the app. An audit log records every change with before and after, so anything can be put back. |
| A stolen admin login | Your member row requires an authenticator-app code, enforced inside the database, not just in the web page. |
| Leaked keys | The page only ever has the **publishable** (anon) key, which is safe to be public because of all the above. The **secret** (service_role) key is never put in the page, the repo, or anywhere else. |

**Worst case with one hijacked family account:** the person can read the shared recipes and that account's own lift log, and write a limited amount of text that only your five people see. You'd spot it in the audit log, switch the account off with one line of SQL, and undo the changes from the log.

## What's in this folder

| File | What it does |
|---|---|
| `sql/01_lockdown.sql` | Strips every default right from logged-out visitors and new tables, turns off GraphQL, makes the `private` schema, and auto-enables row security on new tables. |
| `sql/02_core.sql` | The allowlist, the `is_member()` / `is_admin()` checks, rate limits and row caps, the who/when stamping, the audit log, and the two functions the browser can call (`me()`, `member_names()`). |
| `sql/03_lifting.sql` | Exercises, workouts and sets: private to each person. A personal-bests view. |
| `sql/04_recipes.sql` | Families and recipes, shared with members, with a draft → submitted → approved flow, and strict checks on what a recipe may contain. |
| `sql/05_checks.sql` | A health check. The first query must return no rows; every row is a hole. Then some useful information (size, members, recent changes). |
| `sql/06_policy_tests.sql` | Acts as each kind of user (logged out, stranger, member, admin with and without the code) and tries 36 allowed and forbidden things. Undoes everything. Every row should say `pass`. |

The SQL has been syntax-checked with Postgres's own parser (all statements, every function body, and every test statement), but it hasn't been run against a real database yet. Step 8 is where that happens.

---

## Runbook

Do these in order. Tick them off as you go. Dashboard menu names move around now and then, so if a label doesn't match exactly, look for the nearest thing.

### 1. Lock your own accounts first

- [ ] GitHub: two-factor sign-in on (a passkey or authenticator app).
- [ ] Supabase: sign in with GitHub, or turn on two-factor sign-in under Account → Security.
- [ ] Keep the database password and every family password in a password manager.

*Why first:* these two accounts are the only real way to a bill or to the data. Everything else assumes they're safe.

### 2. Make a free organisation and project

- [ ] Create a **new organisation** just for this, on the **Free** plan. Don't add a payment method, now or later.
- [ ] Only you in the organisation (Organisation → Team).
- [ ] New project in that organisation. Pick the region nearest you. Use the generated database password and save it in the password manager.

*Note:* free projects pause after about a week with no database activity. Your data stays; you press **Restore** in the dashboard. Regular lifting keeps it awake.

### 3. Authentication settings

Under **Authentication**:

- [ ] **Sign-ups off.** Find the "Allow new users to sign up" switch (Sign In / Providers, or the auth settings page) and turn it off.
- [ ] **Email provider:** keep it on for email + password sign-in, but don't use magic links or email confirmation; you'll create confirmed users yourself.
- [ ] **Every other provider off** (Google, GitHub, phone, and so on).
- [ ] **Anonymous sign-ins off.**
- [ ] **Multi-factor:** authenticator app (TOTP) enabled.
- [ ] **Passwords:** minimum length 12 or more. If "leaked password protection" is offered on your plan, turn it on.
- [ ] **URL configuration:** Site URL `https://thecosmickitchen.github.io/the-junk-drawer/`, and the redirect allowlist containing only that (plus `http://localhost:8771/` while testing).

### 4. API and database settings

- [ ] **Project Settings → Data API:** exposed schemas = `public` only. Remove `graphql_public` if it's listed (after step 5 it's gone anyway).
- [ ] **Project Settings → API keys:** note the **publishable** (or "anon") key and the project URL; those go in the web page. Don't copy the **secret** / `service_role` key anywhere.
- [ ] **Database → Settings:** turn on "enforce SSL" if it's offered. If **network restrictions** are available on the free plan, restrict direct database connections to your own IP. (This doesn't affect the website, which goes through the API.)
- [ ] **Storage:** create nothing. **Edge Functions:** deploy nothing. **Realtime:** add no tables.

### 5. Run the lockdown and core SQL

In **SQL Editor**, open a new query, paste the whole file, and run it:

- [ ] `sql/01_lockdown.sql`. If only the last block (the event trigger) errors with a permissions message, that's fine: delete that block and run the rest. Step 8 catches the same thing.
- [ ] `sql/02_core.sql`

### 6. Create the people

First invite each email. **An account can only be created for an invited email**, and at most 3 accounts can exist (`09_invite_list.sql`, raised in `16_three_accounts.sql`), so a stranger using the public sign-up endpoint is refused:

```sql
insert into private.invited_emails (email, note) values ('you@example.com', 'me'), ('them@example.com', 'Brandon');
```

Adding someone later (as with Cynthia) is the same three steps for one email: invite it, create the user, add the `private.members` row.

Then **Authentication → Users → Add user → Create new user**, for each person:

- [ ] email + a strong password (from your password manager), with **auto-confirm** ticked.

Then put each one on the allowlist in the SQL editor (swap in real emails and names):

```sql
insert into private.members (user_id, display_name, is_admin, require_mfa)
select id, 'Your name', true, true from auth.users where email = 'you@example.com';

insert into private.members (user_id, display_name)
select id, 'First name' from auth.users where email = 'them@example.com';
```

Each insert should say "INSERT 0 1". If one says "INSERT 0 0", the email didn't match an account.

*Your row has `require_mfa = true`:* the database won't let you do anything from the app until you've signed in with your authenticator code. The login page (step 9) walks through setting that up. The dashboard isn't affected.

### 7. Run the app tables

- [ ] `sql/03_lifting.sql`
- [ ] `sql/04_recipes.sql`. Its last block adds the two families that are already in the repo, owned by you. Run step 6 before this, or just re-run that last block afterwards.

### 8. Prove it

- [ ] Run `sql/05_checks.sql`. **The first result must be empty.** Fix anything it lists.
- [ ] Run `sql/06_policy_tests.sql`. **Every row should say `pass`** (or `skip` if you haven't added a second member yet). Nothing it does is kept.
- [ ] Re-run both after any change in the dashboard.

If a test fails, the `got` column says what happened instead. Send me the output and we'll fix the SQL together.

### 9. The browser side (next session, with me)

What gets built in the junk drawer once the database exists:

- **`supabase.js` + a sign-in page:** email and password, then the authenticator code where required, including first-time setup with a QR code. The project URL and publishable key go in one small config file. The client library is pinned to an exact version from a CDN.
- **A content security policy** on the signed-in pages: scripts only from the site itself and the pinned CDN, and network requests only to your Supabase project. This limits the damage of any script-injection bug, which is the main way a session gets stolen.
- **Lifting tracker:** log a session quickly on a phone (exercise picker, weight × reps, warm-up toggle), see history and personal bests, kg or lb, and "export everything" to a file.
- **Recipe box:** the entry page gets **Submit** next to Download. You get a review screen: approve, then **Download family file**, which builds `data/<family>.json` from approved recipes in exactly the current format (converting ingredient groups back from the list form). Then you commit it as now.

---

## Design notes

**Why passwords, not magic links.** Supabase's built-in email service is heavily limited, and email you send can be abused. With passwords you create, the project sends no email at all. The cost is that you reset passwords by hand, which is fine for five people.

**Why recipes reach the public site through git, not the database.** The public site can't be made to depend on the database without opening read access to the world. Keeping git as the only route to the public means a hijacked account can never publish anything, and you review every change as a diff.

**Why ingredient groups are a list.** Postgres's `jsonb` type re-sorts object keys, which would scramble "Dough, Filling, To finish". So the database stores `[{"name": "Dough", "items": [...]}, ...]` and the app converts to and from the file format.

**Why soft deletes.** Members can't run `DELETE` at all. "Delete" sets `deleted_at`, and the row stays visible to its owner for undo. You can purge for real from the dashboard.

**Why the rules are checked in the database and not the page.** Anyone can open the browser console and call the API directly with the public key. Everything that matters (who can read what, limits, approval, MFA for admins) is enforced by Postgres, so the page is a convenience, not a guard.

**Limits (in `private.limits`, editable):**

| Table | Per minute | Per day | Live rows per person |
|---|---|---|---|
| lift_exercises | 30 | 200 | 500 |
| lift_workouts | 30 | 100 | 10,000 |
| lift_sets | 120 | 2,000 | 100,000 |
| recipe_families | 10 | 50 | 50 (admin only) |
| recipes | 20 | 200 | 2,000 |

Five sets each of five exercises, four times a week, is about 5,000 sets a year, so 100,000 is roughly 20 years of lifting.

## Running it day to day

**Monthly glance (2 minutes):** run `05_checks.sql`. Look at the database size and the "changes per person per day" table. Check Usage in the dashboard.

**If an account looks hijacked:**

```sql
-- 1. Lock them out of everything, instantly
update private.members set active = false where display_name = 'Name';
-- 2. End their sessions
delete from auth.sessions where user_id = (select user_id from private.members where display_name = 'Name');
```

Then set a new password in Authentication → Users, look through `private.audit_log` for what changed, and restore any rows from `old_row`. Switch them back on with `active = true` when sorted.

**Trimming the audit log** (keeps 180 days):

```sql
select private.prune_audit();
```

**Backups:** the free plan has no automatic backups. Recipes that matter end up in git anyway. For the rest, the lifting tracker will have "export everything", and you can take a full copy any time with the Supabase CLI (`supabase db dump`) from your own computer.

## Open questions for you

- **Units:** kg or lb as the default for new workouts? (Currently kg; each workout can switch.)
- **Families:** only you can create a family right now. Should members be able to?
- **Who's in:** the five people, and which of them besides you (if any) should need an authenticator code.
- **Lifting extras for later:** routines or templates ("Push day"), rest timers (the recipe box already has timers we can reuse), bodyweight charts.

Sources: [Supabase pricing](https://supabase.com/pricing), [Supabase cost control](https://supabase.com/docs/guides/platform/cost-control).
