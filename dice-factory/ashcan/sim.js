// Dice Factory: the simulation.
// Every rule of the game lives here, with no drawing and no DOM, so the same
// code runs in the browser (view.js draws it and handles input) and in Node
// (sim/run.mjs plays games headless, sim/climb.mjs hill-climbs builds).
// Positions are in board space: 1280 wide, 720 tall (600 on phones).

export const W = 1280;
export let H = 720;
export const CELL = 64, HC = CELL / 2, GW = 9, GH = 6, GX = 24;
export let GY = 104, GROUND = GY + GH * CELL;
export const WALL_X0 = 612, WALL_X1 = 690, FIELD_X1 = 1258;
export const REACH_X = WALL_X1 + 8;
export const BLUNDER_RANGE = 230;           // Blunderbuss is strong while the foe is this close
// phones use a shorter board (call before newGame)
export function setLayout(phone) {
  H = phone ? 600 : 720; GY = phone ? 56 : 104; GROUND = GY + GH * CELL;
}

// Seeded randomness: the same seed plays out the same game.
let seed = (Math.random() * 2 ** 32) >>> 0;
export function setSeed(s) { seed = s >>> 0; }
export function rand() {                    // mulberry32
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const BELT_SPEED = 150;
export const ROLL_EVERY = 4.2, ROLL_COUNT = 6, HOPPER_MAX = 10;
export const WALL_COLS = 3, WALL_ROWS = 15, BRICK = 24;
export const JAM_TIME = 0.8;

export const R = {x: 1, y: 0}, D = {x: 0, y: 1}, L = {x: -1, y: 0}, U = {x: 0, y: -1};
export const rotCW = d => ({x: -d.y, y: d.x});
export const neg = d => ({x: -d.x, y: -d.y});
export const deq = (a, b) => a.x === b.x && a.y === b.y;
export const add = (a, b) => ({x: a.x + b.x, y: a.y + b.y});
export const key = c => c.x + ',' + c.y;
export const inGrid = c => c.x >= 0 && c.y >= 0 && c.x < GW && c.y < GH;
export const center = c => ({x: GX + c.x * CELL + HC, y: GY + c.y * CELL + HC});
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpP = (a, b, t) => ({x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t)});
export const bez = (p0, c, p1, t) => { const u = 1 - t; return {x: u*u*p0.x + 2*u*t*c.x + t*t*p1.x, y: u*u*p0.y + 2*u*t*c.y + t*t*p1.y}; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeOutBack = t => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const rnd = (a, b) => a + rand() * (b - a);
export const ri = (a, b) => Math.floor(rnd(a, b + 1));
export function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

export const COL = {
  bg: '#0f2d38', floor: '#16394a', tile: '#1d4659', tile2: '#1a4254', card: '#f7f0e1', ink: '#2b2620',
  route: '#2fae92', mod: '#a66ad6', weapon: '#e2533d', defense: '#3d8be0', pool: '#e0a214', venom: '#7ac943', pip: '#f2c14e',
  hot: '#ffc2a6', ember: '#ff7a2f', ice: '#c9ecff', drop: '#ff5a4a', blk: '#8cc2ff', gold: '#ffd25e', heal: '#7fe08a',
  ground: '#3a4a33', grass: '#46593c',
};
export const TINT = {route: '#d8f0ea', mod: '#eedff8', weapon: '#fde3d8', defense: '#dfeafa', pool: '#fbefc8'};
export const CAT_LABEL = {route: 'ROUTE & SPLIT', mod: 'MODIFY', weapon: 'WEAPONS', defense: 'DEFENSE', pool: 'COMPANIES'};

// ============================================================ parts
// role: source | manip (takes a die, sends dice out) | term (eats the die)
// proc: seconds a manipulator holds the die
export const KINDS = {
  // ---------------------------------------------------- routing and splitting
  chute:   {cat: 'route', role: 'source', name: 'Dice Chute', short: 'Chute', text: 'Rolls 6 dice into its hopper every few seconds. More chutes, more dice.'},
  sorter:  {cat: 'route', role: 'manip', proc: .15, name: 'Sorting Gate', short: 'Hi / Lo', text: '4-6 straight, 1-3 turn right. Click to swap.'},
  switch:  {cat: 'route', role: 'manip', proc: .1, name: 'Track Switch', short: 'Switch', text: 'Every die goes the lit way. Click to flip.'},
  oddeven: {cat: 'route', role: 'manip', proc: .15, name: 'Odd / Even Gate', short: 'Odd Even', text: 'Odd dice straight, even dice turn right.'},
  alt:     {cat: 'route', role: 'manip', proc: .1, name: 'Ping-Pong', short: 'Ping-Pong', text: 'Alternates: straight, right, straight, right.'},
  coin:    {cat: 'route', role: 'manip', proc: .2, name: 'Coin Flip', short: 'Coin Flip', text: 'Heads straight, tails right. Pure luck.'},
  prism:   {cat: 'route', role: 'manip', proc: .3, name: 'Prism Splitter', short: 'Prism', text: 'Splits a die in two: half the pips go straight, the rest turn right.'},
  crusher: {cat: 'route', role: 'manip', proc: .35, name: 'Crusher', short: 'Crusher', text: 'Smashes a die into that many 1s (up to 6). A swarm.'},
  echo:    {cat: 'route', role: 'manip', proc: .3, name: 'Echo Splitter', short: 'Echo', text: 'A 5 or 6 is copied out of its right side (once per die).'},
  overflow:{cat: 'route', role: 'manip', proc: .05, name: 'Overflow Valve', short: 'Overflow', text: 'Straight on, unless that way is blocked: then right.'},
  fuser:   {cat: 'route', role: 'manip', proc: .3, name: 'Fuser', short: 'Fuser', text: 'Holds one die, fuses the next into it: pips add up.'},
  silo:    {cat: 'route', role: 'manip', proc: .05, name: 'Silo', short: 'Silo', text: 'Stores up to 8 dice. Click to hold them back, click again to flood.'},
  bounce:  {cat: 'route', role: 'manip', proc: .12, name: 'Bounce Pad', short: 'Bounce', text: 'Flings the die two tiles ahead, over whatever is between.'},
  // ---------------------------------------------------- modifiers
  forge:   {cat: 'mod', role: 'manip', proc: .32, name: 'Ember Forge', short: 'Forge', text: '+2 pips. Hot: sets the foe on fire.'},
  doubler: {cat: 'mod', role: 'manip', proc: .32, name: 'Doubling Press', short: 'Doubler', text: 'Doubles a 1, 2 or 3.'},
  drum:    {cat: 'mod', role: 'manip', proc: .32, name: 'Tumble Drum', short: 'Reroll', text: 'Rerolls the die.'},
  flipper: {cat: 'mod', role: 'manip', proc: .25, name: 'Flipper', short: 'Flipper', text: 'Turns the die over: 1 becomes 6, 2 becomes 5.'},
  frost:   {cat: 'mod', role: 'manip', proc: .32, name: 'Frost Coat', short: 'Frost', text: '-1 pip, but icy: hits slow the foe and its windup.'},
  spiker:  {cat: 'mod', role: 'manip', proc: .32, name: 'Spike Lathe', short: 'Spikes', text: 'Spiky dice hit 25% harder and ignore 3 points of armor.'},
  inflate: {cat: 'mod', role: 'manip', proc: .25, name: 'Inflator', short: 'Inflate', text: '+1 pip, up to 12. Loop dice through it.'},
  // ---------------------------------------------------- weapons
  pult:    {cat: 'weapon', role: 'term', name: 'Dice-a-pult', short: 'Pult', text: 'Lobs a die: pips x2. Slow to reload.'},
  cannon:  {cat: 'weapon', role: 'term', name: 'Dice Cannon', short: 'Cannon', text: 'Fires a die: pips damage. Quick.'},
  rocket:  {cat: 'weapon', role: 'term', name: 'Dice Rocket', short: 'Rocket', text: 'Packs 10 dice, launches them all. Big shove. Click to launch early.'},
  gatling: {cat: 'weapon', role: 'term', name: 'Dice Gatling', short: 'Gatling', text: 'Drum of 8 dice. Spins up and sprays them.'},
  combo:   {cat: 'weapon', role: 'term', name: 'Combo Cannon', short: 'Combo', text: 'Loads 3. Pair x1.5, straight x2.5, three of a kind x4.'},
  blunder: {cat: 'weapon', role: 'term', name: 'Blunderbuss', short: 'Blunder', text: 'Loads 3, blasts them together. x2 up close, weak far away.'},
  harpoon: {cat: 'weapon', role: 'term', name: 'Harpoon', short: 'Harpoon', text: 'Pins the foe in place for pips x0.6 seconds.'},
  mines:   {cat: 'weapon', role: 'term', name: 'Mine Mortar', short: 'Mines', text: 'Plants the die in the foe’s path. Blows up for pips x3.'},
  lens:    {cat: 'weapon', role: 'term', name: 'Burning Lens', short: 'Lens', text: 'Each die feeds a beam that burns while fuel lasts.'},
  rico:    {cat: 'weapon', role: 'term', name: 'Ricochet Sling', short: 'Ricochet', text: 'The die bounces off the foe and back again: 3 hits (full, half, a quarter).'},
  slots:   {cat: 'weapon', role: 'term', name: 'Slot Machine', short: 'Slots', text: 'Loads 3 and rerolls them. Three alike x8. Pair x2. Else x0.5.'},
  sticky:  {cat: 'weapon', role: 'term', name: 'Sticky Bomb', short: 'Sticky', text: 'Sticks to the foe, blows up 2 s later for pips x4.'},
  // ---------------------------------------------------- defense
  bulwark: {cat: 'defense', role: 'term', name: 'Bulwark', short: 'Bulwark', text: 'Stacks the die into your dice wall. Bricks soak hits.'},
  thorns:  {cat: 'defense', role: 'term', name: 'Thorn Garden', short: 'Thorns', text: 'Plants spiky dice by the wall. Every slam hurts the foe back.'},
  parry:   {cat: 'defense', role: 'term', name: 'Parry Shield', short: 'Parry', text: 'Dice charge it (3 max). Space raises it: block a slam to stun the foe.'},
  patch:   {cat: 'defense', role: 'term', name: 'Patch Bay', short: 'Patch', text: 'Repairs the factory: half the pips.'},
  ram:     {cat: 'defense', role: 'term', name: 'Piston Ram', short: 'Ram', text: 'Holds a die until the foe is close, then shoves it back hard.'},
  cryo:    {cat: 'defense', role: 'term', name: 'Cryo Vent', short: 'Cryo', text: 'Chills the foe: slower walk and windup for pips x0.7 s.'},
  // ---------------------------------------------------- economy
  mint:    {cat: 'mod', role: 'term', name: 'Gear Mint', short: 'Mint', text: 'Turns a die into gears: a quarter of its pips, rounded up. Big dice pay more.'},
  // ---------------------------------------------------- companies
  // Each build pool is a supplier with its own parts (see COMPANIES).
  // Grindwell & Sons: strip dice down into pips (◆, a tank shared by the factory)
  grinder:   {cat: 'pool', pool: 'grind', role: 'manip', proc: .3, name: 'Grinder', short: 'Grinder', text: 'Grinds a die into its pips (into the pip tank ◆) and lets a 1 go on.'},
  pipgat:    {cat: 'pool', pool: 'grind', role: 'term', name: 'Pip Gatling', short: 'Pip Gatling', text: 'Sprays pips from the tank: 2 dmg to mites and flyers, 1 to the foe. Dice fed in become pips. Armor stops pips.'},
  sandblast: {cat: 'pool', pool: 'grind', role: 'term', name: 'Sandblaster', short: 'Sandblast', text: 'A 1 or 2 strips 1 armor off the foe (it grows back 1 every 6 s). Bigger dice just hit. Feed it from a Grinder.'},
  // Titan Foundry Co.: pump one die huge
  pipforge:  {cat: 'pool', pool: 'mega', role: 'manip', proc: .3, name: 'Pip Forge', short: 'Pip Forge', text: 'Pours up to 4 pips from the pip tank into each die. Fill the tank with a Grindwell Grinder.'},
  compressor:{cat: 'pool', pool: 'mega', role: 'manip', proc: .35, name: 'Compressor', short: 'Compress', text: 'Squeezes 3 dice into one: their total +2. Dice of 15+ become crowned Mega dice (x1.5).'},
  meteor:    {cat: 'pool', pool: 'mega', role: 'term', name: 'Meteor', short: 'Meteor', text: 'Damage = pips² ÷ 8 with a little splash. Under 8 pips it fizzles for 1. Slow.'},
  // Viper Chemical: stack poison on the foe
  venomvat:  {cat: 'pool', pool: 'venom', role: 'manip', proc: .3, name: 'Venom Vat', short: 'Venom Vat', text: 'Coats the die. Hits stack poison = pips. Poison ticks, fades slowly and ignores armor.'},
  catalyst:  {cat: 'pool', pool: 'venom', role: 'term', name: 'Catalyst Cannon', short: 'Catalyst', text: 'Hits for the pips and multiplies the poison on the foe by 1.5.'},
  // Bastion Masonry: your wall is ammo
  rampart:   {cat: 'pool', pool: 'fortress', role: 'term', name: 'Rampart Cannon', short: 'Rampart', text: 'Each die fires the top brick of your dice wall: 3x its HP + the die. Build the wall with a Bulwark.'},
  furnace: {cat: 'route', role: 'term', fixed: true, hidden: true, name: 'Gear Furnace', short: 'Furnace', text: 'Part of the floor. Melts a die into gears: a third of its pips, rounded up. Route dice here to earn.'},
};
// What each part costs in gears. Belts are free, so re-routing never costs.
export const COST = {
  chute: 40, sorter: 3, switch: 3, oddeven: 3, alt: 3, coin: 2, prism: 5, crusher: 5, echo: 6, overflow: 3, fuser: 5, silo: 4, bounce: 3,
  forge: 5, doubler: 4, drum: 2, flipper: 3, frost: 4, spiker: 5, inflate: 4, mint: 6,
  pult: 6, cannon: 6, rocket: 12, gatling: 10, combo: 8, blunder: 8, harpoon: 7, mines: 8, lens: 9, rico: 7, slots: 7, sticky: 8,
  bulwark: 5, thorns: 6, parry: 8, patch: 6, ram: 7, cryo: 6,
  grinder: 4, pipgat: 9, sandblast: 6, pipforge: 6, compressor: 6, meteor: 10, venomvat: 5, catalyst: 8, rampart: 8,
};
// The suppliers. Each sells the parts of one build pool; later, a run could
// have you sign contracts with them.
export const COMPANIES = {
  grind:    {name: 'Grindwell & Sons', short: 'Grindwell', mark: 'G', col: '#b8892e', ink: '#fff6e0', motto: 'Every pip counts.'},
  mega:     {name: 'Titan Foundry Co.', short: 'Titan', mark: 'T', col: '#c0392b', ink: '#ffe07a', motto: 'Bigger is better.'},
  venom:    {name: 'Viper Chemical', short: 'Viper', mark: 'V', col: '#4f8f2a', ink: '#e4ffcc', motto: 'Slow, sure, deadly.'},
  fortress: {name: 'Bastion Masonry', short: 'Bastion', mark: 'B', col: '#2f5f9e', ink: '#dfeaff', motto: 'The wall is the weapon.'},
};

export const START_GEARS = 40, BUILD_TIME = 60, PHASE_BONUS = 15;
export const PIP_MAX = 99;      // the pip tank ◆
export const MEGA = 15;         // dice this big are crowned Mega dice: x1.5
export const LOCK_MISS = .1;    // the Lockbox shrugs off dice that don't show its face
export const CLINK = .2;        // what a die too small for the armor still does
export const SPIKE = 1.25;      // spiky dice hit this much harder (and ignore 3 armor)
// damage numbers on screen: whole numbers, or one decimal for scratches
export const fmtDmg = d => d >= 1 ? String(Math.round(d)) : d.toFixed(1);
export const CATS = ['route', 'mod', 'weapon', 'defense', 'pool'];
export const PALETTE = {};
for (const c of CATS) PALETTE[c] = Object.keys(KINDS).filter(k => KINDS[k].cat === c && !KINDS[k].hidden);

// The floor itself: stone pillars to route around, vents that change dice
// riding a belt over them, and the Gear Furnace (fixed) to route dice into.
export const PILLARS = [{x: 3, y: 0}, {x: 3, y: 4}, {x: 6, y: 2}, {x: 5, y: 5}];
export const VENTS = [{x: 4, y: 1, type: 'hot'}, {x: 5, y: 3, type: 'lucky'}, {x: 2, y: 4, type: 'ice'}, {x: 7, y: 0, type: 'lucky'}];
export const FURNACE = {x: 8, y: 5};
export const VENT_INFO = {hot: {name: 'heat vent', col: '#ff7a2f'}, ice: {name: 'ice vent', col: '#9fdcff'}, lucky: {name: 'lucky clover', col: '#6fd16f'}};
export const CLICKY = new Set(['sorter', 'switch', 'silo', 'rocket', 'parry']);

// The Colossus changes as it breaks down. Each phase asks for a different
// factory: `good` lists the parts that answer it (starred in the palette).
export const COLOSSUS_PHASES = [
  {name: 'Iron March', at: 1.0, speed: 9, roll: 6, flyEvery: 0,
   desc: 'Slams and rocks. Build damage and a dice wall.',
   good: ['pult', 'cannon', 'combo', 'bulwark', 'parry', 'rampart', 'venomvat'],
   intents: [{type: 'slam', dmg: 10, wind: 2.6}, {type: 'rocks', dmg: 4, n: 3, wind: 2.2}, {type: 'slam', dmg: 14, wind: 3.0}]},
  {name: 'Hive Hatch', at: .75, speed: 5, roll: 7, flyEvery: 7,
   desc: 'Flyers lift belt tiles and snatch dice. Fast weapons shoot them first. Re-route!',
   good: ['cannon', 'gatling', 'blunder', 'rico', 'lens', 'prism', 'crusher'],
   intents: [{type: 'slam', dmg: 10, wind: 2.6}, {type: 'hatch', n: 6, wind: 1.8}, {type: 'rocks', dmg: 4, n: 3, wind: 2.2}]},
  {name: 'Iron Plating', at: .5, speed: 7, roll: 8, flyEvery: 16, armor: 5,
   desc: 'Armor 5: dice under 5 pips clink off (spiky dice pierce). Slams hit hard.',
   good: ['fuser', 'forge', 'inflate', 'doubler', 'spiker', 'sandblast', 'meteor', 'compressor', 'pipforge', 'rampart'],
   intents: [{type: 'slam', dmg: 18, wind: 3.0}, {type: 'rocks', dmg: 5, n: 4, wind: 2.4}, {type: 'slam', dmg: 22, wind: 3.2}]},
  {name: 'Meltdown', at: .25, speed: 12, roll: 9, flyEvery: 12, meltdown: true,
   desc: 'Boulders bury tiles: route around them. Fire does nothing, ice hits double.',
   good: ['frost', 'cryo', 'overflow', 'switch', 'bounce', 'silo'],
   intents: [{type: 'slam', dmg: 16, wind: 2.2}, {type: 'boulders', n: 3, wind: 2.0}, {type: 'slam', dmg: 20, wind: 2.4}, {type: 'hatch', n: 5, wind: 1.6}]},
];

// The Mite Mother stays at the back and sends waves of mites. Mites have few
// HP, so big single hits are wasted: lots of small, fast dice win, plus splash.
export const SWARM_PHASES = [
  {name: 'First Brood', at: 1.0, speed: 0, roll: 7, flyEvery: 0, waveEvery: 8, wave: 12, miteHp: 7, bigEvery: 0,
   desc: 'Waves of mites gnaw at your wall. Big hits are wasted on them: go fast and wide.',
   good: ['gatling', 'cannon', 'blunder', 'crusher', 'prism', 'rocket', 'mines', 'lens', 'pipgat', 'grinder'],
   intents: []},
  {name: 'Frenzy', at: .5, speed: 0, roll: 8, flyEvery: 0, waveEvery: 7, wave: 16, miteHp: 8, bigEvery: 4,
   desc: 'Bigger waves, with fat mites mixed in. Splash and spray, and keep the wall up.',
   good: ['gatling', 'blunder', 'rocket', 'mines', 'bulwark', 'thorns', 'cryo', 'crusher', 'pipgat', 'grinder', 'meteor'],
   intents: []},
];

// The Ironshell: armor 8, so only pumped-up dice get through. Its shell opens
// while it winds up an attack: then everything hits, x1.5.
export const SHELL_PHASES = [
  {name: 'Closed Shell', at: 1.0, speed: 6, roll: 7, flyEvery: 0, armor: 8,
   desc: 'Armor 8: only dice of 8+ pips hurt (spikes ignore 3 armor). It opens up while winding up.',
   good: ['fuser', 'forge', 'inflate', 'doubler', 'spiker', 'silo', 'parry', 'compressor', 'pipforge', 'meteor', 'sandblast', 'venomvat', 'catalyst'],
   intents: [{type: 'slam', dmg: 16, wind: 3.4}, {type: 'rocks', dmg: 5, n: 3, wind: 2.8}]},
  {name: 'Cracked Shell', at: .5, speed: 9, roll: 8, flyEvery: 0, armor: 6,
   desc: 'Armor drops to 6, but it hits harder and faster. Flood it while the shell is open.',
   good: ['fuser', 'forge', 'inflate', 'spiker', 'silo', 'parry', 'thorns', 'ram', 'compressor', 'meteor', 'rampart', 'catalyst'],
   intents: [{type: 'slam', dmg: 20, wind: 3.0}, {type: 'slam', dmg: 14, wind: 2.4}, {type: 'rocks', dmg: 6, n: 4, wind: 2.6}]},
];

// The Lockbox: only dice showing the face on its lock really hurt it (x3, x2 with two faces);
// anything else does a tenth. The lock changes every few seconds, and the next face is shown.
export const LOCK_PHASES = [
  {name: 'One Lock', at: 1.0, speed: 7, roll: 7, flyEvery: 0, locks: 1, lockEvery: 8, match: 3,
   desc: 'Only dice showing its lock face hurt (x3); others barely scratch it, poison too. Sort, flip and reroll to match.',
   good: ['sorter', 'oddeven', 'flipper', 'drum', 'switch', 'mint', 'cannon', 'gatling', 'venomvat', 'catalyst'],
   intents: [{type: 'slam', dmg: 10, wind: 2.6}, {type: 'rocks', dmg: 4, n: 3, wind: 2.2}]},
  {name: 'Two Locks', at: .5, speed: 9, roll: 8, flyEvery: 0, locks: 2, lockEvery: 6, match: 2,
   desc: 'Two faces now, changing faster. Matching dice glow green on your belts.',
   good: ['sorter', 'oddeven', 'flipper', 'drum', 'switch', 'silo', 'gatling', 'mint'],
   intents: [{type: 'slam', dmg: 14, wind: 2.4}, {type: 'rocks', dmg: 5, n: 3, wind: 2.0}]},
];

// Free play: a practice dummy that never moves, never hits back and can't die.
// Its rules can be switched to test a build against armor or a lock.
export const DUMMY_RULES = {
  plain: {name: 'Free play', at: 1.0, speed: 0, roll: 6, flyEvery: 0, desc: 'Build anything. The dummy never fights back.', good: [], intents: []},
  armor: {name: 'Free play · armor 8', at: 1.0, speed: 0, roll: 6, flyEvery: 0, armor: 8, desc: 'Armor 8, like the Ironshell (it never opens).', good: ['fuser', 'compressor', 'pipforge', 'meteor', 'sandblast', 'spiker', 'venomvat'], intents: []},
  lock:  {name: 'Free play · lock', at: 1.0, speed: 0, roll: 6, flyEvery: 0, locks: 1, lockEvery: 8, match: 3, desc: 'A lock face, like the Lockbox.', good: ['sorter', 'oddeven', 'flipper', 'drum', 'switch', 'silo'], intents: []},
};

export const FOES = {
  colossus: {name: 'The Rust Colossus', hp: 1400, tag: 'ALL-ROUNDER', phases: COLOSSUS_PHASES,
    desc: 'Slams and rocks, then flyers, armor and boulders as it breaks down.',
    counters: 'A bit of everything. Re-route each phase.'},
  swarm: {name: 'The Mite Mother', hp: 650, tag: 'SWARM', phases: SWARM_PHASES,
    desc: 'Stays back and sends waves of little mites at your wall.',
    counters: 'Gatling, Cannon, Blunderbuss, Crusher, Prism. Splash from Rockets and Mines.'},
  shell: {name: 'The Ironshell', hp: 900, tag: 'ARMORED', phases: SHELL_PHASES,
    desc: 'Armor 8: small dice bounce off. Opens its shell to attack.',
    counters: 'Fuser, Forge, Inflator, Doubler, Spikes. A Silo to flood it when it opens.'},
  dummy: {name: 'Scrap Dummy', hp: 99999, tag: 'FREE PLAY', phases: [DUMMY_RULES.plain],
    desc: "Never moves, never hits back, can't die. No timer; free build and god mode are on.",
    counters: 'Switch it to armor or a lock, and send mites, from the panel at the top.'},
  lock: {name: 'The Lockbox', hp: 800, tag: 'PRECISION', phases: LOCK_PHASES,
    desc: 'Only dice showing its lock face hurt it. The face keeps changing.',
    counters: 'Hi/Lo, Odd/Even, Flipper, Reroll, Switch. Dump misses into the Furnace.'},
};
export let PHASES = COLOSSUS_PHASES;     // the current foe's phases
export const FAST = new Set(['cannon', 'bullet', 'pellet', 'rico', 'pip']);   // projectiles that hunt flyers and mites first
export const phaseNow = () => PHASES[S.foe.phase];

// ============================================================ state
export let S;
export const opts = {slow: true, holdFoe: false, god: false, speed: 1, free: false, turns: true};

// Set up the chosen foe (its phases, health and quirks).
export function chooseFoe(id, closePicker = true) {
  const def = FOES[id];
  // free play switches free build and god mode on; leaving it switches them off
  if (id === 'dummy' && closePicker) { opts.free = true; opts.god = true; }
  else if (S.enc === 'dummy' && id !== 'dummy') { opts.free = false; opts.god = false; }
  S.enc = id;
  PHASES = id === 'dummy' ? [DUMMY_RULES[S.dummyRule || 'plain']] : def.phases;
  const f = S.foe;
  Object.assign(f, {hp: def.hp, max: def.hp, phase: 0, intent: 0, speed: PHASES[0].speed, x: id === 'swarm' ? 1150 : (id === 'dummy' ? 1060 : 1175),
    locks: [], nextLocks: [], lockT: 0, enraged: false, state: 'march', shred: 0, poison: 0, poisonT: 0});
  if (PHASES[0].locks) { f.locks = rollLocks(PHASES[0].locks); f.nextLocks = rollLocks(PHASES[0].locks); f.lockT = PHASES[0].lockEvery; }
  S.units = []; S.waveT = 4;
  if (closePicker) { S.picker = false; if (opts.turns) beginTurns(); }
}
// distinct lock faces, 1-6
export function rollLocks(n) {
  const faces = [1, 2, 3, 4, 5, 6].sort(() => rand() - .5);
  return faces.slice(0, n).sort((a, b) => a - b);
}

// layout: 'blank' (chute and a stub of belt), 'starter' (a working demo line),
// 'keep' (same factory, fresh foe).
export function newGame(layout = 'blank') {
  const old = S;
  const keepFloor = layout === 'keep';
  S = {
    t: 0, hp: 40, maxHp: 40, over: null, paused: false, shake: 0, nextId: 1, hitFlash: 0, timeScale: 1,
    belts: new Map(), beltVis: new Map(), machines: new Map(), stops: new Map(),
    dice: [], rollT: 1.0, proj: [], debris: [], parts: [], texts: [], bricks: [], pendingBricks: 0,
    mines: [], thorns: [], bombs: [], shield: 0, shieldCd: 0, ramFx: [],
    flyers: [], rubble: new Map(), piles: new Map(), banner: null, flyT: 6,
    pal: null, placeDir: R, beltDir: R, buttons: [], recent: old ? old.recent : [],
    stats: {thrown: 0, dmg: 0, lost: 0, spilled: 0, downed: 0, stolen: 0},
    foe: {hp: 1400, max: 1400, x: 1175, kv: 0, hit: 0, burn: 0, state: 'march', timer: 0, total: 1, intent: 0,
          arm: 0, step: 0, enraged: false, speed: 9, flash: 0, stagger: 0, pinned: 0, chill: 0, stun: 0, phase: 0},
    // economy, build phase, floor
    gears: keepFloor && old ? Math.max(old.gears, START_GEARS / 2) : START_GEARS, pips: 0,
    mode: 'build', buildT: keepFloor ? BUILD_TIME / 2 : BUILD_TIME, dmgLog: [],
    pillars: new Set(PILLARS.map(key)), vents: new Map(VENTS.map(v => [key(v), v.type])),
    // the foe: which one, its mites (swarm), its lock faces (lockbox)
    enc: old ? old.enc : 'colossus', picker: true, units: [], waveT: 4, nextUnit: 1,
  };
  chooseFoe(S.enc, false);
  S.picker = true;                     // pick a foe before the build timer starts
  placeMachine(FURNACE, 'furnace', L, 1);
  if (keepFloor && old) {
    for (const [k, d] of old.belts) setBelt(parseKey(k), d, 1);
    for (const m of old.machines.values()) if (m.kind !== 'furnace') { placeMachine(m.cell, m.kind, m.dir, 1); Object.assign(S.machines.get(key(m.cell)), {paid: m.paid || 0, lvl: m.lvl || 1, xp: m.xp || 0}); }
    return;
  }
  placeMachine({x: 0, y: 1}, 'chute', R, 1);
  for (const x of [1, 2]) setBelt({x, y: 1}, R, 1);
  if (layout !== 'starter') return;
  placeMachine({x: 3, y: 1}, 'sorter', R, 1);
  setBelt({x: 4, y: 1}, R, 1);
  placeMachine({x: 5, y: 1}, 'forge', R, 1);
  setBelt({x: 6, y: 1}, R, 1);
  placeMachine({x: 7, y: 1}, 'pult', R, 1);
  setBelt({x: 3, y: 2}, D, 1);
  setBelt({x: 3, y: 3}, R, 1);
  placeMachine({x: 4, y: 3}, 'doubler', R, 1);
  setBelt({x: 5, y: 3}, R, 1);
  setBelt({x: 6, y: 3}, R, 1);
  placeMachine({x: 7, y: 3}, 'cannon', R, 1);
}
export const parseKey = k => { const [x, y] = k.split(',').map(Number); return {x, y}; };

export function placeMachine(c, kind, dir, pop = 0) {
  S.machines.set(key(c), {kind, dir, cell: c, pop, busy: 0, work: 0, fire: 0, mode: 0, lever: 0, leverT: 0, load: [],
    launch: 0, wind: 0, ang: Math.atan2(dir.y, dir.x), outQ: [], held: null, alt: 0, mag: [], spin: 0, spinV: 0,
    shotT: 0, fuel: 0, charges: 0, hopper: [], rollT: 0, reel: 0, jam: 0, paid: 0, fixed: !!KINDS[kind].fixed, stack: [],
    lvl: 1, xp: 0, xpTurn: 0, turnDmg: 0, turnProc: 0, lvlFlash: 0});
}
// ---- machine levels
// Every die a machine handles is 1 XP, but only XP_CAP per turn: spreading
// dice over many machines levels more of them than funnelling into one.
export const XP_CAP = 3;
export const LV_XP = [0, 6, 15, 30];          // total XP to reach level 2, 3, 4
export const MAX_LVL = 4;
export const lvlMult = m => 1 + .25 * ((m && m.lvl || 1) - 1);   // weapons hit harder per level
export function gainXP(m) {
  if (!m || m.fixed || m.kind === 'chute' || m.lvl >= MAX_LVL) return;
  m.turnProc = (m.turnProc || 0) + 1;
  if (m.xpTurn >= XP_CAP) return;
  m.xpTurn++; m.xp++;
  if (m.xp >= LV_XP[m.lvl]) {
    m.lvl++; m.lvlFlash = 1.2;
    const ce = center(m.cell);
    say(ce.x, ce.y - 44, `${KINDS[m.kind].short} LEVEL ${m.lvl}!`, COL.gold, 18);
    ring(ce.x, ce.y, 'rgba(255,210,94,.95)', 16, 70, .6);
    burst(ce.x, ce.y, COL.gold, 24, 260, 3, 0, .7);
    S.slowT = .9;                       // a beat of slow-mo to enjoy it
  }
}

export const isPillar = c => S.pillars.has(key(c));
export const canAfford = k => opts.free || S.gears >= (COST[k] || 0);
export function setBelt(c, d, pop = 0) {
  const k = key(c);
  if (!S.belts.has(k) || !S.beltVis.has(k)) S.beltVis.set(k, {ang: Math.atan2(d.y, d.x), pop});
  S.belts.set(k, d);
}
export const machineAt = c => S.machines.get(key(c));
export const beltAt = c => S.belts.get(key(c));

// ============================================================ fx helpers
export function burst(x, y, col, n, spd, size = 3, g = 0, life = .5, shape = 0, dir = null, spread = Math.PI) {
  for (let i = 0; i < n; i++) {
    const a = dir === null ? rnd(0, Math.PI * 2) : dir + rnd(-spread, spread);
    const v = spd * rnd(.35, 1);
    S.parts.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col, size: size * rnd(.6, 1.25), g,
      life: life * rnd(.7, 1.2), t: 0, shape, rot: rnd(0, 6.3), vr: rnd(-12, 12)});
  }
  if (S.parts.length > 1000) S.parts.splice(0, S.parts.length - 1000);
}
export function ring(x, y, col, r0, r1, life = .35) { S.parts.push({x, y, vx: 0, vy: 0, col, size: r0, end: r1, g: 0, life, t: 0, shape: 3, rot: 0, vr: 0}); }
export function say(x, y, txt, col, size = 16) { S.texts.push({x, y: Math.max(y, GY + 6), txt, col, size, t: 0, life: 1.0}); }
export function shake(a) { S.shake = Math.max(S.shake, a); }
export function debrisDie(x, y, d, vx, vy) {
  S.debris.push({x, y, vx, vy, v: d.v, hot: d.hot, ice: d.ice, spiky: d.spiky, rot: rnd(0, 6), vr: rnd(-14, 14), t: 0, life: rnd(1.3, 2.0)});
  if (S.debris.length > 80) S.debris.shift();
}
export const dieSpec = d => ({v: d.v, hot: !!d.hot, ice: !!d.ice, spiky: !!d.spiky, venom: !!d.venom, echoed: !!d.echoed});

