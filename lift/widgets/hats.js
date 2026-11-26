// Kintoremon's hats: earned by the things the app already tracks (PRs, clubs, streaks, challenges,
// goals, records, seasons, stamps), kept for good once earned, worn one at a time.
//
// Pure: the app passes in `facts` (see widgets/index.js). Some facts only say what's true now (a
// record you hold today, this week's challenges), so a hat is saved with the day it was first
// earned and stays yours after that (mergeUnlocks).
//
// facts: {
//   prsSinceHatch    PRs since it hatched
//   lifetimeLb       everything you've ever moved, in lb equivalent
//   streakWeeks      weeks in a row with a lift, up to this one
//   questsAllDone    all of this week's challenges done
//   goalsDone        season goals met, in seasons you're in
//   recordsHeld      crew records you hold now
//   seasonsFinished  [ends_on] of seasons you were in that have ended
//   stamps           [earned_on] of your season stamps
// }

const after = (list, day) => (list || []).some(d => d >= day);

export const HATS = [
  { id: 'sweatband', name: 'Sweatband', hint: 'Set a PR', test: f => f.prsSinceHatch >= 1 },
  { id: 'party', name: 'Party hat', hint: 'Join the Elephant Club (10,000 lb)', test: f => f.lifetimeLb >= 10000 },
  { id: 'viking', name: 'Viking helmet', hint: 'Join the 100K Club', test: f => f.lifetimeLb >= 100000 },
  { id: 'stars', name: 'Star headband', hint: 'Lift 4 weeks in a row', test: f => f.streakWeeks >= 4 },
  { id: 'halo', name: 'Halo', hint: 'Lift 12 weeks in a row', test: f => f.streakWeeks >= 12 },
  { id: 'bandana', name: 'Bandana', hint: 'Finish all of a week’s challenges', test: f => !!f.questsAllDone },
  { id: 'gradcap', name: 'Graduation cap', hint: 'Hit a season goal', test: f => f.goalsDone >= 1 },
  { id: 'laurel', name: 'Laurel wreath', hint: 'Take a crew record', test: f => f.recordsHeld >= 1 },
  { id: 'wizard', name: 'Wizard hat', hint: 'Finish a season', test: (f, hatched) => after(f.seasonsFinished, hatched) },
  { id: 'pin', name: 'Stamp pin', hint: 'Earn a season stamp', test: (f, hatched) => after(f.stamps, hatched) },
  // Seasonal: anyone can wear these, but only in their month.
  { id: 'pumpkin', name: 'Pumpkin', hint: 'Only in October', month: 10 },
  { id: 'santa', name: 'Santa hat', hint: 'Only in December', month: 12 },
];
export const hatById = id => HATS.find(h => h.id === id);

// Hats earned right now from the facts (seasonal hats aren't earned; they're in season or not).
export function hatsMet(facts, hatched) {
  return HATS.filter(h => !h.month && h.test(facts || {}, hatched)).map(h => h.id);
}
// Saved unlocks ({ id: day first earned }) plus anything newly met today. Returns the same object
// when nothing changed, so the app only saves when there's something new.
export function mergeUnlocks(saved, met, today) {
  const add = met.filter(id => !(saved && saved[id]));
  if (!add.length) return saved || {};
  const out = { ...saved };
  for (const id of add) out[id] = today;
  return out;
}
// Can it be worn today: earned (saved), or a seasonal hat in its month.
export function wearable(id, unlocked, today) {
  const h = hatById(id);
  if (!h) return false;
  if (h.month) return Number(today.slice(5, 7)) === h.month;
  return !!(unlocked && unlocked[id]);
}
// Hats first earned today, for the Finish recap.
export const newToday = (unlocked, today) => Object.keys(unlocked || {}).filter(id => unlocked[id] === today);

// ---------------------------------------------------------------------------
// Drawings, in the pet's 120 × 110 box, sitting on top of its head (the head's crown is at about
// 60, 34). Theme colours through the pet's CSS classes; seasonal hats keep their own colours.
// ---------------------------------------------------------------------------
const star = (x, y, r) => '<path d="M' + x + ' ' + (y - r) + ' l' + r * 0.3 + ' ' + r * 0.7 + ' l' + r * 0.7 + ' 0 l-' + r * 0.55 + ' ' + r * 0.45 +
  ' l' + r * 0.25 + ' ' + r * 0.75 + ' l-' + r * 0.7 + ' -' + r * 0.45 + ' l-' + r * 0.7 + ' ' + r * 0.45 + ' l' + r * 0.25 + ' -' + r * 0.75 +
  ' l-' + r * 0.55 + ' -' + r * 0.45 + ' l' + r * 0.7 + ' 0 z" class="pl-gold"/>';
