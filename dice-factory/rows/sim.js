// Dice Factory · Rows: the simulation.
// The board is three habitat rows of card slots (after Wingspan's habitats).
// Each turn your roll goes into the rows; dice ride each row left to right
// through the cards. Modifier cards change a die and pass it on, router cards
// can send it to the row above or below, weapon and defense cards take it.
// Whatever reaches the end of a row does that row's action (Armory: fire at
// the foe; Exchange: gears; Masonry: block), stronger for each card in the row.
// The foe is an opponent card with an intent and a turn countdown.
// No drawing or DOM here: view.js draws it, and Node can play it headless.

// ============================================================ board space
export const W = 1280, H = 640;
export const ROWS = 3, SLOTS = 6;
export const LANE_X0 = 132;                  // where dice enter a row
export const SLOT_X0 = 214, SLOT_DX = 116;   // centre of slot 0, spacing
export const LANE_X1 = SLOT_X0 + SLOTS * SLOT_DX - 30;   // the row's end
export const ROW_Y0 = 118, ROW_DY = 118;
export const SLOT_W = 98, SLOT_H = 104;
export const slotX = c => SLOT_X0 + c * SLOT_DX;
export const rowY = r => ROW_Y0 + r * ROW_DY;
export const FOE_X = 1088, FOE_Y = 210;      // where shots aim on the foe card
export const MITE_Y = 360;                   // the foe card's minion strip

// the rows' flavors (habitats); order top to bottom
export const ROW_KINDS = {
  armory:   {name: 'Armory', col: '#e2533d', tint: '#3a1f1c', end: 'Fire', text: 'Dice that reach the end are fired at the foe.'},
  exchange: {name: 'Exchange', col: '#e0a214', tint: '#3a3014', end: 'Gears', text: 'Dice that reach the end become gears.'},
  masonry:  {name: 'Masonry', col: '#3d8be0', tint: '#1c2a3a', end: 'Block', text: 'Dice that reach the end become block.'},
};
export const ROW_ORDER = ['armory', 'exchange', 'masonry'];
// slots further right cost more (like Wingspan's egg costs)
export const COL_EXTRA = [0, 0, 1, 1, 2, 2];

// ============================================================ helpers
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = t => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

