// Kintoremon: a little lizard who eats your sets, reps and PRs, grows from an egg to a dragon, and
// sulks when you stop. Leave it long enough and it devolves, stage by stage, back into an egg.
//
// Nothing about the pet is stored but its hatch day, its name and a checkpoint: everything else is
// worked out from your lifting history each time, the same on every device, offline and in the demo.
// Pure: no DOM, no app state. The app passes the history in (see widgets/index.js).

// Food. A typical session (20 sets, ~150 reps, a PR or two) is about 100 XP.
export const FOOD = { set: 3, rep: 0.2, pr: 15 };

// Stages by XP, a lizard's life. A few sets hatch the egg; Dragon takes months of steady lifting.
export const STAGES = [
  { key: 'egg', name: 'Egg', min: 0 },
  { key: 'hatchling', name: 'Hatchling', min: 20 },
  { key: 'gecko', name: 'Gecko', min: 300 },
  { key: 'iguana', name: 'Iguana', min: 1000 },
  { key: 'komodo', name: 'Komodo', min: 2500 },
  { key: 'dragon', name: 'Dragon', min: 6000 },
];

// Branches. At 1,000 XP (the third stage) it becomes what you've been training: the 4 weeks of working
// sets before that day, by each lift's main muscles. 40% or more push, pull or legs picks that line;
// anything else is the all-round line. Devolve below 1,000 XP and the branch is forgotten.
export const BRANCH_AT = 3, FOCUS_DAYS = 28, FOCUS_SHARE = 0.4;
export const FAMILIES = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'biceps', 'traps', 'forearms', 'lowerback'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'],
};
// The forms of each line, for stages 3, 4 and 5.
export const FORMS = {
  balanced: ['Iguana', 'Komodo', 'Iron dragon'],
  push: ['Frilled lizard', 'Frillback', 'Sun dragon'],
  pull: ['Chameleon', 'Grip chameleon', 'Shadow dragon'],
  legs: ['Basilisk', 'Stomp basilisk', 'Wyvern'],
};
export const WHY = { balanced: 'All-round training', push: 'All that pressing', pull: 'All those rows and pull-ups', legs: 'All that leg work' };
const FAMILY_OF = Object.fromEntries(Object.entries(FAMILIES).flatMap(([f, gs]) => gs.map(g => [g, f])));
// The line a stretch of training points to. groupsOf(exercise_id) gives a lift's main muscle groups
// (library.js); a set counts once, split between its groups. Core and unknown lifts don't count.
export function focusOf(sets, groupsOf = () => []) {
  const n = { push: 0, pull: 0, legs: 0 };
  for (const s of sets) {
    if (!counts(s)) continue;
    const fams = (groupsOf(s.exercise_id) || []).map(g => FAMILY_OF[g]).filter(Boolean);
    for (const f of fams) n[f] += 1 / fams.length;
  }
  const total = n.push + n.pull + n.legs;
  if (!total) return 'balanced';
  const [top, v] = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return v / total >= FOCUS_SHARE && v > Math.max(...Object.entries(n).filter(([k]) => k !== top).map(([, x]) => x)) ? top : 'balanced';
}
// A stage's name on a given line ("Basilisk" for stage 3 on legs).
export const formName = (stage, branch) => (stage >= BRANCH_AT && branch ? FORMS[branch][stage - BRANCH_AT] : STAGES[stage].name);

