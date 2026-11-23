# Regression suite

Three layers, fastest first. The first two run on every pull request (`.github/workflows/tests.yml`);
the third runs against the real database, by hand, around a migration.

```
npm install          # once
npm test             # unit + browser
npm run test:unit    # about a second
npm run test:e2e     # about a minute
```

## 1. Unit tests: `tests/unit/` (Node's own test runner, no dependencies)

The rules the app is built on, with no browser: dates (in a US time zone, so they cross daylight
saving), volume, milestones, PRs and bests, estimated maxes, plates, exercise search and near-match
names (`logic.test.mjs`); reading and writing sets of reps, time and distance, and bests for holds and
carries (`tracking.test.mjs`); following a plan week by week (`plans.test.mjs`); the library and the
workout generator (`library.test.mjs`). The recipe parser's tests run here too.

Add one when a rule changes, or when a bug turns out to be a rule: write the failing case first.

## 2. Browser tests: `tests/e2e/` (Playwright, the lift demo)

The app as people use it, at phone (Pixel 7) and desktop (1440 wide) sizes, against `lift/?demo`, so
no account and no network. Any page error or console error fails a test.

- `smoke`: every tab draws; the default look is Plain and named The Church of Iron; the first-visit
  theme note shows once, "Keep it plain" puts it away for good, "See themes" lets you pick one.
- `logging`: the picker lists results right under the filters with cardio behind a switch; search;
  opening a lift fills in last time straight away; logging returns to today with the set counted; a
  hold logs a time.
- `speed`: budgets on three years of history (`?demo&big=3`): the picker and a lift open in under
  150 ms of work, each tab draws in under 400 ms. Today they take a few ms; the budgets catch a
  regression, not noise.

Locally it uses the Edge already installed (`PW_CHANNEL=chrome` for Chrome); CI installs Chromium.
On a failure, `npx playwright show-report` has a screenshot and a step-by-step trace.

## Screenshots: `npm run shots` (not a test)

Every tab and the main sheets of the demo, phone and desktop, light and dark, in three themes,
written to `docs/lift-baseline/` for comparing before and after a change. See the README there.

## 3. Database tests: `supabase/sql/06_policy_tests.sql` and `37_lift_tests.sql`

Act as each kind of user (logged out, not on the list, a member, the admin with and without their
code) and try what should and shouldn't work. Everything is undone at the end, so they're safe on the
live project. Run both after every migration; every row should say `pass`:

```sql
select * from private.run_policy_tests() where result <> 'pass';
select * from private.run_lift_tests()   where result <> 'pass';
```

`run_policy_tests` covers the lockdown, sets, routines, seasons, challenges, imports and recipes;
`run_lift_tests` covers what came later: sets of time and distance, assisted sets, bests for holds and
carries, "last time", plans and following one.