let seed = (Math.random() * 2 ** 32) >>> 0;
export function setSeed(s) { seed = s >>> 0; }
export function rand() {                     // mulberry32: seeded, so games replay
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rnd = (a, b) => a + rand() * (b - a);
export const ri = (a, b) => Math.floor(rnd(a, b + 1));

export const COL = {
  ink: '#2b2620', card: '#f7f0e1', gold: '#ffd25e', hot: '#ffc2a6', ember: '#ff7a2f', ice: '#c9ecff',
  drop: '#ff5a4a', blk: '#8cc2ff', heal: '#7fe08a', venom: '#7ac943', pip: '#f2c14e',
  route: '#2fae92', mod: '#a66ad6', weapon: '#e2533d', defense: '#3d8be0', pool: '#e0a214',
};
export const TINT = {route: '#d8f0ea', mod: '#eedff8', weapon: '#fde3d8', defense: '#dfeafa', pool: '#fbefc8'};
export const CAT_LABEL = {route: 'ROUTE & SPLIT', mod: 'MODIFY', weapon: 'WEAPONS', defense: 'DEFENSE', pool: 'COMPANIES'};

// ============================================================ cards
// role: 'route' (may send the die up/down a row) | 'mod' (changes it, passes it on) | 'term' (takes it)
// home: the row it likes (+25% in its home row)
export const KINDS = {
  // ---- routing and splitting
  sorter:   {cat: 'route', role: 'route', proc: .18, name: 'Sorting Gate', short: 'Hi / Lo', text: '4-6 carry on; 1-3 change row. Tap to swap.'},
  switch:   {cat: 'route', role: 'route', proc: .12, name: 'Track Switch', short: 'Switch', text: 'Every die changes row (lit) or carries on. Tap to flip.'},
  oddeven:  {cat: 'route', role: 'route', proc: .18, name: 'Odd / Even Gate', short: 'Odd Even', text: 'Odd dice carry on; even dice change row.'},
  alt:      {cat: 'route', role: 'route', proc: .12, name: 'Ping-Pong', short: 'Ping-Pong', text: 'Alternates: carry on, change row, carry on...'},
  prism:    {cat: 'route', role: 'route', proc: .3, name: 'Prism', short: 'Prism', text: 'Splits a die: half its pips carry on, the rest change row.'},
  trisplit: {cat: 'route', role: 'route', proc: .35, name: 'Tri-Splitter', short: 'Tri-Split', text: 'A die becomes three, a third of its pips each: one into every row.'},
  echo:     {cat: 'route', role: 'route', proc: .3, name: 'Echo', short: 'Echo', text: 'A 5 or 6 is copied into the other row (once per die).'},
  crusher:  {cat: 'route', role: 'mod', proc: .35, name: 'Crusher', short: 'Crusher', text: 'Smashes a die into that many 1s (up to 6). A swarm.'},
  overflow: {cat: 'route', role: 'route', proc: .05, name: 'Overflow', short: 'Overflow', text: 'Carries on, unless the row ahead is jammed: then changes row.'},
  // ---- modifiers
  forge:    {cat: 'mod', role: 'mod', proc: .3, name: 'Ember Forge', short: 'Forge', home: 'armory', text: '+2 pips (+1 per level). Hot: sets the foe on fire.'},
  doubler:  {cat: 'mod', role: 'mod', proc: .3, name: 'Doubling Press', short: 'Doubler', text: 'Doubles a 1, 2 or 3.'},
  drum:     {cat: 'mod', role: 'mod', proc: .3, name: 'Tumble Drum', short: 'Reroll', text: 'Rerolls the die.'},
  flipper:  {cat: 'mod', role: 'mod', proc: .25, name: 'Flipper', short: 'Flipper', text: 'Turns the die over: 1 becomes 6, 2 becomes 5.'},
  frost:    {cat: 'mod', role: 'mod', proc: .3, name: 'Frost Coat', short: 'Frost', text: '-1 pip, icy: in the Meltdown icy dice hit double.'},
  spiker:   {cat: 'mod', role: 'mod', proc: .3, name: 'Spike Lathe', short: 'Spikes', text: 'Spiky dice hit 25% harder and ignore 3 armor.'},
  inflate:  {cat: 'mod', role: 'mod', proc: .25, name: 'Inflator', short: 'Inflate', text: '+1 pip (+1 per level), up to 12.'},
  mint:     {cat: 'mod', role: 'term', name: 'Gear Mint', short: 'Mint', home: 'exchange', text: 'Turns the die into gears: a quarter of its pips, rounded up.'},
  // ---- weapons
  cannon:   {cat: 'weapon', role: 'term', name: 'Dice Cannon', short: 'Cannon', home: 'armory', text: 'Fires the die: pips damage. Quick.'},
  pult:     {cat: 'weapon', role: 'term', name: 'Dice-a-pult', short: 'Pult', home: 'armory', text: 'Lobs the die: pips x2. Slow to reload.'},
  gatling:  {cat: 'weapon', role: 'term', name: 'Dice Gatling', short: 'Gatling', home: 'armory', text: 'Drum of 8 dice; sprays them.'},
  rico:     {cat: 'weapon', role: 'term', name: 'Ricochet Sling', short: 'Ricochet', home: 'armory', text: 'Hits three times: full, half, a quarter.'},
  rocket:   {cat: 'weapon', role: 'term', name: 'Dice Rocket', short: 'Rocket', home: 'armory', text: 'Packs up to 10 dice and launches them all (x1.25) at the end of the run, or when full.'},
  combo:    {cat: 'weapon', role: 'term', name: 'Combo Cannon', short: 'Combo', home: 'armory', text: 'Loads 3. Pair x1.5, straight x2.5, three of a kind x4.'},
  sticky:   {cat: 'weapon', role: 'term', name: 'Sticky Bomb', short: 'Sticky', home: 'armory', text: 'Sticks to the foe; blows up after its turn for pips x4.'},
  // ---- defense
  bulwark:  {cat: 'defense', role: 'term', name: 'Bulwark', short: 'Bulwark', home: 'masonry', text: 'Block = the pips (+1 per level). Block soaks hits before your factory.'},
  thorns:   {cat: 'defense', role: 'term', name: 'Thorn Garden', short: 'Thorns', home: 'masonry', text: 'Thorns = the pips. When the foe hits you, thorns hit it back.'},
  parry:    {cat: 'defense', role: 'term', name: 'Parry Shield', short: 'Parry', home: 'masonry', text: 'Each die is a charge. At 3 charges it blocks the next slam and stuns the foe.'},
  patch:    {cat: 'defense', role: 'term', name: 'Patch Bay', short: 'Patch', home: 'masonry', text: 'Repairs the factory: half the pips.'},
  // ---- companies (build pools)
  grinder:   {cat: 'pool', pool: 'grind', role: 'mod', proc: .3, name: 'Grinder', short: 'Grinder', text: 'Grinds a die into its pips (into the pip tank ◆) and lets a 1 go on.'},
  pipgat:    {cat: 'pool', pool: 'grind', role: 'term', name: 'Pip Gatling', short: 'Pip Gatling', home: 'armory', text: 'Sprays the pip tank: 2 dmg to mites, 1 to the foe; armor stops pips. Dice fed in become pips.'},
  sandblast: {cat: 'pool', pool: 'grind', role: 'term', name: 'Sandblaster', short: 'Sandblast', home: 'armory', text: 'A 1 or 2 strips 1 armor off the foe (it grows back 1 a turn). Bigger dice just hit.'},
  pipforge:  {cat: 'pool', pool: 'mega', role: 'mod', proc: .3, name: 'Pip Forge', short: 'Pip Forge', text: 'Pours up to 4 pips (+1 per level) from the pip tank into the die.'},
  compressor:{cat: 'pool', pool: 'mega', role: 'mod', proc: .35, name: 'Compressor', short: 'Compress', text: 'Squeezes 3 dice into one: their total +2. Dice of 15+ are crowned Mega dice (x1.5).'},
  meteor:    {cat: 'pool', pool: 'mega', role: 'term', name: 'Meteor', short: 'Meteor', home: 'armory', text: 'Damage = pips² ÷ 8, splashing mites. Under 8 pips it fizzles for 1.'},
  venomvat:  {cat: 'pool', pool: 'venom', role: 'mod', proc: .3, name: 'Venom Vat', short: 'Venom Vat', text: 'Coats the die: hits stack poison = pips. Poison ticks on the foe’s turn and ignores armor.'},
  catalyst:  {cat: 'pool', pool: 'venom', role: 'term', name: 'Catalyst Cannon', short: 'Catalyst', home: 'armory', text: 'Hits for the pips and multiplies the poison on the foe by 1.5.'},
  rampart:   {cat: 'pool', pool: 'fortress', role: 'term', name: 'Rampart Cannon', short: 'Rampart', home: 'masonry', text: 'Spends up to 10 of your block: hits for 3x that + the die. Ignores armor.'},
};
export const COST = {
  sorter: 3, switch: 3, oddeven: 3, alt: 3, prism: 5, trisplit: 6, echo: 6, crusher: 5, overflow: 3,
  forge: 5, doubler: 4, drum: 2, flipper: 3, frost: 4, spiker: 5, inflate: 4, mint: 5,
  cannon: 6, pult: 6, gatling: 10, rico: 7, rocket: 12, combo: 8, sticky: 8,
  bulwark: 5, thorns: 6, parry: 8, patch: 6,
  grinder: 4, pipgat: 9, sandblast: 6, pipforge: 6, compressor: 6, meteor: 10, venomvat: 5, catalyst: 8, rampart: 8,
};
export const CATS = ['route', 'mod', 'weapon', 'defense', 'pool'];
export const PALETTE = {};
for (const c of CATS) PALETTE[c] = Object.keys(KINDS).filter(k => KINDS[k].cat === c);

export const COMPANIES = {
  grind:    {name: 'Grindwell & Sons', short: 'Grindwell', mark: 'G', col: '#b8892e', ink: '#fff6e0', motto: 'Every pip counts.'},
  mega:     {name: 'Titan Foundry Co.', short: 'Titan', mark: 'T', col: '#c0392b', ink: '#ffe07a', motto: 'Bigger is better.'},
  venom:    {name: 'Viper Chemical', short: 'Viper', mark: 'V', col: '#4f8f2a', ink: '#e4ffcc', motto: 'Slow, sure, deadly.'},
  fortress: {name: 'Bastion Masonry', short: 'Bastion', mark: 'B', col: '#2f5f9e', ink: '#dfeaff', motto: 'The wall is the weapon.'},
};

export const START_GEARS = 40, PIP_MAX = 99, MEGA = 15, LOCK_MISS = .1, CLINK = .2, SPIKE = 1.25;
export const HOME_BONUS = 1.25;
export const XP_CAP = 3, LV_XP = [0, 6, 15, 30], MAX_LVL = 4;
export const LANE_SPEED = 170, GAP = 30;     // px/s along a row; spacing between dice
export const RUN_MAX = 12, FOE_TURN = 1.8;
export const fmtDmg = d => d >= 1 ? String(Math.round(d)) : d.toFixed(1);
export const lvlMult = c => 1 + .25 * ((c && c.lvl || 1) - 1);

// ============================================================ foes
// Intents act when their countdown reaches 0 (counted down on the foe's turns).
const COLOSSUS = [
  {name: 'Iron March', at: 1, roll: 6, desc: 'Slams and rocks. Build damage and some block.',
   good: ['pult', 'cannon', 'combo', 'bulwark', 'parry', 'forge'],
   intents: [{type: 'slam', dmg: 10, turns: 2}, {type: 'rocks', dmg: 4, n: 3, turns: 1}, {type: 'slam', dmg: 14, turns: 2}]},
  {name: 'Hive Hatch', at: .75, roll: 7, desc: 'Mites hatch and gnaw at you every turn. Fast, wide weapons clear them.',
   good: ['gatling', 'pipgat', 'crusher', 'prism', 'trisplit', 'rocket', 'meteor'],
   intents: [{type: 'brood', n: 4, turns: 1}, {type: 'slam', dmg: 10, turns: 2}]},
  {name: 'Iron Plating', at: .5, roll: 8, armor: 5, desc: 'Armor 5: smaller dice only scratch it (spikes ignore 3). Slams hit hard.',
   good: ['forge', 'inflate', 'compressor', 'pipforge', 'spiker', 'sandblast', 'meteor', 'bulwark'],
   intents: [{type: 'slam', dmg: 18, turns: 2}, {type: 'rocks', dmg: 5, n: 4, turns: 1}, {type: 'slam', dmg: 22, turns: 2}]},
  {name: 'Meltdown', at: .25, roll: 9, meltdown: true, desc: 'It buries slots for 2 turns: route around them. Fire does nothing, ice hits double.',
   good: ['frost', 'overflow', 'switch', 'sorter', 'prism'],
   intents: [{type: 'bury', n: 2, turns: 1}, {type: 'slam', dmg: 16, turns: 2}, {type: 'slam', dmg: 20, turns: 2}]},
];
const SWARM = [
  {name: 'First Brood', at: 1, roll: 7, miteHp: 7, desc: 'A brood every other turn; every mite gnaws you each turn. Go wide.',
   good: ['gatling', 'pipgat', 'grinder', 'crusher', 'trisplit', 'prism', 'rocket', 'meteor'],
   intents: [{type: 'brood', n: 6, turns: 2}]},
  {name: 'Frenzy', at: .5, roll: 8, miteHp: 8, bigEvery: 4, desc: 'Bigger broods every turn, with fat mites. Splash, spray, and block.',
   good: ['gatling', 'pipgat', 'rocket', 'meteor', 'bulwark', 'thorns', 'crusher'],
   intents: [{type: 'brood', n: 6, turns: 1}]},
];
const SHELL = [
  {name: 'Closed Shell', at: 1, roll: 7, armor: 8, desc: 'Armor 8. It opens the turn before it slams: that run, everything hits x1.5.',
   good: ['forge', 'inflate', 'compressor', 'pipforge', 'spiker', 'sandblast', 'meteor', 'venomvat'],
   intents: [{type: 'slam', dmg: 16, turns: 3}, {type: 'rocks', dmg: 5, n: 3, turns: 2}]},
  {name: 'Cracked Shell', at: .5, roll: 8, armor: 6, desc: 'Armor 6, but it hits harder and more often.',
   good: ['forge', 'compressor', 'meteor', 'rampart', 'catalyst', 'parry'],
   intents: [{type: 'slam', dmg: 20, turns: 2}, {type: 'slam', dmg: 14, turns: 2}]},
];
const LOCK = [
  {name: 'One Lock', at: 1, roll: 7, locks: 1, match: 3, desc: 'Only dice showing its lock face hurt (x3); others do a tenth. The next face is shown.',
   good: ['sorter', 'oddeven', 'flipper', 'drum', 'switch', 'mint'],
   intents: [{type: 'slam', dmg: 10, turns: 2}, {type: 'rocks', dmg: 4, n: 3, turns: 2}]},
  {name: 'Two Locks', at: .5, roll: 8, locks: 2, match: 2, desc: 'Two faces now (x2). Matching dice glow green.',
   good: ['sorter', 'oddeven', 'flipper', 'drum', 'switch', 'echo'],
   intents: [{type: 'slam', dmg: 14, turns: 2}, {type: 'rocks', dmg: 5, n: 3, turns: 1}]},
];
export const DUMMY_RULES = {
  plain: {name: 'Free play', at: 1, roll: 6, desc: 'Build anything. The dummy never fights back.', good: [], intents: []},
  armor: {name: 'Free play · armor 8', at: 1, roll: 6, armor: 8, desc: 'Armor 8, like the Ironshell.', good: ['compressor', 'pipforge', 'meteor', 'sandblast', 'spiker', 'forge'], intents: []},
  lock:  {name: 'Free play · lock', at: 1, roll: 6, locks: 1, match: 3, desc: 'A lock face, like the Lockbox.', good: ['sorter', 'oddeven', 'flipper', 'drum', 'switch'], intents: []},
};
export const FOES = {
  colossus: {name: 'The Rust Colossus', hp: 600, tag: 'ALL-ROUNDER', phases: COLOSSUS,
    desc: 'Slams and rocks, then mites, armor and buried slots as it breaks down.', counters: 'A bit of everything. Re-route each phase.'},
  swarm: {name: 'The Mite Mother', hp: 300, tag: 'SWARM', phases: SWARM,
    desc: 'Broods of little mites that gnaw at you every turn.', counters: 'Gatling, Pip Gatling, Crusher, Tri-Splitter. Splash from Rockets and Meteors.'},
  shell: {name: 'The Ironshell', hp: 420, tag: 'ARMORED', phases: SHELL,
    desc: 'Armor 8: small dice scratch it. It opens before it slams.', counters: 'Forge, Compressor, Pip Forge, Spikes, Venom. Flood it on the open turn.'},
  lock: {name: 'The Lockbox', hp: 360, tag: 'PRECISION', phases: LOCK,
    desc: 'Only dice showing its lock face really hurt it.', counters: 'Hi/Lo, Odd/Even, Flipper, Reroll, Switch. Send misses to the Exchange.'},
  dummy: {name: 'Scrap Dummy', hp: 99999, tag: 'FREE PLAY', phases: [DUMMY_RULES.plain],
    desc: "Never hits back, can't die. Free build, no clock.", counters: 'Switch its rules (armor, lock) from the tools to test a build.'},
};
export let PHASES = COLOSSUS;

// ============================================================ state
export let S;
export const opts = {free: false, god: false, speed: 1, deal: 'even'};   // deal: 'even' | 'pick'

export function newGame(keep = false) {
  const old = S;
  S = {
    t: 0, turn: 1, tphase: 'plan', over: null, paused: false, picker: true, skip: false, slowT: 0, timeScale: 1,
    hp: 40, maxHp: 40, block: 0, thorns: 0, gears: START_GEARS, pips: 0,
    rows: old && keep ? old.rows.slice() : ROW_ORDER.slice(),
    slots: Array.from({length: ROWS * SLOTS}, () => null), buried: new Map(),
    dice: [], queue: Array.from({length: ROWS}, () => []), pickRow: 0, nextId: 1,
    proj: [], parts: [], texts: [], shake: 0, banner: null, hitFlash: 0,
    enc: old ? old.enc : 'colossus', dummyRule: old ? old.dummyRule : 'plain',
    foe: null, mites: [], nextMite: 1, foeT: 0, acted: null,
    stats: {thrown: 0, dmg: 0, lost: 0, mites: 0, ended: 0},
    turnStart: null, buttons: [], menuButtons: [],
  };
  if (keep && old) for (let i = 0; i < old.slots.length; i++) if (old.slots[i]) S.slots[i] = {...makeCard(old.slots[i].kind, old.slots[i].dir), lvl: old.slots[i].lvl, xp: old.slots[i].xp, paid: old.slots[i].paid};
  chooseFoe(S.enc, false);
}

export function chooseFoe(id, close = true) {
  const def = FOES[id];
  if (id === 'dummy' && close) { opts.free = true; opts.god = true; }
  else if (S.enc === 'dummy' && id !== 'dummy') { opts.free = false; opts.god = false; }
  S.enc = id;
  PHASES = id === 'dummy' ? [DUMMY_RULES[S.dummyRule || 'plain']] : def.phases;
  S.foe = {hp: def.hp, max: def.hp, phase: 0, intent: 0, count: 0, flash: 0, hit: 0, poison: 0, burn: 0, shred: 0,
    stun: 0, locks: [], nextLocks: [], bombs: [], lunge: 0, arm: 0, enraged: false, chill: 0};
  setIntent(0);
  if (PHASES[0].locks) { S.foe.locks = rollLocks(PHASES[0].locks); S.foe.nextLocks = rollLocks(PHASES[0].locks); }
  S.mites = [];
  if (close) { S.picker = false; beginTurn(true); }
}
export function setDummyRule(rule) {
  S.dummyRule = rule; PHASES = [DUMMY_RULES[rule]];
  const f = S.foe; f.shred = 0; f.poison = 0;
  f.locks = rule === 'lock' ? rollLocks(1) : []; f.nextLocks = rule === 'lock' ? rollLocks(1) : [];
}
function rollLocks(n) { return [1, 2, 3, 4, 5, 6].sort(() => rand() - .5).slice(0, n).sort((a, b) => a - b); }
function setIntent(i) {
  const list = PHASES[S.foe.phase].intents;
  S.foe.intent = i;
  S.foe.count = list.length ? list[i % list.length].turns : 0;
}
export function curIntent() {
  const list = PHASES[S.foe.phase].intents;
  if (!list.length) return {type: 'none', dmg: 0, n: 0, label: ''};
  const b = list[S.foe.intent % list.length];
  const label = {slam: 'SLAM', rocks: 'ROCKS', brood: 'BROOD', bury: 'BURY'}[b.type];
  return {...b, n: b.n || 1, label};
}
export const shellOpen = () => S.enc === 'shell' && S.foe.count === 1 && curIntent().type === 'slam';
export const effArmor = () => Math.max(0, (PHASES[S.foe.phase].armor || 0) - (S.foe.shred || 0));

// ============================================================ slots
export const idx = (r, c) => r * SLOTS + c;
export const cardAt = (r, c) => S.slots[idx(r, c)];
export const isBuried = (r, c) => S.buried.has(idx(r, c));
export const rowKind = r => ROW_KINDS[S.rows[r]];
export const cardsInRow = r => { let n = 0; for (let c = 0; c < SLOTS; c++) if (cardAt(r, c)) n++; return n; };
export const slotCost = (kind, c) => (COST[kind] || 0) + COL_EXTRA[c];
export const homeMult = (card, r) => KINDS[card.kind].home && KINDS[card.kind].home === S.rows[r] ? HOME_BONUS : 1;

export function makeCard(kind, dir = 'D') {
  return {kind, dir, mode: kind === 'switch' ? 1 : 0, busy: 0, work: 0, fire: 0, hold: null, outQ: [], load: [], mag: [],
    stack: [], charges: 0, lvl: 1, xp: 0, xpTurn: 0, turnDmg: 0, turnProc: 0, totalDmg: 0, pop: 1, lever: 0, leverT: 0,
    spin: 0, spinV: 0, shotT: 0, wind: 0, paid: 0, alt: 0, lvlFlash: 0};
}
export const canAfford = (kind, c) => opts.free || S.gears >= slotCost(kind, c);
// first turn's plan: full refunds; after that half
const refundFor = card => S.turn === 1 && S.tphase === 'plan' ? (card.paid || 0) : Math.floor((card.paid || 0) / 2);

export function placeCard(r, c, kind, dir = 'D') {
  const i = idx(r, c), old = S.slots[i];
  if (S.tphase !== 'plan' && !opts.free) return false;
  if (old && old.kind === kind) return false;
  const cost = opts.free ? 0 : slotCost(kind, c), back = old ? refundFor(old) : 0;
  if (S.gears + back < cost) { say(slotX(c), rowY(r) - 50, `need ${cost} ⚙`, '#ffb0a0', 14); return false; }
  if (old) removeCard(r, c, false);
  S.gears -= cost;
  S.slots[i] = {...makeCard(kind, dir), pop: -.15, paid: cost};
  return true;
}
export function removeCard(r, c, refund = true) {
  const i = idx(r, c), card = S.slots[i];
  if (!card) return;
  for (const d of S.dice.slice()) if (d.state === 'proc' && d.row === r && d.slot === c) S.dice.splice(S.dice.indexOf(d), 1);
  if (refund) { const back = opts.free ? 0 : refundFor(card); S.gears += back; if (back) say(slotX(c), rowY(r) - 50, `+${back} ⚙ back`, COL.gold, 13); }
  burst(slotX(c), rowY(r), COL[KINDS[card.kind].cat] || '#888', 12, 180, 4, 400, .5, 1);
  S.slots[i] = null;
}
export function moveCard(r1, c1, r2, c2) {
  const a = idx(r1, c1), b = idx(r2, c2);
  if (a === b || !S.slots[a]) return;
  const t = S.slots[b]; S.slots[b] = S.slots[a]; S.slots[a] = t;
  for (const d of S.dice.slice()) if (d.state === 'proc') S.dice.splice(S.dice.indexOf(d), 1);
  for (const card of S.slots) if (card) card.hold = null;
}
// tap a placed card: routers flip what they do
export function tapCard(r, c) {
  const card = cardAt(r, c);
  if (!card) return;
  if (card.kind === 'sorter' || card.kind === 'switch') { card.mode = 1 - card.mode; card.work = .6; }
  else if (KINDS[card.kind].role === 'route') flipDir(r, c);
}
export function flipDir(r, c) {
  const card = cardAt(r, c);
  if (!card) return;
  card.dir = card.dir === 'D' ? 'U' : 'D'; card.work = .5;
}
// where a router sends dice that change row (clamped to the board: top row only goes down, etc.)
export function routeRow(card, r) {
  const want = r + (card.dir === 'U' ? -1 : 1);
  if (want >= 0 && want < ROWS) return want;
  return r + (card.dir === 'U' ? 1 : -1);
}

// ============================================================ fx (data only; the view draws them)
export function burst(x, y, col, n, spd, size = 3, g = 0, life = .5, shape = 0, dir = null, spread = Math.PI) {
  for (let i = 0; i < n; i++) {
    const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() * 2 - 1) * spread;
    const v = spd * (.35 + Math.random() * .65);
    S.parts.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col, size: size * (.6 + Math.random() * .65), g,
      life: life * (.7 + Math.random() * .5), t: 0, shape, rot: Math.random() * 6.3, vr: (Math.random() * 2 - 1) * 12});
  }
  if (S.parts.length > 900) S.parts.splice(0, S.parts.length - 900);
}
export function ring(x, y, col, r0, r1, life = .35) { S.parts.push({x, y, vx: 0, vy: 0, col, size: r0, end: r1, g: 0, life, t: 0, shape: 3, rot: 0, vr: 0}); }
export function say(x, y, txt, col, size = 16) { S.texts.push({x, y, txt, col, size, t: 0, life: 1}); if (S.texts.length > 80) S.texts.shift(); }
export function shake(a) { S.shake = Math.max(S.shake, a); }

