# Lift widgets

Opt-in extras for the lift app, switched on in **Settings → Widgets**. They're off by default and
saved per device (in `lift.prefs`, like the theme). They give the app room to grow with things
people choose, without cluttering it for everyone else.

## How a widget works

Code lives in `lift/widgets/`. `index.js` lists the widgets; each is a plain object:

| field | what it is |
|---|---|
| `id`, `name`, `blurb` | shown in the Widgets list |
| `where` | where its card goes; today only `'log'` (the Log tab, after today's logging) |
| `start(ctx)` | its saved data the first time it's switched on |
| `card(ctx)` | its card as an HTML string; the root carries `data-widget="<id>"` |
| `click(btn, ctx)` | a tap on a button in its card; return `true` to redraw |

`ctx` holds `today`, the lifting history (`days`: one row per day ever, and `recent`: the sets from
the last 120 days), the widget's own saved `data`, `save(patch)`, and `esc` for anything typed.

Rules:
- **Widgets only read.** They never write sets, wins or anything else in the database, so they need
  no migration and can't break your data.
- **Keep the logic pure** (no DOM, no app state) and unit-test it, like `pet.js`.
- **Use the theme's colours** (CSS variables), so a widget fits all 18 themes.
- A widget that throws leaves its card out; the Log tab still draws.
- When the rebuild (#91) moves the Log tab to components, each widget becomes a component with the
  same inputs.

## The lifting pet (`pet.js`)

A tester asked for a lifting tamagotchi. A little guy who eats your sets, reps and PRs.

- **Food:** 3 XP a working set, 0.2 a rep, 15 a PR (warm-ups and deleted sets don't count). A
  typical session is about 100 XP. PRs are counted as the app counts them for a season.
- **Stages:** Egg (0) → Hatchling (20) → Gym kid (300) → Gym rat (1,000) → Lifter (2,500) →
  Legend (6,000). A few sets hatch the egg; Legend takes months of steady lifting.
- **Moods,** by days since you last lifted: happy (up to 2, so rest days are fine), hungry (3–4),
  sad (5–7), grouchy (8+).
- **Neglect:** from the first grouchy day, each day without a set keeps 85% of its XP. It devolves a
  stage at a time, and about four weeks off takes even a Legend back to an egg. The next workout
  starts it growing again.
- **Stored:** only the hatch day, its name and a checkpoint. Everything else is replayed from your
  history each time it draws, so it's the same offline and in the demo. The checkpoint (30 days back)
  remembers the XP from days whose reps and PRs have left the 120-day window on the phone.
- **Drawn** in SVG with the theme's colours: a face for each mood, arms, then a dumbbell, a barbell
  and finally a crown. It bobs, wobbles as an egg, shakes when grouchy, and hops when fed (no
  animation with reduced motion).

### Ideas for later (not built)
- Per-theme pets (a knight in The Iron King, a pixel critter in Iron Arcade) through the theme's words.
- Evolution paths by what you train (legs-day beast, bench goblin).
- Show it on Progress, or a tiny one in the header.
- Sync the pet across devices (would need a column or table: ask first).
- An evolution posting a win to the feed (opt-in, wins only).
