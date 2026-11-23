// Which workouts finish themselves: 12 hours after the last set, only if nobody finished them.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysToFinish } from '../../lift/logic.js';

const at = (day, hm) => new Date(day + 'T' + hm + ':00').toISOString();
const sets = {
  '2026-11-23': [{ logged_at: at('2026-11-23', '07:00') }],                          // this morning
  '2026-11-22': [{ logged_at: at('2026-11-22', '18:00') }, { logged_at: at('2026-11-22', '18:40') }],
  '2026-11-21': [{ logged_at: at('2026-11-21', '09:00'), is_warmup: true }],          // only a warm-up
};
const base = { today: '2026-11-23', setsOn: d => sets[d] || [], posted: new Set(), finishedHere: '' };

test('a day whose last set is 12 hours old finishes; one that is fresher waits', () => {
  const now = Date.parse(at('2026-11-23', '10:00'));
  assert.deepEqual(daysToFinish({ ...base, now }), ['2026-11-22']);   // 15h20m since 18:40; this morning is only 3h
  assert.deepEqual(daysToFinish({ ...base, now: Date.parse(at('2026-11-23', '19:00')) }), ['2026-11-23', '2026-11-22']);
  assert.deepEqual(daysToFinish({ ...base, now: Date.parse(at('2026-11-23', '06:00')) }), []);   // 11h20m: not yet
});

test('a day already finished, here or on another phone, or with only warm-ups, is left alone', () => {
  const now = Date.parse(at('2026-11-23', '23:00'));
  assert.deepEqual(daysToFinish({ ...base, now, posted: new Set(['2026-11-22']) }), ['2026-11-23']);
  assert.deepEqual(daysToFinish({ ...base, now, finishedHere: '2026-11-23' }), ['2026-11-22']);
  assert.ok(!daysToFinish({ ...base, now }).includes('2026-11-21'));
});

test('only the last few days, so old history never floods the feed', () => {
  const now = Date.parse(at('2026-11-23', '23:00'));
  const old = { ...base, setsOn: d => (d === '2026-11-19' ? [{ logged_at: at(d, '18:00') }] : []) };
  assert.deepEqual(daysToFinish({ ...old, now }), []);
  assert.deepEqual(daysToFinish({ ...old, now, back: 5 }), ['2026-11-19']);
});
