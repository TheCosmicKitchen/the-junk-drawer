// Kintoremon's hats: what earns each one, keeping them once earned, and the seasonal ones.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HATS, hatsMet, mergeUnlocks, wearable, newToday, hatSvg } from '../../lift/widgets/hats.js';

const HATCH = '2026-03-02';
const none = { prsSinceHatch: 0, lifetimeLb: 0, streakWeeks: 0, questsAllDone: false, goalsDone: 0, recordsHeld: 0, seasonsFinished: [], stamps: [] };

test('a brand-new lifter has earned nothing yet', () => {
  assert.deepEqual(hatsMet(none, HATCH), []);
});

test('each hat comes from the thing its hint says', () => {
  const met = f => hatsMet({ ...none, ...f }, HATCH);
  assert.deepEqual(met({ prsSinceHatch: 1 }), ['sweatband']);
  assert.deepEqual(met({ lifetimeLb: 10000 }), ['party']);
  assert.deepEqual(met({ lifetimeLb: 100000 }), ['party', 'viking']);
  assert.deepEqual(met({ streakWeeks: 4 }), ['stars']);
  assert.deepEqual(met({ streakWeeks: 12 }), ['stars', 'halo']);
  assert.deepEqual(met({ questsAllDone: true }), ['bandana']);
  assert.deepEqual(met({ goalsDone: 1 }), ['gradcap']);
  assert.deepEqual(met({ recordsHeld: 2 }), ['laurel']);
  assert.deepEqual(met({ seasonsFinished: ['2026-04-01'] }), ['wizard']);
  assert.deepEqual(met({ stamps: ['2026-03-10'] }), ['pin']);
});

test('seasons and stamps from before it hatched don’t count', () => {
  assert.deepEqual(hatsMet({ ...none, seasonsFinished: ['2026-01-31'], stamps: ['2026-02-01'] }, HATCH), []);
});

test('once earned, a hat is kept with the day it was first earned', () => {
  const day1 = mergeUnlocks({}, ['laurel'], '2026-03-05');
  assert.deepEqual(day1, { laurel: '2026-03-05' });
  // The record was taken back: no longer "met", still kept.
  const day2 = mergeUnlocks(day1, [], '2026-03-09');
  assert.equal(day2, day1, 'nothing new: the same object, so nothing is saved');
  const day3 = mergeUnlocks(day2, ['laurel', 'sweatband'], '2026-03-12');
  assert.deepEqual(day3, { laurel: '2026-03-05', sweatband: '2026-03-12' });
  assert.deepEqual(newToday(day3, '2026-03-12'), ['sweatband']);
});

test('wearing: earned hats any time, seasonal hats only in their month', () => {
  const un = { party: '2026-03-05' };
  assert.equal(wearable('party', un, '2026-07-01'), true);
  assert.equal(wearable('viking', un, '2026-07-01'), false);
  assert.equal(wearable('santa', un, '2026-12-03'), true);
  assert.equal(wearable('santa', un, '2026-11-30'), false);
  assert.equal(wearable('pumpkin', {}, '2026-10-31'), true);
  assert.equal(wearable('nope', un, '2026-10-31'), false);
});

test('every hat has a drawing, a name and a hint', () => {
  for (const h of HATS) {
    assert.ok(h.name && h.hint, h.id);
    assert.match(hatSvg(h.id), /^<g class="pl-hatg">/, h.id);
  }
  assert.match(hatSvg('party', { egg: true }), /translate\(0 -6\)/);
  assert.equal(hatSvg('nope'), '');
});