// ============================================================ dice movement
// Belt tiles have two stops, machines one in the centre. A die moves on only
// when the next stop is free, so dice queue behind anything busy.

export function pathPt(c, din, dout, s, mach) {
  const ce = center(c);
  const p0 = {x: ce.x - din.x * HC, y: ce.y - din.y * HC}, p1 = {x: ce.x + dout.x * HC, y: ce.y + dout.y * HC};
  if (mach) return s <= .5 ? lerpP(p0, ce, s * 2) : lerpP(ce, p1, (s - .5) * 2);
  if (deq(din, dout)) return lerpP(p0, p1, s);
  if (din.x === -dout.x && din.y === -dout.y) return s < .5 ? lerpP(p0, ce, s * 2) : lerpP(ce, p1, s * 2 - 1);
  return bez(p0, ce, p1, s);
}

export function newDie(spec, cell, dir, stopKey) {
  const d = {id: S.nextId++, v: spec.v, show: spec.v, hot: !!spec.hot, ice: !!spec.ice, spiky: !!spec.spiky, venom: !!spec.venom, echoed: !!spec.echoed,
    cell, din: dir, dout: dir, s: .5, ts: .5, next: null, stop: stopKey, state: 'stop', wait: 0, proc: 0,
    pop: spec.pop ? 1 : 0, roll: 0, rollTick: 0, rot: 0, falling: false, fall: 0, x: 0, y: 0, jumpPad: !!spec.jump, jt: 0};
  const p = center(cell); d.x = p.x; d.y = p.y;
  S.stops.set(stopKey, d.id);
  S.dice.push(d);
  return d;
}

