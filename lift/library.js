// The exercise library: sorts the catalogue by muscle and equipment so it can be browsed, and says
// which muscles a week of sets hit. Exercises from the exercemus list carry real muscles and
// equipment; the rest are read from the name (the same way the workout generator sorts lifts into
// slots), and anything the rules don't recognise lands in "Other". Pure functions.
import { slotOf } from './generate.js';

export const MUSCLES = [
  ['chest', 'Chest'], ['back', 'Back'], ['shoulders', 'Shoulders'], ['biceps', 'Biceps'], ['triceps', 'Triceps'],
  ['legs', 'Quads'], ['posterior', 'Glutes & hams'], ['calves', 'Calves'], ['core', 'Core'], ['mobility', 'Mobility'], ['other', 'Other'],
];
export const EQUIPMENT = [
  ['barbell', 'Barbell'], ['dumbbell', 'Dumbbell'], ['cable', 'Cable'], ['machine', 'Machine'],
  ['kettlebell', 'Kettlebell'], ['band', 'Band'], ['bodyweight', 'Bodyweight'],
];
const SLOT_MUSCLE = {
  chest_press: 'chest', chest_fly: 'chest', shoulder_press: 'shoulders', lateral: 'shoulders', rear_delt: 'shoulders',
  vert_pull: 'back', horiz_row: 'back', shrug: 'back', biceps: 'biceps', triceps: 'triceps',
  squat: 'legs', single_leg: 'legs', quad_iso: 'legs', hinge: 'posterior', ham_curl: 'posterior', glute: 'posterior',
  calf: 'calves', core: 'core',
};
const MOBILITY = /stretch|cat-?cow|open book|90\/90|bird dog|child'?s pose|deep squat hold|hanging from|mobility|dead hang|foam roll|breathing/;
export function muscleOf(name) {
  const n = String(name || '').toLowerCase();
  if (MOBILITY.test(n)) return 'mobility';
  if (/pullover|straight-?arm/.test(n)) return 'back';
  if (/wrist|grip|forearm/.test(n)) return 'biceps';
  if (/tibialis/.test(n)) return 'calves';
  return SLOT_MUSCLE[slotOf(n)] || 'other';
}
// First match wins: "cable curl" is cable, "dumbbell bench press" is dumbbell, "bench press" is barbell.
const EQUIP_RULES = [
  ['kettlebell', /kettlebell|\bkb\b/],
  ['dumbbell', /dumbbell|\bdb\b|goblet|hammer curl|concentration|kickback|arnold|lateral raise(?!.*(cable|machine))|waiter|rainbow|\bl raise/],
  ['band', /\bband|banded|spanish squat|monster walk|pull-apart/],
  ['cable', /cable|pulldown|pushdown|face pull|pallof|woodchopper|crossover|pull through|rope/],
  ['machine', /machine|pec deck|leg press|leg curl|leg extension|hack|smith|assisted|seated calf|reverse pec|abduction|adduction|chest press/],
  ['barbell', /barbell|ez-?bar|trap-?bar|hex bar|deadlift|bench press|overhead press|push press|good morning|rack pull|squat|\brow\b|pendlay|seal row|landmine|hip thrust|shrug|lunge|skull|zercher|svend/],
  ['bodyweight', /push-?ups?|pull-?ups?|chin-?ups?|\bdips?\b|plank|sit-?ups?|leg raise|dead bug|bird dog|nordic|inverted row|bridge|bodyweight|pistol|skater|jump|back extension|hanging|crunch|ab wheel|towel row|step-? ?ups?/],
];
export function equipmentOf(name, supportsBodyweight) {
  const n = String(name || '').toLowerCase();
  for (const [k, re] of EQUIP_RULES) if (re.test(n)) return k;
  return supportsBodyweight ? 'bodyweight' : null;
}
export const muscleName = k => (MUSCLES.find(m => m[0] === k) || [k, k])[1];
export const equipmentName = k => (EQUIPMENT.find(m => m[0] === k) || [k, k])[1];

