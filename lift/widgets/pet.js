// The lifting pet: a little guy who eats your sets, reps and PRs, grows through six stages, and
// sulks when you stop. Leave it long enough and it devolves, stage by stage, back into an egg.
//
// Nothing about the pet is stored but its hatch day, its name and a checkpoint: everything else is
// worked out from your lifting history each time, the same on every device, offline and in the demo.
// Pure: no DOM, no app state. The app passes the history in (see widgets/index.js).

// Food. A typical session (20 sets, ~150 reps, a PR or two) is about 100 XP.
export const FOOD = { set: 3, rep: 0.2, pr: 15 };

// Stages by XP. A few sets hatch the egg; Legend takes months of steady lifting.
export const STAGES = [
  { key: 'egg', name: 'Egg', min: 0 },
  { key: 'hatchling', name: 'Hatchling', min: 20 },
  { key: 'kid', name: 'Gym kid', min: 300 },
  { key: 'rat', name: 'Gym rat', min: 1000 },
  { key: 'lifter', name: 'Lifter', min: 2500 },
  { key: 'legend', name: 'Legend', min: 6000 },
];

// Moods by whole days since the last day you lifted. Two rest days never bother it.
export const MOODS = [
  { key: 'happy', upTo: 2 },
  { key: 'hungry', upTo: 4 },
  { key: 'sad', upTo: 7 },
  { key: 'grouchy', upTo: Infinity },
];
// From the first grouchy day on, each day without a set keeps this much of its XP. About four weeks
// of that takes even a Legend back to an egg; the next workout starts it growing again.
export const DECAY = 0.85;
export const GROUCHY_AFTER = MOODS[2].upTo;   // 7

// The checkpoint sits this many days back, well inside the window of sets the app keeps (120 days):
// reps and PRs are known for every day after it, old days falling out of that window never shrink
// the pet, and it holds even if the app isn't opened for up to 90 days. (Editing a set from before
// the checkpoint doesn't change the pet's past; that's fine.)
export const CHECKPOINT_BACK = 30;

const DAY = 86400000;
const toDay = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);   // whole days since 1970, no time zone
const fromDay = n => new Date(n * DAY).toISOString().slice(0, 10);
const bestKey = s => s.exercise_id + '|' + s.unit + '|' + s.reps;
const byTime = (a, b) => (a.performed_on + (a.logged_at || '')).localeCompare(b.performed_on + (b.logged_at || ''));
const counts = s => !s.deleted_at && s.is_warmup !== true;

export const stageOf = xp => { let i = 0; while (i + 1 < STAGES.length && xp >= STAGES[i + 1].min) i++; return i; };
export const moodOf = idle => MOODS.find(m => idle <= m.upTo).key;

// What each day fed it: sets from the per-day totals (every day ever), reps and PRs from the sets
// the app has (the recent window). A PR is a working set that beats every earlier set for that lift,
// unit and rep count, or the first one at that rep count, as the app counts PRs for a season.
export function meals({ days = [], recent = [] }) {
  const out = new Map();
  for (const d of days) if (Number(d.sets) > 0) out.set(d.performed_on, { sets: Number(d.sets), reps: 0, prs: 0 });
  const best = new Map();
  for (const s of [...recent].filter(counts).sort(byTime)) {
    const m = out.get(s.performed_on) || { sets: 0, reps: 0, prs: 0 };
    m.reps += Number(s.reps) || 0;
    const k = bestKey(s), prev = best.get(k), w = Number(s.weight) || 0;
    if (s.reps != null && (prev == null || w > prev)) m.prs++;
    if (s.reps != null) best.set(k, Math.max(prev ?? -Infinity, w));
    out.set(s.performed_on, m);
  }
  return out;
}
export const xpOf = m => (m ? m.sets * FOOD.set + m.reps * FOOD.rep + m.prs * FOOD.pr : 0);