// could a die moving in direction dir out of cell c go there right now?
export function entryFor(c, dir) {
  const n = add(c, dir), nk = key(n);
  if (!inGrid(n)) return null;
  const buried = S.rubble.has(nk);
  if (S.belts.has(nk)) return {key: nk + ',0', s: .25, cell: n, dout: S.belts.get(nk), mach: null, buried};
  const m = S.machines.get(nk);
  if (m) return {key: nk + ',m', s: .5, cell: n, dout: dir, mach: m, buried};
  return null;
}
// is the way into this entry closed right now?
export const entryBlocked = e => e.buried || S.stops.has(e.key) || (e.mach && !accepts(e.mach));
export function canEnter(c, dir) {
  const e = entryFor(c, dir);
  if (!e) return true;                       // runs off into nothing: allowed, it just falls
  return !entryBlocked(e);
}

export function accepts(m) {
  const info = KINDS[m.kind];
  if (m.kind === 'chute' || m.pop < 1 || m.jam > 0 || S.rubble.has(key(m.cell))) return false;
  if (info.role === 'manip') {
    if (m.kind === 'silo') return m.outQ.length < 8;
    return m.outQ.length === 0;
  }
  if (m.busy > 0 || m.launch > 0) return false;
  switch (m.kind) {
    case 'rocket': return m.load.length < 10;
    case 'gatling': return m.mag.length < 8;
    case 'combo': case 'blunder': case 'slots': return m.load.length < 3 && m.reel <= 0;
    case 'ram': return m.load.length === 0;
    case 'parry': return m.charges < 3;
    case 'bulwark': return S.bricks.length + S.pendingBricks < WALL_COLS * WALL_ROWS;
    case 'thorns': return S.thorns.length < 8;
    case 'patch': return true;
  }
  return true;
}

export function release(d) { if (d.stop && S.stops.get(d.stop) === d.id) S.stops.delete(d.stop); d.stop = null; }
export function removeDie(d) { release(d); const i = S.dice.indexOf(d); if (i >= 0) S.dice.splice(i, 1); }

export function tryAdvance(d) {
  const ck = key(d.cell);
  const onBelt = S.belts.has(ck);
  if (d.jumpPad) return tryJump(d);
  let tgt;
  if (onBelt && d.s < .5) tgt = {key: ck + ',1', s: .75, cross: false};
  else {
    const e = entryFor(d.cell, d.dout);
    if (!e) { release(d); d.falling = true; d.ts = 1; d.state = 'move'; d.next = null; return; }
    if (e.buried || (e.mach && !accepts(e.mach))) return;
    tgt = {key: e.key, s: e.s, cross: true, cell: e.cell, dout: e.dout};
  }
  if (S.rubble.has(ck) && onBelt) return;      // buried belt: dice on it are stuck
  if (S.stops.has(tgt.key)) return;
  release(d);
  S.stops.set(tgt.key, d.id);
  d.stop = tgt.key; d.ts = tgt.s;
  d.next = tgt.cross ? {cell: tgt.cell, dout: tgt.dout} : null;
  d.state = 'move'; d.wait = 0;
}

// Bounce Pad: the die flies two tiles ahead
export function tryJump(d) {
  const mid = add(d.cell, d.dout);
  const e = entryFor(mid, d.dout);
  if (e && entryBlocked(e)) return;
  release(d);
  const from = {x: d.x, y: d.y};
  let to, land;
  if (e) {
    S.stops.set(e.key, d.id); d.stop = e.key;
    to = e.mach ? center(e.cell) : pathPt(e.cell, d.dout, e.dout, e.s, false);
    land = e;
  } else { const far = add(mid, d.dout); to = center(far); land = null; }
  d.state = 'jump'; d.jt = 0; d.jfrom = from; d.jto = to; d.jland = land; d.jumpPad = false;
  burst(from.x, from.y, '#cfe9e2', 6, 90, 2.5, 0, .3);
}

export function updateDice(dt) {
  for (const d of S.dice.slice()) {
    d.pop = Math.max(0, d.pop - dt * 3.5);
    if (d.roll > 0) {
      d.roll -= dt; d.rollTick -= dt; d.rot = Math.sin(S.t * 26 + d.id) * .6;
      if (d.rollTick <= 0) { d.rollTick = .055; d.show = ri(1, 6); }
      if (d.roll <= 0) { d.show = d.v; d.pop = 1; d.rot = 0; }
    } else d.rot *= Math.exp(-8 * dt);
    if (d.state === 'fall') {
      d.fall += dt;
      if (d.fall > .5) { burst(d.x, d.y + 10, '#8aa0a8', 6, 70, 2.5, 0, .35); removeDie(d); }
      continue;
    }
    if (d.state === 'jump') {
      d.jt += dt / .45;
      const k = Math.min(1, d.jt);
      d.x = lerp(d.jfrom.x, d.jto.x, k); d.y = lerp(d.jfrom.y, d.jto.y, k) - 70 * 4 * k * (1 - k);
      d.rot += dt * 10;
      if (k >= 1) {
        const e = d.jland;
        if (!e || (!S.belts.has(key(e.cell)) && !S.machines.has(key(e.cell)))) {
          const at = e ? e.cell : cellAt({x: d.x, y: d.y});
          if (isBareFloor(at)) { removeDie(d); addToPile(at, d, {x: d.x, y: d.y}); } else loseDieAt(d, 'lost');
          continue;
        }
        d.cell = e.cell; d.din = d.dout; d.dout = e.dout; d.s = e.s; d.rot = 0;
        ring(d.x, d.y, 'rgba(255,255,255,.7)', 8, 24, .25);
        if (e.mach) arrive(d); else d.state = 'stop';
      }
      continue;
    }
    if (d.state === 'move') {
      d.s += BELT_SPEED * dt / CELL;
      if (d.next && d.s >= 1) {
        d.s -= 1; d.din = d.dout; d.cell = d.next.cell; d.dout = d.next.dout; d.next = null;
        const k = key(d.cell);
        if (!S.belts.has(k) && !S.machines.has(k)) {
          if (isBareFloor(d.cell)) { release(d); removeDie(d); addToPile(d.cell, d, {x: d.x, y: d.y}); } else loseDie(d, 'lost');
          continue;
        }
        applyVent(d);
      }
      if (!d.next && d.s >= d.ts) {
        d.s = d.ts;
        if (d.falling) { landOffBelt(d); continue; }
        arrive(d);
        if (!S.dice.includes(d)) continue;
      }
    } else if (d.state === 'proc') {
      d.proc -= dt;
      if (d.proc <= 0) { finishProc(d); continue; }
    } else if (d.state === 'stop') {
      tryAdvance(d);
      if (d.state === 'stop') d.wait += dt;
      if (d.state === 'jump') continue;
    }
    const p = pathPt(d.cell, d.din, d.dout, d.s, S.machines.has(key(d.cell)));
    d.x = p.x; d.y = p.y;
    if (d.state === 'move') {
      if (d.hot && rand() < dt * 18) S.parts.push({x: d.x + rnd(-6, 6), y: d.y + rnd(-6, 6), vx: rnd(-15, 15), vy: rnd(-70, -30), col: rand() < .6 ? COL.ember : COL.gold, size: rnd(1.5, 3), g: -20, life: .45, t: 0, shape: 0, rot: 0, vr: 0});
      if (d.ice && rand() < dt * 10) S.parts.push({x: d.x + rnd(-8, 8), y: d.y + rnd(-8, 8), vx: 0, vy: 15, col: '#e8f8ff', size: 1.8, g: 0, life: .5, t: 0, shape: 0, rot: 0, vr: 0});
    }
  }
}

// a belt over a floor vent changes each die that rides across it (once per vent)
export function applyVent(d) {
  const k = key(d.cell), type = S.vents.get(k);
  if (!type || !S.belts.has(k)) return;
  d.vented = d.vented || {};
  if (d.vented[k]) return;
  d.vented[k] = true;
  d.pop = 1;
  if (type === 'hot') { d.hot = true; d.ice = false; burst(d.x, d.y, COL.ember, 6, 100, 2.5, -80, .4); }
  else if (type === 'ice') { d.ice = true; d.hot = false; burst(d.x, d.y, COL.ice, 6, 100, 2.5, 0, .4); }
  else { d.v = Math.min(12, d.v + 1); d.show = d.v; say(d.x, d.y - 22, '+1 lucky', '#8fe08f', 12); burst(d.x, d.y, '#8fe08f', 6, 100, 2, 0, .3); }
}

// a die ran off the end of a belt: onto bare floor it heaps, off the factory it's gone
export function landOffBelt(d) {
  const n = add(d.cell, d.dout);
  const p = pathPt(d.cell, d.din, d.dout, 1, S.machines.has(key(d.cell)));
  if (isBareFloor(n)) { removeDie(d); addToPile(n, d, p); return; }
  if (inGrid(n) && isPillar(n)) { burst(p.x, p.y, '#c9d6da', 6, 140, 2, 0, .25, 2); loseDie(d, 'smashed'); return; }
  loseDie(d, 'lost');
}

export function loseDie(d, why) {
  release(d);
  const p = pathPt(d.cell, d.din, d.dout, Math.min(d.s, 1), S.machines.has(key(d.cell)));
  d.x = p.x; d.y = p.y;
  loseDieAt(d, why);
}
export function loseDieAt(d, why) {
  release(d);
  d.state = 'fall'; d.fall = 0;
  S.stats.lost++;
  say(d.x, d.y - 20, why, '#ffb0a0', 13);
}

export function arrive(d) {
  const m = S.machines.get(key(d.cell));
  if (!m) { d.state = 'stop'; return; }
  const info = KINDS[m.kind];
  if (info.role === 'manip') {
    d.state = 'proc'; d.proc = info.proc * (1 - .15 * ((m.lvl || 1) - 1)); m.work = 1;   // levelled machines work faster
    if (m.kind === 'drum') d.roll = info.proc + .05;
    if (m.kind === 'coin') d.roll = 0;
    if (m.kind === 'sorter') m.leverT = sorterHigh(m, d.v) ? 0 : 1;
  } else if (info.role === 'term') consume(m, d);
  else d.state = 'stop';
}

export const sorterHigh = (m, v) => (v >= 4) !== (m.mode === 1);

// A manipulator takes the die in and queues what comes out.
export function finishProc(d) {
  const m = S.machines.get(key(d.cell));
  if (!m) { d.state = 'stop'; return; }
  gainXP(m);
  const v = d.v, sp = dieSpec(d), st = m.dir, rt = rotCW(m.dir);
  const above = {x: d.x, y: d.y - 26};
  const out = [];
  const pop = o => Object.assign(o, {pop: true});
  switch (m.kind) {
    case 'sorter': out.push({...sp, dir: sorterHigh(m, v) ? st : rt}); break;
    case 'switch': out.push({...sp, dir: m.mode ? rt : st}); break;
    case 'oddeven': out.push({...sp, dir: v % 2 ? st : rt}); m.leverT = v % 2 ? 0 : 1; break;
    case 'alt': out.push({...sp, dir: m.alt ? rt : st}); m.alt = 1 - m.alt; break;
    case 'coin': {
      const heads = rand() < .5;
      out.push({...sp, dir: heads ? st : rt});
      say(above.x, above.y, heads ? 'heads' : 'tails', '#ffd25e', 13);
      m.leverT = heads ? 0 : 1;
      break;
    }
    case 'prism': {
      const a = Math.ceil(v / 2), b = Math.floor(v / 2);
      out.push(pop({...sp, v: a, dir: st}));
      if (b > 0) out.push(pop({...sp, v: b, dir: rt}));
      say(above.x, above.y, b > 0 ? `${a} + ${b}` : String(a), '#7fe0c6', 14);
      burst(d.x, d.y, '#ffffff', 8, 140, 2, 0, .3, 2);
      break;
    }
    case 'crusher': {
      const n = Math.min(6, v);
      for (let i = 0; i < n; i++) out.push(pop({...sp, v: 1, dir: st}));
      say(above.x, above.y, `${n} x 1`, '#7fe0c6', 14);
      burst(d.x, d.y, '#c8c8c8', 10, 160, 3, 300, .4, 1);
      shake(.12);
      break;
    }
    case 'echo':
      out.push({...sp, echoed: true, dir: st});
      // each die is copied once at most, so loops can't multiply dice
      if (v >= 5 && !sp.echoed) { out.push(pop({...sp, echoed: true, dir: rt})); say(above.x, above.y, 'copy!', '#7fe0c6', 14); ring(d.x, d.y, '#7fe0c6', 10, 30); }
      break;
    case 'overflow': out.push({...sp, dir: null, overflow: true}); break;
    case 'fuser':
      if (!m.held) { m.held = sp; break; }
      out.push(pop({v: m.held.v + v, hot: m.held.hot || sp.hot, ice: m.held.ice || sp.ice, spiky: m.held.spiky || sp.spiky, dir: st}));
      say(above.x, above.y, `${m.held.v} + ${v} = ${m.held.v + v}`, '#7fe0c6', 15);
      ring(d.x, d.y, '#ffffff', 10, 34); shake(.1);
      m.held = null;
      break;
    case 'silo': out.push({...sp, dir: st}); break;
    case 'bounce': out.push({...sp, dir: st, jump: true}); break;
    case 'forge':
      out.push(pop({...sp, v: Math.min(v + 1 + (m.lvl || 1), 12), hot: true, dir: st}));   // +2 at level 1, +1 per level after
      say(above.x, above.y, '+2 hot', COL.hot, 14);
      burst(d.x, d.y, COL.ember, 12, 150, 3, -80, .5, 0, -Math.PI / 2, .9);
      break;
    case 'doubler':
      if (v <= 3) { out.push(pop({...sp, v: v * 2, dir: st})); say(above.x, above.y, 'x2', '#7fe0c6', 15); burst(d.x, d.y, '#fff', 10, 200, 2, 0, .3, 2); shake(.1); }
      else out.push({...sp, dir: st});
      break;
    case 'drum': { const nv = ri(1, 6); out.push(pop({...sp, v: nv, dir: st})); say(above.x, above.y, v + ' to ' + nv, '#7fe0c6', 14); break; }
    case 'flipper': {
      const nv = v <= 6 ? 7 - v : v;
      out.push(pop({...sp, v: nv, dir: st})); say(above.x, above.y, v + ' flips to ' + nv, '#d9b8f2', 14); break;
    }
    case 'frost':
      out.push(pop({...sp, v: Math.max(1, v - 1), ice: true, hot: false, dir: st}));
      say(above.x, above.y, 'iced', COL.ice, 14); burst(d.x, d.y, COL.ice, 12, 120, 2.5, 0, .5);
      break;
    case 'spiker':
      out.push(pop({...sp, spiky: true, dir: st})); say(above.x, above.y, 'spiky', '#d9b8f2', 14);
      burst(d.x, d.y, '#ffffff', 8, 180, 2, 0, .25, 2);
      break;
    case 'inflate':
      out.push(pop({...sp, v: Math.min(12, v + 1), dir: st})); say(above.x, above.y, '+1', '#d9b8f2', 14); break;
    // ---- pools
    case 'grinder': {
      const got = v + (m.lvl || 1) - 1;   // the full pips (+1 per level after 1) go in the tank; the die comes out as a 1
      S.pips = Math.min(PIP_MAX, S.pips + got); S.pipFlash = 1;
      out.push(pop({...sp, v: 1, dir: st}));
      if (got) say(above.x, above.y, `+${got} ◆`, COL.pip, 15);
      burst(d.x, d.y, '#c8c0a8', 12, 160, 2.5, 300, .5, 1);
      shake(.06);
      break;
    }
    case 'pipforge': {
      const take = Math.min(3 + (m.lvl || 1), Math.floor(S.pips));
      S.pips -= take; S.pipFlash = take ? 1 : 0;
      out.push(take ? pop({...sp, v: v + take, dir: st}) : {...sp, dir: st});
      if (take) { say(above.x, above.y, `◆+${take} → ${v + take}`, COL.pip, 15); burst(d.x, d.y, COL.pip, 14, 140, 2.5, 0, .4); }
      else say(above.x, above.y, 'tank empty', '#c9d6da', 12);
      break;
    }
    case 'compressor': {
      m.stack.push(sp);
      if (m.stack.length < 3) { say(above.x, above.y, `${m.stack.length}/3`, '#d9b8f2', 13); break; }
      const st3 = m.stack.splice(0);
      const total = st3.reduce((a, x) => a + x.v, 0) + 2;
      out.push(pop({v: total, hot: st3.some(x => x.hot), ice: st3.some(x => x.ice), spiky: st3.some(x => x.spiky), venom: st3.some(x => x.venom), dir: st}));
      say(above.x, above.y - 6, total >= MEGA ? `MEGA ${total}!` : `= ${total}`, total >= MEGA ? COL.gold : '#d9b8f2', total >= MEGA ? 20 : 15);
      ring(d.x, d.y, '#ffffff', 10, 40); shake(.18);
      break;
    }
    case 'venomvat':
      out.push(pop({...sp, venom: true, dir: st}));
      say(above.x, above.y, 'venom', COL.venom, 14);
      burst(d.x, d.y, COL.venom, 10, 100, 2.5, 120, .5);
      break;
    default: out.push({...sp, dir: st});
  }
  removeDie(d);
  m.outQ.push(...out);
}

