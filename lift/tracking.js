// What a set records, and how to read it. Driven by fields, not by special cases.
//
// Every tracker (Hevy, Strong, Plates) records some mix of four numbers: load, reps, time and
// distance. FIELDS describes each one once: its column, its label, how its box reads and shows it,
// what − and + do, and how it reads in a set. An exercise's log type (lift_exercises.log_type) is
// just the list of fields it asks for. A logged set is read from the fields it actually holds, so
// it reads right whatever its exercise's type is now.
//
// One rule decides a set's main measure: the first of reps, distance, time that it holds. That
// measure is what a best is about (heaviest at a rep count; farthest; longest), the same rule the
// database's bests trigger uses. Load is always a best too for sets without reps. Volume stays
// weight × reps, so holds and carries don't count toward pounds moved.
import * as L from './logic.js';

// ---------- formatting ----------
const pad = n => String(n).padStart(2, '0');
export function fmtTime(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? h + ':' + pad(m) + ':' + pad(x) : m + ':' + pad(x);
}
// "45" (seconds), "0:45", "1:30", "1:02:03"; null if it isn't a time.
export function parseTime(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t));
  if (!/^\d+(:\d{1,2}){1,2}$/.test(t)) return null;
  return t.split(':').map(Number).reduce((a, p) => a * 60 + p, 0);
}
// Distances are kept in meters and shown in your carry unit.
export const CARRY_UNITS = { m: 1, yd: 0.9144, ft: 0.3048 };
export const toMeters = (v, u) => Math.round(v * (CARRY_UNITS[u] || 1) * 100) / 100;
export const fromMeters = (m, u) => Number(m) / (CARRY_UNITS[u] || 1);
const roundDist = v => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
export const fmtDist = (m, u) => L.fmtNum(roundDist(fromMeters(m, u)), 1) + ' ' + u;

// The load part of a set: "135", "BW", "BW+25", "BW−30" (assisted). unitTag(u) adds a unit when it
// isn't your usual one. bare: nothing for a set with no load at all.
export function loadText(s, unitTag = () => '', bare = false) {
  const w = Number(s.weight) || 0;
  if (s.count_bodyweight) return w > 0 ? 'BW+' + L.fmtLoad(w) + unitTag(s.unit) : w < 0 ? 'BW−' + L.fmtLoad(-w) + unitTag(s.unit) : 'BW';
  return w > 0 || !bare ? L.fmtLoad(w) + unitTag(s.unit) : '';
}

// ---------- the fields ----------
// o (options) carries the viewer's choices: unitTag and carryUnit.
//   label      the box's label        start   a first value with no history
//   show/read  value <-> box text (read: null when invalid)
//   step       what − and + move it by        clamp  keeps it in range
//   text       how it reads in a set           error  what to say when the box won't read
//   noun       a word after a single value ("5 reps"), if it needs one
//   needsLoad  a set of this needs a weight (0 for bodyweight); otherwise the weight is optional
//   stepMax    the most a routine step may ask for, when lower than a set's limit
//   chart      how a trend charts it: the day's best value, its name, and how an axis label reads.
//              Reps has none: a rep set's progress is its load, charted as top set and estimated max.
export const FIELDS = {
  reps: {
    label: 'Reps', start: 8, inputmode: 'numeric', noun: v => (v === 1 ? 'rep' : 'reps'), needsLoad: true, stepMax: 100,
    show: v => String(v), read: t => { const v = parseInt(t, 10); return v >= 1 && v <= 1000 ? v : null; },
    step: () => 1, clamp: v => Math.max(1, Math.min(1000, Math.round(v))),
    text: v => String(v), error: 'Reps must be at least 1.',
  },
  duration_s: {
    label: 'Time', start: 30, inputmode: 'text',
    show: v => fmtTime(v), read: t => { const v = parseTime(t); return v >= 1 && v <= 86400 ? v : null; },
    step: () => 15, clamp: v => Math.max(5, Math.min(86400, Math.round(v))),
    text: v => fmtTime(v), error: 'Enter a time like 0:45, 1:30 or 90.',
    chart: { name: 'Longest', best: 'longest', value: v => Number(v), fmt: v => fmtTime(v) },
  },
  distance_m: {
    label: 'Distance', start: 40 * CARRY_UNITS.yd, inputmode: 'decimal',
    show: (v, o) => String(roundDist(fromMeters(v, o.carryUnit))),
    read: (t, o) => { const v = L.parseLoad(t); return v > 0 && v <= 100000 ? toMeters(v, o.carryUnit) : null; },
    step: o => toMeters(5, o.carryUnit), clamp: v => Math.max(0.5, Math.min(100000, Math.round(v * 100) / 100)),
    text: (v, o) => fmtDist(v, o.carryUnit), error: 'Enter a distance.',
    unitOf: o => o.carryUnit,
    chart: { name: 'Farthest', best: 'farthest', value: (v, o) => fromMeters(v, o.carryUnit), fmt: (v, o) => L.fmtNum(roundDist(v), 1) + ' ' + o.carryUnit },
  },
};
// The measures a set can hold, in the order that decides its main one.
export const MEASURES = ['reps', 'distance_m', 'duration_s'];

