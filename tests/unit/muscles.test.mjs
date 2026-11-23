// Real muscle data on exercises, the weekly hit-and-miss count, and "also called" in search.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LIB from '../../lift/library.js';
import * as L from '../../lift/logic.js';

const bench = { id: 'b', name: 'Bench Press', muscles: ['chest'], muscles_also: ['shoulders', 'triceps'], equipment: ['barbell', 'bench'] };
const row = { id: 'r', name: 'Seated Cable Row', muscles: ['middle back'], muscles_also: ['biceps', 'lats', 'shoulders'], equipment: ['cable'] };
const crew = { id: 'c', name: 'One Cosmic Crisp Curl' };   // the crew's own: no data, read from the name

test('the library uses real muscles and equipment when an exercise has them, the name when not', () => {
  assert.equal(LIB.muscleKeyOf(bench), 'chest');
  assert.equal(LIB.equipmentKeyOf(bench), 'barbell');
  assert.equal(LIB.muscleKeyOf({ name: 'Mystery Move', muscles: ['hamstrings'] }), 'posterior');
  assert.equal(LIB.equipmentKeyOf({ name: 'Mystery Move', equipment: ['pull-up bar'] }), 'bodyweight');
  assert.equal(LIB.muscleKeyOf(crew), 'biceps');            // "curl" in the name
  assert.equal(LIB.muscleKeyOf({ name: 'Bench Press', muscles: [] }), 'chest');
});

test('worked: main and secondary muscle groups, each group once', () => {
  assert.deepEqual(LIB.worked(bench), { main: ['chest'], also: ['shoulders', 'triceps'] });
  assert.deepEqual(LIB.worked(row), { main: ['back'], also: ['biceps', 'shoulders'] });   // lats and middle back are both Back
  assert.deepEqual(LIB.worked(crew), { main: ['biceps'], also: [] });
  assert.deepEqual(LIB.worked({ name: 'Romanian Deadlift' }), { main: ['hamstrings', 'glutes'], also: [] });
});

test('a week’s coverage: 1 per set for main muscles, ½ for secondary; warm-ups and deletes skipped', () => {
  const byId = new Map([bench, row, crew].map(e => [e.id, e]));
  const sets = [
    ...Array(4).fill({ exercise_id: 'b' }), ...Array(3).fill({ exercise_id: 'r' }),
    { exercise_id: 'c' }, { exercise_id: 'b', is_warmup: true }, { exercise_id: 'b', deleted_at: 'x' },
  ];
  const g = Object.fromEntries(LIB.coverage(sets, byId).map(x => [x.key, x]));
  assert.equal(g.chest.sets, 4);
  assert.equal(g.triceps.sets, 2);
  assert.equal(g.shoulders.sets, 3.5);     // 4 × ½ from bench, 3 × ½ from rows
  assert.equal(g.back.sets, 3);
  assert.equal(g.biceps.sets, 2.5);        // 3 × ½ from rows, 1 from the crew's curl
  assert.equal(g.quads.sets, 0);
  assert.equal(g.quads.verdict, 'missing');
  assert.equal(g.chest.verdict, 'light');
  assert.equal(LIB.coverage(Array(6).fill({ exercise_id: 'b' }), byId).find(x => x.key === 'chest').verdict, 'hit');
  assert.equal(LIB.coverage([], byId).length, LIB.GROUPS.length);
});

test('a search that found a lift by another name says which', () => {
  const aliases = new Map([['b', ['bench', 'Barbell Bench Press']]]);
  assert.equal(L.matchedAlias('barbell bench', bench, aliases), 'Barbell Bench Press');
  assert.equal(L.matchedAlias('bench press', bench, aliases), null);   // its own name matches
  assert.equal(L.matchedAlias('', bench, aliases), null);
  assert.equal(L.matchedAlias('squat', bench, aliases), null);
});