// Machines release queued dice one at a time, when the way out is clear.
export function emitFromMachine(m) {
  if (!m.outQ.length || m.jam > 0 || S.rubble.has(key(m.cell))) return;
  if (m.kind === 'silo' && m.mode === 1) return;      // holding
  const mk = key(m.cell) + ',m';
  if (S.stops.has(mk)) return;
  const spec = m.outQ[0];
  let dir = spec.dir;
  if (spec.overflow) {
    if (canEnter(m.cell, m.dir)) dir = m.dir;
    else if (canEnter(m.cell, rotCW(m.dir))) { dir = rotCW(m.dir); m.leverT = 1; }
    else return;
    if (deq(dir, m.dir)) m.leverT = 0;
  } else if (spec.jump) {
    const e = entryFor(add(m.cell, dir), dir);
    if (e && entryBlocked(e)) return;
  } else if (!canEnter(m.cell, dir)) return;
  m.outQ.shift();
  const d = newDie(spec, m.cell, dir, mk);
  tryAdvance(d);
}

// ============================================================ terminals
export function consume(m, d) {
  const sp = dieSpec(d);
  removeDie(d);
  const ce = center(m.cell);
  m.work = 1;
  gainXP(m);
  switch (m.kind) {
    case 'pult': m.load = [sp]; m.wind = .35; m.busy = 1.6; break;
    case 'cannon': m.load = [sp]; m.wind = .12; m.busy = .55; break;
    case 'harpoon': m.load = [sp]; m.wind = .25; m.busy = 2.5; break;
    case 'rico': m.load = [sp]; m.wind = .15; m.busy = .9; break;
    case 'sticky': m.load = [sp]; m.wind = .2; m.busy = 1.0; break;
    case 'mines': m.load = [sp]; m.wind = .25; m.busy = .8; break;
    case 'rocket':
      m.load.push(sp); m.busy = .12;
      burst(ce.x, ce.y, COL.gold, 4, 60, 2, 0, .25);
      if (m.load.length >= 10) launchRocket(m);
      break;
    case 'gatling': m.mag.push(sp); m.busy = .05; break;
    case 'combo': case 'blunder':
      m.load.push(sp); m.busy = .1;
      if (m.load.length >= 3) m.wind = .4;
      break;
    case 'slots':
      m.load.push(sp); m.busy = .1;
      if (m.load.length >= 3) { m.reel = 1.1; m.busy = 1.3; }
      break;
    case 'lens': m.fuel = Math.min(16, m.fuel + sp.v * .6 * (sp.hot ? 1.5 : 1)); m.busy = .1; S.stats.thrown++; break;
    case 'bulwark': {
      m.busy = .3; S.pendingBricks++;
      const slot = S.bricks.length + S.pendingBricks - 1, bp = brickPos(slot);
      S.proj.push({kind: 'brick', dice: [sp], x0: ce.x, y0: ce.y, x1: bp.x, y1: bp.y, t: 0, dur: .55, arc: 90, rot: 0});
      break;
    }
    case 'thorns': {
      m.busy = .3;
      const i = S.thorns.length;
      S.thorns.push({v: 0, spiky: sp.spiky, pending: true});
      S.proj.push({kind: 'thorn', dice: [sp], x0: ce.x, y0: ce.y, x1: thornX(i), y1: GROUND - 8, t: 0, dur: .6, arc: 110, rot: 0, slot: i});
      break;
    }
    case 'parry':
      m.charges++; m.busy = .3;
      say(ce.x, ce.y - 34, `charge ${m.charges}/3`, COL.blk, 13); ring(ce.x, ce.y, COL.blk, 10, 32);
      break;
    case 'patch': {
      m.busy = .25;
      const heal = Math.ceil(sp.v / 2);
      S.hp = Math.min(S.maxHp, S.hp + heal);
      say(ce.x, ce.y - 34, '+' + heal + ' repair', COL.heal, 15);
      burst(ce.x, ce.y, COL.heal, 12, 120, 3, -60, .6);
      break;
    }
    case 'ram': m.load = [sp]; break;
    // ---- pools
    case 'pipgat':
      // dice fed straight in are ground into pips for the spray
      S.pips = Math.min(PIP_MAX, S.pips + sp.v); S.pipFlash = 1; m.busy = .05;
      break;
    case 'sandblast': m.load = [sp]; m.wind = .15; m.busy = .9; break;
    case 'meteor': m.load = [sp]; m.wind = .5; m.busy = 4; break;
    case 'catalyst': m.load = [sp]; m.wind = .25; m.busy = 2.5; break;
    case 'rampart': m.load = [sp]; m.wind = .2; m.busy = 1.2; break;
    case 'furnace': case 'mint': {
      // dice become gears
      const g = Math.ceil(sp.v / (m.kind === 'furnace' ? 3 : 4));
      S.gears += g; S.gearFlash = 1;
      m.busy = .2; m.fire = 1;
      say(ce.x, ce.y - 34, `+${g} ⚙`, COL.gold, 15);
      burst(ce.x, ce.y - 6, m.kind === 'furnace' ? COL.ember : COL.gold, 8, 120, 2.5, -60, .5);
      break;
    }
    case 'cryo': {
      m.busy = .3;
      const tg = foeTarget(30);
      S.proj.push({kind: 'cryo', dice: [sp], x0: ce.x, y0: ce.y, x1: tg.x, y1: tg.y, t: 0, dur: .9, arc: 60, rot: 0});
      break;
    }
  }
}

export function launchRocket(m) {
  if (m.load.length === 0 || m.launch > 0) return;
  m.launch = .9; m.busy = 2.2;
  say(center(m.cell).x, center(m.cell).y - 40, 'LAUNCH ' + m.load.length, COL.gold, 16);
}

export function foeTarget(spread = 40) {
  const f = S.foe;
  return {x: f.x - 10 + rnd(-spread, spread) * .6, y: GROUND - (S.enc === 'dummy' ? 150 : 95) + rnd(-spread, spread)};
}
export const foeFront = () => S.foe.x - 70;

// Damage the foe takes from these dice right now, given its phase.
// Armor: a die under the armor value does 1 (spiky dice ignore 3 armor).
// Ironshell with its shell open: no armor, and x1.5.
// Meltdown: icy dice do double. Lock: matching faces x3 (x2 with two faces), others x0.1.
// vsSmall: hitting a flyer or a mite, which have none of that.
export function diceDamage(dice, mult, vsSmall = false) {
  const ph = PHASES[S.foe.phase], f = S.foe;
  const open = shellOpen(), armor = effArmor();
  let s = 0, clinked = 0, matched = 0;
  for (const d of dice) {
    let v = d.v * (d.spiky ? SPIKE : 1) * (d.v >= MEGA ? 1.5 : 1);
    if (!vsSmall && armor && !open && d.v < armor - (d.spiky ? 3 : 0)) { v = CLINK; clinked++; }
    if (!vsSmall && ph.meltdown && d.ice) v *= 2;
    if (!vsSmall && ph.locks) { if (f.locks.includes(d.v)) { v *= ph.match; matched++; } else v *= LOCK_MISS; }
    s += v;
  }
  if (open && !vsSmall) s *= 1.5;
  lastClink = clinked;
  lastMatch = ph.locks && !vsSmall ? matched : -1;
  return s * mult;                         // fractional: a scratch is a scratch (no 1-damage floor)
}
export let lastClink = 0, lastMatch = -1;
export const shellOpen = () => S.enc === 'shell' && S.foe.state === 'windup';
// armor after Sandblaster shred
export const effArmor = () => Math.max(0, (PHASES[S.foe.phase].armor || 0) - (S.foe.shred || 0));

// where a shot from (x0, y0) should land: the front mite if there are any, else the foe
export function aimAt(x0, y0, spread = 40) {
  const u = targetUnit(false);
  if (u) return {x1: u.x, y1: unitY(u), unit: u};
  const tg = foeTarget(spread);
  return {x1: tg.x, y1: tg.y, unit: null};
}

// fire a projectile from machine m at the foe
export function shoot(m, kind, dice, mult, o = {}) {
  const ce = center(m.cell);
  const x0 = ce.x + (o.ox || 0), y0 = ce.y + (o.oy || 0);
  // fast, light weapons go for flyers first; everything goes for mites before the foe
  let fly = null, unit = null, tg;
  if (FAST.has(kind)) fly = nearestFlyer(x0, y0, o.skipFly);
  if (!fly) unit = targetUnit(FAST.has(kind));
  if (fly) tg = {x: fly.x, y: fly.y};
  else if (unit) tg = {x: unit.x, y: unitY(unit)};
  else tg = foeTarget(o.spread ?? 40);
  const dist = Math.hypot(tg.x - x0, tg.y - y0);
  let dur = o.dur ?? dist / (o.speed || 900);
  if (fly) dur = Math.min(dur, dist / 1100);
  S.proj.push({kind, dice, mult: mult * lvlMult(m), src: m, x0, y0, x1: tg.x, y1: tg.y, t: -(o.delay || 0), dur, arc: fly ? 8 : (o.arc ?? 30),
    rot: 0, knock: o.knock ?? 1, bounces: o.bounces || 0, label: o.label || null, size: o.size || 1, fly, unit});
  S.stats.thrown += dice.length;
  m.fire = 1;
}

export function fire(m) {
  const ce = center(m.cell);
  const load = m.load; m.load = [];
  switch (m.kind) {
    case 'pult':
      shoot(m, 'pult', load, 2, {oy: -18, dur: 1.0, arc: 190});
      burst(ce.x, ce.y - 20, '#c9b48a', 6, 90, 3, 200, .4, 1);
      break;
    case 'cannon':
      shoot(m, 'cannon', load, 1, {ox: 22, oy: -6, speed: 950, arc: 30});
      burst(ce.x + 28, ce.y - 6, '#ffe27a', 8, 220, 2, 0, .2, 2, 0, .5);
      burst(ce.x + 28, ce.y - 6, '#9aa4aa', 5, 60, 5, -30, .6);
      shake(.08);
      break;
    case 'harpoon':
      shoot(m, 'harpoon', load, 1, {ox: 20, speed: 1000, arc: 12, spread: 20});
      break;
    case 'rico':
      shoot(m, 'rico', load, 1, {oy: -10, dur: .6, arc: 60, bounces: 2});
      break;
    case 'sticky':
      shoot(m, 'sticky', load, 0, {oy: -10, dur: .8, arc: 140, knock: 0});
      break;
    case 'mines': {
      const d = load[0];
      const fu = liveUnits().sort((a, b) => a.x - b.x)[0];
      const x = clamp((fu ? fu.x - fu.r : foeFront()) - rnd(30, 150), REACH_X + 10, FIELD_X1 - 20);
      S.proj.push({kind: 'mine', dice: [d], x0: ce.x, y0: ce.y - 10, x1: x, y1: GROUND - 8, t: 0, dur: .9, arc: 170, rot: 0});
      S.stats.thrown++;
      m.fire = 1;
      break;
    }
    case 'combo': {
      const vs = load.map(d => d.v).sort((a, b) => a - b);
      let mult = 1, label = 'no combo';
      const same = vs[0] === vs[1] && vs[1] === vs[2];
      const straight = vs[1] === vs[0] + 1 && vs[2] === vs[1] + 1;
      const pair = vs[0] === vs[1] || vs[1] === vs[2];
      if (same) { mult = 4; label = 'THREE OF A KIND x4'; }
      else if (straight) { mult = 2.5; label = 'STRAIGHT x2.5'; }
      else if (pair) { mult = 1.5; label = 'PAIR x1.5'; }
      say(ce.x, ce.y - 40, label, mult > 1 ? COL.gold : '#c9d6da', mult > 1 ? 16 : 13);
      shoot(m, 'cluster', load, mult, {oy: -8, dur: .9, arc: 120, knock: 1.5, size: 1 + mult * .05});
      shake(.15 + mult * .04);
      break;
    }
    // ---- pools
    case 'sandblast':
      shoot(m, 'sand', load, 1, {ox: 22, speed: 900, arc: 12, spread: 20});
      burst(ce.x + 24, ce.y, '#d8c79a', 12, 220, 2.5, 0, .4, 0, 0, .35);
      break;
    case 'meteor': {
      const d = load[0];
      // pips² ÷ 8 for big dice; small ones fizzle for 1
      const mult = d.v >= 8 ? d.v / 8 : 1 / d.v;
      shoot(m, 'meteor', load, mult, {oy: -16, dur: 1.3, arc: 260, knock: 2.5, size: 1 + Math.min(1, d.v / 20)});
      burst(ce.x, ce.y - 10, COL.ember, 16, 200, 4, -60, .6);
      if (d.v < 8) say(ce.x, ce.y - 40, 'too small: fizzle', '#c9d6da', 13);
      shake(.2);
      break;
    }
    case 'catalyst':
      shoot(m, 'catalyst', load, 1, {ox: 20, speed: 800, arc: 40});
      burst(ce.x + 20, ce.y, COL.venom, 10, 160, 3, 0, .4);
      break;
    case 'rampart': {
      // fires the top brick of your wall; without bricks the die goes alone
      const b = S.bricks.pop();
      const d = load[0];
      if (b) {
        const bp = brickPos(S.bricks.length);
        S.proj.push({kind: 'rampart', dice: [{v: b.v, hot: b.hot, ice: b.ice}], flat: Math.round((b.hp * 3 + d.v) * lvlMult(m)), src: m, x0: bp.x, y0: bp.y, ...aimAt(bp.x, bp.y, 20), t: 0, dur: .7, arc: 90, rot: 0, knock: 2});
        burst(bp.x, bp.y, COL.blk, 12, 160, 3, 0, .4);
        say(bp.x + 40, bp.y - 20, `BRICK ×3 = ${Math.round(b.hp * 3 + d.v)}`, COL.blk, 15);
        m.fire = 1; S.stats.thrown++;
        shake(.2);
      } else {
        shoot(m, 'cannon', load, 1, {ox: 20, speed: 900});
        say(ce.x, ce.y - 36, 'no bricks!', '#ffb0a0', 13);
      }
      break;
    }
    case 'blunder': {
      const fu = liveUnits().sort((a, b) => a.x - b.x)[0];
      const close = (fu ? fu.x - fu.r : foeFront()) < REACH_X + BLUNDER_RANGE;
      const mult = close ? 2 : .5;
      load.forEach((d, i) => shoot(m, 'pellet', [d], mult, {ox: 22, speed: 1100, arc: 20, spread: 60, delay: i * .03}));
      burst(ce.x + 26, ce.y, '#ffe27a', 16, 300, 2.5, 0, .25, 2, 0, .6);
      burst(ce.x + 26, ce.y, '#9aa4aa', 10, 90, 6, -30, .8);
      say(ce.x, ce.y - 40, close ? 'POINT BLANK x2' : 'too far x0.5', close ? COL.gold : '#c9d6da', 14);
      shake(close ? .35 : .15);
      break;
    }
  }
}