// The pet today. hatched: the day it hatched (ISO). checkpoint: { day, xp, last } saved earlier, or
// none. Returns its stage, mood, XP and, when it's time, a newer checkpoint for the app to keep.
export function petState({ hatched, today, days = [], recent = [], checkpoint = null }) {
  const food = meals({ days, recent });
  const end = toDay(today);
  const useCp = checkpoint && checkpoint.day >= hatched && checkpoint.day < today;
  let xp = useCp ? checkpoint.xp : 0;
  let last = useCp ? toDay(checkpoint.last) : toDay(hatched);   // nothing to miss before it hatched
  let peak = stageOf(xp);
  const cpDay = end - CHECKPOINT_BACK;
  let next = null;
  for (let d = useCp ? toDay(checkpoint.day) + 1 : toDay(hatched); d <= end; d++) {
    const m = food.get(fromDay(d));
    if (m) { xp += xpOf(m); last = d; }
    else if (d - last > GROUCHY_AFTER) xp *= DECAY;
    peak = Math.max(peak, stageOf(xp));
    if (d === cpDay && (!checkpoint || fromDay(d) > checkpoint.day)) next = { day: fromDay(d), xp, last: fromDay(last) };
  }
  const stage = stageOf(xp), idle = end - last, fed = food.get(today);
  const cur = STAGES[stage], up = STAGES[stage + 1];
  return {
    xp, stage, stageKey: cur.key, stageName: cur.name, idle, mood: moodOf(idle),
    fedToday: fed ? { sets: fed.sets, reps: fed.reps, prs: fed.prs, xp: Math.round(xpOf(fed)) } : null,
    progress: up ? Math.max(0, Math.min(1, (xp - cur.min) / (up.min - cur.min))) : 1,
    nextName: up ? up.name : null,
    devolved: stage < peak,   // it was bigger than this since the checkpoint
    checkpoint: next,
  };
}

// One line about how it's doing, in plain words.
export function moodLine(p, name) {
  if (p.stage === 0) return p.fedToday ? 'The egg is wobbling. A few more sets and it hatches.'
    : p.devolved || p.idle > GROUCHY_AFTER ? name + ' went back into its shell. A workout will hatch it again.'
    : 'Still an egg. A few sets will hatch it.';
  if (p.fedToday) return name + ' is full and happy: ' + p.fedToday.sets + (p.fedToday.sets === 1 ? ' set' : ' sets') +
    (p.fedToday.prs ? ' and ' + p.fedToday.prs + (p.fedToday.prs === 1 ? ' PR' : ' PRs') : '') + ' today.';
  if (p.mood === 'happy') return name + ' is happy. Ready when you are.';
  if (p.mood === 'hungry') return name + ' is hungry. A few sets would hit the spot.';
  if (p.mood === 'sad') return name + ' is sad. ' + p.idle + ' days without a set.';
  return name + ' is grouchy, and shrinking. ' + p.idle + ' days without a set.';
}