const DRAW = {
  sweatband: '<rect x="35" y="38" width="50" height="8" rx="4" class="pl-hat"/><path d="M38 42 h44" class="pl-hatline"/>',
  party: '<path d="M60 4 L47 38 L73 38 Z" class="pl-hat"/><circle cx="56" cy="26" r="2" class="pl-hat2"/><circle cx="63" cy="18" r="2" class="pl-hat2"/>' +
    '<circle cx="62" cy="31" r="2" class="pl-hat2"/><circle cx="60" cy="5" r="4" class="pl-gold"/>',
  viking: '<path d="M38 40 q22 -30 44 0 z" class="pl-metal"/><path d="M38 40 h44" class="pl-hatline"/>' +
    '<path d="M40 32 q-12 -2 -14 -16 q8 6 16 8 z M80 32 q12 -2 14 -16 q-8 6 -16 8 z" class="pl-horn"/>',
  stars: '<rect x="35" y="36" width="50" height="7" rx="3.5" class="pl-hat"/>' + star(46, 33, 6) + star(60, 30, 7) + star(74, 33, 6),
  halo: '<ellipse cx="60" cy="18" rx="18" ry="5" class="pl-halo"/>',
  bandana: '<path d="M35 42 q25 -26 50 0 z" class="pl-hat"/><circle cx="50" cy="34" r="1.6" class="pl-hat2"/><circle cx="66" cy="32" r="1.6" class="pl-hat2"/>' +
    '<path d="M84 40 l10 -4 l-3 7 l5 3 l-10 1 z" class="pl-hat"/>',
  gradcap: '<path d="M40 30 h40 v8 q-20 6 -40 0 z" class="pl-ink"/><path d="M28 26 L60 16 L92 26 L60 36 Z" class="pl-ink"/>' +
    '<path d="M60 26 L86 30 v10" class="pl-tassel"/><circle cx="86" cy="42" r="2.5" class="pl-gold"/>',
  laurel: '<path d="M36 44 q-4 -14 10 -20 M84 44 q4 -14 -10 -20" class="pl-vine"/>' +
    [[37, 40], [38, 33], [42, 27], [83, 40], [82, 33], [78, 27]].map(([x, y]) => '<ellipse cx="' + x + '" cy="' + y + '" rx="5" ry="2.6" class="pl-leaf" transform="rotate(' + (x < 60 ? -50 : 50) + ' ' + x + ' ' + y + ')"/>').join(''),
  wizard: '<path d="M60 0 L44 36 L76 36 Z" class="pl-wizard"/><ellipse cx="60" cy="37" rx="26" ry="5" class="pl-wizard"/>' + star(58, 22, 5),
  pin: '<circle cx="80" cy="42" r="7" class="pl-gold"/>' + star(80, 42, 4).replace('pl-gold', 'pl-hat'),
  pumpkin: '<ellipse cx="60" cy="32" rx="16" ry="11" class="pl-pumpkin"/><path d="M52 23 q-2 9 0 18 M68 23 q2 9 0 18" class="pl-hatline"/><path d="M60 22 q1 -6 5 -7" class="pl-vine"/>',
  santa: '<path d="M40 38 q6 -30 28 -28 q14 2 20 18 l-8 2 q-6 -12 -14 -10 q-10 4 -8 20 z" class="pl-santa"/>' +
    '<rect x="36" y="35" width="48" height="8" rx="4" class="pl-fur"/><circle cx="88" cy="30" r="5" class="pl-fur"/>',
};
// The hat's drawing; `egg` lifts it onto an egg, which is taller than a head.
export function hatSvg(id, { egg = false } = {}) {
  const d = DRAW[id];
  if (!d) return '';
  return '<g class="pl-hatg"' + (egg ? ' transform="translate(0 -6)"' : '') + '>' + d + '</g>';
}
