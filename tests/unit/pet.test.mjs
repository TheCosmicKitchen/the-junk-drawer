// The lifting pet: what feeds it, how it grows, how it sulks, and how it devolves back to an egg.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petState, meals, moodLine, petSvg, FOOD, STAGES, stageOf, CHECKPOINT_BACK } from '../../lift/widgets/pet.js';

const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const HATCH = '2026-01-05';
// A workout: `sets` working sets of `reps` at `weight` on one lift, as the app keeps them.
function workout(day, { sets = 5, reps = 5, weight = 100, ex = 'bench', warmups = 0 } = {}) {
  const rows = [];
  for (let i = 0; i < warmups; i++) rows.push({ exercise_id: ex, performed_on: day, logged_at: day + 'T10:00:0' + i, weight: 45, reps: 10, unit: 'lb', is_warmup: true });
  for (let i = 0; i < sets; i++) rows.push({ exercise_id: ex, performed_on: day, logged_at: day + 'T11:00:' + String(10 + i), weight, reps, unit: 'lb', is_warmup: false });
  return rows;
}
// History in the app's shapes: one row per day (working sets only) and the sets themselves.
function history(list) {
  const recent = list.flat(), days = new Map();
  for (const s of recent) if (s.is_warmup !== true && !s.deleted_at) days.set(s.performed_on, (days.get(s.performed_on) || 0) + 1);
  return { recent, days: [...days].map(([performed_on, sets]) => ({ performed_on, sets })) };
}
const pet = (today, list, extra = {}) => petState({ hatched: HATCH, today, ...history(list), ...extra });

test('a new pet is an egg, and a few sets hatch it', () => {
  const p = pet(HATCH, []);
  assert.equal(p.stageKey, 'egg');
  assert.equal(p.mood, 'happy');
  assert.match(moodLine(p, 'Pip'), /Still an egg/);
  assert.match(moodLine(pet(HATCH, [workout(HATCH, { sets: 1, reps: 1, weight: 0 })]), 'Pip'), /wobbling/);   // fed, not hatched yet
  const fed = pet(HATCH, [workout(HATCH, { sets: 5, reps: 5 })]);
  assert.equal(fed.stageKey, 'hatchling');
  assert.deepEqual(fed.fedToday, { sets: 5, reps: 25, prs: 1, xp: 5 * FOOD.set + 25 * FOOD.rep + FOOD.pr });
  assert.match(moodLine(fed, 'Pip'), /Pip is full and happy: 5 sets and 1 PR today/);
});

test('sets, reps and PRs feed it; warm-ups and deleted sets do not', () => {
  const day = HATCH;
  const rows = [...workout(day, { sets: 3, reps: 5, weight: 100, warmups: 2 }),
    { exercise_id: 'bench', performed_on: day, logged_at: day + 'T12:00:00', weight: 110, reps: 5, unit: 'lb', is_warmup: false },   // beats 100 × 5
    { exercise_id: 'bench', performed_on: day, logged_at: day + 'T12:01:00', weight: 90, reps: 8, unit: 'lb', is_warmup: false },    // first at 8 reps
    { exercise_id: 'bench', performed_on: day, logged_at: day + 'T12:02:00', weight: 500, reps: 1, unit: 'lb', is_warmup: false, deleted_at: day }];
  const m = meals(history([rows])).get(day);
  assert.deepEqual(m, { sets: 5, reps: 28, prs: 3 });   // 100 × 5 first, 110 × 5, 90 × 8
});

test('PRs count against the sets before them, even from before it hatched', () => {
  const before = workout(addDays(HATCH, -3), { sets: 3, weight: 150 });
  const p = pet(HATCH, [before, workout(HATCH, { sets: 3, weight: 140 })]);
  assert.equal(p.fedToday.prs, 0);
  const pr = pet(HATCH, [before, workout(HATCH, { sets: 3, weight: 155 })]);
  assert.equal(pr.fedToday.prs, 1);
});

