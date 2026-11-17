// "Generate a workout": builds a day (push, pull, legs, upper, lower, full body) out of the exercise
// catalogue. The catalogue has no muscle tags, so each exercise is sorted into a slot by its name;
// anything the rules don't recognise is simply never picked. Lifts you've done before are much more
// likely to come up than ones you haven't. Pure functions, no DOM and no network.

// First match wins, so the order matters: "leg curl" before "curl", "rear delt fly" before "fly".
const RULES = [
  ['skip', /wrist|grip press|thumb|hulk|lip buster|halo|tibialis|scapula pull/],
  ['calf', /calf/],
  ['ham_curl', /leg curl/],
  ['quad_iso', /leg extension/],
  ['glute', /hip thrust|glute bridge|abduction|adduction|pull through|kettlebell swing|monster walk|side step|hip hugger|leg side raise/],
  ['core', /leg raise|sit ?-?ups?|woodchopper|trunk rotation|plank|crunch|ab wheel|get-?up|carry/],
  ['hinge', /deadlift|\brdl\b|back extension|good morning/],
  ['single_leg', /split squat|lunge|step-? ?ups?/],
  ['squat', /squat|leg press|hack/],
  ['triceps', /tricep|skull|pushdown|kickback|\bdips?\b|headbanger/],
  ['biceps', /curl/],
  ['rear_delt', /rear delt|reverse fly|face pull|bend over cable shoulder fly|external rotation|internal rotation|rotator/],
  ['lateral', /lateral raise|\bl raise|ucv|butterfly raise|front raise|plate raise|shoulder fly|shoulder raise|high pull|scapular raise/],
  ['shrug', /shrug/],
  ['shoulder_press', /overhead press|shoulder press|arnold|landmine press/],
  ['chest_fly', /fly|cable cross|\bpec\b|svend|crossover/],
  ['chest_press', /bench|push-?ups?|pushups?|hex press|chest press/],
  ['vert_pull', /pull-?ups?|chin-?ups?|pulldown|straight-arm/],
  ['horiz_row', /\brows?\b/],
];
export function slotOf(name) {
  const n = String(name || '').toLowerCase();
  for (const [slot, re] of RULES) if (re.test(n)) return slot === 'skip' ? null : slot;
  return null;
}
const COMPOUND = new Set(['chest_press', 'shoulder_press', 'vert_pull', 'horiz_row', 'squat', 'hinge', 'single_leg']);

// Each day is a list of steps; a step names the slots it can be filled from. "Short" keeps the first four.
export const DAY_TYPES = [
  { id: 'push', name: 'Push', title: 'Push day', steps: [['chest_press'], ['shoulder_press'], ['chest_press', 'chest_fly'], ['lateral'], ['triceps'], ['chest_fly', 'triceps']] },
  { id: 'pull', name: 'Pull', title: 'Pull day', steps: [['vert_pull'], ['horiz_row'], ['horiz_row', 'vert_pull'], ['rear_delt'], ['biceps'], ['biceps', 'shrug']] },
  { id: 'legs', name: 'Legs', title: 'Leg day', steps: [['squat'], ['hinge'], ['single_leg', 'squat'], ['ham_curl'], ['quad_iso', 'glute'], ['calf']] },
  { id: 'upper', name: 'Upper', title: 'Upper day', steps: [['chest_press'], ['horiz_row'], ['shoulder_press'], ['vert_pull'], ['biceps'], ['triceps'], ['lateral', 'rear_delt']] },
  { id: 'lower', name: 'Lower', title: 'Lower day', steps: [['hinge'], ['squat'], ['single_leg'], ['ham_curl'], ['glute', 'quad_iso'], ['calf'], ['core']] },
  { id: 'full', name: 'Full body', title: 'Full body day', steps: [['squat'], ['chest_press'], ['horiz_row'], ['hinge'], ['shoulder_press', 'vert_pull'], ['core']] },
];
export const dayType = id => DAY_TYPES.find(d => d.id === id) || DAY_TYPES[0];

// Sets, reps and rest for a step: the opening lift heavy, other big lifts moderate, the rest pump work.
export function prescribe(slot, index) {
  if (COMPOUND.has(slot)) return index === 0 ? { sets: 4, reps: 6, rest_s: 150 } : { sets: 3, reps: 8, rest_s: 120 };
  if (slot === 'calf') return { sets: 3, reps: 15, rest_s: 60 };
  return { sets: 3, reps: 12, rest_s: 75 };
}

// exercises: [{id, name}], usage: Map exercise id -> how often you've done it. A lift you've done is
// several times likelier than one you haven't, and more so the more you've done it.
export function pickFor(slots, exercises, usage, exclude, rng = Math.random) {
  const pool = exercises.filter(e => !exclude.has(e.id) && slots.includes(slotOf(e.name)));
  if (!pool.length) return null;
  const w = pool.map(e => { const n = usage.get(e.id) || 0; return n ? 5 + Math.min(n, 20) : 1; });
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) return pool[i]; }
  return pool[pool.length - 1];
}
// The whole day: [{exercise_id, slot, sets, reps, rest_s}], skipping steps nothing in the catalogue fits.
export function generate(typeId, short, exercises, usage, rng = Math.random) {
  const steps = dayType(typeId).steps.slice(0, short ? 4 : undefined);
  const used = new Set(), out = [];
  for (const slots of steps) {
    const e = pickFor(slots, exercises, usage, used, rng);
    if (!e) continue;
    used.add(e.id);
    const slot = slotOf(e.name);
    out.push({ exercise_id: e.id, slots, slot, ...prescribe(slot, out.length) });
  }
  return out;
}