// ============================================================ dice in rows
export const dieSpec = d => ({v: d.v, hot: !!d.hot, ice: !!d.ice, spiky: !!d.spiky, venom: !!d.venom, echoed: !!d.echoed});
function newDie(spec, row, x, state = 'lane') {
  const d = {id: S.nextId++, v: spec.v, show: spec.v, hot: !!spec.hot, ice: !!spec.ice, spiky: !!spec.spiky, venom: !!spec.venom,
    echoed: !!spec.echoed, row, x, y: rowY(row), state, slot: -1, t: 0, pop: spec.pop ? 1 : 0, rot: 0, wait: 0, roll: 0, rollTick: 0,
    fromRow: row, toRow: row};
  S.dice.push(d);
  return d;
}
const inRow = (d, r) => (d.state === 'lane' || d.state === 'proc') ? d.row === r : (d.state === 'move' && d.toRow === r);
// is there room for a die at x in row r? (nothing within GAP)
function roomAt(r, x, self = null) {
  for (const d of S.dice) if (d !== self && inRow(d, r) && Math.abs(d.x - x) < GAP) return false;
  return true;
}
function nextCardCol(r, x) {
  for (let c = 0; c < SLOTS; c++) if (slotX(c) > x + .5 && cardAt(r, c) && !isBuried(r, c)) return c;
  return -1;
}
function accepts(card) {
  if (card.hold !== null || card.outQ.length || card.pop < 1) return false;
  if (KINDS[card.kind].role !== 'term') return true;
  if (card.busy > 0 || card.wind > 0) return false;
  if (card.kind === 'rocket') return card.load.length < 10;
  if (card.kind === 'gatling') return card.mag.length < 8;
  if (card.kind === 'combo') return card.load.length < 3;
  if (card.kind === 'parry') return card.charges < 3;
  return true;
}