// Moods by whole days since the last day you lifted. Two rest days never bother it.
export const MOODS = [
  { key: 'happy', upTo: 2 },
  { key: 'hungry', upTo: 4 },
  { key: 'sad', upTo: 7 },
  { key: 'grouchy', upTo: Infinity },
];
// From the first grouchy day on, each day without a set keeps this much of its XP. About four weeks
// of that takes even a Dragon back to an egg; the next workout starts it growing again.
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
// bonus: treat XP by day (treats.js bonusByDay); it only counts on days you lifted.
export function petState({ hatched, today, days = [], recent = [], checkpoint = null, groupsOf, bonus = new Map() }) {
  const food = meals({ days, recent });
  const focusOn = d => focusOf(recent.filter(x => x.performed_on > fromDay(d - FOCUS_DAYS) && x.performed_on <= fromDay(d)), groupsOf);
  const end = toDay(today);
  const useCp = checkpoint && checkpoint.day >= hatched && checkpoint.day < today;
  let xp = useCp ? checkpoint.xp : 0;
  let last = useCp ? toDay(checkpoint.last) : toDay(hatched);   // nothing to miss before it hatched
  let peak = stageOf(xp);
  const from = useCp ? toDay(checkpoint.day) + 1 : toDay(hatched);
  // A checkpoint from before branches existed: work it out from the weeks before it.
  let branch = useCp ? checkpoint.branch || (stageOf(xp) >= BRANCH_AT ? focusOn(from - 1) : null) : null;
  const cpDay = end - CHECKPOINT_BACK;
  let next = null;
  for (let d = from; d <= end; d++) {
    const m = food.get(fromDay(d));
    if (m) { xp += xpOf(m) + (bonus.get(fromDay(d)) || 0); last = d; }
    else if (d - last > GROUCHY_AFTER) xp *= DECAY;
    const st = stageOf(xp);
    if (st < BRANCH_AT) branch = null;   // devolved below the branch: forgotten
    else if (!branch) branch = focusOn(d);   // the day it crosses 1,000 XP
    peak = Math.max(peak, st);
    if (d === cpDay && (!checkpoint || fromDay(d) > checkpoint.day)) next = { day: fromDay(d), xp, last: fromDay(last), branch };
  }
  const stage = stageOf(xp), idle = end - last, fed = food.get(today);
  const cur = STAGES[stage], up = STAGES[stage + 1];
  // Before it branches, what comes next is a surprise.
  const nextName = !up ? null : stage + 1 === BRANCH_AT ? 'a surprise' : formName(stage + 1, branch);
  return {
    xp, stage, stageKey: cur.key, stageName: formName(stage, branch), branch, idle, mood: moodOf(idle),
    fedToday: fed ? { sets: fed.sets, reps: fed.reps, prs: fed.prs, xp: Math.round(xpOf(fed)), treatXp: bonus.get(today) || 0 } : null,
    progress: up ? Math.max(0, Math.min(1, (xp - cur.min) / (up.min - cur.min))) : 1,
    nextName,
    devolved: stage < peak,   // it was bigger than this since the checkpoint
    checkpoint: next,
  };
}

