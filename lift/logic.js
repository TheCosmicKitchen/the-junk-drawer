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
export function fmtNum(n, max = 1) {
  if (n == null || !isFinite(n)) return '–';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: max });
}
export function fmtLoad(n) {   // 135, 137.5
  return fmtNum(Math.round(n * 100) / 100, 2);
}
export function fmtBig(n) {    // 12,345 / 1.25M
  if (n >= 1e6) return fmtNum(n / 1e6, 2) + 'M';
  return fmtNum(Math.round(n), 0);
}
export function parseLoad(text) {
  const v = Number(String(text).trim().replace(',', '.'));
  return isFinite(v) ? v : null;
}

// ---------- volume ----------
// (weight + bodyweight if counted) x reps, kept separate per unit. Warm-ups don't count.
export function setVolume(s) {
  return (Number(s.weight) + (s.count_bodyweight ? Number(s.bodyweight || 0) : 0)) * s.reps;
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
    { id: 'first_visit', title: 'First Visit', desc: 'The boulder is moving.', have: m.visits, need: 1, unit: 'visits' },
    { id: 'five_visits', title: 'Five Visit Rhythm', desc: 'You kept showing up.', have: m.visits, need: 5, unit: 'visits' },
    { id: 'twenty_visits', title: 'Regular', desc: 'Twenty gym days.', have: m.visits, need: 20, unit: 'visits' },
  ];
  const pr = { id: 'first_pr', title: 'New Personal Record', desc: 'A new best for an exercise and rep count.', have: m.prs, need: 1, unit: 'PRs' };
  return [...visits, pr].map(a => ({ ...a, earned: a.have >= a.need }))
    .concat(MILESTONES.map(ms => ({ id: 'vol_' + ms.lb, title: ms.title, desc: 'Move ' + fmtNum(ms.lb, 0) + ' lb equivalent.', have: lbEq, need: ms.lb, unit: 'lb eq', earned: lbEq >= ms.lb - 1e-6, milestone: true })));
}

// ---------- PRs: a heavier load than ever before for the same exercise, unit and rep count ----------
export const bestKey = s => s.exercise_id + '|' + s.unit + '|' + s.reps;
export function bestsMap(rows) {   // rows from lift_bests
  const m = new Map();
  for (const r of rows) m.set(bestKey(r), Number(r.heaviest));
  return m;
}
export function isPr(set, bests) {
  if (set.is_warmup === true) return false;
  const prev = bests.get(bestKey(set));
  return prev == null ? false : Number(set.weight) > prev;   // a first-ever rep count isn't a PR, just a start
}
// PR count in a window, the same way the app counts a season: a set is a PR when it beats every
// earlier set (including ones before the window) for that exercise, unit and rep count, or when
// it's the first ever at that rep count. `before` = sets from before the window.
export function countPrs(sets, before = []) {
  const byTime = (a, b) => (a.performed_on + a.logged_at).localeCompare(b.performed_on + b.logged_at);
  const best = new Map();
  for (const s of before) {
    if (s.deleted_at || s.is_warmup === true) continue;
    best.set(bestKey(s), Math.max(best.get(bestKey(s)) ?? -Infinity, Number(s.weight)));
  }
  let n = 0;
  for (const s of [...sets].sort(byTime)) {
    if (s.deleted_at || s.is_warmup === true) continue;
    const k = bestKey(s), prev = best.get(k);
    if (prev == null || Number(s.weight) > prev) n++;
    best.set(k, Math.max(prev ?? -Infinity, Number(s.weight)));
  }
  return n;
}

// Estimated 1RM (Epley). An estimate, shown with its method, only from 1-12 rep sets.
export function e1rm(weight, reps) {
  if (!(reps >= 1 && reps <= 12) || !(weight > 0)) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
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