function deal() {
  // the roll waits at each row's entry until there's room
  for (let r = 0; r < ROWS; r++) {
    const q = S.queue[r];
    if (q.length && roomAt(r, LANE_X0)) {
      const d = newDie({v: q.shift()}, r, LANE_X0);
      d.roll = .25;
    }
  }
}

function laneStep(d, dt) {
  const r = d.row;
  const c = nextCardCol(r, d.x);
  const card = c >= 0 ? cardAt(r, c) : null;
  let goal = c >= 0 ? slotX(c) : LANE_X1;
  if (card && !accepts(card)) goal = slotX(c) - 44;
  for (const o of S.dice) if (o !== d && inRow(o, r) && o.x > d.x && o.x - GAP < goal) goal = o.x - GAP;
  const before = d.x;
  d.x = Math.min(goal, d.x + LANE_SPEED * dt);
  if (d.x < before) d.x = before;
  d.wait = d.x - before < .01 ? d.wait + dt : 0;
  if (card && d.x >= slotX(c) - .01 && accepts(card)) enterCard(d, card, r, c);
  else if (c < 0 && d.x >= LANE_X1 - .01) rowEnd(d);
}

function enterCard(d, card, r, c) {
  d.state = 'proc'; d.slot = c; d.x = slotX(c);
  const info = KINDS[card.kind];
  d.t = info.role === 'term' ? .12 : info.proc * (1 - .15 * (card.lvl - 1));
  card.hold = d.id; card.work = 1;
  if (card.kind === 'drum') d.roll = d.t + .05;
  if (card.kind === 'sorter') card.leverT = ((d.v >= 4) !== (card.mode === 1)) ? 0 : 1;
}

// the end of a row: its habitat's action, +10% per card in the row
function rowEnd(d) {
  const r = d.row, rk = S.rows[r], n = cardsInRow(r), boost = 1 + .1 * n;
  const sp = dieSpec(d);
  S.dice.splice(S.dice.indexOf(d), 1);
  S.stats.ended++;
  const x = LANE_X1 + 20, y = rowY(r);
  if (rk === 'armory') {
    // fired at the foe as a loose shot: half the pips, boosted by the row
    shootFrom(x, y, 'loose', [sp], .5 * boost, null, {dur: .55, arc: 50});
  } else if (rk === 'exchange') {
    const g = Math.ceil(sp.v / 3 * boost);
    S.gears += g; say(x, y - 24, `+${g} ⚙`, COL.gold, 14); burst(x, y, COL.gold, 6, 100, 2.5, -60, .4);
  } else {
    const b = Math.round(sp.v * .6 * boost);
    S.block += b; say(x, y - 24, `+${b} block`, COL.blk, 14); burst(x, y, COL.blk, 6, 100, 2.5, 0, .4);
  }
}

export function updateDice(dt) {
  deal();
  for (const d of S.dice.slice()) {
    d.pop = Math.max(0, d.pop - dt * 3.5);
    if (d.roll > 0) {
      d.roll -= dt; d.rollTick -= dt; d.rot = Math.sin(S.t * 26 + d.id) * .6;
      if (d.rollTick <= 0) { d.rollTick = .055; d.show = 1 + Math.floor(Math.random() * 6); }
      if (d.roll <= 0) { d.show = d.v; d.pop = 1; d.rot = 0; }
    } else d.rot *= Math.exp(-8 * dt);
    if (d.state === 'lane') { laneStep(d, dt); d.y = rowY(d.row); }
    else if (d.state === 'proc') {
      d.t -= dt;
      if (d.t <= 0) finishCard(d);
    } else if (d.state === 'move') {
      d.t += dt / .3;
      const k = Math.min(1, d.t);
      d.y = lerp(rowY(d.fromRow), rowY(d.toRow), easeOut(k)) - 26 * Math.sin(k * Math.PI);
      if (k >= 1) { d.row = d.toRow; d.state = 'lane'; d.y = rowY(d.row); }
    }
    if (d.hot && d.state === 'lane' && Math.random() < dt * 14)
      S.parts.push({x: d.x + (Math.random() - .5) * 12, y: d.y - 6, vx: 0, vy: -50, col: COL.ember, size: 2.2, g: -20, life: .4, t: 0, shape: 0, rot: 0, vr: 0});
  }
  emitAll();
}

