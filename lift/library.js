// The exercise library: sorts the catalogue by muscle and equipment so it can be browsed. The
// catalogue has no tags, so both come from the exercise's name (the same way the workout generator
// sorts lifts into slots). Anything the rules don't recognise lands in "Other". Pure functions.
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