export function updateMachines(dt) {
  for (const m of S.machines.values()) {
    if (m.pop < 1) {
      const was = m.pop;
      m.pop = Math.min(1, m.pop + dt / .3);
      if (was < 0 && m.pop >= 0) {
        const ce = center(m.cell);
        ring(ce.x, ce.y, 'rgba(230,240,245,.9)', 14, 36);
        burst(ce.x, ce.y, '#ffffff', 10, 150, 3, 0, .4);
        shake(.12);
      }
    }
    if (m.jam > 0) {
      m.jam -= dt;
      if (rand() < dt * 14) { const ce = center(m.cell); burst(ce.x + rnd(-20, 20), ce.y + rnd(-20, 20), '#ffd25e', 2, 120, 1.5, 0, .2, 2); }
      continue;
    }
    if (S.rubble.has(key(m.cell))) continue;
    m.busy = Math.max(0, m.busy - dt);
    m.work = Math.max(0, m.work - dt / .3);
    m.fire = Math.max(0, m.fire - dt / .45);
    m.ang += angDiff(m.ang, Math.atan2(m.dir.y, m.dir.x)) * (1 - Math.exp(-18 * dt));
    m.lever = lerp(m.lever, m.leverT || 0, 1 - Math.exp(-20 * dt));
    if (m.wind > 0) { m.wind -= dt; if (m.wind <= 0 && m.load.length) fire(m); }
    if (KINDS[m.kind].role === 'manip') emitFromMachine(m);
    const ce = center(m.cell);
    switch (m.kind) {
      case 'chute': {
        m.rollT -= dt;
        const ck = key(m.cell) + ',m';
        if (m.hopper.length && !S.stops.has(ck) && canEnter(m.cell, m.dir)) {
          const d = newDie({v: m.hopper.shift()}, m.cell, m.dir, ck);
          d.roll = .2;
          tryAdvance(d);
        }
        break;
      }
      case 'rocket':
        if (m.launch > 0) {
          m.launch -= dt;
          if (rand() < dt * 30) burst(ce.x + rnd(-8, 8), ce.y + 18, '#b8c2c6', 1, 40, 5, -40, .7);
          if (m.launch <= 0) {
            const ru = targetUnit(false);
            const tg = ru ? {x: ru.x, y: unitY(ru)} : foeTarget(20);
            S.proj.push({kind: 'rocket', dice: m.load.slice(), mult: 1.25 * lvlMult(m), src: m, x0: ce.x, y0: ce.y - 10, x1: tg.x, y1: tg.y, t: 0, dur: 1.35, arc: 260, rot: 0, knock: 3.6, unit: ru});
            S.stats.thrown += m.load.length;
            m.load = []; m.fire = 1;
            burst(ce.x, ce.y + 10, COL.gold, 20, 200, 4, 0, .5);
            burst(ce.x, ce.y + 10, '#9aa4aa', 14, 120, 7, -30, 1.0);
            shake(.35);
          }
        }
        break;
      case 'gatling': {
        const want = m.mag.length ? 1 : 0;
        m.spinV = lerp(m.spinV, want, 1 - Math.exp(-(want ? 3 : 2) * dt));
        m.spin += m.spinV * dt * 30;
        if (m.mag.length && m.spinV > .85) {
          m.shotT -= dt;
          if (m.shotT <= 0) {
            m.shotT = .11;
            shoot(m, 'bullet', [m.mag.shift()], 1, {ox: 26, speed: 1400, arc: 6, spread: 50, size: .7, knock: .6});
            burst(ce.x + 28, ce.y, '#ffe27a', 3, 200, 1.5, 0, .12, 2, 0, .4);
            shake(.04);
          }
        }
        break;
      }
      case 'pipgat': {
        // sprays the pip tank: one pip, one point of damage
        const want = S.pips >= 1 ? 1 : 0;
        m.spinV = lerp(m.spinV, want, 1 - Math.exp(-4 * dt));
        m.spin += m.spinV * dt * 30;
        if (want && m.spinV > .6 && !S.over) {
          m.shotT -= dt;
          if (m.shotT <= 0) {
            m.shotT = .08; S.pips -= 1;
            shoot(m, 'pip', [{v: 1}], 2, {ox: 24, speed: 1500, arc: 4, spread: 40, size: .4, knock: .1});   // x2 vs mites and flyers
          }
        }
        break;
      }
      case 'slots':
        if (m.reel > 0) {
          m.reel -= dt;
          if (m.reel <= 0) {
            const vs = m.load.map(() => ri(1, 6));
            m.load.forEach((d, i) => { d.v = vs[i]; });
            const s = [...vs].sort();
            let mult = .5, label = `${vs.join(' ')}  bust x0.5`;
            if (s[0] === s[2]) { mult = 8; label = `${vs.join(' ')}  JACKPOT x8`; }
            else if (s[0] === s[1] || s[1] === s[2]) { mult = 2; label = `${vs.join(' ')}  pair x2`; }
            say(ce.x, ce.y - 42, label, mult >= 2 ? COL.gold : '#c9d6da', mult >= 8 ? 20 : 14);
            if (mult >= 8) { burst(ce.x, ce.y, COL.gold, 40, 300, 4, 300, .9); shake(.5); }
            const load = m.load; m.load = [];
            shoot(m, 'cluster', load, mult, {oy: -8, dur: .85, arc: 130, knock: 1.2, size: 1 + (mult >= 8 ? .3 : 0)});
          }
        }
        break;
      case 'lens':
        if (m.fuel > 0) {
          m.fuel = Math.max(0, m.fuel - dt);
          const dps = 7;
          // the beam sweeps flyers out of the sky first
          const fl = S.flyers.filter(o => o.delay <= 0).sort((a, b) => Math.hypot(a.x - ce.x, a.y - ce.y) - Math.hypot(b.x - ce.x, b.y - ce.y))[0];
          m.beamAt = fl ? {x: fl.x, y: fl.y} : null;
          if (fl) { fl.hp -= dps * 1.5 * dt; if (fl.hp <= 0) { fl.hp = .01; hitFlyer(fl, 1); } break; }
          // then mites, front first
          const lu = liveUnits().sort((a, b) => a.x - b.x)[0];
          if (lu) { m.beamAt = {x: lu.x, y: unitY(lu)}; lu.hp -= dps * 1.3 * dt; lu.hit = .05; if (lu.hp <= 0) hurtUnit(lu, .01); break; }
          const lph = PHASES[S.foe.phase];
          hurtFoe(dps * dt * (shellOpen() ? 1.5 : (effArmor() ? .35 : 1) * (lph.locks ? LOCK_MISS : 1)), {quiet: true});
          m.beamAcc = (m.beamAcc || 0) + dps * dt;
          if (m.beamAcc >= 5) { const tg = foeTarget(20); say(tg.x, tg.y - 20, String(Math.round(m.beamAcc)), '#fff2a8', 15); m.beamAcc = 0; }
          if (rand() < dt * 30) { const tg = foeTarget(25); burst(tg.x, tg.y, rand() < .5 ? COL.gold : '#ffffff', 2, 120, 2, 0, .25, 2); }
        }
        break;
      case 'ram': {
        if (!m.load.length || S.over) break;
        const d = m.load[0], push = d.v * (d.spiky ? SPIKE : 1);
        const near = liveUnits().filter(u => u.x - u.r <= REACH_X + 90);
        if (near.length) {
          // mites at the wall get shoved back and squashed
          m.load = [];
          for (const u of near) { u.x += 40 + push * 6; hurtUnit(u, Math.round(push * 1.5)); }
          say(REACH_X + 60, GROUND - 120, 'RAM!', '#7fe0c6', 22);
          shake(.35);
        } else if (foeFront() <= REACH_X + 70) {
          m.load = [];
          S.foe.kv += push * 34;
          hurtFoe(Math.round(push), {x: foeFront(), y: GROUND - 60});
          say(foeFront() + 20, GROUND - 160, 'RAM!', '#7fe0c6', 22);
          burst(foeFront(), GROUND - 60, '#ffffff', 18, 260, 3, 0, .4, 2, 0, .8);
          shake(.45);
        } else break;
        S.ramFx.push({t: 0, y: ce.y, to: near.length ? REACH_X + 70 : foeFront()});
        m.fire = 1; m.busy = 1.2;
        break;
      }
    }
  }
}

export function rollChutes(dt) {
  S.rollT -= dt;
  if (S.rollT > 0) return;
  rollNow();
}
export function rollNow() {
  S.rollT = ROLL_EVERY;
  for (const ch of S.machines.values()) {
    if (ch.kind !== 'chute' || ch.pop < 1) continue;
    const ce = center(ch.cell);
    ch.work = 1;
    let spilled = 0;
    for (let i = 0; i < PHASES[S.foe.phase].roll; i++) {
      const v = ri(1, 6);
      if (ch.hopper.length >= HOPPER_MAX) {
        // the hopper overflows: dice tumble onto the tiles around the chute
        spilled++; S.stats.spilled++;
        overflowDie(ch.cell, {v}, {x: ce.x, y: ce.y - 20});
      } else ch.hopper.push(v);
    }
    say(ce.x, ce.y - 44, spilled ? 'SPILL x' + spilled : 'ROLL', spilled ? '#ff8a73' : '#e9fbff', spilled ? 16 : 14);
    if (spilled) shake(.15);
  }
}

// ============================================================ projectiles
export function projPos(p) {
  const t = clamp(p.t / p.dur, 0, 1);
  if (p.kind === 'rocket') {
    const c = {x: lerp(p.x0, p.x1, .25), y: Math.min(p.y0, p.y1) - p.arc};
    return bez({x: p.x0, y: p.y0}, c, {x: p.x1, y: p.y1}, t * t * (3 - 2 * t));
  }
  return {x: lerp(p.x0, p.x1, t), y: lerp(p.y0, p.y1, t) - p.arc * 4 * t * (1 - t)};
}

export function updateProj(dt) {
  for (const p of S.proj.slice()) {
    p.t += dt;
    if (p.t < 0) continue;
    if (p.fly && S.flyers.includes(p.fly)) { p.x1 = p.fly.x; p.y1 = p.fly.y; }
    if (p.unit && S.units.includes(p.unit)) { p.x1 = p.unit.x; p.y1 = unitY(p.unit); }
    p.rot += dt * (p.kind === 'cannon' || p.kind === 'bullet' ? 18 : 9);
    const q = projPos(p);
    if (p.kind === 'rocket' && rand() < dt * 60) S.parts.push({x: q.x, y: q.y, vx: rnd(-20, 20), vy: rnd(-20, 20), col: rand() < .5 ? COL.gold : '#c4ccd0', size: rnd(3, 7), g: -10, life: .7, t: 0, shape: 0, rot: 0, vr: 0});
    if (p.kind === 'cryo' && rand() < dt * 50) S.parts.push({x: q.x + rnd(-10, 10), y: q.y + rnd(-10, 10), vx: rnd(-20, 20), vy: rnd(-20, 20), col: COL.ice, size: rnd(3, 6), g: 0, life: .6, t: 0, shape: 0, rot: 0, vr: 0});
    if (p.kind === 'rock' && rand() < dt * 20) S.parts.push({x: q.x, y: q.y, vx: 0, vy: 0, col: '#6b5a48', size: 3, g: 0, life: .3, t: 0, shape: 0, rot: 0, vr: 0});
    if (p.t < p.dur) continue;
    S.proj.splice(S.proj.indexOf(p), 1);
    landProj(p, q);
  }
}

export function landProj(p, q) {
  const d0 = p.dice && p.dice[0];
  switch (p.kind) {
    case 'brick': {
      S.pendingBricks--;
      S.bricks.push({v: d0.v, hp: d0.v * (d0.spiky ? SPIKE : 1), hot: d0.hot, ice: d0.ice, pop: 1});
      const bp = brickPos(S.bricks.length - 1);
      burst(bp.x, bp.y, COL.blk, 8, 120, 2.5, 0, .35);
      return;
    }
    case 'thorn': {
      const th = S.thorns[p.slot];
      if (th) { th.v = d0.v; th.pending = false; th.pop = 1; }
      burst(q.x, q.y, '#8a7a5a', 8, 120, 3, 400, .4, 1);
      return;
    }
    case 'mine':
      S.mines.push({x: q.x, d: d0, t: 0});
      burst(q.x, q.y, '#8a7a5a', 10, 140, 3, 500, .5, 1);
      return;
    case 'rock':
      hitFactory(p.dmg, q.y, true);
      burst(q.x, q.y, '#6b5a48', 10, 200, 4, 600, .6, 1);
      return;
    case 'boulder': {
      // buries a factory tile: dice can't pass until it is dug out
      const c = p.cell, k = key(c);
      if (S.shield > 0 && [...S.machines.values()].some(m => m.kind === 'parry' && m.charges > 0)) {
        say(q.x, q.y - 20, 'deflected', COL.blk, 14); burst(q.x, q.y, COL.blk, 12, 200, 3, 0, .4); return;
      }
      S.rubble.set(k, {t: 16, max: 16, pop: 1});
      burst(q.x, q.y, '#7a6a58', 24, 260, 5, 700, .8, 1);
      ring(q.x, q.y, 'rgba(255,220,180,.8)', 10, 60, .4);
      say(q.x, q.y - 30, 'BURIED', '#ffb0a0', 16);
      shake(.45);
      return;
    }
    case 'cryo':
      if (S.over) return;
      S.foe.chill = Math.min(10, S.foe.chill + d0.v * .7);
      for (const u of S.units) u.chill = Math.max(u.chill, d0.v * .7);
      say(q.x, q.y - 30, 'chilled', COL.ice, 16);
      burst(q.x, q.y, COL.ice, 24, 220, 3, 0, .6);
      ring(q.x, q.y, 'rgba(200,236,255,.9)', 10, 60);
      return;
    case 'ricoback': {
      const tg = foeTarget(30);
      S.proj.push({kind: 'rico', dice: p.dice, mult: p.mult, src: p.src, x0: q.x, y0: q.y, x1: tg.x, y1: tg.y, t: 0, dur: .45, arc: 70, rot: 0, knock: .8, bounces: p.bounces});
      ring(q.x, q.y, 'rgba(255,255,255,.6)', 6, 20, .2);
      return;
    }
  }
  S.curSrc = p.src || null;     // credit the machine that fired, for its tally
  impact(p, q);
  S.curSrc = null;
}

export function hurtFoe(dmg, o = {}) {
  const f = S.foe;
  if (S.over) return;
  if (S.mode === 'build') {
    // practice: show the hit, count it for the dmg/s meter, but it doesn't count
    S.dmgLog.push({t: S.t, d: dmg});
    if (S.curSrc) { S.curSrc.turnDmg += dmg; S.curSrc.totalDmg = (S.curSrc.totalDmg || 0) + dmg; }
    f.hit = .12;
    if (!o.quiet && o.x !== undefined) say(o.x, o.y - 30, fmtDmg(dmg), '#ffd0c4', 16);
    return;
  }
  if (o.burnOnly !== true) { f.hit = .12; if (!o.quiet) f.flash = 1; }
  f.hp = Math.max(0, f.hp - dmg);
  if (S.curSrc) { S.curSrc.turnDmg += dmg; S.curSrc.totalDmg = (S.curSrc.totalDmg || 0) + dmg; }
  S.stats.dmg += dmg;
  if (!o.quiet && o.x !== undefined) say(o.x, o.y - 30, fmtDmg(dmg), '#ff8a73', 18 + Math.min(14, dmg / 2));
  if (f.hp <= 0) killFoe();
}

export function impact(p, q) {
  const f = S.foe;
  if (S.over) return;
  const dice = p.dice || [];
  if (p.fly) {
    p.fly.incoming = Math.max(0, (p.fly.incoming || 0) - 1);
    if (S.flyers.includes(p.fly)) {
      hitFlyer(p.fly, diceDamage(dice, p.mult, true));
      for (const d of dice) debrisDie(q.x, q.y, d, rnd(-60, 60), rnd(-200, -80));
      burst(q.x, q.y, '#ffe27a', 6, 160, 2, 0, .2, 2);
      return;
    }
    // its flyer is already gone: the die keeps going at the Colossus
    const tg = foeTarget(30);
    S.proj.push({...p, fly: null, x0: q.x, y0: q.y, x1: tg.x, y1: tg.y, t: 0, dur: Math.hypot(tg.x - q.x, tg.y - q.y) / 1000, arc: 10});
    return;
  }
  if (p.unit) {
    const u = p.unit;
    u.incoming = Math.max(0, (u.incoming || 0) - 1);
    const alive = S.units.includes(u);
    const sticky = p.kind === 'sticky';
    const R = SPLASH[p.kind] || 0;
    // venom on a mite just hurts more (they don't live long enough to tick)
    const venom = dice.filter(d => d.venom).reduce((a, d) => a + d.v, 0);
    const dmg = (p.flat ?? diceDamage(dice, sticky ? 4 : (p.mult ?? 1), true)) + venom;
    if (alive) hurtUnit(u, dmg);
    if (R) splashUnits(q.x, q.y, R, Math.max(1, Math.round(dmg * .6)), alive ? u : null);
    if (!alive && !R) {
      // its mite is already dead: find another, or go on to the foe
      const nu = targetUnit(true);
      const tg = nu ? {x: nu.x, y: unitY(nu)} : foeTarget(30);
      S.proj.push({...p, unit: nu, x0: q.x, y0: q.y, x1: tg.x, y1: tg.y, t: 0, dur: Math.max(.08, Math.hypot(tg.x - q.x, tg.y - q.y) / 1100), arc: 6});
      return;
    }
    for (const d of dice) debrisDie(q.x, q.y, d, rnd(-80, 160), rnd(-260, -100));
    burst(q.x, q.y, dice.some(d => d.hot) ? COL.ember : '#ffe27a', 8, 200, 2.5, 0, .25, 2);
    if (p.kind === 'rocket') { burst(q.x, q.y, COL.gold, 30, 380, 5, 200, .6); shake(.6); }
    else shake(R ? .2 : .04);
    return;
  }
  // a pip is one point, and armor stops it almost completely
  if (p.kind === 'pip') {
    const ph = PHASES[f.phase];
    let pd = 1;
    if (effArmor() > 1 && !shellOpen()) pd = .15;
    if (ph.locks) pd *= LOCK_MISS;          // pips are not real faces: they never match
    hurtFoe(pd, {quiet: true});
    f.pipAcc = (f.pipAcc || 0) + pd;
    if (f.pipAcc >= 5) { say(q.x, q.y - 26, String(Math.round(f.pipAcc)), COL.pip, 14); f.pipAcc = 0; }
    burst(q.x, q.y, COL.pip, 2, 90, 1.5, 0, .15, 2);
    return;
  }
  // venom stacks poison: one stack per pip (against a lock, only matching faces count fully)
  const lockF = PHASES[f.phase].locks ? f.locks : null;
  const venom = dice.filter(d => d.venom).reduce((a, d) => a + d.v * (lockF && !lockF.includes(d.v) ? LOCK_MISS : 1), 0);
  if (venom) { f.poison = Math.min(300, (f.poison || 0) + venom); say(q.x + 30, q.y - 40, `+${Math.round(venom)} ☠`, COL.venom, 15); }
  if (p.kind === 'catalyst' && f.poison > 0) {
    f.poison = Math.min(150, f.poison * 1.5);
    say(q.x, q.y - 70, `CATALYZED ☠ ${Math.round(f.poison)}`, COL.venom, 20);
    burst(q.x, q.y, COL.venom, 30, 300, 4, 0, .6); shake(.3);
  }
  if (p.kind === 'sand' && dice[0] && dice[0].v <= 2 && (PHASES[f.phase].armor || 0) > (f.shred || 0)) {
    f.shred = (f.shred || 0) + 1;
    say(q.x, q.y - 70, `−1 ARMOR (now ${effArmor()})`, '#d8c79a', 18);
    burst(q.x, q.y, '#d8c79a', 24, 260, 3, 200, .6);
  }
  if (p.flat) {
    // a Rampart brick: heavy enough to ignore armor, but a lock still wants its face
    const lk = PHASES[f.phase].locks ? f.locks : null;
    if (lk) { p.flat = p.flat * (lk.includes(dice[0].v) ? PHASES[f.phase].match : LOCK_MISS); say(q.x - 30, q.y - 58, lk.includes(dice[0].v) ? 'MATCH!' : 'no match', lk.includes(dice[0].v) ? '#8fe08f' : '#c9d6da', 14); }
    hurtFoe(p.flat);
    f.flash = 1; f.kv += p.flat * .8;
    say(q.x, q.y - 30, fmtDmg(p.flat), COL.blk, Math.min(36, 18 + p.flat * .3));
    burst(q.x, q.y, COL.blk, 24, 300, 4, 300, .6, 1); ring(q.x, q.y, 'rgba(180,220,255,.9)', 10, 70);
    debrisDie(q.x, q.y, dice[0], rnd(-60, 160), -260);
    shake(.45);
    return;
  }
  const melt = !!PHASES[f.phase].meltdown;
  const hot = dice.some(d => d.hot) && !melt, ice = dice.some(d => d.ice);
  if (melt && dice.some(d => d.hot) && rand() < .4) say(q.x + 20, q.y - 50, 'fire: no effect', '#c9d6da', 12);
  if (p.kind === 'sticky') {
    S.bombs.push({ox: q.x - f.x, oy: q.y - GROUND, d: dice[0], t: 2.0});
    say(q.x, q.y - 26, 'stuck!', '#ffb0a0', 14);
    burst(q.x, q.y, '#ff8a73', 6, 80, 2, 0, .25);
    return;
  }
  const dmg = diceDamage(dice, p.mult ?? 1);
  if (lastClink) { say(q.x - 24, q.y - 6, lastClink === dice.length ? 'clink' : `${lastClink} clink`, '#c9d6da', 13); burst(q.x, q.y, '#ffffff', 5, 200, 1.5, 0, .15, 2); }
  if (lastMatch > 0) { say(q.x - 30, q.y - 58, 'MATCH!', '#8fe08f', 18); ring(q.x, q.y, 'rgba(140,230,140,.9)', 10, 50); }
  else if (lastMatch === 0) say(q.x - 24, q.y - 6, 'no match', '#c9d6da', 12);
  if (shellOpen()) say(q.x - 30, q.y - 58, 'EXPOSED!', COL.gold, 15);
  hurtFoe(dmg);
  f.flash = 1;
  f.kv += dmg * .9 * (p.knock ?? 1);
  if (hot) f.burn = 3;
  if (ice) f.chill = Math.min(10, f.chill + 1.5 * dice.filter(d => d.ice).length);
  const big = p.kind === 'rocket';
  say(q.x, q.y - 30, fmtDmg(dmg), big ? COL.gold : '#ff8a73', big ? 34 : Math.min(34, 18 + dmg * .6));
  if (p.label) say(q.x, q.y - 60, p.label, COL.gold, 15);
  if (p.kind === 'harpoon') {
    const v = dice[0].v * (dice[0].spiky ? SPIKE : 1);
    f.pinned = Math.max(f.pinned, v * .6);
    say(q.x, q.y - 58, 'PINNED', '#7fe0c6', 18);
  } else if (p.kind === 'rico' && p.bounces > 0) {
    S.proj.push({kind: 'ricoback', dice, mult: (p.mult ?? 1) * .5, src: p.src, x0: q.x, y0: q.y, x1: q.x - rnd(110, 170), y1: GROUND - 20, t: 0, dur: .4, arc: 60, rot: 0, bounces: p.bounces - 1});
  } else {
    for (const d of dice) debrisDie(q.x, q.y, d, rnd(-80, 260), rnd(-380, -120));
  }
  if (big) {
    burst(q.x, q.y, COL.gold, 40, 420, 5, 200, .7);
    burst(q.x, q.y, COL.weapon, 26, 300, 4, 0, .6);
    burst(q.x, q.y, '#9aa4aa', 18, 160, 9, -40, 1.1);
    ring(q.x, q.y, 'rgba(255,240,200,.9)', 20, 150, .5);
    shake(.9);
  } else {
    burst(q.x, q.y, hot ? COL.ember : (ice ? COL.ice : '#ffe27a'), 10, 240, 2.5, 0, .3, 2);
    ring(q.x, q.y, 'rgba(255,255,255,.8)', 8, 34, .25);
    shake(p.kind === 'pult' || p.kind === 'cluster' ? .22 : .08);
  }
}