// ---- what a card does with a die. Outputs: {spec, move: 0 (carry on) | 1 (change row) | 'all' (one per row)}
function finishCard(d) {
  const r = d.row, c = d.slot, card = cardAt(r, c);
  S.dice.splice(S.dice.indexOf(d), 1);
  if (!card) return;
  card.hold = null;
  gainXP(card, r, c);
  const info = KINDS[card.kind], v = d.v, sp = dieSpec(d), x = slotX(c), y = rowY(r) - 40;
  if (info.role === 'term') { consume(card, sp, r, c); return; }
  const out = [];
  const pop = o => Object.assign(o, {pop: true});
  switch (card.kind) {
    case 'sorter': out.push({spec: sp, move: ((v >= 4) !== (card.mode === 1)) ? 0 : 1}); break;
    case 'switch': out.push({spec: sp, move: card.mode ? 1 : 0}); break;
    case 'oddeven': out.push({spec: sp, move: v % 2 ? 0 : 1}); card.leverT = v % 2 ? 0 : 1; break;
    case 'alt': out.push({spec: sp, move: card.alt}); card.alt = 1 - card.alt; break;
    case 'prism': {
      const a = Math.ceil(v / 2), b = Math.floor(v / 2);
      out.push({spec: pop({...sp, v: a}), move: 0});
      if (b > 0) out.push({spec: pop({...sp, v: b}), move: 1});
      say(x, y, b ? `${a} + ${b}` : String(a), '#7fe0c6', 14);
      break;
    }
    case 'trisplit': {
      const third = Math.max(1, Math.round(v / 3));
      for (let rr = 0; rr < ROWS; rr++) out.push({spec: pop({...sp, v: third}), toRow: rr});
      say(x, y, `${third} × 3`, '#7fe0c6', 14);
      burst(x, rowY(r), '#7fe0c6', 10, 160, 2, 0, .3, 2);
      break;
    }
    case 'echo':
      out.push({spec: {...sp, echoed: true}, move: 0});
      if (v >= 5 && !sp.echoed) { out.push({spec: pop({...sp, echoed: true}), move: 1}); say(x, y, 'copy!', '#7fe0c6', 14); }
      break;
    case 'crusher': {
      const n = Math.min(6, v);
      for (let i = 0; i < n; i++) out.push({spec: pop({...sp, v: 1}), move: 0});
      say(x, y, `${n} × 1`, '#7fe0c6', 14);
      break;
    }
    case 'overflow': out.push({spec: sp, move: 'overflow'}); break;
    case 'forge': out.push({spec: pop({...sp, v: Math.min(v + 1 + card.lvl, 12), hot: true}), move: 0}); say(x, y, `+${1 + card.lvl} hot`, COL.hot, 14); break;
    case 'doubler': out.push({spec: v <= 3 ? pop({...sp, v: v * 2}) : sp, move: 0}); if (v <= 3) say(x, y, 'x2', '#7fe0c6', 14); break;
    case 'drum': { const nv = ri(1, 6); out.push({spec: pop({...sp, v: nv}), move: 0}); say(x, y, `${v} to ${nv}`, '#7fe0c6', 13); break; }
    case 'flipper': out.push({spec: pop({...sp, v: v <= 6 ? 7 - v : v}), move: 0}); break;
    case 'frost': out.push({spec: pop({...sp, v: Math.max(1, v - 1), ice: true, hot: false}), move: 0}); break;
    case 'spiker': out.push({spec: pop({...sp, spiky: true}), move: 0}); break;
    case 'inflate': out.push({spec: pop({...sp, v: Math.min(12, v + card.lvl)}), move: 0}); break;
    case 'grinder': {
      const got = v + card.lvl - 1;
      S.pips = Math.min(PIP_MAX, S.pips + got);
      out.push({spec: pop({...sp, v: 1}), move: 0});
      say(x, y, `+${got} ◆`, COL.pip, 14);
      break;
    }
    case 'pipforge': {
      const take = Math.min(3 + card.lvl, Math.floor(S.pips));
      S.pips -= take;
      out.push({spec: take ? pop({...sp, v: v + take}) : sp, move: 0});
      if (take) say(x, y, `◆+${take}`, COL.pip, 14);
      break;
    }
    case 'compressor': {
      card.stack.push(sp);
      if (card.stack.length < 3) break;
      const s3 = card.stack.splice(0), total = s3.reduce((a, q) => a + q.v, 0) + 2;
      out.push({spec: pop({v: total, hot: s3.some(q => q.hot), ice: s3.some(q => q.ice), spiky: s3.some(q => q.spiky), venom: s3.some(q => q.venom)}), move: 0});
      say(x, y, total >= MEGA ? `MEGA ${total}!` : `= ${total}`, total >= MEGA ? COL.gold : '#d9b8f2', total >= MEGA ? 18 : 14);
      break;
    }
    case 'venomvat': out.push({spec: pop({...sp, venom: true}), move: 0}); break;
    default: out.push({spec: sp, move: 0});
  }
  card.outQ.push(...out);
}

// a card lets its queued dice out one at a time, when there's room where they go
function emitAll() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < SLOTS; c++) {
    const card = cardAt(r, c);
    if (!card || !card.outQ.length || card.hold !== null) continue;
    const o = card.outQ[0], x = slotX(c) + 1;
    let to = r;
    if (o.toRow !== undefined) to = o.toRow;
    else if (o.move === 1) to = routeRow(card, r);
    else if (o.move === 'overflow') {
      // carry on if the row ahead has room, else change row
      const jam = S.dice.some(d => inRow(d, r) && d.x > x && d.x - x < GAP * 1.5 && d.wait > .3);
      to = jam ? routeRow(card, r) : r;
      card.leverT = to === r ? 0 : 1;
    }
    if (!roomAt(to, x)) continue;
    card.outQ.shift();
    const d = newDie(o.spec, r, x, to === r ? 'lane' : 'move');
    if (to !== r) { d.fromRow = r; d.toRow = to; d.t = 0; }
  }
}

// ============================================================ machine levels
export function gainXP(card, r, c) {
  card.turnProc++;
  if (card.lvl >= MAX_LVL || card.xpTurn >= XP_CAP) return;
  card.xpTurn++; card.xp++;
  if (card.xp >= LV_XP[card.lvl]) {
    card.lvl++; card.lvlFlash = 1.2;
    say(slotX(c), rowY(r) - 56, `${KINDS[card.kind].short} LEVEL ${card.lvl}!`, COL.gold, 17);
    ring(slotX(c), rowY(r), 'rgba(255,210,94,.95)', 16, 70, .6);
    S.slowT = .8;
  }
}

