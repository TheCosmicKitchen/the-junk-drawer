// Widgets: opt-in extras, switched on in Settings → Widgets. Off by default, per device.
//
// A widget is a plain object:
//   id, name, blurb     shown in the Widgets list
//   where               where its card goes ('log' = the Log tab, after today's logging)
//   start(ctx)          its saved data the first time it's switched on
//   card(ctx)           its card, as an HTML string; the root carries data-widget="<id>"
//   click(btn, ctx)     a tap on a button inside its card; return true to redraw
// ctx (from the app, read-only except through save):
//   today               ISO date
//   days, recent        lifting history: one row per day ever (sets, volume), and the sets from
//                       the last 120 days (reps, weight, warm-up, PR maths)
//   data                this widget's saved data; save(patch) merges into it and keeps it
//   esc                 HTML-escape for anything user-typed
// Widgets never write sets or anything else in the database: they only read.
import { petState, moodLine, petSvg } from './pet.js';

// Sets fed today when the card last drew: a new one makes it hop. The hop lasts a moment, since the
// Log tab often redraws again right after a set (when the save lands).
let petSeen = null, hopUntil = 0;

const pet = {
  id: 'pet',
  name: 'Lifting pet',
  blurb: 'A little guy who eats your sets, reps and PRs and grows. Skip the gym and he gets sad, then grouchy, then shrinks back toward an egg.',
  where: 'log',
  start: ctx => ({ hatched: ctx.today, name: 'Pip', checkpoint: null }),
  card(ctx) {
    const d = ctx.data, name = d.name || 'Pip';
    const p = petState({ hatched: d.hatched || ctx.today, today: ctx.today, days: ctx.days, recent: ctx.recent, checkpoint: d.checkpoint });
    if (p.checkpoint) ctx.save({ checkpoint: p.checkpoint });
    const fed = p.fedToday ? p.fedToday.sets : 0;
    if (petSeen != null && fed > petSeen) hopUntil = Date.now() + 1200;
    petSeen = fed;
    const hop = Date.now() < hopUntil;
    const label = ctx.esc(name + ', ' + p.stageName.toLowerCase() + ', ' + (p.fedToday ? 'happy' : p.mood));
    return '<section class="card widget pet-card" data-widget="pet">' +
      '<div class="pet-pic' + (hop ? ' pet-hop' : '') + '">' + petSvg(p, label) + '</div>' +
      '<div class="pet-info">' +
        '<div class="card-head"><h3 class="card-title" id="petName">' + ctx.esc(name) + '</h3>' +
          '<button class="linkbtn" data-pet-rename aria-label="Rename ' + ctx.esc(name) + '">Rename</button></div>' +
        '<small class="muted pet-stage">' + ctx.esc(p.stageName) + (p.nextName ? ' · next: ' + ctx.esc(p.nextName) : ' · fully grown') + '</small>' +
        '<p class="pet-mood">' + ctx.esc(moodLine(p, name)) + '</p>' +
        '<div class="bar" style="--p:' + Math.round(p.progress * 100) + '%" role="img" aria-label="' + Math.round(p.progress * 100) + '% of the way to ' + ctx.esc(p.nextName || 'the top') + '"><i></i></div>' +
      '</div></section>';
  },
  click(b, ctx) {
    if (!b.hasAttribute('data-pet-rename')) return false;
    const now = ctx.data.name || 'Pip';
    const typed = window.prompt('Name your pet', now);
    if (typed == null) return false;
    const name = typed.trim().slice(0, 24);
    if (!name || name === now) return false;
    ctx.save({ name });
    return true;
  },
};

export const WIDGETS = [pet];
export const widgetById = id => WIDGETS.find(w => w.id === id);
