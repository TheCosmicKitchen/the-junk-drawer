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

## Kintoremon (`pet.js`)

A tester asked for a lifting tamagotchi. Kintoremon (from *kintore*, Japanese gym slang for strength
training, plus the "-mon" of a monster pet) is a pet lizard who eats your sets, reps and PRs. He
starts out called Iggy; tap Rename to change it.

- **Food:** 3 XP a working set, 0.2 a rep, 15 a PR (warm-ups and deleted sets don't count). A
  typical session is about 100 XP. PRs are counted as the app counts them for a season.
- **Stages,** a lizard's life: Egg (0) → Hatchling (20) → Gecko (300) → Iguana (1,000) → Komodo (2,500)
  → Dragon (6,000). A few sets hatch the egg; Dragon takes months of steady lifting.
- **Moods,** by days since you last lifted: happy (up to 2, so rest days are fine), hungry (3–4),
  sad (5–7), grouchy (8+).
- **Neglect:** from the first grouchy day, each day without a set keeps 85% of its XP. It devolves a
  stage at a time, and about four weeks off takes even a Dragon back to an egg. The next workout
  starts it growing again.
- **Stored:** only the hatch day, its name and a checkpoint. Everything else is replayed from your
  history each time it draws, so it's the same offline and in the demo. The checkpoint (30 days back)
  remembers the XP from days whose reps and PRs have left the 120-day window on the phone.
- **Drawn** in SVG as a chibi lizard: green in every theme (the theme's own green, softened into its
  card colour), with the theme's accent for the crest and wings. A face for each mood; it grows a crest
  and dewlap, lifts dumbbells, then a barbell, and as a Dragon gets wings, a crown and gold plates.
  It bobs, wobbles as an egg, shakes when grouchy, and hops when fed (no animation with reduced
  motion).

### Ideas for later (not built)
- Per-theme touches (a knight's helmet in The Iron King, a pixel lizard in Iron Arcade).
- Evolution paths by what you train (legs-day beast, bench goblin).
- Show it on Progress, or a tiny one in the header.
- Sync the pet across devices (would need a column or table: ask first).
- An evolution posting a win to the feed (opt-in, wins only).