// ============================================================ terminals and shots
function consume(card, sp, r, c) {
  const x = slotX(c), y = rowY(r), hm = homeMult(card, r), lm = lvlMult(card);
  card.work = 1;
  switch (card.kind) {
    case 'cannon': shootCard(card, r, c, 'cannon', [sp], hm * lm); card.busy = .45; break;
    case 'pult': card.load = [sp]; card.wind = .35; card.busy = 1.4; break;
    case 'rico': shootCard(card, r, c, 'rico', [sp], hm * lm, {bounces: 2}); card.busy = .8; break;
    case 'sticky': shootCard(card, r, c, 'sticky', [sp], hm * lm, {arc: 120}); card.busy = .8; break;
    case 'gatling': card.mag.push(sp); card.busy = .05; break;
    case 'combo': card.load.push(sp); card.busy = .1; if (card.load.length >= 3) card.wind = .35; break;
    case 'rocket': card.load.push(sp); card.busy = .1; if (card.load.length >= 10) launchRocket(card, r, c); break;
    case 'meteor': card.load = [sp]; card.wind = .45; card.busy = 2.6; break;
    case 'catalyst': shootCard(card, r, c, 'catalyst', [sp], hm * lm, {arc: 60}); card.busy = 1.6; break;
    case 'sandblast': shootCard(card, r, c, 'sand', [sp], hm * lm, {arc: 20}); card.busy = .7; break;
    case 'pipgat': S.pips = Math.min(PIP_MAX, S.pips + sp.v); card.busy = .05; break;
    case 'rampart': {
      const use = Math.min(S.block, 10);
      S.block -= use;
      const flat = (use * 3 + sp.v) * hm * lm;
      shootCard(card, r, c, 'rampart', [sp], 1, {flat, arc: 90});
      if (use) say(x, y - 50, `−${use} block → ${fmtDmg(flat)}`, COL.blk, 13);
      card.busy = 1;
      break;
    }
    case 'bulwark': { const b = Math.round((sp.v + card.lvl - 1) * hm); S.block += b; say(x, y - 50, `+${b} block`, COL.blk, 14); card.busy = .25; break; }
    case 'thorns': { const t = Math.round(sp.v * hm); S.thorns += t; say(x, y - 50, `+${t} thorns`, '#d9b8f2', 14); card.busy = .25; break; }
    case 'parry': card.charges = Math.min(3, card.charges + 1); say(x, y - 50, `charge ${card.charges}/3`, COL.blk, 13); card.busy = .25; break;
    case 'patch': { const h = Math.ceil(sp.v / 2 * hm); S.hp = Math.min(S.maxHp, S.hp + h); say(x, y - 50, `+${h} repair`, COL.heal, 14); card.busy = .25; break; }
    case 'mint': { const g = Math.ceil(sp.v / 4 * hm) + card.lvl - 1; S.gears += g; say(x, y - 50, `+${g} ⚙`, COL.gold, 14); card.busy = .2; break; }
  }
}

function launchRocket(card, r, c) {
  if (!card.load.length) return;
  shootCard(card, r, c, 'rocket', card.load.slice(), 1.25 * homeMult(card, r) * lvlMult(card), {dur: 1.1, arc: 200});
  card.load = []; card.busy = 1.2; shake(.3);
}

// a shot from a card: at the front mite if there are any, else the foe
function shootCard(card, r, c, kind, dice, mult, o = {}) {
  card.fire = 1;
  shootFrom(slotX(c) + 30, rowY(r) - 8, kind, dice, mult, card, o);
}
function shootFrom(x0, y0, kind, dice, mult, src, o = {}) {
  const mite = S.mites.length ? frontMite(kind === 'pip' || kind === 'cannon' || kind === 'gatling' || kind === 'loose') : null;
  const tx = mite ? mite.x : FOE_X + rnd(-40, 40), ty = mite ? MITE_Y : FOE_Y + rnd(-40, 40);
  const dist = Math.hypot(tx - x0, ty - y0);
  S.proj.push({kind, dice, mult, src, mite, x0, y0, x1: tx, y1: ty, t: -(o.delay || 0), dur: o.dur ?? Math.max(.25, dist / 1100),
    arc: o.arc ?? 30, rot: 0, bounces: o.bounces || 0, flat: o.flat});
  S.stats.thrown += dice.length;
}
let spreadT = 0;
function frontMite(spread) {
  if (!S.mites.length) return null;
  if (!spread) return S.mites[0];
  spreadT = (spreadT + 1) % Math.min(3, S.mites.length);
  return S.mites[spreadT];
}

export function updateCards(dt) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < SLOTS; c++) {
    const card = cardAt(r, c);
    if (!card) continue;
    if (card.pop < 1) card.pop = Math.min(1, card.pop + dt / .3);
    card.busy = Math.max(0, card.busy - dt);
    card.work = Math.max(0, card.work - dt / .3);
    card.fire = Math.max(0, card.fire - dt / .4);
    card.lever = lerp(card.lever, card.leverT, 1 - Math.exp(-20 * dt));
    if (card.wind > 0) {
      card.wind -= dt;
      if (card.wind <= 0) {
        const hm = homeMult(card, r), lm = lvlMult(card);
        if (card.kind === 'pult') shootCard(card, r, c, 'pult', card.load, 2 * hm * lm, {dur: .9, arc: 170});
        else if (card.kind === 'meteor') {
          const d = card.load[0];
          shootCard(card, r, c, 'meteor', card.load, (d.v >= 8 ? d.v / 8 : 1 / d.v) * hm * lm, {dur: 1.1, arc: 220});
        } else if (card.kind === 'combo') {
          const vs = card.load.map(q => q.v).sort((a, b) => a - b);
          let m = 1, label = 'no combo';
          if (vs[0] === vs[2]) { m = 4; label = 'THREE OF A KIND x4'; }
          else if (vs[1] === vs[0] + 1 && vs[2] === vs[1] + 1) { m = 2.5; label = 'STRAIGHT x2.5'; }
          else if (vs[0] === vs[1] || vs[1] === vs[2]) { m = 1.5; label = 'PAIR x1.5'; }
          say(slotX(c), rowY(r) - 56, label, m > 1 ? COL.gold : '#c9d6da', 14);
          shootCard(card, r, c, 'cluster', card.load, m * hm * lm, {dur: .8, arc: 120});
        }
        card.load = [];
      }
    }
    if (card.kind === 'gatling' && card.mag.length) {
      card.shotT -= dt;
      if (card.shotT <= 0) { card.shotT = .1; shootCard(card, r, c, 'bullet', [card.mag.shift()], homeMult(card, r) * lvlMult(card), {arc: 6}); }
    }
    if (card.kind === 'pipgat' && S.pips >= 1) {
      card.shotT -= dt;
      if (card.shotT <= 0) { card.shotT = .08; S.pips -= 1; shootCard(card, r, c, 'pip', [{v: 1}], 2 * lvlMult(card), {arc: 4}); }
    }
  }
}

export function projPos(p) {
  const t = clamp(p.t / p.dur, 0, 1);
  return {x: lerp(p.x0, p.x1, t), y: lerp(p.y0, p.y1, t) - p.arc * 4 * t * (1 - t)};
}
export function updateProj(dt) {
  for (const p of S.proj.slice()) {
    p.t += dt;
    if (p.mite && S.mites.includes(p.mite)) { p.x1 = p.mite.x; }
    p.rot += dt * 10;
    if (p.t < p.dur) continue;
    S.proj.splice(S.proj.indexOf(p), 1);
    const q = projPos(p);
    S.curSrc = p.src || null;
    impact(p, q);
    S.curSrc = null;
  }
}

// ============================================================ damage
let lastClink = 0, lastMatch = -1;
export function diceDamage(dice, mult, vsSmall = false) {
  const ph = PHASES[S.foe.phase], f = S.foe, open = shellOpen(), armor = effArmor();
  let s = 0, clinked = 0, matched = 0;
  for (const d of dice) {
    let v = d.v * (d.spiky ? SPIKE : 1) * (d.v >= MEGA ? 1.5 : 1);
    if (!vsSmall && armor && !open && d.v < armor - (d.spiky ? 3 : 0)) { v = CLINK; clinked++; }
    if (!vsSmall && ph.meltdown && d.ice) v *= 2;
    if (!vsSmall && ph.locks) { if (f.locks.includes(d.v)) { v *= ph.match; matched++; } else v *= LOCK_MISS; }
    s += v;
  }
  if (open && !vsSmall) s *= 1.5;
  lastClink = clinked; lastMatch = ph.locks && !vsSmall ? matched : -1;
  return s * mult;
}

function credit(dmg) { if (S.curSrc) { S.curSrc.turnDmg += dmg; S.curSrc.totalDmg += dmg; } }

export function hurtFoe(dmg, o = {}) {
  const f = S.foe;
  if (S.over || dmg <= 0) return;
  credit(dmg);
  if (S.enc === 'dummy') { S.stats.dmg += dmg; S.practice = (S.practice || 0) + dmg; f.hit = .15; if (!o.quiet) say(FOE_X + rnd(-30, 30), FOE_Y - 60, fmtDmg(dmg), '#ffd0c4', 16); return; }
  f.hp = Math.max(0, f.hp - dmg); f.hit = .15; if (!o.quiet) f.flash = 1;
  S.stats.dmg += dmg;
  if (!o.quiet) say(FOE_X + rnd(-40, 40), FOE_Y - 70 + rnd(-20, 20), fmtDmg(dmg), '#ff8a73', Math.min(34, 16 + dmg * .4));
  if (f.hp <= 0) killFoe();
}
function hurtMite(m, dmg) {
  if (!S.mites.includes(m)) return;
  credit(Math.min(dmg, m.hp));
  m.hp -= dmg; m.hit = .15;
  if (m.hp <= 0) {
    S.mites.splice(S.mites.indexOf(m), 1); S.stats.mites++; S.gears += 1;
    burst(m.x, MITE_Y, '#b0845c', 10, 160, 3, 400, .5, 1);
  }
}

