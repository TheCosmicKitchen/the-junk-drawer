// Kintoremon's branches: at 1,000 XP he becomes what you've been training.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petState, petToday, recapLine, focusOf, petSvg, formName, STAGES, CHECKPOINT_BACK } from '../../lift/widgets/pet.js';

const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const HATCH = '2026-01-05';
const MUSCLES = { bench: ['chest', 'triceps'], ohp: ['shoulders'], squat: ['quads', 'glutes'], rdl: ['hamstrings', 'glutes'], row: ['back', 'biceps'], pullup: ['back'], plank: ['core'] };
const groupsOf = id => MUSCLES[id] || [];
function sets(day, ex, n = 25, reps = 8, weight = 100) {
  return Array.from({ length: n }, (_, i) => ({ exercise_id: ex, performed_on: day, logged_at: day + 'T10:' + String(10 + i).padStart(2, '0'), weight, reps, unit: 'lb', is_warmup: false }));
}
function history(list) {
  const recent = list.flat(), days = new Map();
  for (const s of recent) days.set(s.performed_on, (days.get(s.performed_on) || 0) + 1);
  return { recent, days: [...days].map(([performed_on, n]) => ({ performed_on, sets: n })) };
}
// Train every other day for `n` sessions, cycling through the given lifts.
function block(start, lifts, n) {
  return Array.from({ length: n }, (_, i) => sets(addDays(start, i * 2), lifts[i % lifts.length], 25, 8, 100 + i));
}
const state = (today, list, extra = {}) => petState({ hatched: HATCH, today, ...history(list), groupsOf, ...extra });

test('focus: mostly push, pull or legs picks that line; an even mix, or only core, is all-round', () => {
  assert.equal(focusOf([...sets('d', 'squat', 10), ...sets('d', 'bench', 4)], groupsOf), 'legs');
  assert.equal(focusOf([...sets('d', 'bench', 8), ...sets('d', 'ohp', 4), ...sets('d', 'row', 5)], groupsOf), 'push');
  assert.equal(focusOf([...sets('d', 'row', 8), ...sets('d', 'squat', 3)], groupsOf), 'pull');
  assert.equal(focusOf([...sets('d', 'bench', 5), ...sets('d', 'row', 5), ...sets('d', 'squat', 5)], groupsOf), 'balanced');
  assert.equal(focusOf(sets('d', 'plank', 9), groupsOf), 'balanced');
  assert.equal(focusOf(sets('d', 'squat', 9)), 'balanced', 'without muscle data, all-round');
});

test('before 1,000 XP what comes next is a surprise; crossing it, he becomes what you trained', () => {
  const legs = block(HATCH, ['squat', 'rdl'], 12);
  let i = 0, p;
  do p = state(addDays(HATCH, i++ * 2), legs.slice(0, i)); while (p.stage < 3 && i < 12);
  const before = state(addDays(HATCH, (i - 2) * 2), legs.slice(0, i - 1));
  assert.equal(before.stage, 2);
  assert.equal(before.nextName, 'a surprise');
  assert.equal(p.branch, 'legs');
  assert.equal(p.stageName, 'Basilisk');
  assert.equal(p.nextName, 'Stomp basilisk');
});

test('each line has its own forms', () => {
  const at = (lifts) => { const list = block(HATCH, lifts, 12); return state(addDays(HATCH, 24), list); };
  assert.equal(at(['bench', 'ohp']).stageName, 'Frilled lizard');
  assert.equal(at(['row', 'pullup']).stageName, 'Chameleon');
  assert.equal(at(['squat', 'rdl']).stageName, 'Basilisk');
  assert.equal(at(['bench', 'row', 'squat']).stageName, 'Iguana');
  assert.equal(formName(5, 'legs'), 'Wyvern');
  assert.equal(formName(5, 'balanced'), 'Iron dragon');
  assert.equal(formName(2, 'legs'), 'Gecko', 'the trunk is the same for everyone');
});

test('devolve below the branch and it’s forgotten; train differently and he comes back as something else', () => {
  const legs = block(HATCH, ['squat', 'rdl'], 12);
  const lastLegs = addDays(HATCH, 22);
  assert.equal(state(lastLegs, legs).branch, 'legs');
  const gone = addDays(lastLegs, 30);
  assert.ok(state(gone, legs).stage < 3);
  assert.equal(state(gone, legs).branch, null);
  const push = block(addDays(gone, 1), ['bench', 'ohp'], 14);
  const back = state(addDays(gone, 27), [...legs, ...push]);
  assert.ok(back.stage >= 3);
  assert.equal(back.branch, 'push');
  assert.equal(back.stageName, 'Frilled lizard');
});

test('the recap says what he became, and why', () => {
  const legs = block(HATCH, ['squat', 'rdl'], 12);
  let day = null;
  for (let i = 0; i < 12 && !day; i++) { const d = addDays(HATCH, i * 2); const t = petToday({ hatched: HATCH, today: d, ...history(legs.slice(0, i + 1)), groupsOf }); if (t && t.evolved && t.stage === 3) day = t; }
  assert.ok(day, 'it branched on one of the days');
  assert.match(recapLine(day, 'Iggy'), /Iggy evolved into a Basilisk! All that leg work did that\.$/);
  const mixed = block(HATCH, ['bench', 'row', 'squat'], 12);
  let iguana = null;
  for (let i = 0; i < 12 && !iguana; i++) { const t = petToday({ hatched: HATCH, today: addDays(HATCH, i * 2), ...history(mixed.slice(0, i + 1)), groupsOf }); if (t && t.evolved && t.stage === 3) iguana = t; }
  assert.match(recapLine(iguana, 'Iggy'), /evolved into an Iguana! All-round training did that\.$/);
});

test('the checkpoint keeps the branch', () => {
  const list = block(HATCH, ['row', 'pullup'], 40);
  const today = addDays(HATCH, 78), full = state(today, list);
  assert.equal(full.branch, 'pull');
  assert.equal(full.checkpoint.branch, 'pull');
  assert.equal(full.checkpoint.day, addDays(today, -CHECKPOINT_BACK));
  const later = addDays(today, 3), recent = history(list).recent.filter(s => s.performed_on >= addDays(later, -120));
  const p = petState({ hatched: HATCH, today: later, days: history(list).days, recent, checkpoint: full.checkpoint, groupsOf });
  assert.equal(p.branch, 'pull');
  assert.equal(p.stageName, formName(p.stage, 'pull'));
});

test('the drawing carries the line', () => {
  const p = state(addDays(HATCH, 24), block(HATCH, ['squat', 'rdl'], 12));
  assert.match(petSvg(p, 'x'), /class="pet-svg pet-iguana line-legs mood-/);
  assert.equal(STAGES.length, 6);
});
