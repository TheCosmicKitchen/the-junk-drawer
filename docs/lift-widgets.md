# Lift widgets

Opt-in extras for the lift app, switched on in **Settings → Widgets**. They're off by default and
saved per device (in `lift.prefs`, like the theme). They give the app room to grow with things
people choose, without cluttering it for everyone else.

## How a widget works

Code lives in `lift/widgets/`. `index.js` lists the widgets; each is a plain object:

| field | what it is |
|---|---|
| `id`, `name`, `blurb` | shown in the Widgets list |
| `where` | where its card goes; today only `'log'` (the Log tab, right under today's card, so you see it react as you log) |
| `start(ctx)` | its saved data the first time it's switched on |
| `card(ctx)` | its card as an HTML string; the root carries `data-widget="<id>"` |
| `page(ctx)` | optional: its own sheet (head and body), opened by a button with `data-widget-open="<id>"` |
| `click(btn, ctx)` | a tap on a button in its card or page; return `true` to redraw |
| `recap(ctx)` | optional: a line for the Finish recap (HTML), or nothing |

`ctx` holds `today`, the lifting history (`days`: one row per day ever, and `recent`: the sets from
the last 120 days), `facts` (clubs, streaks, challenges, goals, records, seasons, stamps; worked out
when first asked for), the widget's own saved `data`, `save(patch)`, and `esc` for anything typed.

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
- **At Finish,** the recap says what he ate and how far he is to the next stage, or celebrates (in
  gold) when that workout hatched or evolved him: "Iggy ate 6 sets, 39 reps and 1 PR (+41 XP). Iggy
  hatched!"
- **Drawn** in SVG as a chibi lizard: green in every theme (the theme's own green, softened into its
  card colour), with the theme's accent for the crest and wings. A face for each mood; it grows a crest
  and dewlap, lifts dumbbells, then a barbell, and as a Dragon gets wings, a crown and gold plates.
  It bobs, wobbles as an egg, shakes when grouchy, and hops when fed (no animation with reduced
  motion).

### Hats (built)

Tap the pet (or **Hats** on its card) for its page: the pet up close, its stages, and the wardrobe.
Hats are earned by what the app already tracks, kept for good once earned (saved with the day, since
some facts only say what's true now, like a record you hold today), and worn one at a time. The
Finish recap announces new ones. Rules and drawings: `lift/widgets/hats.js`.

| Hat | Earned by |
|---|---|
| Sweatband | a PR after hatching |
| Party hat | the Elephant Club (10,000 lb, lifetime) |
| Viking helmet | the 100K Club |
| Star headband | lifting 4 weeks in a row |
| Halo | 12 weeks in a row |
| Bandana | all of a week's challenges |
| Graduation cap | a season goal met |
| Laurel wreath | holding a crew record |
| Wizard hat | finishing a season (after hatching) |
| Stamp pin | a season stamp (after hatching) |
| Pumpkin, Santa hat | anyone, in October and December only |

### Branches (built)

**Branches.** At 1,000 XP the pet branches by how you trained in the 4 weeks before (working sets by
main muscle, `library.js` groups): 40%+ push (chest, shoulders, triceps), pull (back, biceps,
traps, forearms) or legs (quads, hamstrings, glutes, calves, inner thighs), otherwise balanced. It's
automatic, never chosen. The branch is saved with the checkpoint; devolve below 1,000 XP and it's
forgotten, so the next time can be different.

| | Push | Pull | Legs | Balanced |
|---|---|---|---|---|
| 1,000 XP | Frilled lizard (neck frill) | Chameleon (curled grip tail) | Basilisk (big back legs) | Iguana |
| 2,500 XP | Frillback | Grip chameleon | Stomp basilisk | Komodo |
| 6,000 XP | Sun dragon | Shadow dragon | Wyvern | Iron dragon |

Each form is the current lizard plus a trait layer or two, in the theme's colours: a neck frill
(push; gold rays on the Sun dragon), a casque and curled grip tail (pull), big thighs and back and head
sails (legs), the crest and dewlap (all-round). Before it branches, the page shows the later forms as
"?" and the card says "next: a surprise". The recap names the form and why ("Iggy evolved into a
Basilisk! All that leg work did that."). Rules: `focusOf` and `petState` in `pet.js`.

### Still to build (decided 2026-11-24)

**Treats.** Collectable snacks, earned by events, fed by tapping in the pet's page: a cricket for
each weekly challenge (+20 XP), a protein shake for each club joined (+40), a golden cricket for each
goal met (+60), a dragonfruit for each season finished (+100). **Only on a day you lifted**:
dessert, not dinner, so treats never stand in for training. Eaten treats are saved (day, kind) and
replayed as XP on that day.

**Private.** Evolutions, hats and treats never post to the feed; it stays wins-only.

### Ideas for later
- Dragon auras by style (heavy PRs, high volume, never missing a week).
- Per-theme touches (a knight's helmet in The Iron King, a pixel lizard in Iron Arcade).
- Show it on Progress, or a tiny one in the header.
- Sync the pet across devices (would need a column or table: ask first).
