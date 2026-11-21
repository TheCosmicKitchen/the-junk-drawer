// Sorting the catalogue by muscle and equipment, and the workout generator.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LIB from '../../lift/library.js';
import * as G from '../../lift/generate.js';

test('lifts land in the right muscle and equipment from their names', () => {
  assert.equal(LIB.muscleOf('Bench Press'), 'chest');
  assert.equal(LIB.muscleOf('Barbell Row'), 'back');
  assert.equal(LIB.muscleOf('Bicep Curl'), 'biceps');
  assert.equal(LIB.muscleOf('Back Squat'), 'legs');
  assert.equal(LIB.muscleOf('Plank'), 'core');
  assert.equal(LIB.equipmentOf('Dumbbell Bench Press'), 'dumbbell');
  assert.equal(LIB.muscleName('posterior'), 'Glutes & hams');
});

test('the generator fills each step once, from the right slots, the same way for the same seed', () => {
  const ex = ['Bench Press', 'Incline Bench Press', 'Overhead Press', 'Cable Fly', 'Lateral Raise', 'Tricep Pushdown', 'Skull Crusher']
    .map((name, i) => ({ id: 'e' + i, name }));
  const seeded = () => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const day = G.generate('push', false, ex, new Map(), seeded());
  assert.ok(day.length >= 4, 'a push day from a push-friendly catalogue');
  assert.equal(new Set(day.map(d => d.exercise_id)).size, day.length, 'no lift twice');
  for (const d of day) assert.ok(d.slots.includes(d.slot), d.slot + ' fits its step');
  assert.deepEqual(G.generate('push', false, ex, new Map(), seeded()), day, 'same seed, same day');
  assert.deepEqual(G.prescribe('chest_press', 0), { sets: 4, reps: 6, rest_s: 150 });
  assert.ok(G.generate('push', true, ex, new Map(), seeded()).length <= 4, 'short keeps four');
  assert.deepEqual(G.generate('legs', false, ex, new Map(), seeded()), [], 'nothing fits: an empty day, no crash');
});