function impact(p, q) {
  if (S.over) return;
  const f = S.foe, dice = p.dice || [];
  if (p.mite) {
    const m = S.mites.includes(p.mite) ? p.mite : S.mites[0];
    if (m) {
      const venom = dice.filter(d => d.venom).reduce((a, d) => a + d.v, 0);
      const dmg = (p.flat ?? diceDamage(dice, p.kind === 'sticky' ? 4 : p.mult, true)) + venom;
      hurtMite(m, dmg);
      if (p.kind === 'rocket' || p.kind === 'meteor' || p.kind === 'cluster' || p.kind === 'pult')
        for (const o of S.mites.slice(0, 4)) if (o !== m) hurtMite(o, dmg * .5);
      burst(q.x, q.y, '#ffe27a', 8, 180, 2.5, 0, .25, 2);
      return;
    }
  }
  if (p.kind === 'pip') {
    let pd = 1;
    if (effArmor() > 1 && !shellOpen()) pd = .15;
    if (PHASES[f.phase].locks) pd *= LOCK_MISS;
    hurtFoe(pd, {quiet: true});
    return;
  }
  const lockF = PHASES[f.phase].locks ? f.locks : null;
  const venom = dice.filter(d => d.venom).reduce((a, d) => a + d.v * (lockF && !lockF.includes(d.v) ? LOCK_MISS : 1), 0);
  if (venom) { f.poison = Math.min(300, f.poison + venom); say(q.x + 40, q.y - 40, `+${Math.round(venom)} ☠`, COL.venom, 14); }
  if (p.kind === 'catalyst' && f.poison > 0) { f.poison = Math.min(150, f.poison * 1.5); say(q.x, q.y - 80, `CATALYZED ☠ ${Math.round(f.poison)}`, COL.venom, 17); }
  if (p.kind === 'sand' && dice[0] && dice[0].v <= 2 && (PHASES[f.phase].armor || 0) > f.shred) { f.shred++; say(q.x, q.y - 80, `−1 ARMOR (${effArmor()})`, '#d8c79a', 16); }
  if (p.kind === 'sticky') { f.bombs.push({d: dice[0], mult: 4 * (p.mult || 1), ox: rnd(-50, 50), oy: rnd(-60, 40)}); say(q.x, q.y - 30, 'stuck!', '#ffb0a0', 14); return; }
  let dmg;
  if (p.flat !== undefined) dmg = lockF ? p.flat * (lockF.includes(dice[0].v) ? PHASES[f.phase].match : LOCK_MISS) : p.flat;
  else dmg = diceDamage(dice, p.mult);
  if (lastClink && p.flat === undefined) say(q.x - 30, q.y - 10, 'clink', '#c9d6da', 12);
  if (lastMatch > 0) say(q.x - 30, q.y - 90, 'MATCH!', '#8fe08f', 17);
  if (shellOpen() && p.flat === undefined) say(q.x - 30, q.y - 90, 'EXPOSED!', COL.gold, 15);
  const melt = PHASES[f.phase].meltdown;
  if (dice.some(d => d.hot) && !melt) f.burn = Math.max(f.burn, 2);
  hurtFoe(dmg);
  if (p.kind === 'rico' && p.bounces > 0) {
    S.proj.push({...p, x0: q.x, y0: q.y, x1: FOE_X + rnd(-40, 40), y1: FOE_Y + rnd(-40, 40), t: 0, dur: .4, arc: 70, mult: p.mult * .5, bounces: p.bounces - 1});
  }
  burst(q.x, q.y, p.kind === 'rocket' ? COL.gold : '#ffe27a', p.kind === 'rocket' ? 30 : 10, 260, 3, 0, .35, 2);
  if (p.kind === 'rocket' || p.kind === 'meteor') { ring(q.x, q.y, 'rgba(255,240,200,.9)', 20, 120, .5); shake(.6); }
  else shake(p.kind === 'pult' || p.kind === 'cluster' ? .2 : .05);
}

function killFoe() {
  if (S.over) return;
  S.over = 'won'; S.foe.hp = 0; S.mites = [];
  burst(FOE_X, FOE_Y, COL.gold, 60, 420, 5, 300, 1, 1); shake(1);
}

// ============================================================ the foe's turn
function hitYou(dmg, what) {
  if (dmg <= 0) return;
  const soak = Math.min(S.block, dmg);
  S.block -= soak;
  const left = dmg - soak;
  if (soak) say(560, 560 - 470, `blocked ${Math.round(soak)}`, COL.blk, 15);
  if (left > 0) {
    if (!opts.god) S.hp = Math.max(0, S.hp - left);
    S.hitFlash = 1; shake(.5);
    say(90, 60, `-${Math.round(left)} ${what || ''}`, COL.drop, 20);
    if (S.hp <= 0) S.over = 'lost';
  }
}

function spawnMites(n) {
  const ph = PHASES[S.foe.phase];
  for (let i = 0; i < n; i++) {
    const big = ph.bigEvery && (S.nextMite % ph.bigEvery === 0);
    const hp = (ph.miteHp || 7) * (big ? 2.5 : 1);
    S.mites.push({id: S.nextMite++, hp, max: hp, big, bite: big ? 3 : 1, hit: 0, x: 0});
  }
  layoutMites();
  say(FOE_X, FOE_Y - 120, `BROOD ×${n}`, '#ffb0a0', 20);
}
export function layoutMites() { S.mites.forEach((m, i) => { m.x = 956 + (i % 8) * 34 + (i >= 8 ? 17 : 0); }); }

// one step of the foe's turn (the view animates around it)
function foeTurn() {
  const f = S.foe, ph = PHASES[f.phase];
  if (S.enc === 'dummy') return;
  // poison: half the stacks, then it fades
  if (f.poison >= 1) { const pd = f.poison * .5; hurtFoe(pd, {quiet: true}); say(FOE_X + 70, FOE_Y + 40, `☠ ${fmtDmg(pd)}`, COL.venom, 16); f.poison = Math.max(0, f.poison * .6 - 1); }
  if (f.burn > 0) { hurtFoe(6, {quiet: true}); say(FOE_X - 70, FOE_Y + 40, '🔥 6', COL.ember, 15); f.burn--; }
  for (const b of f.bombs) hurtFoe(diceDamage([b.d], b.mult));
  if (f.bombs.length) { burst(FOE_X, FOE_Y, COL.gold, 30, 300, 4, 200, .6); shake(.4); }
  f.bombs = [];
  if (S.over) return;
  // mites gnaw
  const bites = S.mites.reduce((a, m) => a + m.bite, 0);
  if (bites) {
    hitYou(bites, 'mites');
    if (S.thorns > 0) for (const m of S.mites.slice()) hurtMite(m, S.thorns * .25);
  }
  // the intent
  if (f.stun > 0) { f.stun--; say(FOE_X, FOE_Y - 120, 'STUNNED', '#7fe0c6', 20); }
  else if (ph.intents.length) {
    f.count--;
    if (f.count <= 0) {
      const it = curIntent();
      S.acted = it;
      f.lunge = 1;
      if (it.type === 'slam' || it.type === 'rocks') {
        const parry = it.type === 'slam' ? S.slots.find(c => c && c.kind === 'parry' && c.charges >= 3) : null;
        if (parry) {
          parry.charges = 0; f.stun = 1; hurtFoe(15);
          say(560, 90, 'PARRY!', '#ffffff', 30); shake(.6);
        } else {
          if (S.thorns > 0) { hurtFoe(S.thorns); say(FOE_X, FOE_Y + 60, `thorns ${S.thorns}`, '#d9b8f2', 15); S.thorns = Math.floor(S.thorns / 2); }
          hitYou(it.type === 'slam' ? it.dmg : it.dmg * it.n, it.type === 'slam' ? 'slam' : 'rocks');
        }
      } else if (it.type === 'brood') spawnMites(it.n);
      else if (it.type === 'bury') {
        const filled = [];
        for (let i = 0; i < S.slots.length; i++) if (S.slots[i] && !S.buried.has(i)) filled.push(i);
        for (let k = 0; k < it.n && filled.length; k++) { const i = filled.splice(ri(0, filled.length - 1), 1)[0]; S.buried.set(i, 2); }
        say(560, 90, 'BURIED!', '#ffb0a0', 22);
      }
      setIntent(f.intent + 1);
    }
  }
  // buried slots dig themselves out
  for (const [i, t] of [...S.buried]) { if (t <= 1) S.buried.delete(i); else S.buried.set(i, t - 1); }
  // armor regrows
  if (f.shred > 0) f.shred--;
  // the lock turns
  if (ph.locks) { f.locks = f.nextLocks; f.nextLocks = rollLocks(ph.locks); }
  // phase change
  const nx = PHASES[f.phase + 1];
  if (nx && f.hp / f.max <= nx.at) {
    f.phase++; f.enraged = f.phase >= 2;
    S.gears += 15;
    setIntent(0);
    if (PHASES[f.phase].locks) { f.locks = rollLocks(PHASES[f.phase].locks); f.nextLocks = rollLocks(PHASES[f.phase].locks); }
    S.banner = {title: `PHASE ${f.phase + 1} · ${PHASES[f.phase].name}`, desc: PHASES[f.phase].desc, t: 0, life: 5};
  }
}