// ============================================================ wall, thorns, mines
export function brickPos(i) {
  const row = Math.floor(i / WALL_COLS), col = i % WALL_COLS;
  return {x: WALL_X0 + 15 + col * (BRICK + 2) + (row % 2 ? 6 : 0), y: GROUND - 14 - row * (BRICK - 1)};
}
export const thornX = i => WALL_X1 + 8 + (i % 4) * 9 + Math.floor(i / 4) * 4;

export function hitFactory(dmg, y, isRock) {
  // a raised parry shield blocks anything; a slam spends a charge and stuns
  // in turn mode a charged shield raises itself against a slam (no reflex taps)
  // in turn mode a fully charged shield (3) raises itself against a slam and spends it all
  const autoParry = opts.turns && !isRock && [...S.machines.values()].some(m => m.kind === 'parry' && m.charges >= 3);
  if (S.shield > 0 || autoParry) {
    if (opts.turns) S.shield = Math.max(S.shield, .55);
    const pm = [...S.machines.values()].find(m => m.kind === 'parry' && m.charges >= (opts.turns ? 3 : 1));
    if (pm) {
      if (!isRock) {
        pm.charges = opts.turns ? 0 : pm.charges - 1;
        S.foe.stun = 2.5; S.foe.state = 'march'; S.foe.timer = 0;
        hurtFoe(opts.turns ? 15 : 25, {x: foeFront() + 30, y: GROUND - 150});
        say(WALL_X1 + 40, GROUND - 210, 'PARRY!', '#ffffff', 34);
        ring(WALL_X1, GROUND - 100, 'rgba(180,220,255,1)', 30, 200, .5);
        burst(WALL_X1 + 10, GROUND - 100, COL.blk, 40, 400, 4, 0, .6);
        shake(.7);
      } else say(WALL_X1 - 20, (y || GROUND - 120) - 10, 'deflected', COL.blk, 14);
      return;
    }
  }
  let left = dmg;
  while (left > 0 && S.bricks.length) {
    const b = S.bricks[S.bricks.length - 1];
    const take = Math.min(b.hp, left);
    b.hp -= take; left -= take; b.pop = 1;
    if (b.hp <= 0) {
      const bp = brickPos(S.bricks.length - 1);
      S.bricks.pop();
      debrisDie(bp.x, bp.y, b, rnd(-260, -60), rnd(-320, -120));
      burst(bp.x, bp.y, COL.blk, 6, 140, 2.5, 0, .3);
    }
  }
  const top = brickPos(Math.max(0, S.bricks.length - 1));
  if (dmg - left > 0) say(WALL_X0 + 40, top.y - 20, 'blocked ' + Math.round(dmg - left), COL.blk, 15);
  if (left > 0) {
    if (!opts.god) S.hp = Math.max(0, S.hp - left);
    S.hitFlash = 1;
    say(WALL_X0 + 30, (y || GROUND - 120) - 10, '-' + Math.round(left), COL.drop, 24);
    shake(.5);
    if (S.hp <= 0) { S.over = 'lost'; burst(300, 300, '#ff8a73', 60, 500, 6, 300, 1.2, 1); }
  } else shake(.25);
}

export function thornsBite() {
  const live = S.thorns.filter(t => !t.pending && t.v > 0);
  if (!live.length) return;
  let dmg = 0;
  for (const t of live) { dmg += t.v * (t.spiky ? SPIKE : 1) * 1.5; t.v--; t.pop = 1; }
  S.thorns = S.thorns.filter(t => t.pending || t.v > 0);
  hurtFoe(Math.round(dmg), {x: foeFront() + 10, y: GROUND - 40});
  say(foeFront() + 10, GROUND - 100, 'THORNS', '#d9b8f2', 16);
  burst(foeFront(), GROUND - 20, '#ffffff', 14, 260, 2, 0, .3, 2, -Math.PI / 2, 1);
}

export function updateField(dt) {
  const f = S.foe;
  for (const mn of S.mines.slice()) {
    mn.t += dt;
    const miteOn = liveUnits().some(u => Math.abs(u.x - mn.x) <= u.r + 10);
    if (!S.over && (foeFront() <= mn.x + 14 || miteOn)) {
      S.mines.splice(S.mines.indexOf(mn), 1);
      const dmg = diceDamage([mn.d], 3);
      if (miteOn) splashUnits(mn.x, GROUND - 12, 60, diceDamage([mn.d], 3, true), null);
      else { hurtFoe(dmg, {x: mn.x, y: GROUND - 40}); f.kv += dmg * 1.2; }
      if (mn.d.hot) f.burn = 3;
      if (mn.d.ice) f.chill = Math.min(10, f.chill + 2);
      burst(mn.x, GROUND - 10, COL.gold, 24, 320, 4, 300, .6);
      burst(mn.x, GROUND - 10, '#6b5a48', 12, 220, 4, 700, .7, 1);
      ring(mn.x, GROUND - 10, 'rgba(255,230,160,.9)', 10, 80);
      debrisDie(mn.x, GROUND - 20, mn.d, rnd(-100, 100), -350);
      shake(.4);
    }
  }
  for (const b of S.bombs.slice()) {
    b.t -= dt;
    if (b.t <= 0 || S.over) {
      S.bombs.splice(S.bombs.indexOf(b), 1);
      if (S.over) continue;
      const x = f.x + b.ox, y = GROUND + b.oy;
      const dmg = diceDamage([b.d], 4);
      hurtFoe(dmg, {x, y});
      f.kv += dmg * 1.4;
      if (b.d.hot) f.burn = 3;
      burst(x, y, COL.gold, 30, 340, 4, 200, .6);
      burst(x, y, COL.weapon, 16, 240, 4, 0, .5);
      ring(x, y, 'rgba(255,230,160,.9)', 10, 90);
      debrisDie(x, y, b.d, rnd(-60, 200), -300);
      shake(.45);
    }
  }
  for (const r of S.ramFx.slice()) { r.t += dt; if (r.t > .35) S.ramFx.splice(S.ramFx.indexOf(r), 1); }
  // in turn mode the foe's side holds still while your line runs
  const foeFrozen = opts.turns && S.tphase === 'run';
  for (const [k, rb] of S.rubble) {
    if (!foeFrozen) rb.t -= dt;
    rb.pop = Math.max(0, rb.pop - dt * 3);
    if (rb.t <= 0) { S.rubble.delete(k); const ce = center(parseKey(k)); burst(ce.x, ce.y, '#7a6a58', 14, 160, 4, 400, .5, 1); }
  }
  if (!foeFrozen) { updateFlyers(dt); updateUnits(dt); }
  updatePiles(dt);
  if (S.banner) { S.banner.t += dt; if (S.banner.t > S.banner.life) S.banner = null; }
  for (const t of S.thorns) t.pop = Math.max(0, (t.pop || 0) - dt * 3);
  S.shield = Math.max(0, S.shield - dt);
  S.shieldCd = Math.max(0, S.shieldCd - dt);
}

export function raiseParry() {
  if (S.shieldCd > 0) return;
  const any = [...S.machines.values()].some(m => m.kind === 'parry');
  if (!any) return;
  S.shield = .55; S.shieldCd = 1.1;
  ring(WALL_X1, GROUND - 120, 'rgba(160,210,255,.8)', 20, 90, .3);
}

// ============================================================ heaps
// Dice that run off a belt onto bare floor are not lost: they heap up there.
// A heap holds 6; more tumble onto a neighbouring tile (another heap, or onto
// a belt, where they join that line). Lay a belt over a heap to scoop it up.

export const PILE_MAX = 6;
export const isBareFloor = c => inGrid(c) && !S.belts.has(key(c)) && !S.machines.has(key(c)) && !S.rubble.has(key(c)) && !S.pillars.has(key(c));

export function addToPile(c, spec, from) {
  const k = key(c);
  let pl = S.piles.get(k);
  if (!pl) { pl = {dice: [], feedT: 0}; S.piles.set(k, pl); }
  if (pl.dice.length >= PILE_MAX) { overflowDie(c, spec, from); return; }
  const p = from || center(c);
  pl.dice.push({...dieSpec(spec), rot: rnd(-.5, .5), t: 0, fx: p.x, fy: p.y});
}

// a die tumbles from tile c onto a random neighbour
export function overflowDie(c, spec, from) {
  const p = from || center(c);
  const ns = [R, D, L, U].map(d => add(c, d)).filter(inGrid).sort(() => rand() - .5);
  for (const n of ns) {
    const nk = key(n);
    if (S.rubble.has(nk)) continue;
    const b = S.belts.get(nk);
    if (b && !S.stops.has(nk + ',0')) {
      const d = newDie(dieSpec(spec), n, b, nk + ',0');
      d.x = p.x; d.y = p.y;
      d.state = 'jump'; d.jt = 0; d.jfrom = {x: p.x, y: p.y}; d.jto = pathPt(n, b, b, .25, false);
      d.jland = {cell: n, dout: b, s: .25, mach: null}; d.dout = b;
      return;
    }
    if (isBareFloor(n) && (!S.piles.has(nk) || S.piles.get(nk).dice.length < PILE_MAX)) { addToPile(n, spec, p); return; }
  }
  // nowhere to go: it bounces off the floor and is gone
  S.stats.lost++;
  debrisDie(p.x, p.y, dieSpec(spec), rnd(-120, 120), rnd(-300, -150));
}

export function updatePiles(dt) {
  for (const [k, pl] of S.piles) {
    for (const pd of pl.dice) pd.t += dt;
    const c = parseKey(k);
    // a machine dropped on a heap shoves the dice aside
    if (S.machines.has(k)) { const ds = pl.dice.splice(0); S.piles.delete(k); for (const pd of ds) overflowDie(c, pd); continue; }
    // a belt laid over a heap scoops it up, one die at a time
    const b = S.belts.get(k);
    if (b && !S.rubble.has(k)) {
      pl.feedT -= dt;
      if (pl.feedT <= 0 && pl.dice.length && !S.stops.has(k + ',0')) {
        pl.feedT = .2;
        const pd = pl.dice.pop();
        const d = newDie(pd, c, b, k + ',0');
        d.s = .25; d.pop = 1;
        const q = pathPt(c, b, b, .25, false); d.x = q.x; d.y = q.y;
      }
    }
    if (!pl.dice.length) S.piles.delete(k);
  }
}

// ============================================================ mites (the swarm)
// Little walkers from the Mite Mother. Few HP each, so a big die on one mite
// is mostly wasted; splash weapons hit everything nearby. They gnaw the wall.
export const SPLASH = {rocket: 100, pult: 45, cluster: 55, sticky: 70, meteor: 50, rampart: 40};

export function spawnWave(n, ph) {
  const f = S.foe;
  for (let i = 0; i < n; i++) {
    const big = ph.bigEvery && i % ph.bigEvery === ph.bigEvery - 1;
    const hp = big ? ph.miteHp * 2.5 : ph.miteHp;
    S.units.push({id: S.nextUnit++, x: f.x - 60 + rnd(-10, 30), lane: rnd(-12, 10), r: big ? 15 : 9, big, hp, max: hp,
      speed: big ? 26 : rnd(36, 50), cd: rnd(.3, 1.2), delay: i * .22, t: rnd(0, 6), hit: 0, chill: 0, incoming: 0});
  }
  say(f.x - 30, GROUND - 200, `BROOD ×${n}`, '#ffb0a0', 20);
  burst(f.x - 50, GROUND - 60, '#b0845c', 18, 220, 3, 300, .6, 1);
}
export const unitY = u => GROUND - u.r - 3 + u.lane;
export const liveUnits = () => S.units.filter(u => u.delay <= 0);

// frontmost mite; fast weapons spread out over several
export function targetUnit(spread) {
  let best = null, bs = 1e9;
  for (const u of liveUnits()) {
    const sc = u.x + (spread ? (u.incoming || 0) * 45 : 0);
    if (sc < bs) { bs = sc; best = u; }
  }
  if (best) best.incoming = (best.incoming || 0) + 1;
  return best;
}

export function hurtUnit(u, dmg) {
  if (!S.units.includes(u)) return;
  u.hp -= dmg; u.hit = .12;
  if (S.curSrc) { S.curSrc.turnDmg += dmg; S.curSrc.totalDmg = (S.curSrc.totalDmg || 0) + dmg; }
  if (dmg >= 1) say(u.x, unitY(u) - u.r - 10, String(Math.round(dmg)), '#ffd0c4', 12);
  if (u.hp > 0) return;
  S.units.splice(S.units.indexOf(u), 1);
  S.stats.downed++;
  S.gears += 1;                                         // every mite pays a gear
  burst(u.x, unitY(u), '#b0845c', u.big ? 14 : 8, 200, u.big ? 4 : 3, 500, .5, 1);
  burst(u.x, unitY(u), COL.gold, 3, 80, 2, 0, .3);
}

export function splashUnits(x, y, r, dmg, skip) {
  for (const u of liveUnits()) if (u !== skip && Math.hypot(u.x - x, unitY(u) - y) <= r + u.r) hurtUnit(u, dmg);
  ring(x, y, 'rgba(255,220,160,.8)', 8, r, .35);
}

// mites gnaw the wall: bricks first, then the factory
export function nibble(dmg) {
  if (S.shield > 0) return;
  let left = dmg;
  while (left > 0 && S.bricks.length) {
    const b = S.bricks[S.bricks.length - 1];
    const take = Math.min(b.hp, left);
    b.hp -= take; left -= take; b.pop = .6;
    if (b.hp <= 0) { const bp = brickPos(S.bricks.length - 1); S.bricks.pop(); debrisDie(bp.x, bp.y, b, rnd(-200, -60), rnd(-260, -120)); }
  }
  if (left > 0 && !opts.god) {
    S.hp = Math.max(0, S.hp - left); S.hitFlash = .6;
    if (S.hp <= 0 && !S.over) { S.over = 'lost'; burst(300, 300, '#ff8a73', 60, 500, 6, 300, 1.2, 1); }
  }
}

