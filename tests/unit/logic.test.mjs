// The lifting maths: dates, volume, milestones, PRs, estimated maxes, plates and exercise search.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../lift/logic.js';

test('dates follow the local calendar, across month ends and daylight saving', () => {
  assert.equal(L.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(L.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(L.addDays('2028-03-01', -1), '2028-02-29');   // leap year
  // The npm script runs in a US time zone, so these cross a clock change.
  assert.equal(L.addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(L.addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(L.daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(L.daysBetween('2026-11-02', '2026-10-31'), -2);
});

test('a typed weight reads as a number, an empty box as nothing', () => {
  assert.equal(L.parseLoad('135'), 135);
  assert.equal(L.parseLoad(' 137,5 '), 137.5);
  assert.equal(L.parseLoad(''), null);
  assert.equal(L.parseLoad('abc'), null);
  assert.equal(L.fmtLoad(135), '135');
  assert.equal(L.fmtLoad(137.5), '137.5');
  assert.equal(L.fmtLoad(1.25), '1.25');
  assert.equal(L.fmtBig(12345.4), '12,345');
  assert.equal(L.fmtBig(1250000), '1.25M');
});

test('volume is weight × reps, counts bodyweight when asked, and skips holds, warm-ups and deletes', () => {
  assert.equal(L.setVolume({ weight: 135, reps: 5 }), 675);
  assert.equal(L.setVolume({ weight: 25, reps: 8, count_bodyweight: true, bodyweight: 180 }), 1640);
  assert.equal(L.setVolume({ weight: 0, reps: null, duration_s: 60 }), 0);
  const v = L.volumeByUnit([
    { weight: 100, reps: 5, unit: 'lb' },
    { weight: 50, reps: 10, unit: 'kg' },
    { weight: 45, reps: 10, unit: 'lb', is_warmup: true },
    { weight: 999, reps: 1, unit: 'lb', deleted_at: '2026-01-01' },
  ]);
  assert.deepEqual(v, { lb: 500, kg: 500 });
  assert.ok(Math.abs(L.lbEquivalent(v) - 500 * L.LB_PER_KG) < 1e-9);   // the bigger of the two
});

test('milestones: the Elephant Club at 10,000 lb, then every 50K', () => {
  assert.equal(L.milestoneProgress(0).next.title, 'Elephant Club');
  assert.equal(L.milestoneProgress(0).earned, null);
  const at = L.milestoneProgress(10000);
  assert.equal(at.earned.title, 'Elephant Club');
  assert.equal(at.next.title, '50K Club');
  assert.equal(L.milestoneProgress(30000).ratio, 0.5);
  assert.equal(L.milestoneProgress(1e6).earned.title, '1M Club');
  assert.equal(L.milestoneProgress(9e6).next, null);
});

test('a PR beats your best at that rep count; a first-ever lift counts, a new rep count does not', () => {
  const bests = L.bestsMap([{ exercise_id: 'bench', unit: 'lb', reps: 5, heaviest: 185 }]);
  const set = o => ({ exercise_id: 'bench', unit: 'lb', reps: 5, weight: 185, ...o });
  assert.equal(L.isPr(set({ weight: 190 }), bests), true);
  assert.equal(L.isPr(set({ weight: 185 }), bests), false);    // a tie is not a PR
  assert.equal(L.isPr(set({ weight: 190, is_warmup: true }), bests), false);
  assert.equal(L.isPr(set({ reps: 3, weight: 200 }), bests), false);   // a lift you've done, a new rep count
  assert.equal(L.isPr(set({ exercise_id: 'squat' }), bests), true);    // never done squats
});

test('PRs in a window count against everything before it, in the order lifted', () => {
  const s = (d, t, w, o) => ({ exercise_id: 'bench', unit: 'lb', reps: 5, weight: w, performed_on: d, logged_at: t, ...o });
  const before = [s('2026-01-01', '10:00', 200)];
  const inside = [s('2026-02-02', '10:00', 210), s('2026-02-01', '10:00', 205), s('2026-02-03', '10:00', 205), s('2026-02-04', '10:00', 300, { is_warmup: true })];
  assert.equal(L.countPrs(inside, before), 2);   // 205 then 210; the second 205 isn't
  assert.equal(L.countPrs([s('2026-02-01', '10:00', 100)]), 1);   // the first ever
});

test('estimated 1-rep max (Epley), only from 1 to 12 reps', () => {
  assert.equal(L.e1rm(225, 1), 225);
  assert.ok(Math.abs(L.e1rm(100, 10) - 133.333) < 0.001);
  assert.equal(L.e1rm(100, 13), null);
  assert.equal(L.e1rm(0, 5), null);
  const rows = [{ exercise_id: 'bench', unit: 'lb', reps: 5, heaviest: 180 }, { exercise_id: 'bench', unit: 'lb', reps: 1, heaviest: 200 }];
  assert.equal(L.bestE1rm('bench', 'lb', rows), 210);
  assert.equal(L.bestE1rm('bench', 'kg', rows), null);
});

test('a routine step at a % of your max rounds to a loadable weight, or waits for a best', () => {
  const rows = [{ exercise_id: 'bench', unit: 'lb', reps: 5, heaviest: 180 }];   // e1rm 210
  const step = { exercise_id: 'bench', unit: 'lb', reps: 5, sets: 3, load_mode: 'percent_1rm', load_value: 75 };
  assert.equal(L.itemTarget(step, rows).weight, 160);                // 157.5 rounds to 160
  assert.equal(L.itemTarget({ ...step, unit: 'kg' }, rows).weight, null);
  assert.equal(L.targetText(step, rows), '3 × 5 @ 75% ≈ 160 lb');
  assert.equal(L.targetText({ ...step, load_mode: 'fixed', load_value: 135 }, rows), '3 × 5 @ 135 lb');
});

test('plates: fewest per side, never over the target', () => {
  const lb = t => L.plateLoadout(t, L.BAR.lb, L.PLATES.lb);
  assert.deepEqual(lb(225).perSide, [45, 45]);
  assert.deepEqual(lb(135).perSide, [45]);
  assert.deepEqual(lb(185).perSide, [45, 25]);
  assert.deepEqual(lb(50).perSide, [2.5]);
  assert.equal(lb(47).total, 45);       // can't make 47: the bar alone, under the target
  assert.equal(lb(40), null);           // less than the bar
  assert.deepEqual(L.plateLoadout(100, L.BAR.kg, L.PLATES.kg).perSide, [25, 15]);
});

test('exercise search: exact, then starts-with, then a word; aliases count; deleted lifts never show', () => {
  const ex = [
    { id: 'b', name: 'Bench Press' }, { id: 'ib', name: 'Incline Bench Press' }, { id: 'db', name: 'Dumbbell Bench Press' },
    { id: 'gone', name: 'Bench Dip', deleted_at: '2026-01-01' }, { id: 'rdl', name: 'Romanian Deadlift' },
  ];
  const aliases = new Map([['rdl', ['RDL']]]);
  assert.equal(L.searchExercises('bench press', ex, aliases)[0].id, 'b');
  assert.ok(!L.searchExercises('bench', ex, aliases).some(e => e.id === 'gone'));
  assert.deepEqual(L.searchExercises('rdl', ex, aliases).map(e => e.id), ['rdl']);
  // Nothing typed: your recent lifts, in order, skipping deleted ones.
  assert.deepEqual(L.searchExercises('', ex, aliases, ['rdl', 'b', 'gone']).map(e => e.id), ['rdl', 'b']);
  // A name that starts with what you typed beats one that only has it as a later word...
  assert.equal(L.searchExercises('bench', ex, aliases, ['db'])[0].id, 'b');
  // ...and among equal matches, something you did recently comes first.
  assert.equal(L.searchExercises('press', ex, aliases)[0].id, 'b');
  assert.equal(L.searchExercises('press', ex, aliases, ['ib'])[0].id, 'ib');
});

test('a near-match warning catches typos but not opposite movements', () => {
  const names = ['Bench Press', 'Hip Abduction', 'Wrist Flexion'];
  assert.equal(L.suggestMatch('Bench Pres', names), 'Bench Press');
  assert.equal(L.suggestMatch('Bench Press', names), null);   // already there
  assert.equal(L.suggestMatch('Hip Adduction', names), null);
  assert.equal(L.suggestMatch('Overhead Squat', names), null);
});
