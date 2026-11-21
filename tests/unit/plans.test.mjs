// Following a plan: which week you're in, today's workout, and the week's load.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as PL from '../../lift/plans.js';

const run = { starts_on: '2026-11-16' };   // a Monday

test('weeks count from the Monday the plan started', () => {
  assert.equal(PL.weekOf(run, '2026-11-15'), 0);   // before it starts
  assert.equal(PL.weekOf(run, '2026-11-16'), 1);
  assert.equal(PL.weekOf(run, '2026-11-22'), 1);   // Sunday, same week
  assert.equal(PL.weekOf(run, '2026-11-23'), 2);
  assert.equal(PL.weekStart(run, 3), '2026-11-30');
});

test('fixed days: the cell for this week and weekday; nothing on a rest day or outside the plan', () => {
  const doc = { v: 2, weeks: 2, schedule: 'days', cells: [[1, 1, 'push'], [1, 3, 'pull'], [2, 1, 'legs']] };
  assert.equal(PL.todayKey(doc, run, '2026-11-16'), 'push');   // week 1, Monday
  assert.equal(PL.todayKey(doc, run, '2026-11-17'), null);     // Tuesday: rest
  assert.equal(PL.todayKey(doc, run, '2026-11-18'), 'pull');
  assert.equal(PL.todayKey(doc, run, '2026-11-23'), 'legs');   // week 2, Monday
  assert.equal(PL.todayKey(doc, run, '2026-11-30'), null);     // week 3: the plan is over
  assert.equal(PL.todayKey(doc, run, '2026-11-10'), null);     // not started yet
});

test('in order: the next after the last one done, until the week’s count is met', () => {
  const doc = { v: 2, weeks: 4, schedule: 'order', order: ['a', 'b', 'c'], per_week: 2 };
  assert.equal(PL.todayKey(doc, run, '2026-11-17', { thisWeek: 0 }), 'a');
  assert.equal(PL.todayKey(doc, run, '2026-11-17', { thisWeek: 1, lastKey: 'a' }), 'b');
  assert.equal(PL.todayKey(doc, run, '2026-11-17', { thisWeek: 1, lastKey: 'c' }), 'a');   // wraps round
  assert.equal(PL.todayKey(doc, run, '2026-11-17', { thisWeek: 2, lastKey: 'b' }), null);  // done for the week
});

test('a week’s load: the % of best the plan sets, and 60% in a deload', () => {
  const doc = { weeks: 4, phases: [{ name: 'Build', from: 1, to: 3, kind: 'build' }, { name: 'Easy', from: 4, to: 4, kind: 'deload' }],
    progression: [{ exercise_id: 'bench', pct: [75, 80, 85, 60] }] };
  assert.equal(PL.pctFor(doc, 2, 'bench'), 80);
  assert.equal(PL.pctFor(doc, 2, 'squat'), null);
  assert.equal(PL.loadFactor(doc, 2), 1);
  assert.equal(PL.loadFactor(doc, 4), 0.6);
  assert.equal(PL.phaseOf(doc, 4).name, 'Easy');
  assert.equal(PL.phaseOf(doc, 9), null);
});

test('climb: up a step a week from the start, holding at the top', () => {
  assert.deepEqual(PL.climb(5, 75, 5, 85), [75, 80, 85, 85, 85]);
  assert.deepEqual(PL.climb(3, 70, 2.5), [70, 72.5, 75]);
  assert.equal(PL.isPlan({ doc: { v: 2 } }), true);
  assert.equal(PL.isPlan({ doc: { v: 1 } }), false);
});