export function updateUnits(dt) {
  const thornBite = S.thorns.filter(t => !t.pending && t.v > 0).reduce((a, t) => a + t.v, 0) * .25;
  for (const u of S.units.slice()) {
    if (u.delay > 0) { u.delay -= dt; continue; }
    u.t += dt; u.hit = Math.max(0, u.hit - dt); u.chill = Math.max(0, u.chill - dt);
    const stop = REACH_X + u.r + 2 + (u.id % 5) * 7;
    if (u.x > stop) { u.x = Math.max(stop, u.x - u.speed * (u.chill > 0 ? .45 : 1) * dt); continue; }
    u.cd -= dt;
    if (u.cd <= 0) {
      u.cd = 1.2;
      nibble(u.big ? 3 : 1);
      burst(WALL_X1 + 4, unitY(u), '#8a9aa0', 2, 90, 2, 300, .3, 1, Math.PI, .8);
      if (thornBite > 0) hurtUnit(u, thornBite);
    }
  }
}

// ============================================================ flyers
// Little drones from the Colossus's hatch. They fly over the wall, then dive
// at a die on your belts (and carry it off) or at a machine (and jam it).
// Fast weapons and the Lens shoot them first. Click a jammed machine to fix it.

export function spawnFlyers(n) {
  const f = S.foe;
  for (let i = 0; i < n; i++) {
    S.flyers.push({x: f.x - 20 + rnd(-30, 30), y: GROUND - 180 + rnd(-30, 30), hp: 3, max: 3, t: rnd(0, 6), state: 'fly',
      target: null, carry: null, speed: rnd(85, 110), incoming: 0, delay: i * .18});
  }
  burst(f.x - 10, GROUND - 190, '#c9a56a', 16, 200, 3, 0, .5);
  say(f.x - 10, GROUND - 220, n + ' FLYERS', '#ffb0a0', 18);
}

export function nearestFlyer(x, y) {
  let best = null, bd = 1e9;
  for (const fl of S.flyers) {
    if (fl.delay > 0) continue;
    // spread shots: a flyer that already has a die coming counts as far away
    const d = Math.hypot(fl.x - x, fl.y - y) + (fl.incoming || 0) * 600;
    if (d < bd) { bd = d; best = fl; }
  }
  if (best) best.incoming = (best.incoming || 0) + 1;
  return best;
}

export function hitFlyer(fl, dmg) {
  fl.hp -= dmg;
  say(fl.x, fl.y - 14, String(Math.round(dmg)), '#ffe27a', 13);
  if (fl.hp > 0) return;
  S.flyers.splice(S.flyers.indexOf(fl), 1);
  S.stats.downed++;
  burst(fl.x, fl.y, '#c9a56a', 10, 180, 3, 400, .5, 1);
  burst(fl.x, fl.y, '#ffd25e', 8, 160, 2, 0, .3);
  // whatever it carried falls back down: onto bare floor it lands
  const under = cellAt({x: fl.x, y: fl.y});
  if (fl.carry) {
    if (isBareFloor(under)) { addToPile(under, fl.carry, {x: fl.x, y: fl.y}); S.stats.lost = Math.max(0, S.stats.lost - 1); }
    else debrisDie(fl.x, fl.y, fl.carry, rnd(-60, 60), -100);
    say(fl.x, fl.y - 30, 'dropped', '#ffd0c4', 12);
  }
  if (fl.carryBelt) {
    if (isBareFloor(under)) { setBelt(under, fl.carryBelt, 0); say(fl.x, fl.y - 30, 'belt dropped here', '#ffd0c4', 12); }
    else burst(fl.x, fl.y, '#d9a62a', 8, 140, 3, 500, .5, 1);
  }
}

// Flyers go for your layout: lift a belt tile out of a line (leaving a gap,
// its dice spill there) or snatch a die off the belts.
export function pickFlyerTarget(fl) {
  const taken = new Set(S.flyers.filter(o => o !== fl && o.target).map(o => o.target.beltKey || o.target));
  const belts = [...S.belts.keys()].filter(k => !S.rubble.has(k) && !taken.has(k));
  const dice = S.dice.filter(d => (d.state === 'move' || d.state === 'stop') && S.belts.has(key(d.cell)) && !taken.has(d));
  if (belts.length && (rand() < .55 || !dice.length)) fl.target = {beltKey: belts[ri(0, belts.length - 1)]};
  else if (dice.length) fl.target = dice[ri(0, dice.length - 1)];
  else fl.target = null;
}

export function updateFlyers(dt) {
  for (const fl of S.flyers.slice()) {
    if (fl.delay > 0) { fl.delay -= dt; continue; }
    fl.t += dt;
    const spd = fl.speed * (S.foe.chill > 0 ? .7 : 1);
    if (fl.state === 'flee') {
      const tx = 1300, ty = 40;
      const a = Math.atan2(ty - fl.y, tx - fl.x);
      fl.x += Math.cos(a) * spd * 1.1 * dt; fl.y += Math.sin(a) * spd * 1.1 * dt + Math.sin(fl.t * 9) * .6;
      if (fl.x > 1270) { S.flyers.splice(S.flyers.indexOf(fl), 1); if (fl.carry) { S.stats.stolen++; } }
      continue;
    }
    // over the field: cross toward the wall at cruising height
    let tx, ty;
    if (fl.x > WALL_X1 + 10 && !fl.target) { tx = WALL_X1 - 20; ty = GY + 60 + Math.sin(fl.t * 2) * 30; }
    else {
      const tg = fl.target;
      const stillThere = tg && (tg.beltKey ? S.belts.has(tg.beltKey) && !S.rubble.has(tg.beltKey)
        : S.dice.includes(tg) && tg.state !== 'fall' && tg.state !== 'proc' && S.belts.has(key(tg.cell)));
      if (!stillThere) pickFlyerTarget(fl);
      if (!fl.target) { fl.state = 'flee'; continue; }
      if (fl.target.beltKey) { const ce = center(parseKey(fl.target.beltKey)); tx = ce.x; ty = ce.y; }
      else { tx = fl.target.x; ty = fl.target.y; }
    }
    const dx = tx - fl.x, dy = ty - fl.y, dist = Math.hypot(dx, dy);
    fl.x += dx / (dist || 1) * spd * dt;
    fl.y += dy / (dist || 1) * spd * dt + Math.sin(fl.t * 8) * 18 * dt;
    if (fl.target && dist < 10) {
      if (fl.target.beltKey) {
        const k = fl.target.beltKey, c = parseKey(k);
        fl.carryBelt = S.belts.get(k);
        clearCell(c, false);              // its dice spill onto the bare tile
        say(fl.x, fl.y - 22, 'belt lifted!', '#ff8a73', 14);
        burst(fl.x, fl.y, '#d9a62a', 10, 160, 2.5, 300, .4, 1);
        shake(.12);
        fl.state = 'flee'; fl.target = null;
      } else {
        const d = fl.target;
        fl.carry = dieSpec(d);
        removeDie(d);
        S.stats.lost++;
        say(fl.x, fl.y - 20, 'stolen!', '#ff8a73', 14);
        fl.state = 'flee'; fl.target = null;
      }
    }
  }
}

// ============================================================ the foe
export function cancelAttack(why = 'STAGGERED!') {
  const f = S.foe;
  f.state = 'march'; f.stagger = 1; f.timer = 0;
  say(f.x - 20, GROUND - 210, why, '#7fe0c6', 22);
}
export const INTENT_LABEL = {slam: 'SLAM', rocks: 'ROCKS', hatch: 'HATCH', boulders: 'BOULDERS'};
export function curIntent() {
  const list = PHASES[S.foe.phase].intents;
  if (!list.length) return {type: 'none', dmg: 0, n: 0, wind: 1, label: ''};
  const b = list[S.foe.intent % list.length];
  return {type: b.type, dmg: b.dmg || 0, n: b.n || 1, wind: b.wind, label: INTENT_LABEL[b.type]};
}

// The build phase ends: the Colossus starts walking. Starting early pays.
export function startFight(early) {
  if (S.mode !== 'build') return;
  const bonus = early ? Math.floor(S.buildT / 2) : 0;
  S.mode = 'fight';
  S.buildT = 0;
  S.gears += bonus;
  S.dmgLog = [];
  S.foe.state = 'march';
  S.banner = {title: 'PHASE 1 · ' + PHASES[0].name, desc: PHASES[0].desc + (bonus ? `  Early start: +${bonus} ⚙` : ''), t: 0, life: 4.5};
  shake(.3);
}

export function enterPhase(i) {
  const f = S.foe, ph = PHASES[i];
  S.gears += PHASE_BONUS; S.gearFlash = 1;
  f.phase = i; f.intent = 0; f.speed = ph.speed;
  f.enraged = i >= 2;
  f.state = 'shift'; f.timer = 2.2; f.arm = 0;
  if (ph.meltdown) f.burn = 0;
  S.flyT = 3; S.waveT = 3;
  if (ph.locks) { f.locks = rollLocks(ph.locks); f.nextLocks = rollLocks(ph.locks); f.lockT = ph.lockEvery; }
  S.banner = {title: `PHASE ${i + 1} · ${ph.name}`, desc: ph.desc, t: 0, life: 5.5};
  burst(f.x, GROUND - 120, ph.meltdown ? COL.ember : (ph.armor ? '#9aa4aa' : '#c9a56a'), 50, 400, 5, 300, 1.0, 1);
  ring(f.x, GROUND - 120, 'rgba(255,255,255,.8)', 30, 220, .6);
  shake(.8);
}

export function updateFoe(dt) {
  const f = S.foe;
  f.hit = Math.max(0, f.hit - dt);
  f.flash = Math.max(0, f.flash - dt * 9);
  f.stagger = Math.max(0, f.stagger - dt * 1.5);
  f.pinned = Math.max(0, f.pinned - dt);
  f.chill = Math.max(0, f.chill - dt);
  // poison ticks twice a second for 15% of the stacks, then fades a little
  if (f.poison > 0 && !S.over) {
    f.poisonT -= dt;
    if (f.poisonT <= 0) {
      f.poisonT = .5;
      const pd = f.poison * .15;
      hurtFoe(pd, {quiet: true});
      f.poisonAcc = (f.poisonAcc || 0) + pd;
      if (f.poisonAcc >= 6) { say(f.x + 40, GROUND - 200, `☠ ${Math.round(f.poisonAcc)}`, COL.venom, 15); f.poisonAcc = 0; }
      f.poison = Math.max(0, f.poison * .93 - .5);
    }
    if (rand() < dt * Math.min(30, 4 + f.poison * .3)) S.parts.push({x: f.x + rnd(-60, 50), y: GROUND - rnd(30, 170), vx: rnd(-8, 8), vy: -30, col: COL.venom, size: rnd(2, 4), g: -15, life: .7, t: 0, shape: 0, rot: 0, vr: 0});
  }
  // sandblasted armor grows back, one point every 6 seconds
  if (f.shred > 0) {
    f.shredT = (f.shredT || 0) + dt;
    if (f.shredT >= 6) { f.shredT = 0; f.shred--; say(f.x - 20, GROUND - 190, `armor regrows (${effArmor()})`, '#c9d6da', 13); }
  }
  // the Lockbox turns its lock to the next face (also while you build, to practice)
  if (PHASES[f.phase].locks && !opts.holdFoe) {
    f.lockT -= dt;
    if (f.lockT <= 0) {
      f.locks = f.nextLocks; f.nextLocks = rollLocks(PHASES[f.phase].locks); f.lockT = PHASES[f.phase].lockEvery;
      say(f.x - 20, GROUND - 230, 'LOCK → ' + f.locks.join(' & '), '#8fe08f', 20);
      ring(f.x - 20, GROUND - 120, 'rgba(140,230,140,.8)', 20, 90, .4);
    }
  }
  if (S.mode === 'build') { f.kv = 0; f.burn = 0; f.state = 'march'; return; }   // waiting in the distance
  // phase shifts as it breaks down
  const frac = f.hp / f.max;
  if (f.phase + 1 < PHASES.length && frac <= PHASES[f.phase + 1].at) enterPhase(f.phase + 1);
  const ph = PHASES[f.phase];
  if (ph.meltdown) f.burn = 0;
  if (ph.flyEvery && !opts.holdFoe) {
    S.flyT -= dt;
    if (S.flyT <= 0) { S.flyT = ph.flyEvery; spawnFlyers(f.phase === 1 ? 4 : 3); }
  }
  // the Mite Mother broods
  if (ph.waveEvery && !opts.holdFoe && f.state !== 'shift') {
    S.waveT -= dt;
    if (S.waveT <= 0) { S.waveT = ph.waveEvery; spawnWave(ph.wave, ph); f.hit = .3; }
  }
  if (f.burn > 0) {
    f.burn -= dt;
    hurtFoe(2 * dt, {quiet: true});
    if (rand() < dt * 25) S.parts.push({x: f.x + rnd(-50, 40), y: GROUND - rnd(40, 160), vx: rnd(-10, 10), vy: -70, col: COL.ember, size: 3, g: -30, life: .5, t: 0, shape: 0, rot: 0, vr: 0});
  }
  if (f.chill > 0 && rand() < dt * 14) S.parts.push({x: f.x + rnd(-60, 50), y: GROUND - rnd(20, 170), vx: 0, vy: 20, col: COL.ice, size: 2.5, g: 0, life: .6, t: 0, shape: 0, rot: 0, vr: 0});
  if (S.over) return;
  f.x += f.kv * dt;
  f.kv *= Math.exp(-4 * dt);
  f.x = Math.min(f.x, 1190);
  if (f.stun > 0) { f.stun -= dt; f.arm = lerp(f.arm, -.2, 1 - Math.exp(-6 * dt)); return; }
  const slow = f.chill > 0 ? .4 : 1;
  const front = foeFront();
  if (f.state === 'shift') {
    f.timer -= dt;
    if (rand() < dt * 20) burst(f.x + rnd(-60, 60), GROUND - rnd(40, 180), PHASES[f.phase].meltdown ? COL.ember : '#c9d6da', 2, 120, 3, -60, .6);
    if (f.timer <= 0) f.state = 'march';
    return;
  }
  if (f.state === 'march') {
    if (front > REACH_X) {
      if (!opts.holdFoe && f.pinned <= 0) {
        f.x -= f.speed * slow * (f.stagger > 0 ? .3 : 1) * (opts.turns ? 2.2 : 1) * dt;   // turns: it covers more ground per foe turn
        f.step += dt * f.speed * .55 * slow;
      }
    } else {
      f.x = REACH_X + 70;
      if (!opts.holdFoe && curIntent().type !== 'none') {
        f.state = 'windup'; f.timer = curIntent().wind; f.total = f.timer;
        if (S.enc === 'shell') { say(f.x - 20, GROUND - 240, 'SHELL OPEN!', COL.gold, 24); burst(f.x, GROUND - 120, COL.gold, 20, 260, 3, 0, .5); }
      }
    }
  } else if (f.state === 'windup') {
    f.timer -= dt * (f.chill > 0 ? .5 : 1);
    if (front > REACH_X + 40) { cancelAttack(); return; }
    if (f.timer <= 0) strike();
  } else if (f.state === 'recover') {
    f.timer -= dt;
    if (f.timer <= 0) f.state = 'march';
  }
  const tgtArm = f.state === 'windup' ? 1 : (f.state === 'recover' ? -0.6 : 0);
  f.arm = lerp(f.arm, tgtArm, 1 - Math.exp(-(f.state === 'recover' ? 30 : 6) * dt));
}

export function strike() {
  const f = S.foe, it = curIntent();
  if (it.type === 'slam') {
    thornsBite();
    if (S.over) return;
    hitFactory(it.dmg, GROUND - 60, false);
    burst(WALL_X1 + 10, GROUND - 4, '#8a7a5a', 22, 300, 4, 700, .7, 1, -Math.PI / 2, 1.2);
    ring(WALL_X1 + 10, GROUND - 4, 'rgba(255,220,180,.8)', 10, 120, .45);
    shake(.8);
  } else if (it.type === 'rocks') {
    for (let i = 0; i < it.n; i++) {
      S.proj.push({kind: 'rock', dmg: it.dmg, dice: [], x0: f.x - 60, y0: GROUND - 150, x1: rnd(WALL_X0 - 120, WALL_X1 - 10), y1: rnd(GY + 60, GROUND - 40),
        t: -i * .25, dur: .7, arc: 120, rot: 0});
    }
  } else if (it.type === 'hatch') {
    spawnFlyers(it.n);
  } else if (it.type === 'boulders') {
    // aim at tiles that have something on them, never the chutes
    const tiles = [...S.belts.keys(), ...[...S.machines.values()].filter(m => m.kind !== 'chute').map(m => key(m.cell))]
      .filter(k => !S.rubble.has(k));
    for (let i = 0; i < it.n && tiles.length; i++) {
      const k = tiles.splice(ri(0, tiles.length - 1), 1)[0], c = parseKey(k), ce = center(c);
      S.proj.push({kind: 'boulder', dice: [], cell: c, x0: f.x - 60, y0: GROUND - 170, x1: ce.x, y1: ce.y, t: -i * .3, dur: 1.1, arc: 220, rot: 0});
    }
  }
  f.intent++;
  if (f.stun <= 0) { f.state = 'recover'; f.timer = 2.2; }
}

export function killFoe() {
  if (S.over) return;
  const f = S.foe;
  S.over = 'won'; f.hp = 0;
  for (const u of S.units) burst(u.x, unitY(u), '#b0845c', 6, 160, 3, 400, .5, 1);
  S.units = [];
  for (let i = 0; i < 6; i++) setTimeout(() => {
    if (!S || S.over !== 'won') return;
    burst(f.x + rnd(-60, 50), GROUND - rnd(30, 170), i % 2 ? COL.gold : '#b0684c', 30, 380, 5, 400, .9, i % 2 ? 0 : 1);
    shake(.7);
  }, i * 160);
}