// ============================================================ turns
// Plan (nothing moves) → Run (your rows work, hands off, up to 12 s) → Foe turn → plan.
export function beginTurn(first = false) {
  if (!first) { S.turn++; S.block = 0; }   // block lasts one foe turn (Spire-style)
  S.tphase = 'plan'; S.skip = false; S.acted = null;
  for (const c of S.slots) if (c) { c.xpTurn = 0; }
  if (first) S.banner = {title: FOES[S.enc].name, desc: 'Plan your rows, then RUN and watch them work.', t: 0, life: 4};
  // the roll: dealt evenly across the rows, or all into the row you pick
  S.roll = [];
  for (let i = 0; i < PHASES[S.foe.phase].roll; i++) S.roll.push(ri(1, 6));
}
export function startRun() {
  if (S.tphase !== 'plan' || S.over) return;
  S.roll.forEach((v, i) => S.queue[opts.deal === 'pick' ? S.pickRow : i % ROWS].push(v));
  S.roll = [];
  S.tphase = 'run'; S.runT = 0; S.idleT = 0;
  S.turnStart = {dmg: S.stats.dmg, thrown: S.stats.thrown, mites: S.stats.mites, gears: S.gears, block: S.block};
  for (const c of S.slots) if (c) { c.turnDmg = 0; c.turnProc = 0; }
}
function lineBusy() {
  if (S.proj.length || S.queue.some(q => q.length)) return true;
  if (S.dice.some(d => d.state !== 'lane' || d.wait < .3)) return true;
  for (const c of S.slots) if (c && (c.wind > 0 || c.mag.length || c.outQ.length || (c.kind === 'pipgat' && S.pips >= 1))) return true;
  return false;
}
function endRun() {
  // rockets launch whatever they hold
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < SLOTS; c++) { const card = cardAt(r, c); if (card && card.kind === 'rocket' && card.load.length >= 3) launchRocket(card, r, c); }
  const st = S.turnStart;
  const dmg = S.stats.dmg - st.dmg;
  S.banner = {title: `TURN ${S.turn} · ${fmtDmg(dmg)} damage`, desc: `+${S.gears - st.gears} ⚙ · +${Math.max(0, S.block - st.block)} block${S.stats.mites - st.mites ? ` · ${S.stats.mites - st.mites} mites` : ''}`, t: 0, life: 3, small: true};
  S.tphase = 'foe'; S.foeT = FOE_TURN; S.foeActed = false;
}
export function update(rawDt) {
  S.slowT = Math.max(0, S.slowT - rawDt);
  S.timeScale = lerp(S.timeScale, S.slowT > 0 ? .35 : 1, 1 - Math.exp(-10 * rawDt));
  const dt = rawDt * S.timeScale * opts.speed * (S.skip && S.tphase !== 'plan' ? 5 : 1);
  S.t += dt;
  S.shake = Math.max(0, S.shake - rawDt * 2.4);
  S.hitFlash = Math.max(0, S.hitFlash - rawDt * 2);
  updateFx(dt);
  if (S.paused || S.picker) return;
  if (S.banner) { S.banner.t += rawDt; if (S.banner.t > S.banner.life) S.banner = null; }
  const f = S.foe;
  f.flash = Math.max(0, f.flash - dt * 6); f.hit = Math.max(0, f.hit - dt); f.lunge = Math.max(0, f.lunge - dt * 2.5);
  for (const m of S.mites) m.hit = Math.max(0, m.hit - dt);
  for (const c of S.slots) if (c) c.lvlFlash = Math.max(0, c.lvlFlash - dt);
  if (S.over) { updateProj(dt); return; }
  if (S.tphase === 'plan') return;
  if (S.tphase === 'run') {
    S.runT += dt;
    updateCards(dt); updateDice(dt); updateProj(dt);
    S.idleT = lineBusy() ? 0 : S.idleT + dt;
    if (S.idleT > .5 || S.runT > RUN_MAX) endRun();
    return;
  }
  // the foe's turn: it acts halfway through, so you see it coming
  S.foeT -= dt;
  updateProj(dt);
  if (!S.foeActed && S.foeT < FOE_TURN * .6) { S.foeActed = true; foeTurn(); }
  if (S.foeT <= 0 && !S.over) beginTurn();
}
function updateFx(dt) {
  const keep = [];
  for (const p of S.parts) { p.t += dt; if (p.t >= p.life) continue; p.vy += p.g * dt; const k = Math.exp(-2.2 * dt); p.vx *= k; p.vy *= k; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; keep.push(p); }
  S.parts = keep;
  for (const t of S.texts.slice()) { t.t += dt; if (t.t >= t.life) S.texts.splice(S.texts.indexOf(t), 1); }
}

// ============================================================ layouts and headless play
// A board as text: tokens `rc` + kind + dir (U/D), joined by '.', e.g. "00forgeD.05cannonD.11sorterU".
// Row kinds as a prefix "rows:armory,exchange,masonry|" (optional).
export function encodeLayout() {
  const toks = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < SLOTS; c++) { const card = cardAt(r, c); if (card) toks.push(`${r}${c}${card.kind}${card.dir}`); }
  return `rows:${S.rows.join(',')}|${toks.join('.')}`;
}
export function applyLayout(str) {
  let body = String(str || '');
  if (body.startsWith('rows:')) { const [head, rest] = body.split('|'); const rk = head.slice(5).split(','); if (rk.length === ROWS && rk.every(k => ROW_KINDS[k])) S.rows = rk; body = rest || ''; }
  S.slots = S.slots.map(() => null); S.dice = []; S.queue = S.queue.map(() => []);
  for (const tok of body.split('.').filter(Boolean)) {
    const m = tok.match(/^(\d)(\d)([a-z]+)([UD])$/);
    if (!m || !KINDS[m[3]] || +m[1] >= ROWS || +m[2] >= SLOTS) continue;
    S.slots[idx(+m[1], +m[2])] = makeCard(m[3], m[4]);
  }
}
export const layoutCost = str => String(str).split('|').pop().split('.').filter(Boolean).reduce((a, t) => {
  const m = t.match(/^(\d)(\d)([a-z]+)([UD])$/); return a + (m && KINDS[m[3]] ? slotCost(m[3], +m[2]) : 0);
}, 0);

export function playFight({foe = 'colossus', layout = '', seed = 1, maxTurns = 25, dt = 1 / 20, deal = 'even', pickRow = 0} = {}) {
  setSeed(seed);
  opts.free = true; opts.god = false; opts.speed = 1; opts.deal = deal;
  newGame();
  chooseFoe(foe);
  applyLayout(layout);
  S.pickRow = pickRow;
  while (!S.over && S.turn <= maxTurns) {
    startRun();
    let g = 0;
    while (S.tphase !== 'plan' && !S.over && g++ < 3000) update(dt);
    if (g >= 3000) break;
  }
  const f = S.foe;
  return {foe, won: S.over === 'won', lost: S.over === 'lost', turns: S.turn, foeHpFrac: Math.max(0, f.hp / f.max),
    factoryHp: S.hp, maxHp: S.maxHp, dmg: Math.round(S.stats.dmg), thrown: S.stats.thrown,
    byCard: Object.fromEntries(S.slots.map((c, i) => c && c.totalDmg ? [`${c.kind}@${Math.floor(i / SLOTS)}${i % SLOTS}`, Math.round(c.totalDmg)] : null).filter(Boolean))};
}

export const STARTER = 'rows:armory,exchange,masonry|00forgeD.01sorterD.03pultD.05cannonD.11doublerD.14mintD.21bulwarkD';
