// Plans: a program designed week by week (a version 2 lift_programs document), and following one
// (a lift_plan_runs row: which plan, since when). Pure functions, no page or storage:
//   which week you're in, today's workout, and what a lift's load should be that week.
//
// A plan document (see supabase/sql/35_plans.sql for the checks):
//   { v: 2, kind: 'plan', weeks, about,
//     workouts: [{ key, template_id }],            routines it uses
//     schedule: 'days' | 'order',
//     cells: [[week, weekday, key]],               'days': what's on each day of each week
//     order: [key], per_week,                      'order': workouts take turns, so many a week
//     phases: [{ name, from, to, kind }],          build | push | peak | deload
//     progression: [{ exercise_id, pct: [...] }] } a lift's % of best, one per week
import { parseDate, addDays } from './logic.js';

export const PHASE_KINDS = {
  build: { name: 'Build', color: '#a8844a' },
  push: { name: 'Push', color: 'var(--accent)' },
  peak: { name: 'Peak', color: 'var(--gold)' },
  deload: { name: 'Deload', color: '#6fa57a', factor: 0.6 },   // the same workouts, lighter
};
export const MAX_WEEKS = 16;
export const isPlan = p => !!(p && p.doc && p.doc.v === 2);
const DAY = 864e5;

// Week 1, 2, … counted from the run's start; 0 before it starts; more than doc.weeks once it's over.
export function weekOf(run, today) {
  const days = Math.round((parseDate(today) - parseDate(run.starts_on)) / DAY);
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}
export const weekStart = (run, week) => addDays(run.starts_on, (week - 1) * 7);
export const phaseOf = (doc, week) => (doc.phases || []).find(p => week >= p.from && week <= p.to) || null;
export const workoutOf = (doc, key) => (doc.workouts || []).find(w => w.key === key) || null;
export const keyOfTemplate = (doc, tid) => ((doc.workouts || []).find(w => w.template_id === tid) || {}).key || null;

// Today's workout key, or null for a rest day (or outside the plan's weeks).
//   'days':  the cell for this week and weekday.
//   'order': the next workout after the last one you did, unless you've already done
//            per_week of them this week. Missing a day just means the next one waits.
export function todayKey(doc, run, today, done) {
  const week = weekOf(run, today);
  if (week < 1 || week > doc.weeks) return null;
  if (doc.schedule === 'days') {
    const dow = parseDate(today).getDay();
    const c = (doc.cells || []).find(x => x[0] === week && x[1] === dow);
    return c ? c[2] : null;
  }
  const order = doc.order || [];
  if (!order.length || (done && done.thisWeek >= (doc.per_week || order.length))) return null;
  const i = done && done.lastKey ? order.indexOf(done.lastKey) : -1;
  return order[(i + 1) % order.length];
}

// A lift's % of best in a week, if the plan sets one.
export function pctFor(doc, week, exId) {
  const p = (doc.progression || []).find(x => x.exercise_id === exId);
  const v = p && p.pct ? p.pct[week - 1] : null;
  return v == null ? null : Number(v);
}
// How much of the usual load a week asks for: 0.6 in a deload, else 1.
export const loadFactor = (doc, week) => { const ph = phaseOf(doc, week); return ph && PHASE_KINDS[ph.kind] && PHASE_KINDS[ph.kind].factor || 1; };

// A progression that climbs by `step` % a week from `start`, holding at `top`.
export const climb = (weeks, start, step, top = 110) => Array.from({ length: weeks }, (_, i) => Math.min(top, Math.round((start + i * step) * 2) / 2));
