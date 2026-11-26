// Kintoremon's treats: earned by new things you do, kept in a bag, fed only after a workout.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treatKeys, syncTreats, bag, canFeed, feed, bonusByDay, treatList, gotOn, PER_DAY, TREATS, treatSvg } from '../../lift/widgets/treats.js';
import { petState } from '../../lift/widgets/pet.js';

const HATCH = '2026-03-02';
const facts = (f = {}) => ({ questsDone: [], clubs: [], goalsMet: [], seasonsDone: [], ...f });

test('each kind of thing earns its own treat, once', () => {
  const keys = treatKeys(facts({ questsDone: ['2026-03-09:days3'], clubs: [10000, 50000], goalsMet: ['g1'], seasonsDone: [{ id: 's1', ends_on: '2026-04-01' }, { id: 's0', ends_on: '2026-02-01' }] }), HATCH);
  assert.deepEqual(keys.map(k => k.kind), ['cricket', 'shake', 'shake', 'golden', 'dragonfruit'], 'a season that ended before hatching earns nothing');
  assert.equal(new Set(keys.map(k => k.key)).size, keys.length);
});

test('the starting day is the starting line: nothing already done (or loading late that day) earns a treat', () => {
  const day1 = syncTreats(undefined, treatKeys(facts({ clubs: [10000, 50000] }), HATCH), '2026-03-02');
  assert.deepEqual(bag(day1), { cricket: 0, shake: 0, golden: 0, dragonfruit: 0 });
  const later = syncTreats(day1, treatKeys(facts({ clubs: [10000, 50000], goalsMet: ['g1'] }), HATCH), '2026-03-02');   // goals loaded a moment later
  assert.equal(bag(later).golden, 0);
  const next = syncTreats(later, treatKeys(facts({ clubs: [10000, 50000, 100000], goalsMet: ['g1'], questsDone: ['2026-03-02:sets60'] }), HATCH), '2026-03-04');
  assert.deepEqual(bag(next), { cricket: 1, shake: 1, golden: 0, dragonfruit: 0 });
  assert.deepEqual(gotOn(next, '2026-03-04').map(g => g.kind).sort(), ['cricket', 'shake']);
  assert.equal(syncTreats(next, treatKeys(facts({ clubs: [10000, 50000, 100000], goalsMet: ['g1'], questsDone: ['2026-03-02:sets60'] }), HATCH), '2026-03-05'), next, 'nothing new: the same object');
});

test('dessert, not dinner: only after a workout today, one in the bag, a few a day', () => {
  let st = { seen: {}, since: '2026-03-01', got: Array.from({ length: 5 }, () => ({ kind: 'cricket', day: '2026-03-03' })), eaten: [] };
  assert.deepEqual(canFeed(st, 'cricket', false, '2026-03-04'), { ok: false, why: 'After a workout today' });
  assert.deepEqual(canFeed(st, 'golden', true, '2026-03-04'), { ok: false, why: 'None in the bag' });
  for (let i = 0; i < PER_DAY; i++) { assert.equal(canFeed(st, 'cricket', true, '2026-03-04').ok, true); st = feed(st, 'cricket', '2026-03-04'); }
  assert.deepEqual(canFeed(st, 'cricket', true, '2026-03-04'), { ok: false, why: 'Full for today' });
  assert.equal(canFeed(st, 'cricket', true, '2026-03-05').ok, true, 'a new day');
  assert.equal(bag(st).cricket, 5 - PER_DAY);
  assert.equal(bonusByDay(st).get('2026-03-04'), PER_DAY * 20);
});

test('treat XP counts on the day it was eaten, and only if you lifted that day', () => {
  const day = '2026-03-04';
  const recent = Array.from({ length: 5 }, (_, i) => ({ exercise_id: 'bench', performed_on: day, logged_at: day + 'T10:0' + i, weight: 100, reps: 5, unit: 'lb', is_warmup: false }));
  const days = [{ performed_on: day, sets: 5 }];
  const plain = petState({ hatched: HATCH, today: day, days, recent });
  const sweet = petState({ hatched: HATCH, today: day, days, recent, bonus: new Map([[day, 60]]) });
  assert.equal(sweet.xp - plain.xp, 60);
  assert.equal(sweet.fedToday.treatXp, 60);
  const rest = petState({ hatched: HATCH, today: '2026-03-05', days, recent, bonus: new Map([['2026-03-05', 60]]) });
  assert.equal(rest.xp, petState({ hatched: HATCH, today: '2026-03-05', days, recent }).xp, 'no lifting that day: no dessert');
});

test('treats read naturally, and each has a drawing', () => {
  assert.equal(treatList([{ kind: 'golden' }]), 'a Golden cricket');
  assert.equal(treatList([{ kind: 'cricket' }, { kind: 'cricket' }, { kind: 'dragonfruit' }]), '2 Crickets and a Dragonfruit');
  assert.equal(treatList([{ kind: 'shake' }]), 'a Protein shake');
  for (const t of TREATS) assert.match(treatSvg(t.id, t.name), /<svg class="treat-svg"[^>]*aria-label="[^"]+"><ellipse|<svg class="treat-svg"[^>]*><path/);
});