// Today at a glance, for the Finish recap: what it ate, and whether that hatched or evolved it
// (its stage now against its stage as of yesterday). null when it hasn't eaten today.
export function petToday(args) {
  const now = petState(args);
  if (!now.fedToday) return null;
  const y = new Date(Date.parse(args.today + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
  const before = y < args.hatched ? 0 : petState({ ...args, today: y }).stage;
  return { ...now, before, evolved: now.stage > before };
}
const aOrAn = w => (/^[AEIOU]/i.test(w) ? 'an' : 'a');
export function recapLine(t, name) {
  const f = t.fedToday, list = [f.sets + (f.sets === 1 ? ' set' : ' sets')];
  if (f.reps) list.push(Math.round(f.reps) + (f.reps === 1 ? ' rep' : ' reps'));
  if (f.prs) list.push(f.prs + (f.prs === 1 ? ' PR' : ' PRs'));
  const ate = name + ' ate ' + (list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0]) + ' (+' + f.xp + ' XP)' +
    (f.treatXp ? ', plus dessert (+' + f.treatXp + ' XP).' : '.');
  if (t.evolved) return ate + ' ' + (t.before === 0 ? name + ' hatched!' : name + ' evolved into ' + aOrAn(t.stageName) + ' ' + t.stageName + '!' +
    (t.stage === BRANCH_AT && t.before < BRANCH_AT ? ' ' + WHY[t.branch] + ' did that.' : ''));
  if (t.stage === 0) return ate + ' The egg is wobbling.';
  return ate + ' ' + (t.nextName ? Math.round(t.progress * 100) + '% of the way to ' + t.nextName + '.' : 'A full-grown ' + t.stageName + '.');
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
// A chibi lizard: a big round head (the face goes on it), a little body and feet, a curled tail.
// It grows a crest and a dewlap, picks up dumbbells, then a barbell, and as a Dragon gets wings, a
// crown and gold plates. Earlier stages are drawn smaller.
const tail = d => '<path d="' + d + '" class="pl-out"/><path d="' + d + '" class="pl-tail"/>';
const TAIL = { short: 'M76 92 q14 4 18 -6', long: 'M76 92 q22 6 28 -8 q3 -8 -3 -12', big: 'M78 94 q26 6 32 -10 q3 -10 -5 -14' };
const BODY = '<ellipse cx="60" cy="88" rx="20" ry="13" class="pl-body"/><ellipse cx="60" cy="91" rx="11" ry="7" class="pl-belly"/>' +
  '<ellipse cx="45" cy="100" rx="7" ry="3.5" class="pl-body"/><ellipse cx="75" cy="100" rx="7" ry="3.5" class="pl-body"/>';
const HEAD = '<ellipse cx="60" cy="56" rx="27" ry="22" class="pl-body"/>';
const CREST = '<path d="M42 41 l3 -9 l5 6 l4 -10 l6 9 l6 -9 l4 10 l5 -6 l3 9" class="pl-crest"/>';
const DEWLAP = '<path d="M50 74 q10 14 20 0" class="pl-crest"/>';
const SHELL = '<path d="M38 47 q22 -28 44 0 l-5 -5 l-6 5 l-6 -6 l-5 6 l-6 -6 l-5 6 l-6 -5 z" class="pl-shell"/>';
const CROWN = '<path d="M46 38 l3 -12 l7 7 l4 -10 l4 10 l7 -7 l3 12 z" class="pl-gold"/>';
const WINGS = '<path d="M44 82 q-24 -20 -32 -4 q8 0 10 6 q6 -4 10 2 z M76 82 q24 -20 32 -4 q-8 0 -10 6 q-6 -4 -10 2 z" class="pl-wing"/>';
const DUMBBELLS = '<path d="M42 84 q-14 -2 -20 -14 M78 84 q14 -2 20 -14" class="pl-limb"/>' +
  '<rect x="12" y="64" width="16" height="6" rx="2" class="pl-iron"/><rect x="92" y="64" width="16" height="6" rx="2" class="pl-iron"/>';
const barbell = plate => '<path d="M42 84 q-18 -10 -22 -62 M78 84 q18 -10 22 -62" class="pl-limb"/><path d="M4 20 h112" class="pl-bar"/>' +
  '<rect x="2" y="9" width="9" height="22" rx="2" class="pl-' + plate + '"/><rect x="109" y="9" width="9" height="22" rx="2" class="pl-' + plate + '"/>';
// A star of points around (cx, cy), for the frill and the Sun dragon's rays.
const rays = (n, r1, r2, cx = 60, cy = 54) => 'M' + Array.from({ length: n * 2 }, (_, i) => {
  const a = Math.PI * i / n, r = i % 2 ? r1 : r2;
  return (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
}).join(' L') + ' Z';
// Each line's look, added to the lizard from stage 3 on (size grows with the stage).
// [behind the body, between body and head, on the head]
const TRAITS = {
  balanced: st => ['', DEWLAP + (st < 5 ? CREST : ''), ''],
  // Frilled lizard: a big neck frill, like a puffed-up chest; the Sun dragon's turns to gold rays.
  push: st => ['', '<path d="' + rays(st === 3 ? 9 : 11, st === 3 ? 30 : 33, st === 3 ? 37 : 42) + '" class="' + (st === 5 ? 'pl-gold' : 'pl-frill') + '"/>', ''],
  // Chameleon: a curled grip tail and a helmet-like casque on the head.
  pull: () => ['', '', '<path d="M38 50 q2 -24 22 -26 q20 2 22 26 q-10 -10 -22 -12 q-12 2 -22 12 z" class="pl-casque"/>'],
  // Basilisk: huge back legs and a sail on the head (the Wyvern's two legs are its whole thing).
  legs: st => {
    const rx = st === 3 ? 13 : 15, ry = st === 3 ? 12 : 14, sail = st === 3 ? 20 : 26;
    return ['<path d="M64 80 q14 -' + (sail + 4) + ' 32 -6 q-8 4 -14 10 z" class="pl-frill"/>',   // a sail along the back
      '<ellipse cx="33" cy="88" rx="' + rx + '" ry="' + ry + '" class="pl-body"/><ellipse cx="87" cy="88" rx="' + rx + '" ry="' + ry + '" class="pl-body"/>' +
      '<path d="M27 86 q6 -6 12 0 M81 86 q6 -6 12 0" class="pl-line"/>' +
      '<ellipse cx="28" cy="101" rx="12" ry="4.5" class="pl-body"/><ellipse cx="92" cy="101" rx="12" ry="4.5" class="pl-body"/>',
      '<path d="M44 38 q16 -' + sail + ' 32 0 z" class="pl-frill"/>'];
  },
};
const CURL = 'M76 92 q24 4 26 -12 q2 -14 -10 -12 q-8 2 -6 10 q2 6 8 4';
// Stage → [scale, tail, extra behind the body, parts in front of the head, its own headgear]
const LIZARD = [
  null,
  [0.72, TAIL.short, '', '', SHELL],
  [0.85, TAIL.long, '', '<path d="M42 86 q-9 1 -12 8 M78 86 q9 1 12 8" class="pl-limb"/>', ''],
  [0.95, TAIL.long, '', DUMBBELLS, ''],
  [1, TAIL.big, '', barbell('iron'), ''],
  [1, TAIL.big, WINGS, barbell('gold'), CROWN],
];
function lizard(stage, face, hat, branch) {
  const [k, tl, behind, front, own] = LIZARD[stage];
  const [tBack, tMid, tHead] = stage >= 3 ? TRAITS[branch || 'balanced'](stage) : ['', '', ''];
  const at = k === 1 ? '' : ' transform="translate(' + (60 - 60 * k).toFixed(1) + ' ' + (100 - 100 * k).toFixed(1) + ') scale(' + k + ')"';
  const t = tail(branch === 'pull' && stage >= 3 ? CURL : tl);
  return '<g' + at + '>' + t + behind + tBack + BODY + tMid + HEAD + tHead + front + face + (hat || own) + '</g>';
}
const EGG = (cracked, mood) => '<ellipse cx="60" cy="64" rx="27" ry="34" class="pl-egg"/>' +
  '<circle cx="50" cy="52" r="4" class="pl-spot"/><circle cx="70" cy="74" r="5" class="pl-spot"/><circle cx="66" cy="44" r="3" class="pl-spot"/>' +
  (cracked ? '<path d="M38 62 l8 -5 l6 6 l8 -7 l8 6 l7 -5 l7 5" class="pl-crack"/>' : '') +
  (mood === 'grouchy' || mood === 'sad' ? '<text x="88" y="30" class="pl-zzz">z</text><text x="96" y="20" class="pl-zzz">z</text>' : '');

// hat: a hat's drawing from hats.js (hatSvg), or nothing.
export function petSvg(p, label, hat = '') {
  const body = p.stage === 0 ? EGG(p.devolved || p.xp >= STAGES[1].min / 2, p.mood) + hat : lizard(p.stage, FACES[p.fedToday ? 'happy' : p.mood], hat, p.branch);
  return '<svg class="pet-svg pet-' + p.stageKey + (p.branch ? ' line-' + p.branch : '') + ' mood-' + (p.fedToday ? 'happy' : p.mood) + '" viewBox="0 0 120 110" role="img" aria-label="' + label + '">' +
    '<ellipse cx="60" cy="102" rx="34" ry="5" class="pl-floor"/><g class="pl-me">' + body + '</g></svg>';
}