// ---------------------------------------------------------------------------
// The drawing: an SVG string in the theme's colours (CSS variables), so it fits every theme.
// ---------------------------------------------------------------------------
const FACES = {
  happy: '<path d="M50 62 q10 9 20 0" class="pl-line"/><path d="M47 50 q4 -5 8 0 M65 50 q4 -5 8 0" class="pl-line"/>',
  hungry: '<ellipse cx="60" cy="65" rx="6" ry="5" class="pl-ink"/><circle cx="51" cy="50" r="3.2" class="pl-ink"/><circle cx="69" cy="50" r="3.2" class="pl-ink"/>' +
    '<path d="M64 70 q1 6 3 8" class="pl-drool"/>',
  sad: '<path d="M51 68 q9 -7 18 0" class="pl-line"/><circle cx="51" cy="51" r="3" class="pl-ink"/><circle cx="69" cy="51" r="3" class="pl-ink"/>' +
    '<path d="M47 56 q-2 6 1 8" class="pl-tear"/>',
  grouchy: '<path d="M50 67 l5 -3 l5 3 l5 -3 l5 3" class="pl-line"/><path d="M45 44 l10 4 M75 44 l-10 4" class="pl-line"/>' +
    '<circle cx="52" cy="51" r="2.6" class="pl-ink"/><circle cx="68" cy="51" r="2.6" class="pl-ink"/>' +
    '<path d="M86 22 q4 -5 0 -10 M94 26 q4 -5 0 -10" class="pl-steam"/>',
};
// Bodies get bigger and grow arms, then a dumbbell, then a barbell, then a crown.
const BODIES = [
  '',
  '<ellipse cx="60" cy="64" rx="26" ry="24" class="pl-body"/><path d="M40 46 l6 -8 l6 6 l8 -9 l8 9 l6 -6 l6 8" class="pl-shell"/>',
  '<ellipse cx="60" cy="62" rx="30" ry="29" class="pl-body"/><path d="M31 66 q-9 3 -10 12 M89 66 q9 3 10 12" class="pl-limb"/>',
  '<ellipse cx="60" cy="60" rx="32" ry="33" class="pl-body"/><path d="M29 64 q-10 -2 -14 -12 M91 64 q10 -2 14 -12" class="pl-limb"/>' +
    '<rect x="8" y="44" width="14" height="6" rx="2" class="pl-iron"/><rect x="98" y="44" width="14" height="6" rx="2" class="pl-iron"/>',
  '<path d="M26 92 q-4 -56 34 -62 q38 6 34 62 z" class="pl-body"/><path d="M28 58 q-14 -6 -14 -26 M92 58 q14 -6 14 -26" class="pl-limb"/>' +
    '<path d="M6 30 h108" class="pl-bar"/><rect x="4" y="20" width="8" height="20" rx="2" class="pl-iron"/><rect x="108" y="20" width="8" height="20" rx="2" class="pl-iron"/>',
  '<path d="M24 94 q-4 -60 36 -66 q40 6 36 66 z" class="pl-body"/><path d="M26 58 q-14 -6 -14 -26 M94 58 q14 -6 14 -26" class="pl-limb"/>' +
    '<path d="M6 30 h108" class="pl-bar"/><rect x="2" y="18" width="10" height="24" rx="2" class="pl-gold"/><rect x="108" y="18" width="10" height="24" rx="2" class="pl-gold"/>' +
    '<path d="M44 26 l4 -12 l7 8 l5 -11 l5 11 l7 -8 l4 12 z" class="pl-gold"/>',
];
const EGG = (cracked, mood) => '<ellipse cx="60" cy="64" rx="27" ry="34" class="pl-egg"/>' +
  '<circle cx="50" cy="52" r="4" class="pl-spot"/><circle cx="70" cy="74" r="5" class="pl-spot"/><circle cx="66" cy="44" r="3" class="pl-spot"/>' +
  (cracked ? '<path d="M38 62 l8 -5 l6 6 l8 -7 l8 6 l7 -5 l7 5" class="pl-crack"/>' : '') +
  (mood === 'grouchy' || mood === 'sad' ? '<text x="88" y="30" class="pl-zzz">z</text><text x="96" y="20" class="pl-zzz">z</text>' : '');

export function petSvg(p, label) {
  const body = p.stage === 0 ? EGG(p.devolved || p.xp >= STAGES[1].min / 2, p.mood) : BODIES[p.stage] + FACES[p.fedToday ? 'happy' : p.mood];
  return '<svg class="pet-svg pet-' + p.stageKey + ' mood-' + (p.fedToday ? 'happy' : p.mood) + '" viewBox="0 0 120 110" role="img" aria-label="' + label + '">' +
    '<ellipse cx="60" cy="102" rx="34" ry="5" class="pl-floor"/><g class="pl-me">' + body + '</g></svg>';
}