// ---------- real data: muscles and equipment on the exercise (from the exercemus list) ----------
// An exercise may carry muscles (main), muscles_also (secondary) and equipment, in exercemus's
// words (21 muscles, 16 kinds of equipment). Lifts without them (the crew's own) fall back to the
// name rules above, so everything still sorts.
const DATA_MUSCLE = {
  chest: 'chest', 'serratus anterior': 'chest', lats: 'back', 'middle back': 'back', traps: 'back', 'lower back': 'back', neck: 'back',
  shoulders: 'shoulders', biceps: 'biceps', brachialis: 'biceps', forearms: 'biceps', triceps: 'triceps',
  quads: 'legs', adductors: 'legs', hamstrings: 'posterior', glutes: 'posterior', abductors: 'posterior', calves: 'calves', soleus: 'calves',
  abs: 'core', obliques: 'core',
};
const DATA_EQUIP = { barbell: 'barbell', 'ez curl bar': 'barbell', dumbbell: 'dumbbell', cable: 'cable', machine: 'machine', kettlebell: 'kettlebell', bands: 'band', none: 'bodyweight', 'pull-up bar': 'bodyweight' };
const has = a => Array.isArray(a) && a.length > 0;
// The library's muscle for an exercise: its first main muscle if it has data, else from the name.
export function muscleKeyOf(ex) {
  if (ex && has(ex.muscles)) for (const m of ex.muscles) if (DATA_MUSCLE[m]) return DATA_MUSCLE[m];
  return muscleOf(ex && ex.name);
}
export function equipmentKeyOf(ex) {
  if (ex && has(ex.equipment)) for (const q of ex.equipment) if (DATA_EQUIP[q]) return DATA_EQUIP[q];
  return equipmentOf(ex && ex.name, ex && ex.supports_bodyweight);
}

// ---------- what a week hits and misses ----------
// The muscles people think in, each made of exercemus's muscles. A working set counts 1 toward
// each of its exercise's main muscles and ½ toward each secondary one (a common way to count
// weekly volume). Lifts without data count toward the muscle their name suggests.
export const GROUPS = [
  ['chest', 'Chest', ['chest', 'serratus anterior']], ['back', 'Back', ['lats', 'middle back']], ['traps', 'Traps', ['traps', 'neck']],
  ['lowerback', 'Lower back', ['lower back']], ['shoulders', 'Shoulders', ['shoulders']], ['biceps', 'Biceps', ['biceps', 'brachialis']],
  ['triceps', 'Triceps', ['triceps']], ['forearms', 'Forearms', ['forearms']], ['quads', 'Quads', ['quads']], ['hamstrings', 'Hamstrings', ['hamstrings']],
  ['glutes', 'Glutes', ['glutes', 'abductors']], ['adductors', 'Inner thighs', ['adductors']], ['calves', 'Calves', ['calves', 'soleus']], ['core', 'Core', ['abs', 'obliques']],
];
const GROUP_OF = Object.fromEntries(GROUPS.flatMap(([k, , ms]) => ms.map(m => [m, k])));
const NAME_GROUPS = { chest: ['chest'], back: ['back'], shoulders: ['shoulders'], biceps: ['biceps'], triceps: ['triceps'], legs: ['quads'], posterior: ['hamstrings', 'glutes'], calves: ['calves'], core: ['core'] };
// { main: [group], also: [group] } for an exercise.
export function worked(ex) {
  if (ex && has(ex.muscles)) {
    const main = [...new Set(ex.muscles.map(m => GROUP_OF[m]).filter(Boolean))];
    const also = [...new Set((ex.muscles_also || []).map(m => GROUP_OF[m]).filter(g => g && !main.includes(g)))];
    return { main, also };
  }
  return { main: NAME_GROUPS[muscleOf(ex && ex.name)] || [], also: [] };
}
// Hard sets per group from a list of sets (warm-ups and deleted ones skipped), and each group's
// verdict: missing (none), light (under `enough`), hit.
export function coverage(sets, exById, enough = 6) {
  const n = new Map(GROUPS.map(([k]) => [k, 0]));
  for (const s of sets) {
    if (s.is_warmup === true || s.deleted_at) continue;
    const w = worked(exById.get(s.exercise_id));
    for (const g of w.main) n.set(g, n.get(g) + 1);
    for (const g of w.also) n.set(g, n.get(g) + 0.5);
  }
  return GROUPS.map(([key, name]) => { const sets = n.get(key); return { key, name, sets, verdict: !sets ? 'missing' : sets < enough ? 'light' : 'hit' }; });
}