// ---------- log types: which fields an exercise asks for ----------
// fields: the measures the logger shows beside the weight, main one first; the rest are optional.
export const TYPES = {
  reps: { id: 'reps', name: 'Weight × reps', blurb: 'Most lifts: presses, rows, curls, pull-ups', fields: ['reps'] },
  time: { id: 'time', name: 'Time', blurb: 'Holds: planks, hangs, wall sits', fields: ['duration_s'] },
  distance: { id: 'distance', name: 'Distance', blurb: 'Carries and sleds, with the time if you like', fields: ['distance_m', 'duration_s'] },
};
export const TYPE_ORDER = ['reps', 'time', 'distance'];
export const typeOf = ex => TYPES[ex && ex.log_type] || TYPES.reps;   // anything unknown asks for reps
export const mainField = t => t.fields[0];

// ---------- reading a record ----------
// The measures a record (a set or a routine step) holds, in MEASURES order.
export const measuresOf = r => MEASURES.filter(f => r[f] != null);
export const mainOf = r => measuresOf(r)[0] || null;
// "135 × 5", "BW−30 × 8", "0:45", "25 × 1:00", "70 × 40 yd · 0:32", plus "@8" for effort.
export function setText(s, o) {
  const [main, ...rest] = measuresOf(s);
  const load = main === 'reps' ? loadText(s, o.unitTag) : loadText(s, o.unitTag, true);
  const head = main ? FIELDS[main].text(s[main], o) : '';
  const shown = load && !(load === 'BW' && main !== 'reps') ? (head ? load + ' × ' + head : load) : head;
  return [shown, ...rest.map(f => FIELDS[f].text(s[f], o))].join(' · ') + (s.rpe ? ' @' + L.fmtNum(Number(s.rpe), 1) : '');
}
// A routine step's target: "3 × 5", "3 × 0:45", "3 × 40 yd". Its main field is the exercise type's,
// unless the step only holds another measure.
export function stepField(it, ex) {
  const t = typeOf(ex), f = mainField(t);
  return it[f] != null ? f : mainOf(it) || f;
}
export const stepValue = (it, ex) => { const f = stepField(it, ex); return it[f] ?? FIELDS[f].start; };
export const stepText = (it, ex, o) => { const f = stepField(it, ex); return it.sets + ' × ' + FIELDS[f].text(stepValue(it, ex), o); };
// A step's target as set fields: { reps } or { duration_s } or { distance_m }, the other measures null.
export function stepRecord(it, ex) {
  const f = stepField(it, ex), out = {};
  for (const m of MEASURES) out[m] = m === f ? stepValue(it, ex) : null;
  return out;
}

// ---------- bests for sets without reps ----------
// Rep sets keep a best per rep count (lift_bests, as before). Other sets keep, per exercise, their
// main measure (longest, farthest) and their heaviest load (lift_feats). Units: s, m, lb, kg.
const METRIC = { duration_s: ['time', 's'], distance_m: ['distance', 'm'] };
export const featKey = (exId, metric, unit) => exId + '|' + metric + '|' + unit;
export function featsMap(rows) {
  const m = new Map();
  for (const r of rows || []) m.set(featKey(r.exercise_id, r.metric, r.unit), Number(r.best));
  return m;
}
export function featsOf(s) {
  const main = mainOf(s);
  if (!main || main === 'reps') return [];
  const out = [[...METRIC[main], Number(s[main])]];
  if (Number(s.weight) > 0) out.push(['load', s.unit, Number(s.weight)]);
  return out;
}
// A new longest, farthest or heaviest; the first time you ever do one counts too.
export function isFeatPr(s, feats) {
  if (s.is_warmup === true) return false;
  const mine = featsOf(s);
  let seen = false;
  for (const [m, u, v] of mine) {
    const prev = feats.get(featKey(s.exercise_id, m, u));
    if (prev != null) { seen = true; if (v > prev) return true; }
  }
  if (seen) return false;
  for (const k of feats.keys()) if (k.startsWith(s.exercise_id + '|')) return false;
  return mine.length > 0;
}
export function raiseFeats(s, feats) {
  if (s.is_warmup === true) return;
  for (const [m, u, v] of featsOf(s)) { const k = featKey(s.exercise_id, m, u); if (!(feats.get(k) >= v)) feats.set(k, v); }
}
export const isPr = (s, bests, feats) => (mainOf(s) === 'reps' ? L.isPr(s, bests) : isFeatPr(s, feats));
// "longest 1:30 · heaviest 25 lb" for an exercise, or ''.
export function featLine(exId, feats, o) {
  const get = (m, u) => feats.get(featKey(exId, m, u)), parts = [];
  if (get('time', 's') != null) parts.push('longest ' + fmtTime(get('time', 's')));
  if (get('distance', 'm') != null) parts.push('farthest ' + fmtDist(get('distance', 'm'), o.carryUnit));
  for (const u of ['lb', 'kg']) if (get('load', u) != null) parts.push('heaviest ' + L.fmtLoad(get('load', u)) + ' ' + u);
  return parts.join(' · ');
}
