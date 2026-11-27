// Pure lifting maths, ported from Sisyfitness (WorkoutLogic.kt, PlateCalculator.kt)
// so the numbers match the app and the spreadsheet: volume, milestones,
// achievements, PRs, estimated 1RM, plates, and near-match exercise names.

export const LB_PER_KG = 1 / 0.45359237;

// ---------- dates (always the lifter's local calendar day) ----------
export function localDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + n));
}
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function daysBetween(a, b) {   // b - a, in whole days
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

// ---------- numbers ----------
// One formatter per number of decimals, made once: toLocaleString builds a new one on every call,
// which is about 50 times slower and adds up across a page of weights.
const NUM_FMT = new Map();
export function fmtNum(n, max = 1) {
  if (n == null || !isFinite(n)) return '–';
  let f = NUM_FMT.get(max);
  if (!f) NUM_FMT.set(max, f = new Intl.NumberFormat('en-US', { maximumFractionDigits: max }));
  return f.format(Number(n));
}
// The same for dates: a formatter per set of options, made once. fmtDate(date, opts) matches
// date.toLocaleDateString('en-US', opts).
const DATE_FMT = new Map();
export function fmtDate(date, opts) {
  const key = JSON.stringify(opts || {});
  let f = DATE_FMT.get(key);
  if (!f) DATE_FMT.set(key, f = new Intl.DateTimeFormat('en-US', opts));
  return f.format(date);
}
export function fmtLoad(n) {   // 135, 137.5
  return fmtNum(Math.round(n * 100) / 100, 2);
}
export function fmtBig(n) {    // 12,345 / 1.25M
  if (n >= 1e6) return fmtNum(n / 1e6, 2) + 'M';
  return fmtNum(Math.round(n), 0);
}
export function parseLoad(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;   // an empty box is "no weight yet", not 0
  const v = Number(t.replace(',', '.'));
  return isFinite(v) ? v : null;
}

// ---------- volume ----------
// (weight + bodyweight if counted) x reps, kept separate per unit. Warm-ups don't count, and nor do
// sets measured in time or distance (no reps): holds and carries aren't pounds moved.
export function setVolume(s) {
  return s.reps == null ? 0 : (Number(s.weight) + (s.count_bodyweight ? Number(s.bodyweight || 0) : 0)) * s.reps;
}
export function volumeByUnit(sets) {
  const out = { lb: 0, kg: 0 };
  for (const s of sets) if (!s.deleted_at && s.is_warmup !== true) out[s.unit] += setVolume(s);
  return out;
}
export function lbEquivalent(v) {
  return Math.max(v.lb || 0, (v.kg || 0) * LB_PER_KG);
}

// ---------- milestones (Elephant Club, then every 50K lb up to 5M) ----------
export const MILESTONES = (() => {
  const list = [{ lb: 10000, title: 'Elephant Club', blurb: 'As much as an elephant.' }];
  for (let lb = 50000; lb <= 5000000; lb += 50000) {
    const title = lb < 1e6 ? lb / 1000 + 'K Club' : (lb / 1e6).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'M Club';
    list.push({ lb, title });
  }
  return list;
})();
export function milestoneProgress(lbEq) {
  let earned = null, next = MILESTONES[0];
  for (const m of MILESTONES) {
    if (lbEq >= m.lb - 1e-6) earned = m; else { next = m; break; }
    next = null;
  }
  const from = earned ? earned.lb : 0;
  return {
    earned, next,
    count: MILESTONES.filter(m => lbEq >= m.lb - 1e-6).length,
    ratio: next ? Math.max(0, Math.min(1, (lbEq - from) / (next.lb - from))) : 1,
    remaining: next ? next.lb - lbEq : 0,
  };
}
// Fun comparisons for the progress screen (lb). Rough, and labelled as such.
export const COMPARISONS = [
  { lb: 1, one: 'loaf of bread' },
  { lb: 15, one: 'Thanksgiving turkey' },
  { lb: 400, one: 'grand piano' },
  { lb: 3000, one: 'small car' },
  { lb: 10000, one: 'African elephant' },
  { lb: 80000, one: 'humpback whale' },
  { lb: 330000, one: 'blue whale' },
  { lb: 900000, one: 'loaded Boeing 747' },
];
export function compareTo(lbEq) {
  let pick = COMPARISONS[0];
  for (const c of COMPARISONS) if (lbEq >= c.lb) pick = c;
  const times = lbEq / pick.lb;
  return { times, thing: pick.one };
}

// ---------- achievements (season or all-time metrics) ----------
export function achievements(m) {
  const lbEq = lbEquivalent(m.volume);
  const visits = [
    { id: 'first_visit', title: 'First Visit', desc: 'Your first day logged.', have: m.visits, need: 1, unit: 'visits' },
    { id: 'five_visits', title: 'Five Visit Rhythm', desc: 'Five gym days.', have: m.visits, need: 5, unit: 'visits' },
    { id: 'twenty_visits', title: 'Regular', desc: 'Twenty gym days.', have: m.visits, need: 20, unit: 'visits' },
  ];
  const pr = { id: 'first_pr', title: 'New Personal Record', desc: 'A new best for an exercise and rep count.', have: m.prs, need: 1, unit: 'PRs' };
  return [...visits, pr].map(a => ({ ...a, earned: a.have >= a.need }))
    .concat(MILESTONES.map(ms => ({ id: 'vol_' + ms.lb, title: ms.title, desc: 'Move ' + fmtNum(ms.lb, 0) + ' lb equivalent.', have: lbEq, need: ms.lb, unit: 'lb eq', earned: lbEq >= ms.lb - 1e-6, milestone: true })));
}

// ---------- PRs: heavier than you've ever lifted for this many reps or more ----------
// Bests are kept per exercise, unit and rep count (lift_bests). A set is a PR when it beats every
// best at its rep count or more: 70 × 6 counts when the most you'd done for 6+ reps was 60 × 10.
// At a rep count higher than you've ever done, it counts when it's at least as heavy as anything
// you've done for fewer (50 × 12 after 50 × 8), and the first time on a lift always counts.
export const bestKey = s => s.exercise_id + '|' + s.unit + '|' + s.reps;
export function bestsMap(rows) {   // rows from lift_bests
  const m = new Map();
  for (const r of rows) m.set(bestKey(r), Number(r.heaviest));
  return m;
}
export function bestDaysMap(rows) {   // the day each best was first lifted
  const m = new Map();
  for (const r of rows) m.set(bestKey(r), r.first_lifted_on);
  return m;
}
// The best to beat for a set: { weight, reps } at its rep count or more, else at fewer (beat = tie
// is enough), else null (a lift you've never done in this unit). `on` limits it to bests first
// lifted before that day. `other` says whether the lift has any best at all (any unit).
export function prBar(set, bests, bestOn, before) {
  const lift = set.exercise_id + '|', unit = lift + set.unit + '|';
  let up = null, down = null, other = false;
  for (const [k, v] of bests) {
    if (!k.startsWith(lift)) continue;
    if (before && !(bestOn.get(k) < before)) continue;
    other = true;
    if (!k.startsWith(unit)) continue;
    const r = Number(k.slice(unit.length));
    if (r >= set.reps) { if (!up || v > up.weight) up = { weight: v, reps: r }; }
    else if (!down || v > down.weight) down = { weight: v, reps: r };
  }
  return up ? { ...up, strict: true } : down ? { ...down, strict: false } : { weight: null, reps: null, strict: true, other };
}
const beatsBar = (w, bar) => (bar.weight == null ? !bar.other : bar.strict ? w > bar.weight : w >= bar.weight);
export function isPr(set, bests) {
  if (set.is_warmup === true || set.reps == null) return false;
  return beatsBar(Number(set.weight), prBar(set, bests));
}
// A set that's probably a typo, judged against your own bests for that lift in that unit: far over
// your best estimated 1-rep max (a slipped digit: 160 for 60), or far more reps than you've ever done.
// Returns a short reason, or null. Nothing to judge on a lift you've never done. The app asks once
// and logs it anyway on the second tap: a real jump in strength is allowed, just double-checked.
export function oddSet(set, bests) {
  if (set.reps == null || set.is_warmup === true) return null;
  const unit = set.exercise_id + '|' + set.unit + '|', w = Number(set.weight);
  let top = null, topE = 0, most = 0;
  for (const [k, v] of bests) {
    if (!k.startsWith(unit)) continue;
    const r = Number(k.slice(unit.length)), e = e1rm(v, r) || 0;
    most = Math.max(most, r);
    if (e > topE) { topE = e; top = { weight: v, reps: r }; }
  }
  const e = e1rm(w, set.reps) || (set.reps > 12 && w > 0 ? w * (1 + 12 / 30) : 0);
  // 1.6× and 15 lb (7 kg) over: light dumbbells jump 20 → 30 for real; typos look like 160 for 60.
  if (top && e > topE * 1.6 && w - top.weight >= (set.unit === 'kg' ? 7 : 15)) {
    return 'That’s far above your best (' + fmtLoad(top.weight) + ' ' + set.unit + ' × ' + top.reps + '). A typo?';
  }
  if (most && set.reps >= 25 && set.reps >= most * 2.5) return set.reps + ' reps is a lot more than you’ve done before (' + most + '). A typo?';
  return null;
}
// Whether a logged set still stands as its day's PR: it holds the best at its rep count, that best
// was first lifted that day, and it beat what stood before that day. (A later, heavier best hides
// what came before, so an older day's PR that has since been beaten no longer shows.)
export function standsAsPr(set, bests, bestOn) {
  if (set.is_warmup === true || set.reps == null) return false;
  const k = bestKey(set), w = Number(set.weight);
  if (bests.get(k) !== w || bestOn.get(k) !== set.performed_on) return false;
  return beatsBar(w, prBar(set, bests, bestOn, set.performed_on));
}
// PR count in a window, the same way the app counts a season: a set is a PR when it beats every
// earlier set (including ones before the window) for that exercise, unit and rep count, or when
// it's the first ever at that rep count. `before` = sets from before the window.
export function countPrs(sets, before = []) { return prSets(sets, before).length; }
// The PR sets themselves, in the order lifted (same rule as countPrs).
export function prSets(sets, before = []) {
  const byTime = (a, b) => (a.performed_on + a.logged_at).localeCompare(b.performed_on + b.logged_at);
  const best = new Map(), out = [];
  for (const s of before) {
    if (s.deleted_at || s.is_warmup === true) continue;
    best.set(bestKey(s), Math.max(best.get(bestKey(s)) ?? -Infinity, Number(s.weight)));
  }
  for (const s of [...sets].sort(byTime)) {
    if (s.deleted_at || s.is_warmup === true) continue;
    const k = bestKey(s), prev = best.get(k);
    if (prev == null || Number(s.weight) > prev) out.push(s);
    best.set(k, Math.max(prev ?? -Infinity, Number(s.weight)));
  }
  return out;
}

// Estimated 1RM (Epley). An estimate, shown with its method, only from 1-12 rep sets.
export function e1rm(weight, reps) {
  if (!(reps >= 1 && reps <= 12) || !(weight > 0)) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

// ---------- routines ----------
// Best estimated 1RM for an exercise in one unit, from the heaviest-by-rep-count rows (lift_bests).
export function bestE1rm(exerciseId, unit, bestRows) {
  let top = 0;
  for (const r of bestRows) if (r.exercise_id === exerciseId && r.unit === unit) top = Math.max(top, e1rm(Number(r.heaviest), r.reps) || 0);
  return top || null;
}
const roundLoad = (w, unit) => { const step = unit === 'kg' ? 2.5 : 5; return Math.round(w / step) * step; };
// What a routine item asks for today: { weight, reps, unit, pct?, basis? } or weight null if % needs a best first.
export function itemTarget(item, bestRows) {
  if (item.load_mode === 'percent_1rm') {
    const basis = bestE1rm(item.exercise_id, item.unit, bestRows);
    return { reps: item.reps, unit: item.unit, pct: Number(item.load_value), basis,
      weight: basis ? roundLoad(basis * Number(item.load_value) / 100, item.unit) : null };
  }
  return { reps: item.reps, unit: item.unit, weight: Number(item.load_value) };
}
export function targetText(item, bestRows, unitShown = true) {
  const t = itemTarget(item, bestRows);
  const load = item.load_mode === 'percent_1rm'
    ? ' @ ' + fmtNum(t.pct, 0) + '%' + (t.weight ? ' ≈ ' + fmtLoad(t.weight) + ' ' + t.unit : '')
    : (t.weight > 0 ? ' @ ' + fmtLoad(t.weight) + (unitShown ? ' ' + t.unit : '') : '');
  return item.sets + ' × ' + item.reps + load;
}

// ---------- seasons ----------
// Totals for a date range from the per-day rows (lift_days); "bests set" counts rep-count bests
// first reached inside the season that still stand.
export function seasonMetrics(days, bestRows, from, to) {
  const inside = days.filter(d => d.performed_on >= from && d.performed_on <= to && d.sets > 0);
  const volume = { lb: 0, kg: 0 };
  let sets = 0;
  for (const d of inside) { volume.lb += Number(d.volume_lb); volume.kg += Number(d.volume_kg); sets += Number(d.sets); }
  const bests = bestRows.filter(r => r.first_lifted_on >= from && r.first_lifted_on <= to).length;
  return { volume, visits: inside.length, sets, bests };
}
export function goalProgress(goal, m) {
  const have = goal.metric === 'visits' ? m.visits : (m.volume[goal.unit] || 0);
  const need = Number(goal.target);
  return { have, need, ratio: need > 0 ? Math.min(1, have / need) : 0, done: have >= need };
}

// ---------- plates: closest load at or under the target, fewest plates ----------
export const PLATES = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };
export const BAR = { lb: 45, kg: 20 };
export function plateLoadout(target, bar, plates) {
  const SCALE = 4;
  if (!isFinite(target) || target < bar || target > 4000) return null;
  const perSide = Math.floor(((target - bar) / 2) * SCALE + 1e-9);
  const den = [...new Set(plates.map(p => Math.round(p * SCALE)))].filter(p => p > 0);
  const min = new Array(perSide + 1).fill(Infinity), prev = new Array(perSide + 1).fill(-1);
  min[0] = 0;
  for (let a = 1; a <= perSide; a++) for (let i = 0; i < den.length; i++) {
    const p = den[i];
    if (p <= a && min[a - p] + 1 < min[a]) { min[a] = min[a - p] + 1; prev[a] = i; }
  }
  let a = perSide; while (a > 0 && min[a] === Infinity) a--;
  const side = [];
  for (let r = a; r > 0; r -= den[prev[r]]) side.push(den[prev[r]] / SCALE);
  side.sort((x, y) => y - x);
  return { perSide: side, total: bar + 2 * side.reduce((s, p) => s + p, 0) };
}

// ---------- exercise search ----------
export function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
export function searchExercises(query, exercises, aliasesById, recentIds = []) {
  const q = norm(query);
  const recentRank = new Map(recentIds.map((id, i) => [id, i]));
  const live = exercises.filter(e => !e.deleted_at);
  if (!q) return recentIds.map(id => live.find(e => e.id === id)).filter(Boolean);
  const words = q.split(' ');
  const scored = [];
  for (const e of live) {
    const names = [e.name, ...(aliasesById.get(e.id) || [])].map(norm);
    let best = 0;
    for (const n of names) {
      if (!words.every(w => n.includes(w))) continue;
      let s = 1;
      if (n === q) s = 100; else if (n.startsWith(q)) s = 50; else if (n.split(/[^a-z0-9]+/).some(t => t.startsWith(words[0]))) s = 20;
      best = Math.max(best, s);
    }
    if (best) scored.push({ e, s: best + (recentRank.has(e.id) ? 30 - Math.min(20, recentRank.get(e.id)) : 0) - e.name.length / 100 });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.e);
}

// Which of your recent days should finish themselves: the last `back` days (today included) with
// working sets, none posted or finished on this phone, whose last set is at least `hours` old.
// setsOn(day) gives that day's sets; posted is a Set of days already finished.
export function daysToFinish({ today, now, setsOn, posted, finishedHere, hours = 12, back = 3 }) {
  const out = [];
  for (let k = 0; k < back; k++) {
    const day = addDays(today, -k);
    if (posted.has(day) || finishedHere === day) continue;
    const times = setsOn(day).filter(x => x.is_warmup !== true && x._sync !== 'gone').map(x => Date.parse(x.logged_at)).filter(Number.isFinite);
    if (times.length && now - Math.max(...times) >= hours * 3600e3) out.push(day);
  }
  return out;
}

// The other name a search found an exercise by, when its own name doesn't match: searching
// "barbell bench press" finds Bench Press, and this says "Barbell Bench Press". Null otherwise.
export function matchedAlias(query, ex, aliasesById) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length || words.every(w => norm(ex.name).includes(w))) return null;
  const hits = (aliasesById.get(ex.id) || []).filter(a => words.every(w => norm(a).includes(w)));
  return hits.length ? hits.sort((a, b) => a.length - b.length)[0] : null;
}

// Near-match warning before the admin adds a new name (never merges anything).
export function suggestMatch(entered, names) {
  const t = entered.trim();
  if (!t || names.some(n => n.toLowerCase() === t.toLowerCase())) return null;
  const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const opposite = [['abduction', 'adduction'], ['flexion', 'extension'], ['supination', 'pronation'], ['internal', 'external'], ['left', 'right'], ['wide', 'close']];
  const words = s => s.toLowerCase().split(/[^a-z]+/);
  const clash = (a, b) => opposite.some(([x, y]) => (words(a).includes(x) && words(b).includes(y)) || (words(a).includes(y) && words(b).includes(x)));
  const limit = t.length < 12 ? 1 : 2;
  const close = names.map(n => [n, dist(clean(n), clean(t))]).filter(([n, d]) => d <= limit && !clash(n, t)).sort((a, b) => a[1] - b[1]);
  if (!close.length) return null;
  return close.filter(c => c[1] === close[0][1]).length === 1 ? close[0][0] : null;
}
function dist(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) cur[j + 1] = Math.min(cur[j] + 1, prev[j + 1] + 1, prev[j] + (a[i] === b[j] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