test('moods: two rest days are fine, then hungry, sad, grouchy', () => {
  const list = [workout(HATCH, { sets: 20, reps: 8 })];
  assert.equal(pet(addDays(HATCH, 2), list).mood, 'happy');
  assert.equal(pet(addDays(HATCH, 3), list).mood, 'hungry');
  assert.equal(pet(addDays(HATCH, 5), list).mood, 'sad');
  assert.equal(pet(addDays(HATCH, 8), list).mood, 'grouchy');
  assert.match(moodLine(pet(addDays(HATCH, 8), list), 'Pip'), /grouchy, and shrinking\. 8 days without a set/);
});

test('a week off never costs it anything; from the grouchy days on it shrinks', () => {
  const list = [workout(HATCH, { sets: 20, reps: 8 })];
  const fed = pet(HATCH, list).xp;
  assert.equal(pet(addDays(HATCH, 7), list).xp, fed);
  assert.ok(pet(addDays(HATCH, 8), list).xp < fed);
});

test('neglect devolves it a stage at a time, all the way back to an egg; lifting brings it back', () => {
  // Steady training for 10 weeks: three big days a week.
  const list = [];
  for (let w = 0; w < 10; w++) for (const d of [0, 2, 4]) list.push(workout(addDays(HATCH, w * 7 + d), { sets: 25, reps: 8, weight: 100 + w }));
  const lastDay = addDays(HATCH, 9 * 7 + 4);
  const top = pet(lastDay, list);
  assert.ok(top.stage >= 4, 'a Lifter or better after 10 weeks: ' + top.stageName);

  let prev = top.stage, seen = new Set([top.stage]);
  for (let i = 1; i <= 45; i++) {
    const p = pet(addDays(lastDay, i), list);
    assert.ok(p.stage <= prev, 'never grows while neglected');
    prev = p.stage; seen.add(p.stage);
  }
  const gone = pet(addDays(lastDay, 45), list);
  assert.equal(gone.stageKey, 'egg');
  assert.ok(gone.devolved);
  assert.match(moodLine(gone, 'Pip'), /went back into its shell/);
  assert.ok(seen.size >= 4, 'it passed through the stages on the way down: ' + [...seen]);

  const back = addDays(lastDay, 46);
  const again = pet(back, [...list, workout(back, { sets: 20, reps: 8, weight: 120 })]);
  assert.ok(again.stage >= 1, 'a workout hatches it again');
  assert.equal(again.mood, 'happy');
});

test('nothing before it hatched feeds it', () => {
  const p = pet(HATCH, [workout(addDays(HATCH, -1), { sets: 50 })]);
  assert.equal(p.stageKey, 'egg');
  assert.equal(p.fedToday, null);
});

test('the checkpoint gives the same pet, and old days leaving the window never shrink it', () => {
  const list = [];
  for (let d = 0; d < 150; d += 2) list.push(workout(addDays(HATCH, d), { sets: 15, reps: 6, weight: 100 + d }));
  const today = addDays(HATCH, 150);
  const full = pet(today, list);
  assert.ok(full.checkpoint, 'it offers a checkpoint');
  assert.equal(full.checkpoint.day, addDays(today, -CHECKPOINT_BACK));

  // Opened again 60 days later: only the last 120 days of sets are on the phone, the checkpoint covers before.
  const cp = full.checkpoint, later = addDays(today, 60);
  const window = list.filter(w => w[0].performed_on >= addDays(later, -120));
  const h = history(list), recent = history(window).recent;
  const withCp = petState({ hatched: HATCH, today: later, days: h.days, recent, checkpoint: cp });
  const truth = petState({ hatched: HATCH, today: later, ...h });
  assert.ok(Math.abs(withCp.xp - truth.xp) < 1e-6, 'same XP as replaying everything');
  const withoutCp = petState({ hatched: HATCH, today: later, days: h.days, recent });
  assert.ok(withoutCp.xp < truth.xp, 'without it, the reps and PRs outside the window would be lost');
});

test('stages climb by XP, and the drawing names the pet and its mood', () => {
  assert.deepEqual(STAGES.map(s => stageOf(s.min)), [0, 1, 2, 3, 4, 5]);
  assert.equal(stageOf(STAGES[2].min - 1), 1);
  const svg = petSvg(pet(addDays(HATCH, 9), [workout(HATCH, { sets: 30, reps: 10 })]), 'Pip, grouchy');
  assert.match(svg, /^<svg class="pet-svg pet-\w+ mood-grouchy"/);
  assert.match(svg, /aria-label="Pip, grouchy"/);
});