// ============================================================ building
export function clearCell(c, scrap) {
  const k = key(c);
  const m0 = S.machines.get(k);
  if (m0 && m0.fixed) return false;
  if (m0 && m0.kind === 'chute' && [...S.machines.values()].filter(x => x.kind === 'chute').length <= 1) {
    say(center(c).x, center(c).y - 30, 'need one chute', '#ffb0a0', 13);
    return false;
  }
  // dice on the tile drop where they are and heap up
  const dropped = [];
  for (const d of S.dice.slice()) if (key(d.cell) === k && d.state !== 'fall' && d.state !== 'jump') { dropped.push([dieSpec(d), {x: d.x, y: d.y}]); removeDie(d); }
  if (m0) for (const l of [...m0.load, ...m0.mag, ...m0.outQ, ...(m0.stack || []), ...(m0.held ? [m0.held] : [])]) dropped.push([dieSpec(l), center(c)]);
  for (const sk of [...S.stops.keys()]) if (sk.startsWith(k + ',')) S.stops.delete(sk);
  if (S.belts.has(k)) {
    S.belts.delete(k); S.beltVis.delete(k);
    if (scrap) burst(center(c).x, center(c).y, '#7b858c', 8, 120, 4, 300, .45, 1);
  }
  if (m0) {
    S.machines.delete(k);
    const ce = center(c);
    burst(ce.x, ce.y, COL[KINDS[m0.kind].cat], 12, 200, 5, 500, .6, 1);
    const back = scrap ? refundFor(m0) : 0;
    if (back) { S.gears += back; say(ce.x, ce.y - 30, `+${back} ⚙ back`, COL.gold, 13); }
  }
  // the tile is bare now: whatever was on it heaps up there
  for (const [sp, p] of dropped) addToPile(c, sp, p);
  return true;
}

export function placeKind(c, kind) {
  const k = key(c);
  const m = S.machines.get(k);
  if (isPillar(c)) return;
  if (m && m.kind === kind && deq(m.dir, S.placeDir)) return;
  if (m && m.fixed) { say(center(c).x, center(c).y - 30, 'part of the floor', '#ffb0a0', 13); return; }
  const cost = opts.free ? 0 : (COST[kind] || 0);
  const refund = m ? refundFor(m) : 0;
  if (S.gears + refund < cost) {
    say(center(c).x, center(c).y - 30, `need ${cost} ⚙`, '#ffb0a0', 14);
    S.gearFlash = 1;
    return;
  }
  if (clearCell(c, !!m) === false) return;
  S.gears -= cost;
  placeMachine(c, kind, S.placeDir, -.15);
  S.machines.get(k).paid = cost;
  if (cost) say(center(c).x, center(c).y - 34, `-${cost} ⚙`, COL.gold, 13);
}

// full refund while building, half once the fight is on
export const refundFor = m => S.mode === 'build' ? (m.paid || 0) : Math.floor((m.paid || 0) / 2);

export function interact(c) {
  const k = key(c);
  const m = S.machines.get(k);
  const ce = center(c);
  if (m) {
    switch (m.kind) {
      case 'sorter': m.mode = 1 - m.mode; m.work = .6; say(ce.x, ce.y - 34, m.mode ? 'swapped' : 'normal', '#7fe0c6', 13); return;
      case 'switch': m.mode = 1 - m.mode; m.work = .6; say(ce.x, ce.y - 34, 'flipped', '#7fe0c6', 13); return;
      case 'silo': m.mode = 1 - m.mode; m.work = .6; say(ce.x, ce.y - 34, m.mode ? 'HOLD' : 'FLOOD!', m.mode ? '#ffb0a0' : '#7fe0c6', 15); return;
      case 'rocket':
        if (m.load.length >= 3) launchRocket(m); else say(ce.x, ce.y - 34, 'needs 3+ dice', '#ffb0a0', 13);
        return;
      case 'parry': raiseParry(); return;
    }
    if (KINDS[m.kind].role !== 'term') { m.dir = rotCW(m.dir); m.work = .4; }
    return;
  }
  if (S.belts.has(k)) {
    const nd = rotCW(S.belts.get(k));
    S.belts.set(k, nd);
    for (const d of S.dice) if (key(d.cell) === k && !d.next && d.state === 'stop') d.dout = nd;
  }
}

export function rotateAt(c) {
  const m = machineAt(c);
  if (m && KINDS[m.kind].role !== 'term') { m.dir = rotCW(m.dir); m.work = .4; return; }
  if (!m) interact(c);
}
export const cellAt = p => ({x: Math.floor((p.x - GX) / CELL), y: Math.floor((p.y - GY) / CELL)});

// Drag a machine to another tile: it keeps what it is holding.
export function moveMachine(from, to) {
  const fk = key(from), tk = key(to);
  const m = S.machines.get(fk);
  if (!m) return;
  if (m.fixed) { interact(from); return; }
  if (S.machines.has(tk) || S.rubble.has(tk) || isPillar(to)) { say(center(to).x, center(to).y - 30, 'occupied', '#ffb0a0', 13); return; }
  const dropped = [];
  for (const d of S.dice.slice()) if (key(d.cell) === fk && d.state !== 'fall' && d.state !== 'jump') { dropped.push([dieSpec(d), {x: d.x, y: d.y}]); removeDie(d); }
  for (const sk of [...S.stops.keys()]) if (sk.startsWith(fk + ',')) S.stops.delete(sk);
  clearCell(to, false);
  S.machines.delete(fk);
  m.cell = to; m.pop = .35;
  S.machines.set(tk, m);
  for (const [sp, p] of dropped) addToPile(from, sp, p);
  burst(center(to).x, center(to).y, '#ffffff', 8, 120, 2.5, 0, .3);
}

// ============================================================ update
export function update(rawDt, placing = false) {   // placing: the player is placing a part (real-time slows down)
  // real time: time slows while you place parts. Turns: it slows for big moments in the run.
  S.slowT = Math.max(0, (S.slowT || 0) - rawDt);
  placing = placing && !opts.turns && opts.slow;
  S.timeScale = lerp(S.timeScale, placing || S.slowT > 0 ? .3 : 1, 1 - Math.exp(-10 * rawDt));
  const dt = rawDt * S.timeScale * opts.speed * (opts.turns && S.skip && S.tphase !== 'plan' ? 6 : 1);
  S.t += dt;
  S.shake = Math.max(0, S.shake - rawDt * 2.4);
  S.hitFlash = Math.max(0, S.hitFlash - rawDt * 2);
  for (const [k, v] of S.beltVis) {
    const d = S.belts.get(k); if (!d) continue;
    v.ang += angDiff(v.ang, Math.atan2(d.y, d.x)) * (1 - Math.exp(-18 * rawDt));
    v.pop = Math.min(1, v.pop + rawDt / .25);
  }
  updateParticles(dt);
  if (S.paused || S.picker) return;
  if (opts.turns) { updateTurns(dt); return; }
  // machines' per-turn XP cap, in real time: a fresh allowance every 8 s
  S.xpResetT = (S.xpResetT || 0) + dt;
  if (S.xpResetT > 8) { S.xpResetT = 0; for (const m of S.machines.values()) m.xpTurn = 0; }
  if (S.mode === 'build' && !S.over && S.enc !== 'dummy') {
    S.buildT -= dt;
    if (S.buildT <= 0) startFight(false);
  }
  if (!S.over) {
    rollChutes(dt);
    updateMachines(dt);
    updateDice(dt);
    updateFoe(dt);
    updateField(dt);
  }
  updateProj(dt);
}

// ============================================================ turns
// Plan (nothing moves: see your roll, build and route) → Run (hands off: the
// line runs until every die has settled) → Foe (the foe's side moves and acts)
// → next turn: a fresh roll. Backed-up dice and heaps carry over.
export const FOE_TURN = 4;        // seconds of foe time per turn
export const RUN_MAX = 12;        // a run ends by then; dice still moving carry over (no endless loops)

// turn 1: no build timer; the fight is on (free play stays in practice mode)
export function beginTurns() {
  if (S.enc !== 'dummy') { S.mode = 'fight'; S.buildT = 0; S.foe.state = 'march'; }
  // walkers start closer, so they reach the wall in about four turns
  if (S.enc === 'colossus' || S.enc === 'shell' || S.enc === 'lock') S.foe.x = 980;
  S.turn = 1; S.tphase = 'plan'; S.skip = false;
  S.rollT = 999;
  for (const m of S.machines.values()) m.xpTurn = 0;
  rollNow();
  S.banner = {title: `${FOES[S.enc].name}`, desc: 'Plan your line, then press RUN and watch it work.', t: 0, life: 4};
}

export function startRun() {
  if (!opts.turns || S.tphase !== 'plan' || S.over) return;
  S.tphase = 'run'; S.runT = 0; S.idleT = 0; S.skip = false;
  S.pal = null;
  S.turnStart = {dmg: S.stats.dmg, mites: S.stats.downed, lost: S.stats.lost, thrown: S.stats.thrown};
  for (const m of S.machines.values()) { m.turnDmg = 0; m.turnProc = 0; }
}

export function lineBusy() {
  if (S.proj.length) return true;
  if (S.dice.some(d => d.state === 'move' || d.state === 'proc' || d.state === 'jump' || d.state === 'spawn' || d.state === 'fall')) return true;
  for (const m of S.machines.values()) {
    if (m.wind > 0 || m.launch > 0 || m.reel > 0) return true;
    if (m.kind === 'gatling' && m.mag.length) return true;
    if (m.kind === 'pipgat' && S.pips >= 1) return true;
  }
  return false;
}

export function endRun() {
  const st = S.turnStart || {dmg: 0, mites: 0, lost: 0, thrown: 0};
  const dmg = Math.round(S.stats.dmg - st.dmg), mites = S.stats.downed - st.mites, lost = S.stats.lost - st.lost;
  const best = [...S.machines.values()].filter(m => m.turnDmg > 0).sort((a, b) => b.turnDmg - a.turnDmg)[0];
  S.banner = {title: `TURN ${S.turn} · ${dmg} damage${mites ? ` · ${mites} mites` : ''}`,
    desc: `${S.stats.thrown - st.thrown} dice thrown${lost ? ` · ${lost} lost` : ''}${best ? ` · best: ${KINDS[best.kind].name} ${Math.round(best.turnDmg)}` : ''}`,
    t: 0, life: 3.2, small: true};
  S.skip = false;
  if (S.mode === 'build') { nextTurn(); return; }     // free play: no foe turn
  S.tphase = 'foe'; S.foeT = FOE_TURN;
}

export function nextTurn() {
  S.turn = (S.turn || 1) + 1;
  S.tphase = 'plan';
  for (const m of S.machines.values()) m.xpTurn = 0;
  rollNow();
}

export function updateTurns(dt) {
  if (S.over) { updateProj(dt); return; }
  if (S.tphase === 'plan') {                   // nothing moves while you plan
    if (S.banner) { S.banner.t += dt; if (S.banner.t > S.banner.life) S.banner = null; }
    return;
  }
  if (S.tphase === 'run') {
    S.runT += dt;
    updateMachines(dt);
    updateDice(dt);
    updateField(dt);
    updateProj(dt);
    S.idleT = lineBusy() ? 0 : S.idleT + dt;
    if (S.idleT > .6 || S.runT > RUN_MAX) endRun();
    return;
  }
  // the foe's turn: it walks, winds up and strikes; mites and flyers move
  S.foeT -= dt;
  updateFoe(dt);
  updateField(dt);
  updateProj(dt);
  if (S.foeT <= 0 && !S.proj.some(p => p.kind === 'rock' || p.kind === 'boulder')) nextTurn();
}

export function updateParticles(dt) {
  const keep = [];
  for (const p of S.parts) {
    p.t += dt; if (p.t >= p.life) continue;
    p.vy += p.g * dt; const dr = Math.exp(-2.2 * dt); p.vx *= dr; p.vy *= dr;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; keep.push(p);
  }
  S.parts = keep;
  for (const d of S.debris.slice()) {
    d.t += dt;
    d.vy += 1100 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
    const floor = d.x > WALL_X0 - 4 ? GROUND - 9 : GY + GH * CELL + 10;
    if (d.y > floor) { d.y = floor; d.vy *= -.38; d.vx *= .6; d.vr *= .6; }
    if (d.t > d.life) S.debris.splice(S.debris.indexOf(d), 1);
  }
  for (const t of S.texts.slice()) { t.t += dt; if (t.t >= t.life) S.texts.splice(S.texts.indexOf(t), 1); }
  for (const b of S.bricks) b.pop = Math.max(0, b.pop - dt * 3);
}

export function feeds(n, c) {
  const b = beltAt(n);
  if (b) return deq(add(n, b), c);
  const m = machineAt(n);
  if (!m) return false;
  return outDirs(m).some(o => deq(add(n, o), c));
}
export function outDirs(m) {
  const info = KINDS[m.kind];
  if (info.role === 'term') return [];
  if (m.kind === 'switch') return [m.mode ? rotCW(m.dir) : m.dir];
  if (['sorter', 'oddeven', 'alt', 'coin', 'prism', 'echo', 'overflow'].includes(m.kind)) return [m.dir, rotCW(m.dir)];
  if (m.kind === 'bounce') return [];
  return [m.dir];
}
export function beltInput(c, d) {
  if (feeds(add(c, neg(d)), c)) return d;
  for (const side of [rotCW(d), neg(rotCW(d))]) if (feeds({x: c.x - side.x, y: c.y - side.y}, c)) return side;
  return d;
}

// While building: a countdown, what to do, and a button to start early.
// Free play: switch the dummy's rules, send mites, see how the line does.
export function setDummyRule(rule) {
  S.dummyRule = rule;
  PHASES = [DUMMY_RULES[rule]];
  const f = S.foe;
  f.shred = 0; f.poison = 0;
  if (rule === 'lock') { f.locks = rollLocks(1); f.nextLocks = rollLocks(1); f.lockT = DUMMY_RULES.lock.lockEvery; } else f.locks = [];
  S.dmgLog = [];
}

// ============================================================ layouts as text
// A factory floor as a short string, for the simulator, the hill climber and
// links (ashcan.html?layout=...). Tokens joined by '.': `xy` + dir for a belt
// ("11R"), `xy` + kind + dir for a machine ("31sorterR"). Dirs: R D L U.
// The chute at (0,1) and the fixed Gear Furnace are always there.
const DIR_CH = {R: R, D: D, L: L, U: U};
export const dirChar = d => d.x === 1 ? 'R' : d.x === -1 ? 'L' : d.y === 1 ? 'D' : 'U';

export function encodeLayout() {
  const out = [];
  for (const [k, d] of S.belts) { const c = parseKey(k); out.push(`${c.x}${c.y}${dirChar(d)}`); }
  for (const m of S.machines.values()) if (!m.fixed && !(m.kind === 'chute' && m.cell.x === 0 && m.cell.y === 1)) out.push(`${m.cell.x}${m.cell.y}${m.kind}${dirChar(m.dir)}`);
  return out.join('.');
}

export function decodeLayout(str) {
  const belts = [], machines = [];
  for (const tok of String(str || '').split('.').filter(Boolean)) {
    const m = tok.match(/^(\d)(\d)([a-z]*)([RDLU])$/);
    if (!m) continue;
    const cell = {x: +m[1], y: +m[2]}, dir = DIR_CH[m[4]];
    if (!inGrid(cell) || S.pillars.has(key(cell))) continue;
    if (m[3]) { if (KINDS[m[3]] && !KINDS[m[3]].fixed) machines.push({cell, kind: m[3], dir}); }
    else belts.push({cell, dir});
  }
  return {belts, machines};
}

// put a layout on the floor (everything but the chute and the Furnace is replaced)
export function applyLayout(str) {
  const {belts, machines} = decodeLayout(str);
  for (const [k, m] of [...S.machines]) if (!m.fixed && !(m.kind === 'chute' && k === '0,1')) S.machines.delete(k);
  S.belts.clear(); S.beltVis.clear(); S.stops.clear(); S.dice = []; S.piles.clear();
  for (const b of belts) if (!S.machines.has(key(b.cell))) setBelt(b.cell, b.dir, 1);
  for (const m of machines) if (!S.machines.has(key(m.cell))) { S.belts.delete(key(m.cell)); placeMachine(m.cell, m.kind, m.dir, 1); }
}

export const layoutCost = str => decodeLayout(str).machines.reduce((a, m) => a + (COST[m.kind] || 0), 0);

// ============================================================ headless play
// Play one fight with a fixed layout, no player input: RUN every turn.
// Returns how it went. Used by sim/run.mjs and sim/climb.mjs.
export function playFight({foe = 'colossus', layout = '', seed = 1, maxTurns = 25, dt = 1 / 20} = {}) {
  setSeed(seed);
  opts.turns = true; opts.free = true; opts.god = false; opts.holdFoe = false; opts.speed = 1;
  newGame('blank');
  chooseFoe(foe);
  applyLayout(layout);
  const f = S.foe;
  while (!S.over && S.turn <= maxTurns) {
    startRun();
    let guard = 0;
    while (S.tphase !== 'plan' && !S.over && guard++ < 4000) update(dt);
    if (guard >= 4000) break;
  }
  return {
    foe, won: S.over === 'won', lost: S.over === 'lost', turns: S.turn,
    foeHpFrac: Math.max(0, f.hp / f.max), factoryHp: S.hp, maxHp: S.maxHp,
    dmg: Math.round(S.stats.dmg), mites: S.stats.downed, lost_dice: S.stats.lost, thrown: S.stats.thrown,
    levels: [...S.machines.values()].filter(m => !m.fixed && m.kind !== 'chute').map(m => `${m.kind}:${m.lvl}`),
    // damage by source: machines that fired, plus poison and burn ticks and the like
    byMachine: Object.fromEntries([...S.machines.values()].filter(m => m.totalDmg).map(m => [`${m.kind}@${m.cell.x}${m.cell.y}`, Math.round(m.totalDmg)])),
    unattributed: Math.round(S.stats.dmg - [...S.machines.values()].reduce((a, m) => a + (m.totalDmg || 0), 0)),
  };
}
