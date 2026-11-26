// Widgets: opt-in extras, switched on in Settings → Widgets. Off by default, per device.
//
// A widget is a plain object:
//   id, name, blurb     shown in the Widgets list
//   where               where its card goes ('log' = the Log tab, right under today's card)
//   start(ctx)          its saved data the first time it's switched on
//   card(ctx)           its card, as an HTML string; the root carries data-widget="<id>"
//   page(ctx)           optional: its own sheet (head and body), opened by a button in its card with
//                       data-widget-open="<id>"
//   click(btn, ctx)     a tap on a button in its card or page; return true to redraw
//   recap(ctx)          optional: lines for the Finish recap (HTML), or nothing
// ctx (from the app, read-only except through save):
//   today               ISO date
//   days, recent        lifting history: one row per day ever (sets, volume), and the sets from
//                       the last 120 days (reps, weight, warm-up, PR maths)
//   facts               what else the app tracks: clubs, streaks, challenges, goals, records,
//                       seasons, stamps (see hats.js), worked out when first asked for
//   data                this widget's saved data; save(patch) merges into it and keeps it
//   groupsOf(id)        a lift's main muscle groups, for Kintoremon's branches
//   esc                 HTML-escape for anything user-typed
// Widgets never write sets or anything else in the database: they only read.
import { petState, petToday, moodLine, recapLine, petSvg, meals, STAGES, FORMS, BRANCH_AT, WHY, formName } from './pet.js';
import { HATS, hatById, hatsMet, mergeUnlocks, wearable, newToday, hatSvg } from './hats.js';
import { TREATS, PER_DAY, treatKeys, syncTreats, bag, canFeed, feed, bonusByDay, eatenOn, gotOn, treatList, treatSvg } from './treats.js';

// Sets fed today when the card last drew: a new one makes it hop. The hop lasts a moment, since the
// Log tab often redraws again right after a set (when the save lands).
let petSeen = null, hopUntil = 0;

const nameOf = d => d.name || 'Iggy';
const shortDay = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });   // Nov 24
const argsOf = ctx => ({ hatched: ctx.data.hatched || ctx.today, today: ctx.today, days: ctx.days, recent: ctx.recent, checkpoint: ctx.data.checkpoint, groupsOf: ctx.groupsOf,
  bonus: bonusByDay(ctx.data.treats) });
// The treat bag, with anything newly earned added. Saves only when something's new.
function treatsOf(ctx) {
  const d = ctx.data, next = syncTreats(d.treats, treatKeys(ctx.facts, d.hatched || ctx.today), ctx.today);
  if (next !== d.treats) ctx.save({ treats: next });
  return next;
}
const stateOf = ctx => petState(argsOf(ctx));
// Hats earned so far (saved), adding any met right now. Saves only when something's new.
function unlocks(ctx) {
  const d = ctx.data, hatched = d.hatched || ctx.today;
  let prs = 0;
  for (const [day, m] of meals({ days: ctx.days, recent: ctx.recent })) if (day >= hatched) prs += m.prs;
  const merged = mergeUnlocks(d.hats, hatsMet({ ...ctx.facts, prsSinceHatch: prs }, hatched), ctx.today);
  if (merged !== (d.hats || {}) && Object.keys(merged).length !== Object.keys(d.hats || {}).length) ctx.save({ hats: merged });
  return merged;
}
// The hat it's wearing, if it can still wear it (a seasonal hat goes back in the box after its month).
const wornHat = (ctx, unlocked) => (ctx.data.hat && wearable(ctx.data.hat, unlocked, ctx.today) ? ctx.data.hat : null);
const drawPet = (p, ctx, label, hat) => petSvg(p, label, hat ? hatSvg(hat, { egg: p.stage === 0 }) : '');
const labelOf = (ctx, p, hat) => ctx.esc(nameOf(ctx.data) + ', ' + p.stageName.toLowerCase() + ', ' + (p.fedToday ? 'happy' : p.mood) + (hat ? ', wearing a ' + hatById(hat).name.toLowerCase() : ''));

function rename(ctx) {
  const now = nameOf(ctx.data);
  const typed = window.prompt('Name your lizard', now);
  if (typed == null) return false;
  const name = typed.trim().slice(0, 24);
  if (!name || name === now) return false;
  ctx.save({ name });
  return true;
}

