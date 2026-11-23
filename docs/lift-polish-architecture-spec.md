# Lift: polish, feel and architecture — the spec

A working document for the agent that rebuilds the lift app's front end (`lift/`). It is meant to
survive context clears: **everything you need is in this file and the repo**. Tick boxes as you go,
append to the log at the bottom, and commit this file with every piece of work.

---

## 0. How to work from this file (read every time you start)

**The work is tracked as GitHub issues:** the pinned tracking issue
[#91](https://github.com/TheCosmicKitchen/the-junk-drawer/issues/91) lists issues #54–#90 in order
(labels `lift-rebuild`, `phase-0`…`phase-5`, `needs-decision`). Each issue has its own checklist
and "done when". §5 below is the same list, for reading offline; the issues are the source of
truth for what's done.

1. Read this whole file, then `tests/README.md`, then `git log --oneline -15` and `git status`,
   then the tracking issue (`gh issue view 91`).
2. Take the first open issue in the tracking list. That is your next task. If one is half done,
   its comments and the log (§9) say how far it got.
3. Work on a branch (`lift-rw-<phase>-<short-name>`), never on `main`. One PR per box or small group
   of boxes. The user merges; ask before merging.
4. Before every commit: `npm test` (unit + browser) must pass. If a test is wrong rather than the
   app, fix the test in the same commit and say why in the commit message.
5. After every PR: tick the box(es), add a line to §9 with the date, branch, PR link and anything
   the next session must know. Commit that with the work.
6. Never start a phase before the previous one's "done when" is true.
7. When unsure about a product decision, add it to §8 (open questions) and ask the user; don't
   guess on things in §2.

---

## 1. Goal and non-goals

**Goal:** the same app, rebuilt so that it is
- **modular**: small files by feature, each screen and sheet its own component; no 5,000-line file;
- **efficient**: a tap updates only what changed; long lists draw only what's on screen; the app
  opens from the offline snapshot instantly and stays fast on three years of history;
- **nice to use**: smooth motion, sheets you can drag, consistent cards and spacing, clear empty and
  loading states, good on a phone first and powerful on a desktop.

**Non-goals (don't do these without asking):**
- New features, new tables, or schema changes. Front end only. If something truly needs a
  migration, stop and ask (migrations always need the user's explicit OK).
- Changing what the app does or says, except where §6 lists a polish change.
- A build pipeline that needs a server, a paid service, or anything beyond GitHub Pages serving
  static files.

---

## 2. Hard constraints (from the user; do not break)

- [ ] **Security first.** Supabase with row-level security is the whole backend. Never put keys
  other than the publishable one in the front end; never weaken a policy; never add a service that
  can cost money. Text only (no image uploads).
- [ ] **Static site on GitHub Pages.** It must work by opening `lift/index.html` from Pages. If you
  use a library, vendor a pinned copy into `lift/vendor/` (and list it in `sw.js`) so the app works
  offline and never depends on a CDN at runtime. Record each library, version and licence in
  `lift/vendor/README.md`.
- [ ] **No build step required to run.** A small optional build (e.g. to bundle for speed) is fine
  only if the unbuilt files also run; ask first.
- [ ] **Demo mode keeps working**: `lift/?demo` (no account, no network) and `?demo&big=3` (three
  years of history, ~250 lifts) are how everything is tested.
- [ ] **Offline and sync behaviour is kept exactly**: the outbox (sets logged offline are saved on
  the phone and sent later, in order, with undo), the snapshot (the app draws from the last thing
  you saw, then refreshes), and the service worker (bump `CACHE` in `lift/sw.js` whenever shell
  files change, and keep its file list in sync).
- [ ] **Themes are skins.** A theme changes colours, lettering, logo, icons and words — never data
  or behaviour. Every screen must work in every theme (18 themes, `lift/themes.js`). The default is
  **Plain**; the app is named **The Church of Iron**; the Catholic "Church of Iron" theme is an
  option, not the default.
- [ ] **The feed shows wins only** (PRs, clubs, goals, records, finished sessions). No kudos, no
  comments. Sharing is opt-in per person (`prefs.shareWins`).
- [ ] **Privacy**: never commit anyone's personal data (emails, real workout data) to the public
  repo. Fixtures use the demo data.
- [ ] **Branches and PRs**, never commits to `main`. The user merges.
- [ ] **Phone first, desktop powerful**: the plan and routine designers are desktop pages; the
  phone gets the minimal versions. Keep both.

---

## 3. Where things are today (snapshot, 2026-11-23)

```
lift/index.html   1,008  page shell + ALL css (tokens, components, themes' base) + static brand
lift/app.js       5,535  everything on screen: ~390 functions, global state S, 23 sheet modes
lift/data.js        683  SupaStore (Supabase) and DemoStore (in-memory demo), same methods
lift/themes.js    1,121  18 themes: colours, words (T), logos, tab icons, applyTheme()
lift/logic.js       298  pure: dates, volume, PRs, e1RM, plates, search, near-match, daysToFinish
lift/tracking.js    162  pure: set fields (reps/time/distance), reading a set, bests for holds/carries
lift/plans.js        63  pure: plan weeks, today's workout, % of best, deload
lift/library.js     102  pure: muscles/equipment (data or name rules), weekly muscle coverage
lift/generate.js     75  pure: workout generator
lift/seasons.js     263  season packs (curated content)
lift/charts.js      167  SVG charts (needs document)
lift/share.js       161  share-a-picture canvas
lift/sw.js           45  service worker (cache list + version)
lift/boot.js, config.js, starters.js   tiny
```

**How app.js works now** (so you can move it piece by piece):
- **State:** one global `S` (catalogue, recent sets, days, bests, feats, routines, seasons, wins,
  plans…), plus `prefs` (localStorage) and `LG` (the open sheet's state).
- **Drawing:** `render()` rebuilds the current tab's `#view.innerHTML` from strings
  (`renderLog`, `renderRoutines`, `renderLibrary`, `renderHistory`, `renderSeasons`,
  `renderProgress`). Some hot paths patch in place (`redrawAfterStep`, `syncTicks`, `drawResults`).
- **Sheets:** one `<dialog id="sheet">` whose `#sheetInner` is rebuilt per `LG.mode`:
  `pick, entry/edit, cardio, design, progdesign, plandesign, exinfo, menu, recap, season,
  seasonstart, seasonprog, wizard, program, starters, gen, chunk, newpick, newex, libaddto,
  addtoday, pickwk, sched, use`. `PAGE_MODES` open full-page with a history entry.
- **Events:** delegated click/input/change listeners on `view` and `inner`, dispatched by
  `data-*` attributes.
- **Data:** `store` is a SupaStore or DemoStore; `fetchAll()` → `applyData()`; writes go through
  the outbox (`logSets`, `editSet`, …) and `postWin`.
- **Memo helpers:** `memoOn`, `recentBy`, `itemsByTpl`, `taskMemo`, `libStats` — the existing
  performance work (PR #42); keep their effect.

**Tests that guard behaviour** (`tests/`): unit (node --test, pure modules) and browser
(Playwright on the demo, phone + desktop). Browser tests use these selectors — keep them working
or update the tests in the same commit: `#fab`, `#navLog`, `#exSearch`, `#exResults [data-pick]`,
`#pkFilters`, `[data-pk-kind]`, `#resTitle`, `#sheetTitle`, `#lastLine`, `#wIn`, `#aIn`, `#nIn`,
`#saveBtn`, `.trio`, `#view .hero`, `.tabs a[href="#…"]`, `.brand-name`, `html[data-skin]`,
`.theme-hint`, `#sheet [data-skin]`, `#gMetric`, `#gEx`, `#gExRes [data-gex]`, `#gTarget`,
`#gAdd`, `#snGoals`, `#snErr`, `#view [data-core-edit]`, `#libSearch`, `#libList [data-lib-ex]`,
`#libFilters [data-lib-mus]`, `#musclesBox`, `.mus-row`, `[data-mus-week]`, `.lib-sub`.
Prefer adding `data-testid` going forward.

**Database tests** (run after any migration, not part of this work): `private.run_policy_tests()`
and `private.run_lift_tests()` — see `tests/README.md`.

---

## 4. Target architecture (decided; change only with the user)

- **UI library:** Preact + `@preact/signals` + `htm` (tagged templates, no JSX, no build),
  vendored as pinned ES modules in `lift/vendor/`. About 10 KB total. Reason: components and
  fine-grained updates without a build step; looks like plain JS for future readers.
  (Fallback if the user prefers zero dependencies: `lit-html` for templates + a 50-line signals
  module. Ask before switching.)
- **Layout:**
  ```
  lift/
    index.html            shell only: <div id="app">, meta, boot.js, preload links
    main.js               start-up: snapshot → render → fetch → refresh; service worker
    vendor/               preact, signals, htm (pinned) + README with versions/licences
    core/                 pure logic (logic, tracking, plans, library, generate, seasons) — unchanged APIs
    data/                 store.js (Supabase), demo.js (DemoStore), outbox.js, snapshot.js, sync.js
    state/                signals: catalogue, sets, days, bests, routines, seasons, wins, prefs, ui
    ui/                   shared components: Sheet, Page, Card, Chip, Seg, Bar, Stepper, List, Toast, Empty, Skeleton
    screens/log/          LogPage, Hero, TodayCard, ExerciseCard, RestTimer, Recap, …
    screens/picker/       Picker, Results, KindSwitch
    screens/logger/       Logger (entry/edit), Trio, MoreFields
    screens/routines/     …  screens/plans/  screens/library/  screens/history/  screens/progress/
    screens/seasons/      …  screens/feed/   screens/settings/
    styles/               tokens.css, base.css, components.css, one css per screen (plain CSS, @layer)
    themes/               themes.js split: one file per theme + index (data only)
  ```
- **State:** signals for each data slice; derived values with `computed` (today's sets, recent by
  exercise, bests map, weekly coverage, following, plan today). No component reads `S` directly.
- **Routing:** hash routes as today (`#log`, `#routines`, `#library`, `#history`, `#seasons`,
  `#progress`, `#r-<id>`, `#s-<id>`), plus a sheet stack with history entries so Back closes the top
  sheet on phones.
- **Data layer:** one module owns Supabase calls, retries, the outbox and the snapshot. Screens
  call actions (`logSet`, `editSet`, `postWin`, `saveRoutine`…) — never `store.*` directly.
- **Styles:** CSS custom properties as tokens (colour, space, radius, type scale, motion), set by
  the theme; components use tokens only. `@layer base, components, screens, theme`.
- **Accessibility:** every control reachable by keyboard, visible focus, labels on icon buttons,
  `prefers-reduced-motion` honoured, contrast AA in every theme (check with a script).

---

## 5. The work, phase by phase (tick as you go)

### Phase 0 — baseline (no behaviour change)
- [x] Create `docs/lift-baseline/`: phone (375×812) and desktop (1440×900) screenshots of every tab
  and every sheet in the demo, light and dark, Plain theme + 2 others. Script it (Playwright) so it
  can be re-run: `npm run shots`. Commit the script, not necessarily the PNGs (keep under 5 MB).
- [ ] Record performance baselines on `?demo&big=3` into §9: app open to first paint, picker open,
  lift open, each tab switch, logging a set → card updated (use `performance.now` in-page, as
  `tests/e2e/speed.spec.mjs` does).
- [ ] Add `data-testid` to the elements the tests use (keep the ids too) so tests stop depending on
  markup details.
- [ ] Add browser tests for flows not yet covered: routine follow → steps tick; plan designer save
  (desktop); cardio log; settings unit switch; undo a deleted set; offline log then sync (DemoStore
  can simulate `_sync`); season page opens; calendar month switch. **Done when** `npm test` covers
  every tab and the main sheet of each tab.

### Phase 1 — foundations (old UI still running)
- [ ] Vendor Preact, signals, htm (pinned, licences recorded); add to `sw.js`; bump cache.
- [ ] Move pure modules into `lift/core/` with re-export shims at the old paths (so nothing breaks).
- [ ] Split `data.js` into `data/store.js`, `data/demo.js`; extract the outbox and snapshot from
  app.js into `data/outbox.js`, `data/snapshot.js` with unit tests (the outbox is the riskiest
  code: write tests for ordering, retry, undo, delete-while-in-flight before moving it).
- [ ] Create `state/` signals and have the **old** app.js write to them after `applyData` and after
  each write, so new components can read live state while old screens still render.
- [ ] Split CSS out of `index.html` into `styles/` with tokens; no visual change (compare to the
  Phase 0 screenshots).
- [ ] Split `themes.js` into data files per theme + `applyTheme` (unchanged output).
- [ ] Build the shared `ui/` components with a demo page (`lift/ui-gallery.html`, not linked from
  the app) showing each in every theme. **Done when** the gallery renders every component in all
  18 themes, light and dark, with no console errors.

### Phase 2 — move screens one at a time (each box = one PR, tests green before and after)
Order is by use and risk; each new screen mounts in place of the old `render*` function.
- [ ] Exercise picker (search, filters, Weights/Cardio switch, "also called", recents).
- [ ] Logger sheet (entry and edit: trio boxes, steppers, More, PR flag, last time, rest row).
- [ ] Log tab (hero, today's exercise cards, follow card, plan card, cardio card, weekly card,
  theme note, finish/recap, auto-finish).
- [ ] Routines tab (your week, routines list, routine editor page, blocks/supersets, schedule).
- [ ] Plan designer (desktop page) and plan following; program designer.
- [ ] Library tab and exercise info sheet.
- [ ] Progress tab (KPIs, charts, calendar heatmap, Muscles card, records, top lifts, clubs).
- [ ] Calendar/History tab.
- [ ] Seasons tab, season page, wizard, packs/stamps, Wrapped.
- [ ] Feed (wins list, session cards) — shared by Log and season pages.
- [ ] Settings sheet, sign-in gate, share-a-picture.
- [ ] Delete the old `render*`/sheet code as each screen moves; app.js shrinks to nothing.
  **Done when** app.js is gone (or < 200 lines of glue) and every file is < 400 lines.

### Phase 3 — polish and feel
- [ ] Motion system: tokens for durations/easings; sheet slide-up and page slide-in with spring
  feel; list items animate in/out on log/undo; respect reduced motion.
- [ ] Sheets you can drag down to close on phones; desktop sheets stay centred dialogs.
- [ ] Skeletons instead of "Loading…" (season feed, records, last time if ever slow).
- [ ] Empty states with one clear action for every list (no routines, no seasons, no sets today,
  no matches).
- [ ] Long lists draw only what's visible (library of ~850 lifts, picker "show all", calendar
  history, feed): windowing or `content-visibility` + paging; keep search instant.
- [ ] Consistent cards: one Card component; session cards, win rows, day folds share spacing and
  type scale. Decide with the user (§8) whether an unfinished day's wins become a compact card.
- [ ] Touch targets ≥ 44 px; steppers support press-and-hold to repeat; haptics where the app
  already vibrates.
- [ ] Number entry: the trio boxes select-all on focus, `inputmode` right per field, Enter logs.
- [ ] Keyboard on phones never hides the field being typed into or the first results.
- [ ] Desktop: keyboard shortcuts (`/` search, `n` new set, `Esc` close), hover states, wider
  layouts for Progress and Library.
- [ ] Theme QA: every screen in all 18 themes, light and dark; fix contrast and overflow
  (long names like "The Church of Iron", "Bent Over Dumbbell Rear Delt Raise With Head On Bench").
- [ ] Copy pass with the theme words (T): no "0 lb", no "undefined", plural/singular right.

### Phase 4 — performance budgets (enforced by tests)
- [ ] On `?demo&big=3`: first paint from snapshot < 300 ms after script start; picker open and
  lift open < 50 ms of script; tab switch < 100 ms; logging a set → UI updated < 50 ms. Put the
  budgets in `tests/e2e/speed.spec.mjs` (they're 150/400 ms today; tighten once met).
- [ ] Total JS shipped (gzip) recorded in §9; no regression vs Phase 0 by more than the vendored
  libraries (~10 KB).
- [ ] Lighthouse (mobile) ≥ 95 performance and accessibility on the demo; record scores in §9.

### Phase 5 — finish
- [ ] Remove shims and dead code; one module per concern; README section in `lift/` explaining the
  structure (a map like §4's layout, kept true).
- [ ] Update `tests/README.md` with any new layers.
- [ ] Re-run the Phase 0 screenshots and attach before/after to the final PR.
- [ ] Update this file: everything ticked, §9 has the summary.

---

## 6. Known polish items already noticed (fold into the phases above)
- [ ] Feed: an unfinished day shows a scatter of PR rows while finished days show a card —
  auto-finish (PR #52) now posts the card after 12 h; check whether anything still looks uneven.
- [ ] Season feed: earlier days fold to one line; in the demo, expanding an earlier day shows no
  wins (seeded wins don't appear) — find out whether that's demo data or a real bug.
- [ ] Picker title + Weights/Cardio switch wrap to two lines at 375 px; tighten.
- [ ] Muscles card: on Mondays "This week" is empty — consider defaulting to last week until the
  first set of the week.
- [ ] Goal form: the lift picker list and the plan designer's lift list should share the same
  search component.
- [ ] Library has ~850 lifts now: needs windowing and better grouping (variations under a main
  lift, using the `variation_on` idea — needs the user's OK if it needs data).

## 7. Things not to break (regression checklist for every PR)
- [ ] Log a set offline, reload, it's still there; go online, it syncs once.
- [ ] Undo after logging and after deleting.
- [ ] Last time fills in instantly for an old lift (data comes from `last_days_before`).
- [ ] Following a routine ticks steps, offers the next, finishes.
- [ ] A plan's week, phase and % load show on Log.
- [ ] Themes switch live; the first-visit note works; default is Plain.
- [ ] Sign-in gate: members only; admin needs their code (MFA); non-members see nothing.
- [ ] `npm test` green; no console errors in any tab.

## 8. Open questions for the user (add, don't guess)
- Unfinished-day wins as a compact card? (no set details, for privacy)
- A server-side job so workouts auto-finish even if the phone never opens the app?
- Group library variations under a main lift?
- OK to add an optional build step later for bundling, if the no-build version stays working?

## 9. Log (append; newest last)
- 2026-11-23 — Spec written. Baseline: 33 unit + 32 browser tests green on main (`6a7d420`).
  Database: 854 live lifts, migrations through 38. Nothing in §5 started.
- 2026-11-23 — #54 screenshot baseline, branch `lift-rw-0-shots`. `npm run shots` (tests/shots.mjs)
  captures 17 screens × phone/desktop × light/dark × Plain/King/Arcade = 204 JPEGs in ~4 min;
  only Plain (68, ~4 MB) is committed, the rest are gitignored. Found while scripting it:
  (1) picking a lift within 120 ms of typing throws in `setResTitle` (the debounced search runs
  after the picker is gone) — fix under #85; (2) `openWizard` is never called (dead code, or a
  lost entry point) — decide in Phase 2 (#73). The plan designer shot is a new plan: the demo has
  no plan of its own to edit.
