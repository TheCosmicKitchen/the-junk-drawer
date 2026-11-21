// Reading and writing a set from its fields: reps, time and distance; bests for holds and carries.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as TR from '../../lift/tracking.js';

const o = { unitTag: () => '', carryUnit: 'yd' };

test('times read as seconds, mm:ss or h:mm:ss, and show back the same way', () => {
  assert.equal(TR.parseTime('45'), 45);
  assert.equal(TR.parseTime('1:30'), 90);
  assert.equal(TR.parseTime('1:02:03'), 3723);
  assert.equal(TR.parseTime('abc'), null);
  assert.equal(TR.parseTime(''), null);
  assert.equal(TR.fmtTime(45), '0:45');
  assert.equal(TR.fmtTime(90), '1:30');
  assert.equal(TR.fmtTime(3723), '1:02:03');
});

test('distances are kept in meters and shown in your carry unit', () => {
  assert.equal(TR.toMeters(40, 'yd'), 36.58);
  assert.equal(TR.fmtDist(36.58, 'yd'), '40 yd');
  assert.equal(TR.fmtDist(36.58, 'm'), '37 m');
  assert.equal(TR.fmtDist(3, 'm'), '3 m');
  assert.equal(TR.FIELDS.distance_m.read('40', o), 36.58);
  assert.equal(TR.FIELDS.distance_m.read('0', o), null);
});

test('each field reads only sensible values', () => {
  assert.equal(TR.FIELDS.reps.read('8'), 8);
  assert.equal(TR.FIELDS.reps.read('0'), null);
  assert.equal(TR.FIELDS.reps.read('1001'), null);
  assert.equal(TR.FIELDS.duration_s.read('0:45'), 45);
  assert.equal(TR.FIELDS.duration_s.read('0'), null);
});

test('a set’s main measure is the first of reps, distance, time that it holds', () => {
  assert.equal(TR.mainOf({ reps: 5, duration_s: 30 }), 'reps');
  assert.equal(TR.mainOf({ reps: null, distance_m: 36.58, duration_s: 32 }), 'distance_m');
  assert.equal(TR.mainOf({ reps: null, duration_s: 45 }), 'duration_s');
  assert.equal(TR.mainOf({}), null);
  assert.equal(TR.typeOf({ log_type: 'time' }).id, 'time');
  assert.equal(TR.typeOf({ log_type: 'nonsense' }).id, 'reps');
  assert.equal(TR.typeOf(null).id, 'reps');
});

test('a set reads the way people write it', () => {
  assert.equal(TR.setText({ weight: 135, reps: 5, unit: 'lb' }, o), '135 × 5');
  assert.equal(TR.setText({ weight: 0, reps: null, duration_s: 45, unit: 'lb' }, o), '0:45');
  assert.equal(TR.setText({ weight: 25, reps: null, duration_s: 60, unit: 'lb' }, o), '25 × 1:00');
  assert.equal(TR.setText({ weight: 70, reps: null, distance_m: 36.58, duration_s: 32, unit: 'lb' }, o), '70 × 40 yd · 0:32');
  assert.equal(TR.setText({ weight: -30, reps: 8, count_bodyweight: true, unit: 'lb' }, o), 'BW−30 × 8');
  assert.equal(TR.setText({ weight: 25, reps: 8, count_bodyweight: true, unit: 'lb' }, o), 'BW+25 × 8');
  assert.equal(TR.setText({ weight: 0, reps: 10, count_bodyweight: true, unit: 'lb' }, o), 'BW × 10');
  assert.equal(TR.setText({ weight: 135, reps: 5, rpe: 8.5, unit: 'lb' }, o), '135 × 5 @8.5');
});

test('a routine step targets its exercise type’s main field', () => {
  const plank = { log_type: 'time' }, bench = { log_type: 'reps' };
  assert.equal(TR.stepText({ sets: 3, duration_s: 45 }, plank, o), '3 × 0:45');
  assert.equal(TR.stepText({ sets: 3, reps: 5 }, bench, o), '3 × 5');
  assert.equal(TR.stepText({ sets: 3 }, plank, o), '3 × 0:30');   // nothing set: the field's start
  assert.deepEqual(TR.stepRecord({ sets: 3, duration_s: 45 }, plank), { reps: null, distance_m: null, duration_s: 45 });
});

test('holds and carries: longest, farthest and heaviest are bests; the first time counts', () => {
  const feats = TR.featsMap([{ exercise_id: 'plank', metric: 'time', unit: 's', best: 60 }]);
  const hold = (s, w = 0) => ({ exercise_id: 'plank', duration_s: s, weight: w, unit: 'lb' });
  assert.equal(TR.isFeatPr(hold(75), feats), true);
  assert.equal(TR.isFeatPr(hold(60), feats), false);
  // The first time with a plate on a lift you've done is a start, not a PR (like a new rep count).
  assert.equal(TR.isFeatPr(hold(30, 25), feats), false);
  assert.equal(TR.isFeatPr({ ...hold(90), is_warmup: true }, feats), false);
  assert.equal(TR.isFeatPr({ exercise_id: 'carry', distance_m: 20, weight: 50, unit: 'lb' }, feats), true);
  assert.equal(TR.isPr({ exercise_id: 'plank', duration_s: 75, unit: 'lb' }, new Map(), feats), true);
  const f2 = new Map(feats); TR.raiseFeats(hold(80, 10), f2);
  assert.equal(TR.featLine('plank', f2, o), 'longest 1:20 · heaviest 10 lb');
});