const pet = {
  id: 'pet',
  name: 'Kintoremon',
  blurb: 'A pet lizard who eats your sets, reps and PRs and grows from an egg into a dragon. Skip the gym and he gets sad, then grouchy, then shrinks back toward an egg.',
  where: 'log',
  start: ctx => ({ hatched: ctx.today, name: 'Iggy', checkpoint: null }),
  card(ctx) {
    const d = ctx.data, name = nameOf(d);
    const p = stateOf(ctx);
    if (p.checkpoint) ctx.save({ checkpoint: p.checkpoint });
    const un = unlocks(ctx), hat = wornHat(ctx, un), tr = treatsOf(ctx);
    const fed = (p.fedToday ? p.fedToday.sets : 0) + eatenOn(tr, ctx.today).length;
    if (petSeen != null && fed > petSeen) hopUntil = Date.now() + 1200;
    petSeen = fed;
    const hop = Date.now() < hopUntil, fresh = newToday(un, ctx.today).length + gotOn(tr, ctx.today).length;
    return '<section class="card widget pet-card" data-widget="pet">' +
      '<button class="pet-pic' + (hop ? ' pet-hop' : '') + '" data-widget-open="pet" aria-label="Open ' + ctx.esc(name) + '’s page">' + drawPet(p, ctx, labelOf(ctx, p, hat), hat) + '</button>' +
      '<div class="pet-info">' +
        '<div class="card-head"><h3 class="card-title" id="petName">' + ctx.esc(name) + '</h3>' +
          '<span class="pet-links"><button class="linkbtn" data-widget-open="pet">Hats & treats' + (fresh ? ' <b class="pet-new">new</b>' : '') + '</button></span></div>' +
        '<small class="muted pet-stage">' + ctx.esc(p.stageName) + (p.nextName ? ' · next: ' + ctx.esc(p.nextName) : ' · fully grown') + '</small>' +
        '<p class="pet-mood">' + ctx.esc(moodLine(p, name)) + '</p>' +
        '<div class="bar" style="--p:' + Math.round(p.progress * 100) + '%" role="img" aria-label="' + Math.round(p.progress * 100) + '% of the way to ' + ctx.esc(p.nextName || 'the top') + '"><i></i></div>' +
      '</div></section>';
  },
  // Its page: the pet up close, the way up the stages, and the wardrobe.
  page(ctx) {
    const d = ctx.data, name = nameOf(d), un = unlocks(ctx), tr = treatsOf(ctx), p = stateOf(ctx), hat = wornHat(ctx, un);
    const up = STAGES[p.stage + 1];
    const inBag = bag(tr), lifted = !!p.fedToday, dessert = eatenOn(tr, ctx.today);
    const treats = TREATS.map(t => {
      const can = canFeed(tr, t.id, lifted, ctx.today), n = inBag[t.id];
      return '<button type="button" class="treat-tile' + (n ? '' : ' empty') + '" data-treat="' + t.id + '"' + (can.ok ? '' : ' disabled') + ' aria-label="Feed ' + ctx.esc(name) + ' a ' + ctx.esc(t.name) + '">' +
        treatSvg(t.id) + '<b>' + ctx.esc(t.name) + (n ? ' <span class="treat-n">×' + n + '</span>' : '') + '</b><small>+' + t.xp + ' XP · ' + ctx.esc(n ? (can.ok ? 'Tap to feed' : can.why) : t.hint) + '</small></button>';
    }).join('');
    // His line's forms; before he branches, the later ones are a mystery.
    const stages = STAGES.map((s, i) => {
      const secret = i >= BRANCH_AT && !p.branch, nm = secret ? '?' : formName(i, p.branch);
      const q = { ...p, stage: i, stageKey: s.key, fedToday: null, mood: 'happy', devolved: false, xp: s.min };
      return '<li class="pet-step' + (i === p.stage ? ' now' : i > p.stage ? ' later' : '') + (secret ? ' secret' : '') + '">' + petSvg(q, ctx.esc(nm)) +
        '<small>' + ctx.esc(nm) + '</small></li>';
    }).join('');
    const lines = Object.entries(FORMS).map(([k, f]) => '<li' + (k === p.branch ? ' class="now"' : '') + '><b>' + ({ balanced: 'All-round', push: 'Push', pull: 'Pull', legs: 'Legs' })[k] + '</b> ' + f.map(x => ctx.esc(x)).join(' → ') + '</li>').join('');
    const branchNote = p.branch ? WHY[p.branch] + ' made ' + ctx.esc(name) + ' ' + (/^[AEIOU]/i.test(formName(BRANCH_AT, p.branch)) ? 'an ' : 'a ') + ctx.esc(formName(BRANCH_AT, p.branch)) + '. Drop below ' + STAGES[BRANCH_AT].min.toLocaleString() + ' XP and he can branch again.'
      : 'At ' + STAGES[BRANCH_AT].min.toLocaleString() + ' XP he branches by what you’ve trained the 4 weeks before: mostly push, pull or legs, or all-round.';
    const tile = (id, title, sub, on, can) => '<button type="button" class="hat-tile' + (can ? '' : ' locked') + '" data-hat="' + id + '" aria-pressed="' + on + '"' + (can ? '' : ' disabled') + '>' +
      drawPet(p, ctx, ctx.esc(title), id ? id : null) + '<b>' + ctx.esc(title) + '</b><small>' + ctx.esc(sub) + '</small></button>';
    const hats = HATS.map(h => {
      const can = wearable(h.id, un, ctx.today);
      const sub = can ? (h.month ? 'In season' : 'Earned ' + shortDay(un[h.id])) : h.hint;
      return tile(h.id, h.name, sub, hat === h.id, can);
    }).join('');
    const got = HATS.filter(h => !h.month && un[h.id]).length, of = HATS.filter(h => !h.month).length;
    return '<div class="sheet-head"><div><small class="muted">Kintoremon</small><h2 id="sheetTitle">' + ctx.esc(name) + '</h2></div>' +
      '<button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
      '<div class="sheet-body pet-page">' +
        '<div class="pet-hero' + (Date.now() < hopUntil ? ' pet-hop' : '') + '">' + drawPet(p, ctx, labelOf(ctx, p, hat), hat) +
          '<div><b>' + ctx.esc(p.stageName) + '</b><p class="pet-mood">' + ctx.esc(moodLine(p, name)) + '</p>' +
          '<small class="muted">' + Math.floor(p.xp).toLocaleString() + ' XP' + (up ? ' · ' + up.min.toLocaleString() + ' for ' + ctx.esc(up.name) : '') + '</small>' +
          '<div><button class="btn sm" data-pet-rename>Rename</button></div></div></div>' +
        '<div class="field-label"><span>Growing up</span><small>sets, reps and PRs feed him</small></div>' +
        '<ol class="pet-steps">' + stages + '</ol>' +
        '<p class="hint-line">' + branchNote + '</p><ul class="pet-lines">' + lines + '</ul>' +
        '<div class="field-label" style="margin-top:18px"><span>Treat bag</span><small>dessert after a workout, up to ' + PER_DAY + ' a day</small></div>' +
        (dessert.length ? '<p class="pet-dessert">Dessert today: ' + ctx.esc(treatList(dessert)) + '. Yum.</p>' : '') +
        '<div class="treat-grid" role="group" aria-label="Treats">' + treats + '</div>' +
        '<div class="field-label" style="margin-top:18px"><span>Wardrobe</span><small>' + got + ' of ' + of + ' hats earned</small></div>' +
        '<div class="hat-grid" role="group" aria-label="Hats">' + tile('', 'No hat', 'Just ' + name, !hat, true) + hats + '</div>' +
      '</div>';
  },
  recap(ctx) {
    const d = ctx.data, name = nameOf(d);
    const t = petToday(argsOf(ctx));
    const un = unlocks(ctx), hat = wornHat(ctx, un);
    // Hats first earned today, in one line: "New hats: Party hat, Viking helmet and Halo."
    const got = newToday(un, ctx.today).map(id => '<b>' + ctx.esc(hatById(id).name) + '</b>');
    const list = got.length > 1 ? got.slice(0, -1).join(', ') + ' and ' + got[got.length - 1] : got[0];
    const fresh = got.length ? '<p class="pet-unlock">' + (got.length > 1 ? 'New hats: ' : 'New hat: ') + list + '. Try ' + (got.length > 1 ? 'them' : 'it') + ' on from ' + ctx.esc(name) + '’s page.</p>' : '';
    const tr = treatsOf(ctx), newTreats = gotOn(tr, ctx.today);
    const snacks = newTreats.length ? '<p class="pet-unlock">New ' + (newTreats.length > 1 ? 'treats' : 'treat') + ' in the bag: <b>' + ctx.esc(treatList(newTreats)) + '</b>.</p>' : '';
    if (!t) return fresh || snacks ? '<div class="pet-recap"><div>' + fresh + snacks + '</div></div>' : '';
    return '<div class="pet-recap' + (t.evolved ? ' pet-evolved' : '') + '" data-widget-recap="pet">' + drawPet({ ...t }, ctx, labelOf(ctx, t, hat), hat) +
      '<div><p>' + ctx.esc(recapLine(t, name)) + '</p>' + fresh + snacks + '</div></div>';
  },
  click(b, ctx) {
    if (b.hasAttribute('data-pet-rename')) return rename(ctx);
    if (b.dataset.treat) {
      const tr = treatsOf(ctx), p = stateOf(ctx);
      if (!canFeed(tr, b.dataset.treat, !!p.fedToday, ctx.today).ok) return false;
      ctx.save({ treats: feed(tr, b.dataset.treat, ctx.today) });
      hopUntil = Date.now() + 1200;
      return true;
    }
    if (b.dataset.hat != null) {
      const id = b.dataset.hat || null;
      if (id && !wearable(id, unlocks(ctx), ctx.today)) return false;
      ctx.save({ hat: id });
      return true;
    }
    return false;
  },
};

export const WIDGETS = [pet];
export const widgetById = id => WIDGETS.find(w => w.id === id);
