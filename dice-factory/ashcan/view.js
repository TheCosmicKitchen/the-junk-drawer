// Dice Factory: the view. Draws the simulation (sim.js) on a canvas and turns
// mouse, touch and keys into sim actions. No game rules live here.
import {
  S, applyLayout, encodeLayout, decodeLayout, layoutCost, playFight, dirChar,
  BELT_SPEED, BLUNDER_RANGE, BRICK, BUILD_TIME, CATS, CAT_LABEL, CELL, CLICKY, COL, COLOSSUS_PHASES, COMPANIES, 
  COST, DUMMY_RULES, FAST, FIELD_X1, FOES, FOE_TURN, FURNACE, GH, GROUND, GW, GX, GY, H, HC, HOPPER_MAX, 
  INTENT_LABEL, JAM_TIME, KINDS, LOCK_MISS, LOCK_PHASES, LV_XP, MAX_LVL, MEGA, PALETTE, PHASES, PHASE_BONUS, 
  PILE_MAX, PILLARS, PIP_MAX, R, REACH_X, ROLL_COUNT, ROLL_EVERY, RUN_MAX, SHELL_PHASES, SPLASH, START_GEARS, 
  SWARM_PHASES, TINT, VENTS, VENT_INFO, W, WALL_COLS, WALL_ROWS, WALL_X0, WALL_X1, XP_CAP, accepts, add, 
  addToPile, aimAt, angDiff, applyVent, arrive, beginTurns, beltAt, beltInput, bez, brickPos, burst, canAfford, 
  canEnter, cancelAttack, cellAt, center, chooseFoe, clamp, clearCell, consume, curIntent, debrisDie, deq, 
  diceDamage, dieSpec, easeOut, easeOutBack, effArmor, emitFromMachine, endRun, enterPhase, entryBlocked, 
  entryFor, feeds, finishProc, fire, foeFront, foeTarget, gainXP, hitFactory, hitFlyer, hurtFoe, hurtUnit, 
  impact, inGrid, interact, isBareFloor, isPillar, key, killFoe, landOffBelt, landProj, lastClink, lastMatch, 
  launchRocket, lerp, lerpP, lineBusy, liveUnits, loseDie, loseDieAt, lvlMult, machineAt, moveMachine, 
  nearestFlyer, neg, newDie, newGame, nextTurn, nibble, opts, outDirs, overflowDie, parseKey, pathPt, phaseNow, 
  pickFlyerTarget, placeKind, placeMachine, projPos, raiseParry, rand, refundFor, release, removeDie, ri, ring, 
  rnd, rollChutes, rollLocks, rollNow, rotCW, rotateAt, say, setBelt, setDummyRule, setLayout, setSeed, shake, 
  shellOpen, shoot, sorterHigh, spawnFlyers, spawnWave, splashUnits, startFight, startRun, strike, targetUnit, 
  thornX, thornsBite, tryAdvance, tryJump, unitY, update, updateDice, updateField, updateFlyers, updateFoe, 
  updateMachines, updateParticles, updatePiles, updateProj, updateTurns, updateUnits
} from './sim.js';

// Phone mode: a full-screen landscape stage with a wider, shorter board, a
// compact top bar, a tabbed palette with big tiles and buttons on the board.
// On by default for touch phones; ?phone or ?desktop forces either.
const QS = new URLSearchParams(location.search);
const PHONE = QS.has('phone') || (!QS.has('desktop') && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
if (PHONE) document.body.classList.add('phone');
setLayout(PHONE);
opts.turns = !QS.has('realtime');
if (QS.has('seed')) setSeed(+QS.get('seed'));

let PAL_Y = 510, PAL_ROW = 40, PAL_X = 118, PAL_W = 84, PAL_H = 36, PAL_GAP = 3;
if (PHONE) { PAL_Y = GROUND + 14; PAL_X = 132; PAL_W = 130; PAL_H = 62; PAL_ROW = 68; PAL_GAP = 6; }

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let stageRotated = false;
function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (PHONE) {
    // fill the screen; if the phone is upright, lay the board on its side
    const vw = window.innerWidth, vh = window.innerHeight;
    stageRotated = vh > vw;
    const long = stageRotated ? vh : vw, short = stageRotated ? vw : vh;
    const s = Math.min(long / W, short / H);
    const cw = W * s, ch = H * s;
    Object.assign(cv.style, {width: cw + 'px', height: ch + 'px', left: (vw - cw) / 2 + 'px', top: (vh - ch) / 2 + 'px',
      transform: stageRotated ? 'rotate(90deg)' : 'none'});
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    return;
  }
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 200));

// "Tap to play": go full screen and lock landscape where the browser allows it
// (Android). iPhones allow neither, so there the board turns itself sideways.
if (PHONE) {
  const st = document.getElementById('start');
  st.classList.add('show');
  document.getElementById('start-btn').addEventListener('click', async () => {
    st.classList.remove('show');
    S.paused = false;
    try { await document.documentElement.requestFullscreen({navigationUI: 'hide'}); } catch (_) { /* not allowed here */ }
    try { await screen.orientation.lock('landscape'); } catch (_) { /* not allowed here */ }
    setTimeout(fitCanvas, 250);
  });
}

// a company's round stamp, centred at (x, y)
function stamp(co, x, y, r = 9) {
  const c = COMPANIES[co];
  circle(x, y, r + 1.5, 'rgba(0,0,0,.35)');
  circle(x, y, r, c.col);
  ringStroke(x, y, r - 2, c.ink, 1);
  txt(c.mark, x, y + .5, r * 1.15, c.ink, 'center', 900);
}
const mouse = {x: 0, y: 0, cell: {x: -1, y: -1}, dragging: false, moved: false, last: null, pressNew: false};

function drawUnits() {
  for (const u of S.units) {
    if (u.delay > 0) continue;
    const y = unitY(u), walking = u.x > REACH_X + u.r + 4;
    const bob = walking ? Math.abs(Math.sin(u.t * 14)) * -2 : Math.sin(u.t * 20) * 1.5;
    const body = u.hit > 0 ? '#ffffff' : (u.chill > 0 ? '#9fb4c0' : (u.big ? '#8a5a3c' : '#b0845c'));
    ctx.beginPath(); ctx.ellipse(u.x, GROUND - 1 + u.lane * .3, u.r, 3, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    for (let i = 0; i < 3; i++) {
      const lx = u.x - u.r * .5 + i * u.r * .5, sw = Math.sin(u.t * 18 + i * 2) * (walking ? 4 : 1);
      line(lx, y + bob, lx - 3 + sw, y + u.r + 2, '#4a3424', 1.8);
    }
    circle(u.x, y + bob, u.r, body);
    circle(u.x - u.r * .45, y + bob - u.r * .2, Math.max(2, u.r * .22), '#ff5a4a');
    if (u.big) { circle(u.x + u.r * .2, y + bob - u.r * .5, 4, '#6b4a30'); circle(u.x + u.r * .5, y + bob - u.r * .1, 3, '#6b4a30'); }
    if (u.hp < u.max) { rr(u.x - u.r, y - u.r - 8 + bob, u.r * 2, 3, 1.5, 'rgba(0,0,0,.5)'); rr(u.x - u.r, y - u.r - 8 + bob, u.r * 2 * Math.max(0, u.hp / u.max), 3, 1.5, '#6fd16f'); }
  }
}

function drawFlyers() {
  for (const fl of S.flyers) {
    if (fl.delay > 0) continue;
    const flap = Math.sin(fl.t * 40) * 6;
    ctx.save(); ctx.translate(fl.x, fl.y);
    ctx.beginPath(); ctx.ellipse(-7, -4, 8, 3 + flap * .3, -.4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(220,240,255,.7)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -4, 8, 3 - flap * .3, .4, 0, Math.PI * 2); ctx.fill();
    circle(0, 0, 8, '#8a5a3c'); ringStroke(0, 0, 8, '#3a2a1e', 2);
    circle(-2, -1, 3.5, '#ff5a4a'); circle(-3, -2, 1.2, '#fff');
    ctx.restore();
    if (fl.hp < fl.max) { rr(fl.x - 10, fl.y - 16, 20, 3, 1.5, 'rgba(0,0,0,.5)'); rr(fl.x - 10, fl.y - 16, 20 * fl.hp / fl.max, 3, 1.5, '#6fd16f'); }
    if (fl.carryBelt) {
      ctx.save(); ctx.translate(fl.x, fl.y + 18); ctx.rotate(Math.sin(fl.t * 4) * .3);
      rr(-16, -10, 32, 20, 3, '#3c4449', '#d9a62a', 2.5);
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, 0); ctx.lineTo(-4, 6); ctx.strokeStyle = '#6b767d'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    if (fl.carry) drawDie(fl.x, fl.y + 16, fl.carry, Math.sin(fl.t * 5) * .3, .6, 0, 20);
    else if (fl.target && fl.x < WALL_X1) {
      // a faint line shows what it is going for
      const tp = fl.target.beltKey ? center(parseKey(fl.target.beltKey)) : fl.target;
      ctx.setLineDash([3, 5]); line(fl.x, fl.y, tp.x, tp.y, 'rgba(255,120,100,.35)', 1.5); ctx.setLineDash([]);
      if (fl.target.beltKey) rr(tp.x - 30, tp.y - 30, 60, 60, 9, null, `rgba(255,90,74,${.5 + .4 * Math.sin(S.t * 10)})`, 2.5);
    }
  }
}

// ============================================================ input
function toLocal(e) {
  const r = cv.getBoundingClientRect();
  // turned 90° clockwise: the board's x runs down the screen, its y runs right to left
  if (stageRotated) return {x: (e.clientY - r.top) * W / r.height, y: (r.right - e.clientX) * H / r.width};
  return {x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height};
}

function paletteAt(p) {
  for (const t of paletteTiles()) if (p.x >= t.x && p.x <= t.x + PAL_W && p.y >= t.y && p.y <= t.y + PAL_H) return t.k;
  return null;
}
function buttonAt(p) {
  // the foe picker takes every tap until you choose
  if (S.picker) return S.menuButtons.find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) || {fn: () => {}};
  // an open Tools menu takes every tap until it closes
  if (S.toolsOpen) return S.menuButtons.find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) || {fn: () => { S.toolsOpen = false; }};
  return S.buttons.find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
}

const capture = e => { try { cv.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ } };
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointermove', e => {
  const p = toLocal(e); mouse.x = p.x; mouse.y = p.y; mouse.cell = cellAt(p);
  if (mouse.erasing && inGrid(mouse.cell) && !deq(mouse.cell, mouse.last)) { mouse.last = mouse.cell; clearCell(mouse.cell, true); }
  else if (mouse.dragging) dragTo(mouse.cell);
  else if (mouse.painting && S.pal && inGrid(mouse.cell) && !deq(mouse.cell, mouse.last)) { mouse.last = mouse.cell; placeKind(mouse.cell, S.pal); }
});
cv.addEventListener('pointerdown', e => {
  const p = toLocal(e); mouse.x = p.x; mouse.y = p.y; mouse.cell = cellAt(p);
  const b = buttonAt(p);
  if (b && e.button === 0) { b.fn(); return; }
  if (S.over) { newGame('keep'); return; }
  if (opts.turns && S.tphase !== 'plan') return;     // hands off while the line runs: just watch
  if (e.button === 2) {
    if (S.pal) { S.pal = null; return; }
    if (inGrid(mouse.cell)) clearCell(mouse.cell, true);
    return;
  }
  if (e.button !== 0) return;
  const pk = paletteAt(p);
  if (pk) { if (S.pal === pk) S.pal = null; else pickPal(pk); return; }
  const c = mouse.cell;
  if (!inGrid(c)) return;
  const k = key(c);
  if (S.rubble.has(k) || isPillar(c)) return;  // buried or stone: route around it
  S.lastTap = c;
  if (opts.erase) { clearCell(c, true); mouse.erasing = true; mouse.last = c; capture(e); return; }
  if (S.pal) { placeKind(c, S.pal); mouse.painting = true; mouse.last = c; capture(e); return; }
  if (S.machines.has(k)) { mouse.moving = c; capture(e); return; }
  mouse.dragging = true; mouse.moved = false; mouse.last = c; mouse.pressNew = false;
  if (!S.belts.has(k)) { setBelt(c, S.beltDir); mouse.pressNew = true; }
  capture(e);
});
cv.addEventListener('pointerup', () => {
  if (mouse.erasing) { mouse.erasing = false; return; }
  if (mouse.moving) {
    const from = mouse.moving, to = mouse.cell;
    mouse.moving = null;
    if (inGrid(to) && !deq(from, to)) moveMachine(from, to); else interact(from);
    return;
  }
  if (mouse.dragging && !mouse.moved && !mouse.pressNew && inGrid(mouse.last)) interact(mouse.last);
  mouse.dragging = false; mouse.painting = false;
});

// a finger leaves no hover behind: forget the position after a touch ends
cv.addEventListener('pointerup', e => { if (e.pointerType === 'touch') { mouse.x = -1; mouse.y = -1; mouse.cell = {x: -1, y: -1}; } });

// on-screen buttons, for phones (no right-click, keys or hover there)
const tbErase = document.getElementById('tb-erase');
function setErase(on) { opts.erase = on; tbErase.classList.toggle('on', on); if (on) S.pal = null; }
document.getElementById('tb-rotate').addEventListener('click', () => {
  if (S.pal) S.placeDir = rotCW(S.placeDir);
  else if (S.lastTap) rotateAt(S.lastTap);
});
tbErase.addEventListener('click', () => setErase(!opts.erase));
document.getElementById('tb-parry').addEventListener('click', () => raiseParry());
document.getElementById('tb-drop').addEventListener('click', () => { S.pal = null; setErase(false); });

function pickPal(k) {
  if (opts.erase) setErase(false);
  S.pal = k; S.palPickT = S.t;
  S.recent = [k, ...S.recent.filter(x => x !== k)].slice(0, 5);
}
cv.addEventListener('wheel', e => { if (S.pal) { e.preventDefault(); S.placeDir = rotCW(S.placeDir); } }, {passive: false});
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (opts.turns) startRun(); else raiseParry(); return; }
  if (e.key === 'p' || e.key === 'P') S.paused = !S.paused;
  else if (e.key === 'r' || e.key === 'R') {
    if (S.over) newGame('keep');
    else if (S.pal) S.placeDir = rotCW(S.placeDir);
    else if (inGrid(mouse.cell)) rotateAt(mouse.cell);
  } else if (e.key === 'Escape') S.pal = null;
  else if (e.key >= '1' && e.key <= '5') { const k = S.recent[+e.key - 1]; if (k) pickPal(k); }
});

function dragTo(c) {
  if (!inGrid(c) || deq(c, mouse.last)) return;
  let guard = 0;
  while (!deq(mouse.last, c) && guard++ < 32) {
    const dx = c.x - mouse.last.x, dy = c.y - mouse.last.y;
    const step = Math.abs(dx) >= Math.abs(dy) ? {x: Math.sign(dx), y: 0} : {x: 0, y: Math.sign(dy)};
    if (S.belts.has(key(mouse.last))) {
      S.belts.set(key(mouse.last), step);
      for (const d of S.dice) if (key(d.cell) === key(mouse.last) && !d.next && d.state === 'stop') d.dout = step;
    }
    const nx = add(mouse.last, step);
    if (isPillar(nx)) break;                   // belts stop at stone
    if (!S.machines.has(key(nx))) setBelt(nx, step);
    S.beltDir = step; mouse.last = nx; mouse.moved = true;
  }
}

// ============================================================ drawing
function rr(x, y, w, h, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
}
function circle(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function ringStroke(x, y, r, col, w) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
function line(x0, y0, x1, y1, col, w) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); }
function tri(ax, ay, bx, by, cx, cy, fill) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
function txt(s, x, y, size, col, align = 'left', weight = 700, outline = 0) {
  ctx.font = `${weight} ${size}px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = 'rgba(6,20,26,.9)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}

const PIPS = {1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]};

function drawDie(x, y, d, rot = 0, s = 1, alert = 0, size = 22) {
  if (s <= .01) return;
  const v = d.show ?? d.v;
  const mega = d.v >= MEGA;
  // bigger values draw bigger; Mega dice are gold and crowned
  const big = d.v > 6 ? Math.min(mega ? 16 : 8, (d.v - 6) * 1.2) : 0;
  size += big;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  const h = size / 2;
  if (mega) circle(0, 0, h + 8 + Math.sin(S.t * 8) * 2, 'rgba(255,210,94,.3)');
  if (d.hot) circle(0, 0, h + 6 + Math.sin(S.t * 20) * 1.2, 'rgba(255,120,50,.25)');
  if (d.ice) circle(0, 0, h + 5, 'rgba(180,230,255,.25)');
  if (d.venom) circle(0, 0, h + 5 + Math.sin(S.t * 6) * 1.2, 'rgba(122,201,67,.3)');
  if (d.spiky) for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; tri(Math.cos(a) * (h + 6), Math.sin(a) * (h + 6), Math.cos(a - .3) * h, Math.sin(a - .3) * h, Math.cos(a + .3) * h, Math.sin(a + .3) * h, '#4a4f54'); }
  rr(-h + 1, -h + 3, size, size, 5, 'rgba(0,0,0,.35)');
  const face = mega ? '#ffe07a' : (d.hot ? COL.hot : (d.ice ? COL.ice : (d.venom ? '#d7f2b8' : '#fff')));
  rr(-h, -h, size, size, 5, face, alert ? `rgba(255,70,60,${.6 + .4 * Math.sin(S.t * 12)})` : (mega ? '#7a5404' : COL.ink), alert ? 3 : (mega ? 2.6 : 1.8));
  if (PIPS[v]) for (const [px, py] of PIPS[v]) circle(px * size * .26, py * size * .26, size * .1, COL.ink);
  else txt(String(v), 0, 1, size * .6, mega ? '#5a3a00' : COL.ink, 'center', 900);
  if (mega) {
    // the crown
    ctx.beginPath(); ctx.moveTo(-h * .6, -h - 1); ctx.lineTo(-h * .6, -h - 9); ctx.lineTo(-h * .3, -h - 4); ctx.lineTo(0, -h - 11); ctx.lineTo(h * .3, -h - 4); ctx.lineTo(h * .6, -h - 9); ctx.lineTo(h * .6, -h - 1); ctx.closePath();
    ctx.fillStyle = COL.gold; ctx.fill(); ctx.strokeStyle = '#7a5404'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
}

function drawFloor() {
  rr(GX - 8, GY - 8, GW * CELL + 16, GH * CELL + 16, 12, COL.floor);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    ctx.fillStyle = (x + y) % 2 ? COL.tile2 : COL.tile;
    ctx.fillRect(GX + x * CELL + 2, GY + y * CELL + 2, CELL - 4, CELL - 4);
  }
  // floor vents: a glowing grate (a belt laid over one still shows the glow at its edges)
  for (const [k, type] of S.vents) {
    const ce = center(parseKey(k)), info = VENT_INFO[type];
    const glow = .25 + .12 * Math.sin(S.t * 3 + ce.x);
    ctx.fillStyle = info.col; ctx.globalAlpha = glow;
    ctx.fillRect(ce.x - 30, ce.y - 30, 60, 60);
    ctx.globalAlpha = 1;
    rr(ce.x - 26, ce.y - 26, 52, 52, 6, null, info.col, 2);
    for (let i = -2; i <= 2; i++) line(ce.x - 20, ce.y + i * 9, ce.x + 20, ce.y + i * 9, 'rgba(0,0,0,.35)', 3);
    if (type === 'lucky') txt('+1', ce.x, ce.y + 1, 16, '#1d4a1d', 'center', 900);
    else if (type === 'hot') txt('🔥', ce.x, ce.y + 1, 18, '#000', 'center', 400);
    else txt('❄', ce.x, ce.y + 1, 20, '#1d3f5a', 'center', 900);
  }
  // stone pillars
  for (const k of S.pillars) {
    const ce = center(parseKey(k));
    rr(ce.x - 28, ce.y - 24, 56, 54, 10, 'rgba(0,0,0,.35)');
    rr(ce.x - 28, ce.y - 30, 56, 56, 10, '#6f7a7e', '#3d4649', 3);
    rr(ce.x - 20, ce.y - 22, 40, 12, 4, '#8a969a');
    line(ce.x - 14, ce.y + 2, ce.x - 4, ce.y + 14, '#4d5659', 2); line(ce.x + 8, ce.y - 6, ce.x + 16, ce.y + 8, '#4d5659', 2);
  }
}

function drawField() {
  const g = ctx.createLinearGradient(0, GY - 8, 0, GROUND);
  g.addColorStop(0, '#1e3b3e'); g.addColorStop(1, '#2c4a3e');
  rr(WALL_X0 - 4, GY - 8, FIELD_X1 - WALL_X0 + 12, GH * CELL + 16, 12, g);
  ctx.fillStyle = COL.ground; ctx.fillRect(WALL_X0 - 4, GROUND - 2, FIELD_X1 - WALL_X0 + 12, 18);
  ctx.fillStyle = COL.grass; ctx.fillRect(WALL_X0 - 4, GROUND - 4, FIELD_X1 - WALL_X0 + 12, 4);
  ctx.fillStyle = 'rgba(20,45,45,.7)';
  ctx.beginPath(); ctx.moveTo(WALL_X1, GROUND - 4);
  for (let x = WALL_X1; x <= FIELD_X1; x += 20) ctx.lineTo(x, GROUND - 60 - 26 * Math.sin(x * .011) - 14 * Math.sin(x * .037));
  ctx.lineTo(FIELD_X1, GROUND - 4); ctx.fill();
  if ([...S.machines.values()].some(m => m.kind === 'blunder')) {
    const x = REACH_X + BLUNDER_RANGE;
    ctx.setLineDash([6, 6]); line(x, GY + 40, x, GROUND - 4, 'rgba(255,226,122,.35)', 2); ctx.setLineDash([]);
    txt('blunderbuss range', x + 6, GY + 50, 11, 'rgba(255,226,122,.55)', 'left', 600);
  }
}
function offsetPts(pts, off) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return {x: p.x - dy / l * off, y: p.y + dx / l * off};
  });
}
function poly(pts, col, w) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.stroke();
}

function drawBelt(k, d) {
  const c = parseKey(k);
  const vis = S.beltVis.get(k) || {ang: Math.atan2(d.y, d.x), pop: 1};
  const ce = center(c);
  const settled = Math.abs(angDiff(vis.ang, Math.atan2(d.y, d.x))) < .05;
  const din = settled ? beltInput(c, d) : d;
  let pts = [];
  if (settled && !deq(din, d) && !deq(din, neg(d))) for (let i = 0; i <= 12; i++) pts.push(pathPt(c, din, d, i / 12, false));
  else {
    const dv = {x: Math.cos(vis.ang), y: Math.sin(vis.ang)};
    pts = [{x: ce.x - dv.x * HC, y: ce.y - dv.y * HC}, {x: ce.x + dv.x * HC, y: ce.y + dv.y * HC}];
  }
  const sc = easeOutBack(vis.pop);
  if (sc !== 1) pts = pts.map(p => ({x: ce.x + (p.x - ce.x) * sc, y: ce.y + (p.y - ce.y) * sc}));
  poly(pts, '#171c1f', 40 * sc);
  poly(pts, '#3c4449', 29 * sc);
  poly(offsetPts(pts, 17.5 * sc), '#d9a62a', 4.5 * sc);
  poly(offsetPts(pts, -17.5 * sc), '#d9a62a', 4.5 * sc);
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = lens[lens.length - 1];
  let seg = 1;
  for (let x = (S.t * BELT_SPEED) % 16 - 16; x < total; x += 16) {
    if (x < 2 || x > total - 9) continue;
    while (seg < pts.length - 1 && lens[seg] < x) seg++;
    const a = pts[seg - 1], b = pts[seg], f = (x - lens[seg - 1]) / Math.max(.001, lens[seg] - lens[seg - 1]);
    const p = lerpP(a, b, f), l = Math.hypot(b.x - a.x, b.y - a.y) || 1, t = {x: (b.x - a.x) / l, y: (b.y - a.y) / l}, n = {x: -t.y, y: t.x};
    ctx.beginPath(); ctx.moveTo(p.x + n.x * 8 * sc, p.y + n.y * 8 * sc); ctx.lineTo(p.x + t.x * 6 * sc, p.y + t.y * 6 * sc); ctx.lineTo(p.x - n.x * 8 * sc, p.y - n.y * 8 * sc);
    ctx.strokeStyle = '#6b767d'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
  }
  const nx = add(c, d);
  if (vis.pop >= 1 && (!inGrid(nx) || (!S.belts.has(key(nx)) && !S.machines.has(key(nx))))) {
    const e = pts[pts.length - 1], q = pts[pts.length - 2], l = Math.hypot(e.x - q.x, e.y - q.y) || 1;
    const t = {x: (e.x - q.x) / l, y: (e.y - q.y) / l}, n = {x: -t.y, y: t.x};
    line(e.x + n.x * 19 - t.x * 3, e.y + n.y * 19 - t.y * 3, e.x - n.x * 19 - t.x * 3, e.y - n.y * 19 - t.y * 3, `rgba(255,90,74,${.6 + .4 * Math.sin(S.t * 6)})`, 5);
  }
}

function arrowsFor(m) {
  if (KINDS[m.kind].role === 'term') return [];
  if (m.kind === 'switch') return [m.dir, rotCW(m.dir)];
  return outDirs(m).length ? outDirs(m) : [m.dir];
}

function drawMachine(m, cx, cy, ghost) {
  const info = KINDS[m.kind], col = info.pool ? COMPANIES[info.pool].col : COL[info.cat];
  if (m.pop < 0) return;
  const b = m.work > 0 ? Math.sin((1 - m.work) * Math.PI) : 0;
  const s = easeOutBack(m.pop);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s * (1 + .1 * b), s * (1 - .1 * b));
  if (ghost) ctx.globalAlpha = .75;
  rr(-27, -23, 56, 54, 9, 'rgba(0,0,0,.35)');
  rr(-28, -28, 56, 56, 9, TINT[info.cat], col, 3);
  if (m.work > 0) rr(-28, -28, 56, 56, 9, `rgba(255,255,255,${.25 * m.work})`);
  drawIcon(m);
  if (info.pool) stamp(info.pool, -21, 21, 7);          // the maker's stamp
  const base = Math.atan2(m.dir.y, m.dir.x);
  for (const o of arrowsFor(m)) {
    const a = m.ang + angDiff(base, Math.atan2(o.y, o.x));
    const dv = {x: Math.cos(a), y: Math.sin(a)}, n = {x: -dv.y, y: dv.x}, p = {x: dv.x * 30, y: dv.y * 30};
    let ac = col;
    const straight = deq(o, m.dir);
    if (m.kind === 'sorter') ac = straight ? (m.mode ? COL.defense : COL.weapon) : (m.mode ? COL.weapon : COL.defense);
    else if (m.kind === 'switch') ac = deq(o, outDirs(m)[0]) ? COL.gold : 'rgba(40,60,66,.5)';
    else if (m.kind === 'alt') ac = (m.alt ? !straight : straight) ? COL.gold : col;
    else if (!straight) ac = '#1b6b59';
    const len = m.kind === 'bounce' ? 14 : 8;
    tri(p.x + dv.x * len, p.y + dv.y * len, p.x + n.x * 7, p.y + n.y * 7, p.x - n.x * 7, p.y - n.y * 7, ac);
  }
  if (m.kind === 'sorter' || m.kind === 'oddeven') {
    const hp = {x: Math.cos(m.ang) * 17, y: Math.sin(m.ang) * 17}, lp = {x: Math.cos(m.ang + Math.PI / 2) * 17, y: Math.sin(m.ang + Math.PI / 2) * 17};
    const A = m.kind === 'sorter' ? (m.mode ? '1-3' : '4-6') : 'odd', B = m.kind === 'sorter' ? (m.mode ? '4-6' : '1-3') : 'even';
    txt(A, hp.x, hp.y, 9.5, '#7a1d10', 'center', 800);
    txt(B, lp.x, lp.y, 9.5, '#163f6e', 'center', 800);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = s => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// A tiny die face for icons
function miniDie(x, y, v, s = 10, fill = '#fff') {
  rr(x - s / 2, y - s / 2, s, s, 2, fill, COL.ink, 1);
  if (PIPS[v]) for (const [px, py] of PIPS[v]) circle(x + px * s * .26, y + py * s * .26, s * .09, COL.ink);
}

function drawIcon(m) {
  const dark = '#2b373c', b = m.work > 0 ? Math.sin((1 - m.work) * Math.PI) : 0, fire = m.fire || 0;
  const t = S ? S.t : 0;
  switch (m.kind) {
    case 'chute': {
      const sh = Math.sin(t * 70) * 2 * m.work;
      ctx.beginPath(); ctx.moveTo(-18 + sh, -12); ctx.lineTo(18 + sh, -12); ctx.lineTo(7, 7); ctx.lineTo(-7, 7); ctx.fillStyle = '#8ea3ab'; ctx.fill();
      ctx.fillStyle = '#5f727a'; ctx.fillRect(-5, 7, 10, 10);
      const hop = m.hopper ? m.hopper.length : 0, fill = hop / HOPPER_MAX;
      rr(-22, 20, 44, 5, 2.5, 'rgba(0,0,0,.3)');
      if (fill > 0) rr(-22, 20, 44 * fill, 5, 2.5, fill > .8 ? COL.drop : '#7fe0c6');
      for (let i = 0; i < 3; i++) miniDie(-10 + i * 10, -19 - Math.sin(t * 50 + i) * 3 * m.work, 3 + i, 9);
      break;
    }
    case 'sorter': case 'oddeven': case 'coin': {
      if (m.kind === 'coin') { circle(-4, 0, 11, '#f0b429'); ringStroke(-4, 0, 11, '#9a6a05', 2); txt('?', -4, 1, 13, '#7a5404', 'center', 900); }
      const la = lerp(-.95, .95, m.lever);
      if (m.kind !== 'coin') { line(-20, 0, 0, 0, dark, 5); circle(0, 0, 6, '#f0b429'); }
      const tip = {x: Math.cos(la) * 14, y: Math.sin(la) * 14};
      if (m.kind !== 'coin') { line(0, 0, tip.x, tip.y, dark, 4); circle(tip.x, tip.y, 4.5, m.lever < .5 ? COL.weapon : COL.defense); }
      break;
    }
    case 'switch': {
      const o = outDirs(m)[0], rel = angDiff(Math.atan2(m.dir.y, m.dir.x), Math.atan2(o.y, o.x));
      ctx.save(); ctx.rotate(rel);
      line(-14, 0, 6, 0, COL.gold, 6); tri(16, 0, 4, -9, 4, 9, COL.gold);
      ctx.restore(); circle(-16, 0, 5, dark);
      break;
    }
    case 'alt': {
      line(-14, -6, 12, -6, m.alt ? '#7a8a90' : COL.gold, 4); tri(18, -6, 10, -12, 10, 0, m.alt ? '#7a8a90' : COL.gold);
      line(-14, 6, 12, 6, m.alt ? COL.gold : '#7a8a90', 4); tri(18, 6, 10, 0, 10, 12, m.alt ? COL.gold : '#7a8a90');
      break;
    }
    case 'prism': {
      tri(0, -16, -16, 12, 16, 12, 'rgba(190,240,255,.9)');
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(-16, 12); ctx.lineTo(16, 12); ctx.closePath(); ctx.strokeStyle = '#3d8be0'; ctx.lineWidth = 2; ctx.stroke();
      line(-22, -2, -6, 2, '#ffffff', 2.5);
      line(6, 2, 22, -4, '#e2533d', 2.5); line(6, 4, 20, 14, '#3d8be0', 2.5);
      break;
    }
    case 'crusher': {
      const j = 6 * b;
      ctx.fillStyle = '#6b767d';
      ctx.beginPath(); ctx.moveTo(-18 + j, -14); for (let i = 0; i < 4; i++) { ctx.lineTo(-10 + j + (i % 2) * 6, -10 + i * 7); } ctx.lineTo(-18 + j, 14); ctx.fill();
      ctx.beginPath(); ctx.moveTo(18 - j, -14); for (let i = 0; i < 4; i++) { ctx.lineTo(10 - j - (i % 2) * 6, -10 + i * 7); } ctx.lineTo(18 - j, 14); ctx.fill();
      miniDie(0, 0, 1, 8);
      break;
    }
    case 'echo': {
      const sl = 5 * b;
      rr(-17, -15, 18, 18, 4, '#fff', COL.ink, 2); rr(-3 + sl, -3 + sl, 18, 18, 4, '#d4f3ea', COL.ink, 2);
      circle(-8, -6, 2.3, COL.ink); circle(6 + sl, 6 + sl, 2.3, COL.ink);
      break;
    }
    case 'overflow': {
      line(-18, 0, 12, 0, COL.ink, 4); tri(20, 0, 10, -7, 10, 7, COL.ink);
      ctx.setLineDash([3, 3]); line(0, 0, 0, 14, '#1b6b59', 3); ctx.setLineDash([]); tri(0, 20, -6, 12, 6, 12, '#1b6b59');
      for (let i = 0; i < 3; i++) miniDie(-14 + i * 0, -10 - i * 0, 0, 0);
      break;
    }
    case 'fuser': {
      circle(0, 0, 15, '#5d6e75'); circle(0, 0, 11, '#ffd25e');
      txt('+', 0, 1, 20, COL.ink, 'center', 900);
      if (m.held) miniDie(-14, -14, m.held.v, 12);
      break;
    }
    case 'silo': {
      rr(-12, -22, 24, 42, 8, '#7b858c', dark, 2);
      const n = m.outQ ? m.outQ.length : 0;
      for (let i = 0; i < Math.min(8, n); i++) miniDie(-5 + (i % 2) * 10, 14 - Math.floor(i / 2) * 9, 1 + (i % 6), 8);
      if (m.mode === 1) { rr(-16, -4, 32, 10, 3, COL.drop); txt('HOLD', 0, 1, 8, '#fff', 'center', 900); }
      break;
    }
    case 'bounce': {
      const sq = 1 - .4 * b;
      ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo((i % 2 ? 8 : -8), 14 - i * 4 * sq); ctx.strokeStyle = '#59636a'; ctx.lineWidth = 3; ctx.stroke();
      rr(-14, 14 - 24 * sq - 4, 28, 5, 2, COL.route);
      rr(-14, 14, 28, 5, 2, dark);
      break;
    }
    case 'forge': {
      const f = Math.sin(t * 9) * 2, fl = 1 + .7 * b;
      ctx.beginPath(); ctx.moveTo(-13, 6); ctx.lineTo(-15, -6 * fl); ctx.lineTo(-7, -2 * fl); ctx.lineTo(-4, (-17 - f) * fl); ctx.lineTo(2, -4 * fl); ctx.lineTo(9, (-11 + f) * fl); ctx.lineTo(13, 6); ctx.fillStyle = COL.ember; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(-4, (-6 - f) * fl); ctx.lineTo(2, 0); ctx.lineTo(5, -6 * fl); ctx.lineTo(7, 6); ctx.fillStyle = '#ffd04a'; ctx.fill();
      rr(-18, 6, 36, 12, 3, '#3a4046');
      break;
    }
    case 'doubler': {
      const slam = 11 * b;
      ctx.fillStyle = '#5a646b'; ctx.fillRect(-3, -25 + slam, 6, 9);
      ctx.fillStyle = '#7b858c'; ctx.fillRect(-16, -18 + slam, 32, 7); ctx.fillRect(-16, 11, 32, 7);
      txt('x2', 0, 3, 14, COL.ink, 'center', 800);
      break;
    }
    case 'drum': {
      circle(0, 0, 18, '#5d6e75'); circle(0, 0, 13, COL.route);
      m.spin = (m.spin || 0) + (.02 + m.work * .5);
      for (let i = 0; i < 3; i++) { const a = m.spin + i * Math.PI / 3; line(-Math.cos(a) * 13, -Math.sin(a) * 13, Math.cos(a) * 13, Math.sin(a) * 13, '#1b6b59', 3); }
      circle(0, 0, 3.5, '#f0b429');
      break;
    }
    case 'flipper': {
      ctx.save(); ctx.rotate(b * Math.PI);
      miniDie(-8, 0, 1, 14); miniDie(8, 0, 6, 14);
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, 16, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = '#7a4aa6'; ctx.lineWidth = 3; ctx.stroke();
      tri(14, -10, 8, -14, 16, -4, '#7a4aa6');
      break;
    }
    case 'frost': {
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + b; line(-Math.cos(a) * 17, -Math.sin(a) * 17, Math.cos(a) * 17, Math.sin(a) * 17, '#3d8be0', 3.5); }
      circle(0, 0, 5, COL.ice);
      break;
    }
    case 'spiker': {
      ctx.save(); ctx.rotate(b * 2);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; tri(Math.cos(a) * 19, Math.sin(a) * 19, Math.cos(a - .35) * 9, Math.sin(a - .35) * 9, Math.cos(a + .35) * 9, Math.sin(a + .35) * 9, '#4a4f54'); }
      ctx.restore();
      circle(0, 0, 9, '#a66ad6');
      break;
    }
    case 'inflate': {
      const s = 1 + .25 * b;
      ctx.beginPath(); ctx.ellipse(0, -3, 12 * s, 14 * s, 0, 0, Math.PI * 2); ctx.fillStyle = '#e27ab0'; ctx.fill();
      line(0, 11 * s, 0, 20, dark, 1.5);
      txt('+1', 0, -3, 12, '#fff', 'center', 900);
      break;
    }
    case 'pult': {
      ctx.fillStyle = '#6b5236'; ctx.fillRect(-18, 12, 36, 7);
      ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(0, -2); ctx.lineTo(10, 12); ctx.strokeStyle = '#6b5236'; ctx.lineWidth = 4; ctx.stroke();
      const a = lerp(-0.3, -2.3, fire > 0 ? easeOut(1 - fire) : 0);
      ctx.save(); ctx.translate(0, -2); ctx.rotate(Math.PI + a);
      line(0, 0, 22, 0, '#8a6a44', 4); rr(18, -6, 10, 10, 3, '#5a4630');
      ctx.restore();
      if (m.load && m.load.length && m.wind > 0) miniDie(-20, -6, m.load[0].v, 12);
      break;
    }
    case 'cannon': case 'blunder': {
      const rc = -7 * fire;
      circle(-4, 8, 12, dark);
      ctx.save(); ctx.rotate(-.35);
      if (m.kind === 'blunder') {
        ctx.beginPath(); ctx.moveTo(-6 + rc, -5); ctx.lineTo(18 + rc, -6); ctx.lineTo(26 + rc, -12); ctx.lineTo(26 + rc, 12); ctx.lineTo(18 + rc, 6); ctx.lineTo(-6 + rc, 5); ctx.closePath();
        ctx.fillStyle = '#8a6a44'; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
        for (let i = 0; i < (m.load ? m.load.length : 0); i++) circle(-2 + i * 6, -14, 2.5, COL.gold);
      } else {
        rr(-6 + rc, -6, 30, 12, 4, '#59636a', dark, 2); rr(20 + rc, -7, 6, 14, 2, COL.weapon);
      }
      ctx.restore();
      circle(-4, 8, 5, '#9aa4aa');
      if (fire > .55) { const fa = (fire - .55) / .45; circle(26, -11, 10 * fa, `rgba(255,220,120,${fa})`); circle(26, -11, 5 * fa, '#fff'); }
      break;
    }
    case 'rocket': {
      const gone = (m.launch || 0) <= 0 && m.busy > .2 && m.load.length === 0;
      ctx.fillStyle = '#4a555b'; ctx.fillRect(-18, 16, 36, 6);
      if (!gone) {
        const jig = m.launch > 0 ? Math.sin(t * 80) * 1.5 : 0;
        ctx.save(); ctx.translate(jig, 0);
        ctx.beginPath(); ctx.moveTo(-8, 14); ctx.lineTo(-8, -10); ctx.quadraticCurveTo(0, -26, 8, -10); ctx.lineTo(8, 14); ctx.fillStyle = '#e8e2d4'; ctx.fill(); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.stroke();
        tri(-8, 6, -14, 16, -8, 14, COL.weapon); tri(8, 6, 14, 16, 8, 14, COL.weapon);
        ctx.restore();
      }
      for (let i = 0; i < 10; i++) circle(16 + (i % 2) * 6, 10 - Math.floor(i / 2) * 6, 2.3, i < (m.load ? m.load.length : 0) ? COL.gold : 'rgba(0,0,0,.25)');
      break;
    }
    case 'gatling': {
      circle(-6, 8, 11, dark);
      ctx.save(); ctx.translate(4, -2);
      rr(-8, -9, 26, 18, 4, '#59636a', dark, 2);
      for (let i = 0; i < 3; i++) { const yy = Math.sin((m.spin || 0) + i * 2.1) * 6; line(16, yy, 26, yy, '#2b373c', 3); }
      ctx.restore();
      const n = m.mag ? m.mag.length : 0;
      for (let i = 0; i < 8; i++) circle(-20 + (i % 4) * 5, -16 - Math.floor(i / 4) * 5, 2, i < n ? COL.gold : 'rgba(0,0,0,.25)');
      if (fire > .6) circle(28, -2, 7 * fire, 'rgba(255,220,120,.9)');
      break;
    }
    case 'combo': case 'slots': {
      rr(-22, -14, 44, 26, 5, m.kind === 'slots' ? '#7a2a4a' : '#59636a', dark, 2);
      const n = m.load ? m.load.length : 0;
      for (let i = 0; i < 3; i++) {
        const reel = m.kind === 'slots' && m.reel > 0;
        const v = reel ? ri(1, 6) : (i < n ? m.load[i].v : 0);
        if (v) miniDie(-13 + i * 13, -1, v, 11); else rr(-18 + i * 13, -6.5, 11, 11, 2, 'rgba(0,0,0,.3)');
      }
      txt(m.kind === 'slots' ? '777' : 'x3', 0, 18, 9, m.kind === 'slots' ? '#ffd25e' : COL.ink, 'center', 900);
      break;
    }
    case 'harpoon': {
      circle(-8, 8, 10, dark);
      ctx.save(); ctx.rotate(-.25 - fire * .2);
      line(-10, 0, 18, 0, '#59636a', 4); tri(26, 0, 16, -7, 16, 7, '#c9d6da');
      ctx.restore();
      ctx.beginPath(); for (let i = 0; i < 4; i++) ctx.arc(-14 + i * 4, 16, 2, 0, Math.PI * 2); ctx.strokeStyle = '#9aa4aa'; ctx.lineWidth = 1.5; ctx.stroke();
      break;
    }
    case 'mines': {
      ctx.beginPath(); ctx.arc(0, 8, 16, Math.PI, 0); ctx.fillStyle = '#4a555b'; ctx.fill();
      rr(-18, 8, 36, 8, 3, dark);
      circle(0, -2, 3.5, Math.sin(t * 8) > 0 ? COL.drop : '#7a1d10');
      line(-8, -4, -4, -12, '#59636a', 3); line(8, -4, 4, -12, '#59636a', 3);
      break;
    }
    case 'lens': {
      const on = (m.fuel || 0) > 0;
      if (on) circle(0, 0, 22, `rgba(255,230,120,${.3 + .1 * Math.sin(t * 20)})`);
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 17, 0, 0, Math.PI * 2); ctx.fillStyle = on ? '#fff6c0' : '#bfe6ff'; ctx.fill(); ctx.strokeStyle = '#59636a'; ctx.lineWidth = 3; ctx.stroke();
      rr(-22, 20, 44, 4, 2, 'rgba(0,0,0,.3)');
      if (on) rr(-22, 20, 44 * Math.min(1, m.fuel / 16), 4, 2, COL.gold);
      break;
    }
    case 'rico': {
      ctx.beginPath(); ctx.arc(0, 2, 13, Math.PI * .9, Math.PI * 2.3); ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 4; ctx.stroke();
      tri(12, -8, 4, -12, 10, 0, '#8a6a44');
      miniDie(0, 2, 3, 10);
      break;
    }
    case 'sticky': {
      circle(-2, 4, 13, '#2b2b2b'); circle(-6, 0, 4, 'rgba(255,255,255,.25)');
      ctx.beginPath(); ctx.moveTo(6, -6); ctx.quadraticCurveTo(14, -14, 10, -20); ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 2.5; ctx.stroke();
      circle(10, -21, 3 + Math.sin(t * 30), COL.gold);
      break;
    }
    case 'bulwark': {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - (r === 2 ? 1 : 0); c++) {
        const x = -15 + c * 11 + (r % 2 ? 5 : 0), y = 8 - r * 11 - (b * 4 * (r === 2 ? 1 : 0));
        rr(x - 1, y - 5, 10, 10, 2, r === 2 && b > 0 ? '#ffffff' : '#cfe3ff', '#163f6e', 1.2);
      }
      break;
    }
    case 'thorns': {
      ctx.fillStyle = '#5a7a4a'; ctx.fillRect(-20, 12, 40, 6);
      for (let i = 0; i < 5; i++) tri(-16 + i * 8, 12, -12 + i * 8, -10 - (i % 2) * 6 - b * 4, -8 + i * 8, 12, '#4a4f54');
      break;
    }
    case 'parry': {
      const raised = S && S.shield > 0;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(16, -13); ctx.lineTo(14, 6); ctx.lineTo(0, 20); ctx.lineTo(-14, 6); ctx.lineTo(-16, -13); ctx.closePath();
      ctx.fillStyle = raised ? '#ffffff' : '#7ab8f0'; ctx.fill(); ctx.strokeStyle = '#163f6e'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 3; i++) circle(-8 + i * 8, 0, 3, i < (m.charges || 0) ? '#163f6e' : 'rgba(22,63,110,.2)');
      break;
    }
    case 'patch': {
      rr(-6, -18, 12, 36, 3, COL.heal); rr(-18, -6, 36, 12, 3, COL.heal);
      ringStroke(0, 0, 20, 'rgba(40,120,60,.5)', 2);
      break;
    }
    case 'ram': {
      const ext = fire * 12;
      rr(-20, -10, 18, 20, 3, '#59636a', dark, 2);
      rr(-4, -4, 10 + ext, 8, 2, '#9aa4aa');
      rr(6 + ext, -12, 8, 24, 2, COL.defense);
      if (m.load && m.load.length) miniDie(-11, -18, m.load[0].v, 10);
      break;
    }
    case 'furnace': {
      rr(-22, -18, 44, 38, 8, '#4a3a30', '#2a1d14', 2);
      rr(-14, -6, 28, 20, 4, '#2a1d14');
      const fl = 1 + .6 * fire;
      for (let i = 0; i < 3; i++) circle(-8 + i * 8, 6 - Math.abs(Math.sin(t * 7 + i)) * 4 * fl, 5 * fl, i % 2 ? '#ffd04a' : COL.ember);
      txt('⚙', 0, -12, 13, COL.gold, 'center', 900);
      break;
    }
    case 'mint': {
      for (let i = 0; i < 3; i++) {
        const hop = fire > 0 ? -Math.sin((1 - fire) * Math.PI) * 4 * (i + 1) : 0;
        rr(-15, 9 - i * 8 + hop, 30, 8, 4, '#f0b429', '#9a6a05', 1.5);
      }
      txt('⚙', 0, -18, 13, '#7a5404', 'center', 900);
      break;
    }
    case 'cryo': {
      rr(-10, -4, 20, 22, 4, '#59636a', dark, 2);
      for (let i = 0; i < 3; i++) circle(-8 + i * 8, -10 - Math.sin(t * 4 + i) * 3, 5, 'rgba(200,236,255,.9)');
      break;
    }
    // ---- pools
    case 'grinder': {
      // two toothed millstones turning against each other
      const a = (m.spin || 0) + t * (1 + m.work * 8);
      for (const [cx, dir] of [[-9, 1], [9, -1]]) {
        circle(cx, 0, 11, '#8a8f98'); ringStroke(cx, 0, 11, dark, 2);
        for (let i = 0; i < 6; i++) { const aa = a * dir + i * Math.PI / 3; line(cx + Math.cos(aa) * 5, Math.sin(aa) * 5, cx + Math.cos(aa) * 11, Math.sin(aa) * 11, dark, 2); }
      }
      for (let i = 0; i < 3; i++) circle(-4 + i * 4, 16 + ((t * 30 + i * 5) % 8), 1.6, COL.pip);
      break;
    }
    case 'pipgat': {
      circle(-6, 8, 11, dark);
      ctx.save(); ctx.translate(4, -2);
      rr(-8, -8, 24, 16, 4, '#8a6a2a', dark, 2);
      for (let i = 0; i < 4; i++) { const yy = Math.sin((m.spin || 0) + i * 1.6) * 5; line(16, yy, 26, yy, '#5a3a00', 2.5); }
      ctx.restore();
      txt('◆', -16, -14, 11, COL.pip, 'center', 900);
      if (fire > .5) circle(28, -2, 5 * fire, 'rgba(242,193,78,.9)');
      break;
    }
    case 'sandblast': {
      rr(-20, -8, 26, 16, 4, '#8a7a58', dark, 2);
      ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(20, -11); ctx.lineTo(20, 11); ctx.lineTo(6, 6); ctx.closePath(); ctx.fillStyle = '#6b5a40'; ctx.fill();
      for (let i = 0; i < 5; i++) circle(22 + ((t * 40 + i * 7) % 12), -6 + i * 3, 1.5, '#d8c79a');
      break;
    }
    case 'pipforge': {
      // an anvil fed from a pip funnel
      ctx.beginPath(); ctx.moveTo(-18, 2); ctx.lineTo(18, 2); ctx.lineTo(12, 10); ctx.lineTo(6, 10); ctx.lineTo(8, 18); ctx.lineTo(-8, 18); ctx.lineTo(-6, 10); ctx.lineTo(-12, 10); ctx.closePath(); ctx.fillStyle = '#3a4046'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(10, -20); ctx.lineTo(3, -6); ctx.lineTo(-3, -6); ctx.closePath(); ctx.fillStyle = COL.pip; ctx.fill();
      txt('◆', 0, -14, 9, '#7a5404', 'center', 900);
      break;
    }
    case 'compressor': {
      const sq = 8 * (m.work > 0 ? Math.sin((1 - m.work) * Math.PI) : 0);
      rr(-22 + sq, -14, 8, 28, 2, '#7b858c'); rr(14 - sq, -14, 8, 28, 2, '#7b858c');
      const n = m.stack ? m.stack.length : 0;
      for (let i = 0; i < 3; i++) miniDie(-8 + i * 8, 0, i < n ? m.stack[i].v : 1, 8, i < n ? '#fff' : 'rgba(255,255,255,.3)');
      break;
    }
    case 'meteor': {
      circle(0, 4, 14, '#5a3a2a'); circle(-4, 0, 5, '#7a5a40'); circle(5, 8, 3, '#7a5a40');
      for (let i = 0; i < 3; i++) circle(10 + i * 5, -8 - i * 5, 4 - i, i % 2 ? '#ffd04a' : COL.ember);
      rr(-18, 16, 36, 5, 2, dark);
      break;
    }
    case 'venomvat': {
      rr(-16, -6, 32, 24, 6, '#3a4a30', dark, 2);
      ctx.beginPath(); ctx.ellipse(0, -6, 16, 5, 0, 0, Math.PI * 2); ctx.fillStyle = COL.venom; ctx.fill();
      for (let i = 0; i < 3; i++) circle(-6 + i * 6, -10 - ((t * 20 + i * 6) % 12), 2.5, 'rgba(160,230,100,.8)');
      txt('☠', 0, 8, 12, '#d7f2b8', 'center', 900);
      break;
    }
    case 'catalyst': {
      circle(-6, 8, 10, dark);
      ctx.save(); ctx.rotate(-.3 - fire * .2);
      rr(-4, -6, 26, 12, 4, '#3a4a30', dark, 2); circle(24, 0, 6, COL.venom);
      ctx.restore();
      txt('×2', -14, -14, 11, COL.venom, 'center', 900);
      break;
    }
    case 'rampart': {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) rr(-20 + c * 11 + (r ? 5 : 0), 4 - r * 10, 10, 9, 2, '#cfe3ff', '#163f6e', 1);
      ctx.save(); ctx.rotate(-.4 - fire * .3);
      rr(0, -18, 22, 9, 3, '#59636a', dark, 2);
      ctx.restore();
      break;
    }
  }
}

function drawWall() {
  rr(WALL_X0 + 4, GROUND - 2, WALL_X1 - WALL_X0 - 8, 8, 3, '#4a5a60');
  if (S.bricks.length === 0) txt('dice wall', (WALL_X0 + WALL_X1) / 2, GROUND - 16, 11, 'rgba(255,255,255,.3)', 'center', 600);
  for (let i = 0; i < S.bricks.length; i++) {
    const b = S.bricks[i], p = brickPos(i), s = 1 + .25 * b.pop;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s);
    rr(-11, -11, 22, 22, 4, b.hot ? COL.hot : (b.ice ? COL.ice : '#eaf3ff'), '#163f6e', 1.8);
    const v = Math.max(1, Math.ceil(b.hp));
    if (PIPS[v]) for (const [px, py] of PIPS[v]) circle(px * 5.6, py * 5.6, 2.1, '#163f6e');
    else txt(String(v), 0, 1, 12, '#163f6e', 'center', 800);
    ctx.restore();
  }
  const hp = S.bricks.reduce((a, b) => a + b.hp, 0);
  if (hp > 0) { const top = brickPos(S.bricks.length - 1); txt(String(Math.round(hp)), (WALL_X0 + WALL_X1) / 2, top.y - 24, 13, COL.blk, 'center', 800, 4); }
  // thorns
  S.thorns.forEach((th, i) => {
    if (th.pending) return;
    const x = thornX(i), s = 1 + .3 * (th.pop || 0);
    ctx.save(); ctx.translate(x, GROUND - 8); ctx.scale(s, s);
    tri(-4, 6, 0, -12 - th.v * 2, 4, 6, '#4a4f54');
    circle(0, 2, 4, th.spiky ? '#a66ad6' : '#8a9aa0');
    ctx.restore();
  });
  // parry shield bubble
  if (S.shield > 0) {
    const a = S.shield / .55;
    ctx.beginPath(); ctx.ellipse(WALL_X1 + 4, GROUND - 120, 30, 140, 0, -Math.PI / 2, Math.PI / 2);
    ctx.strokeStyle = `rgba(180,220,255,${.5 + .5 * a})`; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = `rgba(140,194,255,${.15 * a})`; ctx.fill();
  }
  // piston rams punching out of the wall
  for (const r of S.ramFx) {
    const k = r.t / .35, ext = Math.sin(k * Math.PI);
    const x1 = WALL_X1 + ext * ((r.to ?? foeFront()) - WALL_X1 + 10);
    rr(WALL_X1, GROUND - 70, x1 - WALL_X1, 14, 3, '#9aa4aa', '#2b373c', 2);
    rr(x1 - 6, GROUND - 92, 14, 58, 3, COL.defense, '#163f6e', 2);
  }
}

function drawRubbleAndJams() {
  for (const [k, rb] of S.rubble) {
    const ce = center(parseKey(k)), s = 1 + .3 * rb.pop;
    ctx.save(); ctx.translate(ce.x, ce.y); ctx.scale(s, s);
    const rocks = [[-14, 8, 13], [10, 10, 12], [0, -4, 15], [-12, -12, 9], [14, -10, 9]];
    for (const [x, y, r] of rocks) { circle(x, y + 2, r, 'rgba(0,0,0,.3)'); circle(x, y, r, '#7a6a58'); circle(x - r * .3, y - r * .3, r * .35, '#9a8a74'); }
    ctx.restore();
    rr(ce.x - 24, ce.y + 22, 48 * rb.t / rb.max, 4, 2, '#ffb0a0');
  }
}

// heaps of dice on bare floor
const PILE_SPOTS = [[-11, 9], [11, 10], [0, -3], [-12, -12], [12, -11], [1, 15]];
function drawPiles() {
  for (const [k, pl] of S.piles) {
    const ce = center(parseKey(k));
    pl.dice.forEach((pd, i) => {
      const [ox, oy] = PILE_SPOTS[i % PILE_SPOTS.length];
      let x = ce.x + ox, y = ce.y + oy - Math.floor(i / 6) * 6;
      if (pd.t < .3) { const k2 = pd.t / .3; x = lerp(pd.fx, x, k2); y = lerp(pd.fy, y, k2) - 40 * Math.sin(k2 * Math.PI); }
      drawDie(x, y, pd, pd.rot, .82, 0, 20);
    });
    if (pl.dice.length >= 5 && !S.belts.has(k)) txt(`${pl.dice.length}/6`, ce.x, ce.y - 26, 10, pl.dice.length >= 6 ? '#ff8a73' : 'rgba(255,255,255,.7)', 'center', 800, 3);
  }
}
function drawFreePlayUI() {
  const x = WALL_X1 + 12, y = GY + 4, w = FIELD_X1 - x - 6, h = 78;
  rr(x, y, w, h, 12, 'rgba(6,18,22,.9)', '#7fe0c6', 2);
  txt('FREE PLAY', x + 16, y + 20, 18, '#7fe0c6', 'left', 900);
  txt('Build anything: free build', x + 16, y + 44, 12.5, '#e9fbff', 'left', 600);
  txt('and god mode are on.', x + 16, y + 60, 12.5, '#e9fbff', 'left', 600);
  txt('Change foe to fight', x + 140, y + 20, 11, 'rgba(255,255,255,.55)', 'left', 600);
  const rule = S.dummyRule || 'plain';
  let bx = x + 240;
  const btn = (label, on, fn, bw = 70) => {
    const hov = mouse.x >= bx && mouse.x <= bx + bw && mouse.y >= y + 12 && mouse.y <= y + 66;
    rr(bx, y + 12, bw, 54, 9, on ? '#2fae92' : (hov ? '#1f4d5c' : '#16394a'), on ? '#7fe0c6' : 'rgba(255,255,255,.25)', 1.5);
    const parts = label.split('\n');
    parts.forEach((p, i) => txt(p, bx + bw / 2, y + 39 + (i - (parts.length - 1) / 2) * 15, 12.5, on ? '#06201a' : '#fff', 'center', 800));
    S.buttons.push({x: bx, y: y + 12, w: bw, h: 54, fn});
    bx += bw + 6;
  };
  btn('Plain', rule === 'plain', () => setDummyRule('plain'));
  btn('Armor\n8', rule === 'armor', () => setDummyRule('armor'));
  btn('Lock', rule === 'lock', () => setDummyRule('lock'));
  btn('Send\nmites', false, () => spawnWave(12, {miteHp: 7, bigEvery: 0}), 76);
}

// Turn mode: what phase you're in, this turn's roll, and the RUN button.
function drawTurnUI() {
  if (!opts.turns || S.over || S.picker || !S.tphase) return;
  const x = WALL_X1 + 12, w = FIELD_X1 - x - 6, h = 70, top = S.enc === 'dummy' ? GY + 88 : GY + 4;
  const ph = S.tphase, col = ph === 'plan' ? COL.gold : (ph === 'run' ? '#7fe0c6' : '#ff8a73');
  rr(x, top, w, h, 12, 'rgba(6,18,22,.9)', col, 2);
  txt(`TURN ${S.turn}`, x + 14, top + 20, 16, '#fff', 'left', 900);
  txt(ph === 'plan' ? 'PLAN' : (ph === 'run' ? 'RUNNING' : 'FOE TURN'), x + 104, top + 20, 16, col, 'left', 900);
  const bw = 132, bx = x + w - bw - 10, by = top + 8, bh = 54;
  const hov = mouse.x >= bx && mouse.x <= bx + bw && mouse.y >= by && mouse.y <= by + bh;
  if (ph === 'plan') {
    // this turn's roll, waiting in the hopper: you see it before you route
    const roll = [...S.machines.values()].filter(m => m.kind === 'chute').flatMap(m => m.hopper);
    txt('Roll', x + 14, top + 48, 12, 'rgba(255,255,255,.6)', 'left', 700);
    roll.slice(0, 11).forEach((v, i) => drawDie(x + 58 + i * 24, top + 48, {v, show: v}, 0, 1, 0, 19));
    const waiting = S.dice.filter(d => d.state === 'stop').length;
    if (waiting) txt(`+${waiting} waiting`, x + 50 + Math.min(11, roll.length) * 24 + 4, top + 48, 11, '#ffb0a0', 'left', 700);
    rr(bx, by, bw, bh, 12, hov ? '#3fc9a8' : '#2fae92', '#7fe0c6', 2);
    txt('RUN ▶', bx + bw / 2, by + bh / 2 + 1, 22, '#06201a', 'center', 900);
    S.buttons.push({x: bx, y: by, w: bw, h: bh, fn: startRun});
  } else if (ph === 'run') {
    txt('Hands off: watch your line work.', x + 14, top + 48, 12.5, '#e9fbff', 'left', 600);
    rr(bx, by, bw, bh, 12, S.skip ? '#2fae92' : (hov ? '#1f4d5c' : '#16394a'), 'rgba(255,255,255,.25)', 1.5);
    txt(S.skip ? 'Fast ▸▸' : 'Speed up ▸▸', bx + bw / 2, by + bh / 2 + 1, 15, S.skip ? '#06201a' : '#fff', 'center', 800);
    S.buttons.push({x: bx, y: by, w: bw, h: bh, fn: () => { S.skip = !S.skip; }});
  } else {
    const it = curIntent();
    const what = S.enc === 'swarm' ? 'The brood creeps closer.' : (S.foe.state === 'windup' || it.type === 'none' ? `It acts: ${it.label || 'waits'}` : 'It advances.');
    txt(what, x + 14, top + 48, 12.5, '#ffd0c4', 'left', 600);
    rr(bx, by, bw, bh, 12, S.skip ? '#2fae92' : (hov ? '#1f4d5c' : '#16394a'), 'rgba(255,255,255,.25)', 1.5);
    txt(S.skip ? 'Fast ▸▸' : 'Speed up ▸▸', bx + bw / 2, by + bh / 2 + 1, 15, S.skip ? '#06201a' : '#fff', 'center', 800);
    S.buttons.push({x: bx, y: by, w: bw, h: bh, fn: () => { S.skip = !S.skip; }});
  }
}

// a machine's level (stars), XP towards the next one, and this turn's tally
function drawMachineLevel(m, cx, cy) {
  if (m.fixed || m.kind === 'chute' || m.pop < 1) return;
  const lv = m.lvl || 1;
  if (m.lvlFlash > 0) { m.lvlFlash = Math.max(0, m.lvlFlash - 1 / 60); circle(cx, cy, 36 + 6 * Math.sin(S.t * 20), `rgba(255,210,94,${.35 * m.lvlFlash})`); }
  for (let i = 0; i < lv - 1; i++) txt('★', cx - (lv - 2) * 6 + i * 12, cy - 35, 12, COL.gold, 'center', 900, 3);
  if (lv < MAX_LVL && (m.xp > 0 || lv > 1)) {
    const f = (m.xp - LV_XP[lv - 1]) / (LV_XP[lv] - LV_XP[lv - 1]);
    rr(cx - 14, cy + 24, 38, 4, 2, 'rgba(0,0,0,.45)');
    rr(cx - 14, cy + 24, 38 * clamp(f, 0, 1), 4, 2, m.xpTurn >= XP_CAP ? '#9aa4aa' : COL.gold);
  }
  if (opts.turns && (m.turnDmg > 0 || m.turnProc > 0)) {
    const label = m.turnDmg > 0 ? String(Math.round(m.turnDmg)) : `×${m.turnProc}`;
    rr(cx + 14, cy - 34, 26, 15, 7, m.turnDmg > 0 ? 'rgba(120,20,10,.9)' : 'rgba(6,18,22,.85)');
    txt(label, cx + 27, cy - 26, 10.5, m.turnDmg > 0 ? '#ffd0c4' : '#e9fbff', 'center', 900);
  }
}

function drawBuildUI() {
  if (S.mode !== 'build' || S.over) return;
  if (S.enc === 'dummy') { drawFreePlayUI(); return; }
  const x = WALL_X1 + 12, y = GY + 4, w = FIELD_X1 - x - 6, h = 78;
  rr(x, y, w, h, 12, 'rgba(6,18,22,.9)', COL.gold, 2);
  const s = Math.ceil(S.buildT);
  txt('BUILD PHASE', x + 16, y + 20, 18, COL.gold, 'left', 900);
  txt(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x + 170, y + 20, 18, s <= 10 ? '#ff8a73' : '#fff', 'left', 900);
  txt('The Colossus waits. Lay down your line;', x + 16, y + 44, 12.5, '#e9fbff', 'left', 600);
  txt('your weapons practice on it. Refunds are full.', x + 16, y + 60, 12.5, '#e9fbff', 'left', 600);
  const bonus = Math.floor(S.buildT / 2);
  const bw = 150, bx = x + w - bw - 12, by = y + 16, bh = 46;
  const hov = mouse.x >= bx && mouse.x <= bx + bw && mouse.y >= by && mouse.y <= by + bh;
  rr(bx, by, bw, bh, 10, hov ? '#3fc9a8' : '#2fae92', '#7fe0c6', 2);
  txt('Start now', bx + bw / 2, by + 15, 15, '#06201a', 'center', 900);
  txt(`+${bonus} ⚙ early bonus`, bx + bw / 2, by + 33, 11.5, '#06201a', 'center', 700);
  S.buttons.push({x: bx, y: by, w: bw, h: bh, fn: () => startFight(true)});
}

function drawBanner() {
  const b = S.banner;
  if (!b) return;
  const k = b.t / b.life;
  const a = Math.min(1, b.t / .25, (b.life - b.t) / .6);
  const y = (opts.turns ? GY + 128 : GY + 40) - (1 - easeOut(b.t / .4)) * 30;
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
  rr(W / 2 - 330, y - 30, 660, 74, 14, 'rgba(6,18,22,.92)', COL.gold, 2);
  txt(b.title, W / 2, y - 6, 26, COL.gold, 'center', 900);
  txt(b.desc, W / 2, y + 22, 14, '#e9fbff', 'center', 600);
  ctx.restore();
  void k;
}

function drawMines() {
  for (const mn of S.mines) {
    ctx.save(); ctx.translate(mn.x, GROUND - 6);
    ctx.beginPath(); ctx.ellipse(0, 4, 14, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    drawDie(0, -2, mn.d, .2, .75, 0, 20);
    circle(0, -14, 3, Math.sin(mn.t * 10) > 0 ? COL.drop : '#5a1d10');
    ctx.restore();
  }
}

function drawColossus() {
  const f = S.foe, enr = f.enraged;
  const walk = f.state === 'march' && f.pinned <= 0 && f.stun <= 0 && !opts.holdFoe;
  const bob = walk ? Math.abs(Math.sin(f.step)) * -5 : Math.sin(S.t * 2) * 1.5;
  const x = f.x, gy = GROUND;
  let body = enr ? '#b0573c' : '#9a6a48';
  if (f.chill > 0) body = enr ? '#a07a88' : '#8a8f98';
  if (f.flash > 0) body = mix(body, '#ffffff', Math.min(.75, f.flash));
  const dark = enr ? '#5a2618' : '#4a3424';
  ctx.beginPath(); ctx.ellipse(x, gy, 95, 14, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
  const la = walk ? Math.sin(f.step) * 10 : 0;
  rr(x - 52 + la, gy - 58, 30, 58, 8, dark); rr(x + 18 - la, gy - 58, 30, 58, 8, dark);
  rr(x - 58 + la, gy - 12, 42, 14, 6, '#3a2a1e'); rr(x + 12 - la, gy - 12, 42, 14, 6, '#3a2a1e');
  ctx.save(); ctx.translate(x + 62, gy - 160 + bob); ctx.rotate(.3 + Math.sin(S.t * 1.5) * .05);
  rr(-14, 0, 28, 80, 12, dark); circle(0, 86, 20, '#3a2a1e'); ctx.restore();
  ctx.save(); ctx.translate(x, gy - 50 + bob);
  ctx.beginPath(); ctx.moveTo(-78, 0); ctx.lineTo(-88, -120); ctx.quadraticCurveTo(-60, -175, 0, -178); ctx.quadraticCurveTo(64, -175, 84, -118); ctx.lineTo(72, 0); ctx.closePath();
  ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = dark; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-84, -70); ctx.lineTo(80, -70); ctx.moveTo(-80, -30); ctx.lineTo(76, -30); ctx.stroke();
  for (let i = -3; i <= 3; i++) { circle(i * 22, -64, 3, 'rgba(0,0,0,.3)'); circle(i * 22, -24, 3, 'rgba(0,0,0,.3)'); }
  const dmgFrac = 1 - f.hp / f.max;
  ctx.strokeStyle = 'rgba(30,10,0,.7)'; ctx.lineWidth = 2.5;
  if (dmgFrac > .25) { ctx.beginPath(); ctx.moveTo(-40, -150); ctx.lineTo(-30, -120); ctx.lineTo(-44, -100); ctx.lineTo(-34, -80); ctx.stroke(); }
  if (dmgFrac > .5) { ctx.beginPath(); ctx.moveTo(40, -40); ctx.lineTo(30, -60); ctx.lineTo(46, -80); ctx.stroke(); }
  if (dmgFrac > .75) { ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(4, -36); ctx.lineTo(-8, -58); ctx.lineTo(10, -70); ctx.stroke(); }
  const ph = PHASES[f.phase];
  if (ph.armor) {
    // bolted-on plates for Iron Plating
    for (const [px, py, pw, phh] of [[-82, -112, 70, 40], [-4, -112, 82, 40], [-78, -66, 66, 36], [-6, -66, 76, 36]]) {
      rr(px, py, pw, phh, 6, '#6b767d', '#2b373c', 3);
      circle(px + 7, py + 7, 2.5, '#2b373c'); circle(px + pw - 7, py + 7, 2.5, '#2b373c');
    }
  }
  if (f.phase === 1) {
    // the open hive hatch
    rr(10, -150, 50, 30, 8, '#2a1d14', '#c9a56a', 2);
    for (let i = 0; i < 3; i++) circle(22 + i * 13, -135, 3, Math.sin(S.t * 6 + i) > 0 ? '#ff5a4a' : '#5a1d10');
  }
  if (ph.meltdown) {
    ctx.strokeStyle = `rgba(255,${140 + 60 * Math.sin(S.t * 6)},40,.9)`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-60, -150); ctx.lineTo(-40, -110); ctx.lineTo(-58, -80); ctx.moveTo(30, -160); ctx.lineTo(50, -120); ctx.lineTo(36, -90); ctx.lineTo(56, -50); ctx.stroke();
    if (Math.random() < .3) S.parts.push({x: x + rnd(-70, 70), y: GROUND - 50 - rnd(20, 160), vx: 0, vy: -40, col: 'rgba(255,160,80,.6)', size: 4, g: -20, life: .7, t: 0, shape: 0, rot: 0, vr: 0});
  }
  rr(-50, -110, 56, 24, 6, '#2a1d14');
  for (let i = 0; i < 5; i++) line(-44 + i * 11, -106, -44 + i * 11, -90, '#5a4030', 3);
  const eyeCol = f.stun > 0 ? '#9aa4aa' : (enr ? '#ff4a3a' : COL.gold);
  circle(-26, -142, 22, '#2a1d14');
  circle(-30, -142, 15 + Math.sin(S.t * 4), eyeCol);
  circle(-35, -142, 6, '#fff7d0');
  if (f.state === 'windup') circle(-30, -142, 24 + 6 * Math.sin(S.t * 12), 'rgba(255,80,60,.25)');
  if (f.chill > 0) { ctx.fillStyle = 'rgba(200,236,255,.35)'; ctx.fillRect(-80, -12, 150, 12); }
  ctx.restore();
  const armA = -0.2 + f.arm * -1.9;
  ctx.save(); ctx.translate(x - 70, gy - 160 + bob); ctx.rotate(armA);
  rr(-15, 0, 30, 84, 12, body, dark, 3);
  circle(0, 92, 24, enr ? '#7a3020' : '#5a4030'); circle(-6, 86, 6, 'rgba(255,255,255,.15)');
  ctx.restore();
}

function foeBody(base, enrBase) {
  const f = S.foe;
  let body = f.enraged ? enrBase : base;
  if (f.chill > 0) body = '#8a8f98';
  if (f.flash > 0) body = mix(body, '#ffffff', Math.min(.75, f.flash));
  return body;
}

// The Mite Mother: a swollen sac on spindly legs, pulsing out mites.
function drawMother() {
  const f = S.foe, x = f.x, gy = GROUND;
  const pulse = Math.sin(S.t * 3) * 4 + (S.waveT < 1.5 && S.mode === 'fight' ? Math.sin(S.t * 30) * 4 : 0);
  const body = foeBody('#9a6a48', '#b0573c');
  ctx.beginPath(); ctx.ellipse(x, gy, 90, 12, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
  for (let i = 0; i < 6; i++) {
    const lx = x - 70 + i * 28, sw = Math.sin(S.t * 2 + i) * 4;
    ctx.beginPath(); ctx.moveTo(lx, gy - 70); ctx.lineTo(lx + (i < 3 ? -18 : 18) + sw, gy - 100); ctx.lineTo(lx + (i < 3 ? -26 : 26), gy);
    ctx.strokeStyle = '#4a3424'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(x + 10, gy - 110, 95 + pulse, 70 + pulse * .6, -.1, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#4a3424'; ctx.stroke();
  // egg sacs
  for (let i = 0; i < 7; i++) {
    const a = i * .9 + .4, ex = x + 20 + Math.cos(a) * 55, ey = gy - 110 + Math.sin(a) * 38;
    circle(ex, ey, 10 + Math.sin(S.t * 4 + i) * 2, 'rgba(255,210,150,.55)');
  }
  // head
  circle(x - 80, gy - 120, 30, mix(body.startsWith('#') ? body : '#9a6a48', '#4a3424', .25));
  for (let i = 0; i < 3; i++) circle(x - 96 + i * 12, gy - 128, 5, f.stun > 0 ? '#9aa4aa' : '#ff4a3a');
  line(x - 100, gy - 104, x - 116, gy - 90, '#2a1d14', 4); line(x - 86, gy - 100, x - 92, gy - 84, '#2a1d14', 4);
}

// The Ironshell: a low armored beetle. Its shell lifts while it winds up.
function drawShell() {
  const f = S.foe, x = f.x, gy = GROUND, open = shellOpen();
  const walk = f.state === 'march' && f.pinned <= 0 && f.stun <= 0 && !opts.holdFoe && S.mode === 'fight';
  const bob = walk ? Math.abs(Math.sin(f.step * 1.3)) * -3 : 0;
  const body = foeBody('#5d6e75', '#7a5a50');
  ctx.beginPath(); ctx.ellipse(x, gy, 105, 14, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
  for (let i = 0; i < 4; i++) {
    const lx = x - 70 + i * 46, sw = walk ? Math.sin(f.step * 1.3 + i * 1.7) * 8 : 0;
    rr(lx + sw - 8, gy - 40, 16, 40, 6, '#2b373c');
  }
  // soft core, visible when the shell lifts
  const lift = open ? 40 + Math.sin(S.t * 10) * 3 : 0;
  ctx.beginPath(); ctx.ellipse(x, gy - 60 + bob, 92, 40, 0, Math.PI, 0); ctx.fillStyle = open ? '#ff9a5a' : '#3a2a30'; ctx.fill();
  if (open) { circle(x, gy - 66, 28 + Math.sin(S.t * 12) * 3, 'rgba(255,230,150,.7)'); txt('WEAK', x, gy - 66, 14, '#7a2a10', 'center', 900); }
  // the shell
  ctx.save(); ctx.translate(x, gy - 62 + bob - lift); ctx.rotate(open ? -.12 : 0);
  ctx.beginPath(); ctx.ellipse(0, 0, 110, 78, 0, Math.PI, 0); ctx.closePath();
  ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#1d2a30'; ctx.stroke();
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 36, 0); ctx.lineTo(i * 24, -70 + Math.abs(i) * 14); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3; ctx.stroke(); }
  for (let i = 0; i < 6; i++) circle(-80 + i * 32, -12, 4, '#9aa4aa');
  txt(String(effArmor()), 0, -40, 22, 'rgba(255,255,255,.55)', 'center', 900);
  const dmgFrac = 1 - f.hp / f.max;
  if (dmgFrac > .3) { ctx.beginPath(); ctx.moveTo(-30, -70); ctx.lineTo(-20, -40); ctx.lineTo(-34, -20); ctx.strokeStyle = '#1d2a30'; ctx.lineWidth = 3; ctx.stroke(); }
  if (dmgFrac > .6) { ctx.beginPath(); ctx.moveTo(40, -60); ctx.lineTo(30, -30); ctx.lineTo(48, -10); ctx.stroke(); }
  ctx.restore();
  // head
  rr(x - 136, gy - 76 + bob, 44, 36, 12, '#2b373c');
  circle(x - 122, gy - 62 + bob, 6, f.stun > 0 ? '#9aa4aa' : (open ? '#ff4a3a' : COL.gold));
}

// The Lockbox: an iron safe on legs with a big lock showing the face(s) it wants.
function drawLockbox() {
  const f = S.foe, x = f.x, gy = GROUND;
  const walk = f.state === 'march' && f.pinned <= 0 && f.stun <= 0 && !opts.holdFoe && S.mode === 'fight';
  const bob = walk ? Math.abs(Math.sin(f.step)) * -4 : 0;
  const body = foeBody('#6b767d', '#7a6a70');
  ctx.beginPath(); ctx.ellipse(x, gy, 90, 13, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
  const la = walk ? Math.sin(f.step) * 9 : 0;
  rr(x - 50 + la, gy - 46, 24, 46, 6, '#2b373c'); rr(x + 26 - la, gy - 46, 24, 46, 6, '#2b373c');
  rr(x - 84, gy - 220 + bob, 168, 176, 14, body, '#1d2a30', 5);
  rr(x - 70, gy - 206 + bob, 140, 148, 10, null, 'rgba(0,0,0,.25)', 3);
  for (const [rx, ry] of [[-74, -210], [62, -210], [-74, -58], [62, -58]]) circle(x + rx + 6, gy + ry + bob, 5, '#3a4448');
  // the lock: one or two faces it wants; the ring shows time to the next turn
  const n = f.locks.length || 1, size = n > 1 ? 44 : 60;
  rr(x - 60, gy - 184 + bob, 120, 96, 12, '#2b2b2b', COL.gold, 3);
  f.locks.forEach((v, i) => drawDie(x + (n > 1 ? (i ? 26 : -26) : 0), gy - 136 + bob, {v, show: v}, 0, 1, 0, size));
  const k = 1 - f.lockT / PHASES[f.phase].lockEvery;
  ctx.beginPath(); ctx.arc(x, gy - 136 + bob, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.strokeStyle = '#8fe08f'; ctx.lineWidth = 4; ctx.stroke();
  // next faces, small, under the lock
  txt('next', x - 40, gy - 72 + bob, 11, 'rgba(255,255,255,.6)', 'center', 700);
  f.nextLocks.forEach((v, i) => drawDie(x - 6 + i * 26, gy - 72 + bob, {v, show: v}, 0, 1, 0, 20));
  circle(x - 62, gy - 196 + bob, 8, f.stun > 0 ? '#9aa4aa' : '#ff4a3a');
}

// The Scrap Dummy: a sack on a post with a painted target. Plates when it has
// armor, a lock plate with the face when it has a lock.
function drawDummy() {
  const f = S.foe, x = f.x, gy = GROUND, ph = PHASES[f.phase];
  const wob = Math.sin(S.t * 3) * .03 + (f.hit > 0 ? Math.sin(S.t * 60) * .06 : 0);
  ctx.beginPath(); ctx.ellipse(x, gy, 60, 10, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
  rr(x - 6, gy - 120, 12, 120, 3, '#6b5236');
  rr(x - 40, gy - 6, 80, 10, 3, '#4a3424');
  ctx.save(); ctx.translate(x, gy - 150); ctx.rotate(wob);
  const body = foeBody('#d8c79a', '#d8c79a');
  ctx.beginPath(); ctx.ellipse(0, 0, 62, 78, 0, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = '#8a7a58'; ctx.lineWidth = 4; ctx.stroke();
  for (let i = 0; i < 4; i++) line(-50 + i * 10, -40 + i * 26, -30 + i * 10, -36 + i * 26, '#a8966e', 2);   // stitches
  if (ph.locks) {
    rr(-48, -48, 96, 96, 12, '#2b2b2b', COL.gold, 3);
    f.locks.forEach(v => drawDie(0, 0, {v, show: v}, 0, 1, 0, 54));
    const k = 1 - f.lockT / ph.lockEvery;
    ctx.beginPath(); ctx.arc(0, 0, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.strokeStyle = '#8fe08f'; ctx.lineWidth = 4; ctx.stroke();
    txt('next', -22, 64, 11, 'rgba(255,255,255,.7)', 'center', 700, 3);
    f.nextLocks.forEach((v, i) => drawDie(8 + i * 24, 64, {v, show: v}, 0, 1, 0, 20));
  } else {
    for (const [r, c] of [[46, '#e2533d'], [34, '#f7f0e1'], [22, '#e2533d'], [10, '#f7f0e1'], [4, '#e2533d']]) circle(0, 0, r, c);
  }
  if (ph.armor) {
    for (const [px, py] of [[-62, -60], [18, -60], [-62, 22], [18, 22]]) rr(px, py, 44, 38, 6, 'rgba(107,118,125,.92)', '#2b373c', 3);
    txt(String(effArmor()), 0, 2, 26, '#fff', 'center', 900, 4);
  }
  ctx.restore();
}

function drawFoe() {
  const f = S.foe, x = f.x, gy = GROUND;
  if (S.enc === 'swarm') drawMother();
  else if (S.enc === 'shell') drawShell();
  else if (S.enc === 'lock') drawLockbox();
  else if (S.enc === 'dummy') drawDummy();
  else drawColossus();
  if (f.burn > 0) for (let i = 0; i < 5; i++) { const fy = (S.t * 40 + i * 13) % 30; circle(x - 60 + i * 28, gy - 170 - fy, 5 - fy * .15, COL.ember); }
  if (f.stagger > 0 || f.stun > 0) for (let i = 0; i < 3; i++) { const a = S.t * 5 + i * 2.1; circle(x - 30 + Math.cos(a) * 40, gy - 245 + Math.sin(a) * 8, 4, '#ffe27a'); }
  // poison stacks and stripped armor, as badges by the foe
  let by0 = gy - 30;
  if (f.poison >= 1) {
    rr(x + 58, by0 - 14, 70, 26, 13, 'rgba(20,40,10,.88)', COL.venom, 2);
    txt(`☠ ${Math.round(f.poison)}`, x + 93, by0, 14, '#d7f2b8', 'center', 900);
    by0 -= 32;
  }
  if (f.shred > 0 && PHASES[f.phase].armor) {
    rr(x + 58, by0 - 14, 70, 26, 13, 'rgba(40,32,14,.88)', '#d8c79a', 2);
    txt(`armor ${effArmor()}`, x + 93, by0, 12, '#f0e2b8', 'center', 900);
  }
  // sticky bombs
  for (const b of S.bombs) {
    const bx = x + b.ox, by = gy + b.oy;
    circle(bx, by, 9, '#2b2b2b');
    drawDie(bx, by, b.d, 0, .5, 0, 18);
    txt(b.t.toFixed(1), bx, by - 18, 11, b.t < .7 ? '#ff5a4a' : '#ffd25e', 'center', 900, 3);
    if (Math.random() < .5) circle(bx + 6, by - 9, 2 + Math.random() * 2, COL.gold);
  }
  // harpoon chain
  if (f.pinned > 0) {
    const hm = [...S.machines.values()].find(m => m.kind === 'harpoon');
    if (hm) {
      const ce = center(hm.cell), hx = x - 40, hy = gy - 110;
      ctx.setLineDash([5, 4]); line(ce.x + 20, ce.y, hx, hy, '#c9d6da', 3); ctx.setLineDash([]);
      txt('pinned ' + f.pinned.toFixed(1) + 's', hx, hy - 20, 12, '#7fe0c6', 'center', 800, 3);
    }
  }
}

function drawLensBeams() {
  for (const m of S.machines.values()) {
    if (m.kind !== 'lens' || m.fuel <= 0) continue;
    const ce = center(m.cell), tx = m.beamAt ? m.beamAt.x : S.foe.x - 40, ty = m.beamAt ? m.beamAt.y : GROUND - 100;
    const w = 6 + Math.sin(S.t * 40) * 1.5;
    line(ce.x + 8, ce.y, tx, ty, 'rgba(255,230,120,.35)', w + 8);
    line(ce.x + 8, ce.y, tx, ty, 'rgba(255,250,210,.9)', w * .45);
    circle(tx, ty, 10 + Math.random() * 4, 'rgba(255,240,180,.6)');
  }
}

function drawTelegraph() {
  const f = S.foe, it = curIntent();
  const bx = f.x - 20, by = GROUND - (S.enc === 'dummy' && S.mode === 'build' ? 262 : 250);
  if (S.mode === 'build') {
    // practice meter: damage per second over the last 5 seconds
    S.dmgLog = S.dmgLog.filter(e => S.t - e.t < 5);
    const dps = S.dmgLog.reduce((a, e) => a + e.d, 0) / 5;
    rr(bx - 80, by - 20, 160, 40, 18, 'rgba(10,25,30,.85)', 'rgba(255,255,255,.25)', 2);
    txt('PRACTICE', bx, by - 7, 11, 'rgba(255,255,255,.6)', 'center', 800);
    txt(`${dps.toFixed(1)} dmg/s`, bx, by + 9, 15, '#ffd0c4', 'center', 900);
    return;
  }
  if (S.enc === 'swarm') {
    // the next brood: how many and how soon; and how many mites are out
    const ph = PHASES[f.phase], k = 1 - S.waveT / ph.waveEvery, n = liveUnits().length;
    rr(bx - 90, by - 20, 180, 40, 18, S.waveT < 2 ? 'rgba(120,20,10,.92)' : 'rgba(10,25,30,.85)', S.waveT < 2 ? '#ff8a73' : 'rgba(255,255,255,.25)', 2);
    txt(`BROOD ×${ph.wave} in ${Math.ceil(S.waveT)}s`, bx, by - 5, 14, '#fff', 'center', 800);
    txt(n ? `${n} mites out` : 'no mites: hit her!', bx, by + 11, 11.5, n ? '#ffd0c4' : '#8fe08f', 'center', 700);
    ctx.beginPath(); ctx.arc(bx + 104, by, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.strokeStyle = '#ff8a73'; ctx.lineWidth = 3; ctx.stroke();
    return;
  }
  const winding = f.state === 'windup';
  const k = winding ? 1 - f.timer / f.total : 0;
  if (winding) {
    const a = .12 + .25 * k + .08 * Math.sin(S.t * 14);
    ctx.fillStyle = `rgba(255,70,50,${a})`;
    if (it.type === 'slam') ctx.fillRect(WALL_X0 - 4, GY - 8, WALL_X1 - WALL_X0 + 8, GH * CELL + 16);
    else if (it.type !== 'hatch') ctx.fillRect(GX - 8, GY - 8, WALL_X1 - GX + 16, GH * CELL + 16);
  }
  if (f.stun > 0) {
    rr(bx - 60, by - 18, 120, 36, 18, 'rgba(10,25,30,.85)', '#7fe0c6', 2);
    txt('STUNNED ' + f.stun.toFixed(1), bx, by + 1, 15, '#7fe0c6', 'center', 800);
    return;
  }
  if (f.state === 'shift') {
    rr(bx - 80, by - 18, 160, 36, 18, 'rgba(10,25,30,.85)', COL.gold, 2);
    txt('CHANGING…', bx, by + 1, 15, COL.gold, 'center', 800);
    return;
  }
  const label = it.type === 'slam' ? `${it.label} ${it.dmg}` : (it.type === 'rocks' ? `${it.label} ${it.n}×${it.dmg}` : `${it.label} ${it.n}`);
  const w = it.type === 'boulders' ? 150 : 120;
  rr(bx - w / 2, by - 18, w, 36, 18, winding ? 'rgba(120,20,10,.92)' : 'rgba(10,25,30,.85)', winding ? '#ff8a73' : 'rgba(255,255,255,.25)', 2);
  txt(label, bx + 8, by + 1, 16, '#fff', 'center', 800);
  if (it.type === 'slam') circle(bx - w / 2 + 18, by, 8, '#c9a56a'); else for (let i = 0; i < 3; i++) circle(bx - w / 2 + 12 + i * 6, by + (i % 2 ? -4 : 4), 3.5, '#a08a6a');
  if (winding) {
    ctx.beginPath(); ctx.arc(bx, by, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.strokeStyle = '#ff8a73'; ctx.lineWidth = 4; ctx.stroke();
    txt(f.timer.toFixed(1) + 's', bx, by + 32, 13, '#ffd0c4', 'center', 700, 4);
    if (it.type === 'slam' && [...S.machines.values()].some(m => m.kind === 'parry' && m.charges > 0) && f.timer < .55)
      txt('PARRY NOW (Space)', WALL_X1 + 70, GROUND - 260, 15, '#ffffff', 'center', 900, 4);
  }
}

function drawProj() {
  for (const p of S.proj) {
    if (p.t < 0) continue;
    const q = projPos(p);
    if (p.kind === 'rocket') {
      const t2 = clamp((p.t + .02) / p.dur, 0, 1), q2 = projPos({...p, t: t2 * p.dur});
      const a = Math.atan2(q2.y - q.y, q2.x - q.x);
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a);
      circle(-22, 0, 9 + Math.random() * 4, 'rgba(255,200,80,.6)');
      ctx.beginPath(); ctx.moveTo(-18, -9); ctx.lineTo(10, -9); ctx.quadraticCurveTo(26, 0, 10, 9); ctx.lineTo(-18, 9); ctx.closePath();
      ctx.fillStyle = '#e8e2d4'; ctx.fill(); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = COL.weapon; ctx.fillRect(-18, -13, 7, 26);
      ctx.restore();
      for (let i = 0; i < Math.min(p.dice.length, 6); i++) drawDie(q.x - Math.cos(a) * (i * 4 - 6), q.y - Math.sin(a) * (i * 4 - 6) - 14, p.dice[i], a, .5, 0, 18);
      continue;
    }
    if (p.kind === 'rock') { circle(q.x, q.y, 9, '#6b5a48'); circle(q.x - 3, q.y - 3, 3, '#8a7a5a'); continue; }
    if (p.kind === 'boulder') {
      const tc = center(p.cell);
      ringStroke(tc.x, tc.y, 26 - 10 * clamp(p.t / p.dur, 0, 1), 'rgba(255,90,74,.8)', 3);
      circle(q.x, q.y, 17, '#7a6a58'); circle(q.x - 5, q.y - 5, 6, '#9a8a74');
      continue;
    }
    if (p.kind === 'cryo') { circle(q.x, q.y, 14, 'rgba(200,236,255,.5)'); drawDie(q.x, q.y, p.dice[0], p.rot, .7, 0, 20); continue; }
    if (p.kind === 'harpoon') {
      const a = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
      ctx.setLineDash([5, 4]); line(p.x0, p.y0, q.x, q.y, '#c9d6da', 2.5); ctx.setLineDash([]);
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a); tri(14, 0, 0, -7, 0, 7, '#c9d6da'); ctx.restore();
      drawDie(q.x - 10, q.y, p.dice[0], 0, .6, 0, 20);
      continue;
    }
    if (p.kind === 'pip') { circle(q.x, q.y, 4, 'rgba(242,193,78,.35)'); circle(q.x, q.y, 2.4, COL.pip); continue; }
    if (p.kind === 'sand') { for (let i = 0; i < 4; i++) circle(q.x - i * 7 + rnd(-3, 3), q.y + rnd(-4, 4), 4 - i * .6, 'rgba(216,199,154,.7)'); }
    if (p.kind === 'meteor') { circle(q.x - 10, q.y + 8, 22 * p.size, 'rgba(255,122,47,.35)'); for (let i = 1; i < 5; i++) circle(q.x - i * 9, q.y + i * 6, (12 - i * 2) * p.size, 'rgba(255,170,80,.4)'); }
    if (p.kind === 'catalyst') circle(q.x, q.y, 14, 'rgba(122,201,67,.35)');
    if (p.kind === 'rampart') { drawDie(q.x, q.y, {v: p.dice[0].v, show: p.dice[0].v, ice: true}, p.rot, 1.2, 0, 24); circle(q.x, q.y, 18, 'rgba(140,194,255,.25)'); continue; }
    if (p.kind === 'cluster') {
      p.dice.forEach((d, i) => drawDie(q.x + (i - 1) * 14 * p.size, q.y + (i % 2 ? -8 : 6), d, p.rot + i, 1.0 * p.size, 0, 22));
      continue;
    }
    const d = p.dice[0];
    if (!d) continue;
    if (p.kind === 'cannon' || p.kind === 'bullet' || p.kind === 'pellet') line(q.x - 24, q.y + 3, q.x, q.y, 'rgba(255,226,122,.35)', 5);
    if (p.kind === 'sticky') circle(q.x + 8, q.y - 8, 3 + Math.random() * 2, COL.gold);
    const s = p.kind === 'bullet' ? .65 : (p.kind === 'brick' || p.kind === 'thorn' ? .9 : 1.05);
    drawDie(q.x, q.y, d, p.rot, s * (p.size || 1), 0, 22);
  }
}

function drawDebris() {
  for (const d of S.debris) {
    ctx.globalAlpha = clamp((d.life - d.t) / .4, 0, 1);
    drawDie(d.x, d.y, d, d.rot, .8, 0, 20);
    ctx.globalAlpha = 1;
  }
}

function drawParticles() {
  for (const p of S.parts) {
    const k = p.t / p.life;
    ctx.globalAlpha = 1 - k;
    if (p.shape === 0) circle(p.x, p.y, p.size * (1 - .5 * k), p.col);
    else if (p.shape === 1) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2); ctx.restore(); }
    else if (p.shape === 2) line(p.x, p.y, p.x - p.vx * .04, p.y - p.vy * .04, p.col, p.size);
    else ringStroke(p.x, p.y, lerp(p.size, p.end, easeOut(k)), p.col, 3 * (1 - k) + 1);
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  for (const t of S.texts) {
    const k = t.t / t.life, pop = 1 + .6 * Math.max(0, 1 - k * 7);
    ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.translate(t.x, t.y - easeOut(k) * 34); ctx.scale(pop, pop);
    txt(t.txt, 0, 0, t.size, t.col, 'center', 800, 5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function bar(x, y, w, h, frac, col, back = 'rgba(0,0,0,.4)') {
  rr(x, y, w, h, h / 2, back);
  if (frac > 0) rr(x, y, Math.max(h, w * frac), h, h / 2, col);
}

function button(x, y, w, label, on, fn) {
  const hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + 22;
  rr(x, y, w, 22, 6, on ? '#2fae92' : (hov ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.3)'), 'rgba(255,255,255,.18)', 1);
  txt(label, x + w / 2, y + 11.5, 11, '#fff', 'center', 700);
  S.buttons.push({x, y, w, h: 22, fn});
}

// Sandbox controls: a toolbar row on desktop, the ☰ Tools menu on phones.
function toolbarItems() {
  return [
    {w: 58, label: S.paused ? 'Paused' : 'Pause', on: S.paused, fn: () => { S.paused = !S.paused; }},
    {w: 62, toggle: true, label: 'Speed ' + opts.speed + 'x', on: opts.speed > 1, fn: () => { opts.speed = opts.speed === 1 ? 2 : (opts.speed === 2 ? 3 : 1); }},
    {w: 98, toggle: true, label: 'Slow-mo build', on: opts.slow, fn: () => { opts.slow = !opts.slow; }},
    {w: 84, toggle: true, label: opts.holdFoe ? 'Foe frozen' : 'Freeze foe', on: opts.holdFoe, fn: () => { opts.holdFoe = !opts.holdFoe; }},
    {w: 72, toggle: true, label: 'God mode', on: opts.god, fn: () => { opts.god = !opts.god; if (opts.god) S.hp = S.maxHp; }},
    {w: 64, toggle: true, label: opts.turns ? 'Turns' : 'Real-time', on: opts.turns, fn: () => { opts.turns = !opts.turns; if (opts.turns) beginTurns(); else { S.tphase = null; S.rollT = 1; } }},
    {w: 72, toggle: true, label: 'Free build', on: opts.free, fn: () => { opts.free = !opts.free; }},
    {w: 68, label: 'Phase ▸', on: false, fn: () => {
      if (S.enc === 'dummy') return;           // free play has no phases
      if (S.mode === 'build') { startFight(false); return; }
      const f = S.foe;
      if (f.phase + 1 < PHASES.length) f.hp = Math.min(f.hp, f.max * PHASES[f.phase + 1].at - 1);
      else f.hp = Math.min(f.hp, 60);
    }},
    {w: 70, label: 'Flyers +4', on: false, fn: () => spawnFlyers(4)},
    {w: 84, label: 'Change foe', on: false, fn: () => newGame('keep')},
    {w: 76, label: 'Clear floor', on: false, fn: () => newGame('blank')},
    {w: 58, label: 'Starter', on: false, fn: () => newGame('starter')},
  ];
}

function drawHud() {
  S.buttons = [];
  if (PHONE) { drawHudPhone(); return; }
  txt('DICE FACTORY', 24, 22, 20, COL.gold, 'left', 800);
  txt('ashcan sandbox', 176, 23, 12, 'rgba(255,255,255,.5)', 'left', 600);
  // toolbar
  let bx = 330;
  for (const it of toolbarItems()) { button(bx, 10, it.w, it.label, it.on, it.fn); bx += it.w + 5; }
  // factory health
  txt('Factory', 24, 60, 13, 'rgba(255,255,255,.65)', 'left', 600);
  bar(84, 52, 200, 16, S.hp / S.maxHp, S.hitFlash > 0 ? '#ffffff' : '#ff7a6a');
  txt(`${Math.ceil(S.hp)} / ${S.maxHp}${opts.god ? ' (god)' : ''}`, 184, 61, 12, '#fff', 'center', 800, 3);
  const wallHp = S.bricks.reduce((a, b) => a + b.hp, 0);
  // gears: the build currency
  S.gearFlash = Math.max(0, (S.gearFlash || 0) - 1 / 30);
  const gs = 1 + .25 * S.gearFlash;
  rr(292, 44, 74, 34, 8, `rgba(224,162,20,${.18 + .3 * S.gearFlash})`, COL.gold, 1.5);
  ctx.save(); ctx.translate(329, 61); ctx.scale(gs, gs);
  txt(`⚙ ${opts.free ? '∞' : Math.floor(S.gears)}`, 0, 1, 18, COL.gold, 'center', 900);
  ctx.restore();
  const jams = S.dice.filter(d => d.state === 'stop' && d.wait > JAM_TIME).length;
  const hop = Math.max(0, ...[...S.machines.values()].filter(m => m.kind === 'chute').map(m => m.hopper.length));
  const chips = [
    ['Hopper', `${hop}/${HOPPER_MAX}`, hop >= HOPPER_MAX - 2 ? '#ff8a73' : '#e9fbff'],
    ['Backed up', String(jams), jams > 3 ? '#ff8a73' : '#e9fbff'],

    ['Wall', String(Math.round(wallHp)), COL.blk],
    ['On floor', String([...S.piles.values()].reduce((a, p) => a + p.dice.length, 0)), '#e9fbff'],
    ['Lost', String(S.stats.lost), S.stats.lost > 0 ? '#ffb0a0' : '#e9fbff'],
    ['Pips ◆', String(Math.floor(S.pips)), COL.pip],
  ];
  chips.forEach(([l, v, c], i) => {
    const x = 372 + i * 70;
    rr(x, 44, 66, 34, 8, 'rgba(0,0,0,.28)');
    txt(l, x + 7, 53, 10.5, 'rgba(255,255,255,.55)', 'left', 600);
    txt(v, x + 60, 67, 16, c, 'right', 800);
  });
  rr(796, 44, 90, 34, 8, 'rgba(0,0,0,.28)');
  txt('Next roll', 803, 53, 10.5, 'rgba(255,255,255,.55)', 'left', 600);
  bar(803, 64, 76, 7, 1 - S.rollT / ROLL_EVERY, '#7fe0c6');
  const f = S.foe;
  const ph = PHASES[f.phase];
  txt(`Phase ${f.phase + 1}: ${ph.name}`, 904, 52, 14, f.enraged ? '#ff8a73' : '#fff', 'left', 800);
  bar(904, 62, 352, 14, f.hp / f.max, f.enraged ? '#ff5a4a' : '#e2533d');
  // phase breakpoints on the health bar
  for (let i = 1; i < PHASES.length; i++) {
    const px = 904 + 352 * PHASES[i].at;
    line(px, 59, px, 79, i <= f.phase ? 'rgba(255,255,255,.25)' : '#ffd25e', 2);
    txt(String(i + 1), px, 86, 9, i <= f.phase ? 'rgba(255,255,255,.3)' : COL.gold, 'center', 800);
  }
  txt(S.enc === 'dummy' ? 'practice target' : `${Math.ceil(f.hp)} / ${f.max}`, 1080, 70, 11, '#fff', 'center', 800, 3);
  // heads-up when the next phase is close
  const nx = PHASES[f.phase + 1];
  if (nx && f.hp / f.max - nx.at < .07 && f.state !== 'shift') {
    const a = .6 + .4 * Math.sin(S.t * 8);
    txt(`Phase ${f.phase + 2} soon: ${nx.name}`, 904, 89, 11, `rgba(255,210,94,${a})`, 'left', 800);
  }
  const st = foeStatus();
  const tags = [f.pinned > 0 ? 'pinned' : '', f.chill > 0 ? 'chilled' : '', f.burn > 0 ? 'burning' : ''].filter(Boolean).join(' · ');
  txt(st + (tags ? '  ·  ' + tags : ''), 1256, 52, 11.5, f.state === 'windup' ? '#ff8a73' : 'rgba(255,255,255,.7)', 'right', 600);
  if (S.timeScale < .9) txt('slow-mo', 318, 23, 11, '#7fe0c6', 'right', 800);
}

// One compact row on phones: factory, gears, line health, then the Colossus.
function foeStatus() {
  const f = S.foe;
  if (S.mode === 'build') return 'Waiting while you build';
  if (S.enc === 'swarm') return f.state === 'shift' ? 'Changing…' : 'Brooding at the back';
  if (f.stun > 0) return 'Stunned';
  if (f.state === 'march') { const front = foeFront(); return front > REACH_X + 2 ? `Reaches wall in ${Math.ceil(Math.max(0, (front - REACH_X) / f.speed))}s` : 'At your wall'; }
  if (f.state === 'windup') return 'Winding up!';
  if (f.state === 'shift') return 'Changing…';
  return 'Recovering';
}
function drawHudPhone() {
  const f = S.foe, ph = PHASES[f.phase];
  // factory health
  bar(12, 8, 170, 18, S.hp / S.maxHp, S.hitFlash > 0 ? '#ffffff' : '#ff7a6a');
  txt(`Factory ${Math.ceil(S.hp)}/${S.maxHp}`, 97, 18, 12, '#fff', 'center', 800, 3);
  // gears
  S.gearFlash = Math.max(0, (S.gearFlash || 0) - 1 / 30);
  rr(190, 4, 86, 40, 9, `rgba(224,162,20,${.18 + .3 * S.gearFlash})`, COL.gold, 1.5);
  txt(`⚙ ${opts.free ? '∞' : Math.floor(S.gears)}`, 233, 25, 21 + 4 * S.gearFlash, COL.gold, 'center', 900);
  // line health
  const jams = S.dice.filter(d => d.state === 'stop' && d.wait > JAM_TIME).length;
  const hop = Math.max(0, ...[...S.machines.values()].filter(m => m.kind === 'chute').map(m => m.hopper.length));
  const wallHp = Math.round(S.bricks.reduce((a, b) => a + b.hp, 0));
  const floor = [...S.piles.values()].reduce((a, p) => a + p.dice.length, 0);
  const pipMode = S.pips >= 1 || [...S.machines.values()].some(m => KINDS[m.kind].pool === 'grind' || m.kind === 'pipforge');
  const chips = [['Hopper', `${hop}/${HOPPER_MAX}`, hop >= HOPPER_MAX - 2], ['Jammed', String(jams), jams > 3], ['Wall', String(wallHp), false], pipMode ? ['Pips ◆', String(Math.floor(S.pips)), false] : ['Floor', String(floor), false]];
  chips.forEach(([l, v, bad], i) => {
    const x = 284 + i * 74;
    rr(x, 4, 68, 40, 8, 'rgba(0,0,0,.28)');
    txt(l, x + 34, 15, 11, 'rgba(255,255,255,.6)', 'center', 600);
    txt(v, x + 34, 32, 16, bad ? '#ff8a73' : (l === 'Wall' ? COL.blk : '#e9fbff'), 'center', 800);
  });
  // the Colossus
  const fx = 590, fw = 380;
  txt(`Phase ${f.phase + 1}: ${ph.name}`, fx, 14, 14, f.enraged ? '#ff8a73' : '#fff', 'left', 800);
  bar(fx, 24, fw, 16, f.hp / f.max, f.enraged ? '#ff5a4a' : '#e2533d');
  for (let i = 1; i < PHASES.length; i++) line(fx + fw * PHASES[i].at, 21, fx + fw * PHASES[i].at, 43, i <= f.phase ? 'rgba(255,255,255,.25)' : '#ffd25e', 2);
  txt(S.enc === 'dummy' ? 'practice target' : `${Math.ceil(f.hp)} / ${f.max}`, fx + fw / 2, 33, 11, '#fff', 'center', 800, 3);
  const nx = PHASES[f.phase + 1];
  const soon = nx && S.mode !== 'build' && f.hp / f.max - nx.at < .07 && f.state !== 'shift';
  txt(soon ? `Phase ${f.phase + 2} soon: ${nx.name}` : foeStatus(), 1268, 14, 12.5, soon ? COL.gold : (f.state === 'windup' ? '#ff8a73' : 'rgba(255,255,255,.75)'), 'right', 700);
  const tags = [f.pinned > 0 ? 'pinned' : '', f.chill > 0 ? 'chilled' : '', f.burn > 0 ? 'burning' : '', S.timeScale < .9 ? 'slow-mo' : ''].filter(Boolean).join(' · ');
  if (tags) txt(tags, 1268, 33, 11.5, '#7fe0c6', 'right', 700);
}

// Phone: category tabs on the left, big buttons on the right of the palette.
function bigButton(x, y, w, h, label, sub, on, fn, col = '#16394a') {
  rr(x, y, w, h, 10, on ? '#2fae92' : col, on ? '#7fe0c6' : 'rgba(255,255,255,.2)', 1.5);
  txt(label, x + w / 2, y + h / 2 - (sub ? 7 : 0), 20, on ? '#06201a' : '#fff', 'center', 800);
  if (sub) txt(sub, x + w / 2, y + h / 2 + 15, 10.5, on ? '#06201a' : 'rgba(255,255,255,.7)', 'center', 700);
  S.buttons.push({x, y, w, h, fn});
}
function drawPhoneControls() {
  CATS.forEach((cat, i) => {
    const on = (S.palCat || 'route') === cat, y = PAL_Y - 2 + i * 29;
    rr(14, y, 112, 26, 8, on ? COL[cat] : 'rgba(0,0,0,.25)', COL[cat], 1.5);
    txt(CAT_LABEL[cat].replace(' & SPLIT', ''), 70, y + 13.5, 12, on ? '#06201a' : COL[cat], 'center', 900);
    S.buttons.push({x: 14, y, w: 112, h: 26, fn: () => { S.palCat = cat; }});
  });
  const bx = 1094, bw = 56, by = PAL_Y - 2, bh = 62;
  bigButton(bx, by, bw, bh, '↻', 'rotate', false, () => { if (S.pal) S.placeDir = rotCW(S.placeDir); else if (S.lastTap) rotateAt(S.lastTap); });
  bigButton(bx + 60, by, bw, bh, '✕', 'erase', opts.erase, () => setErase(!opts.erase));
  bigButton(bx + 120, by, bw, bh, '🛡', 'parry', false, () => raiseParry());
  bigButton(bx, by + 68, bw, bh, '✋', 'drop', false, () => { S.pal = null; setErase(false); });
  bigButton(bx + 60, by + 68, bw, bh, '☰', 'tools', S.toolsOpen, () => { S.toolsOpen = true; });
  bigButton(bx + 120, by + 68, bw, bh, S.paused ? '▶' : '❚❚', S.paused ? 'play' : 'pause', S.paused, () => { S.paused = !S.paused; });
}
// Choose what you are building against: each foe wants a different factory.
const FOE_ART = {colossus: '#9a6a48', swarm: '#b0845c', shell: '#5d6e75', lock: '#6b767d', dummy: '#7a6a4a'};
function drawPicker() {
  if (!S.picker) return;
  S.menuButtons = [];
  ctx.fillStyle = 'rgba(4,14,18,.82)'; ctx.fillRect(0, 0, W, H);
  txt('CHOOSE YOUR FOE', W / 2, PHONE ? 40 : 70, PHONE ? 30 : 34, COL.gold, 'center', 900, 6);
  txt('Each one needs a different factory. You get a build phase first.', W / 2, PHONE ? 72 : 104, 15, '#e9fbff', 'center', 600, 4);
  const ids = ['colossus', 'swarm', 'shell', 'lock', 'dummy'], gap = 14, cw = (W - 80 - gap * (ids.length - 1)) / ids.length, ch = PHONE ? 440 : 470, cy = PHONE ? 100 : 136;
  ids.forEach((id, i) => {
    const d = FOES[id], cx = 40 + i * (cw + gap);
    const hov = !PHONE && mouse.x >= cx && mouse.x <= cx + cw && mouse.y >= cy && mouse.y <= cy + ch;
    rr(cx, cy, cw, ch, 16, hov ? '#173f4f' : '#0f2d38', id === S.enc ? COL.gold : 'rgba(255,255,255,.2)', id === S.enc ? 3 : 2);
    rr(cx + 14, cy + 14, cw - 28, 120, 12, FOE_ART[id]);
    // a tiny portrait
    ctx.save(); ctx.translate(cx + cw / 2, cy + 74);
    if (id === 'swarm') { circle(10, -6, 34, '#9a6a48'); for (let k = 0; k < 5; k++) circle(-50 + k * 18, 34, 7, '#6b4a30'); circle(-32, -8, 14, '#6b4a30'); circle(-36, -10, 3, '#ff4a3a'); }
    else if (id === 'shell') { ctx.beginPath(); ctx.ellipse(0, 20, 70, 50, 0, Math.PI, 0); ctx.fillStyle = '#3d4c52'; ctx.fill(); txt('8', 0, -4, 30, 'rgba(255,255,255,.6)', 'center', 900); }
    else if (id === 'lock') { rr(-44, -40, 88, 80, 10, '#3d4649', COL.gold, 3); drawDie(0, 0, {v: 4, show: 4}, 0, 1, 0, 44); }
    else if (id === 'dummy') { rr(-4, -10, 8, 60, 3, '#6b5236'); circle(0, -12, 30, '#d8c79a'); circle(0, -12, 20, '#e2533d'); circle(0, -12, 11, '#d8c79a'); circle(0, -12, 4, '#e2533d'); }
    else { rr(-40, -44, 80, 80, 14, '#7a5236'); circle(-12, -16, 14, '#2a1d14'); circle(-14, -16, 9, COL.gold); }
    ctx.restore();
    txt(d.tag, cx + 18, cy + 156, 12, COL.gold, 'left', 900);
    txt(d.name, cx + 18, cy + 180, 21, '#fff', 'left', 900);
    wrapText(d.desc, cx + 18, cy + 212, cw - 36, 15, '#e9fbff');
    txt('BUILD FOR', cx + 18, cy + 300, 12, '#7fe0c6', 'left', 900);
    wrapText(d.counters, cx + 18, cy + 324, cw - 36, 14, '#bfe8dc');
    txt(`${d.phases.length} phases · ${d.hp} HP`, cx + 18, cy + ch - 22, 12.5, 'rgba(255,255,255,.55)', 'left', 700);
    S.menuButtons.push({x: cx, y: cy, w: cw, h: ch, fn: () => chooseFoe(id)});
  });
}

function drawToolsMenu() {
  if (!S.toolsOpen) return;
  S.menuButtons = [];
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
  const items = toolbarItems(), cols = 3, w = 220, h = 54, gap = 10;
  const rows = Math.ceil(items.length / cols), pw = cols * w + (cols - 1) * gap + 40, ph = rows * h + (rows - 1) * gap + 84;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  rr(px, py, pw, ph, 16, 'rgba(6,18,22,.97)', COL.gold, 2);
  txt('Sandbox tools', px + 20, py + 26, 18, COL.gold, 'left', 900);
  txt('tap outside to close', px + pw - 20, py + 26, 12, 'rgba(255,255,255,.5)', 'right', 600);
  items.forEach((it, i) => {
    const x = px + 20 + (i % cols) * (w + gap), y = py + 52 + Math.floor(i / cols) * (h + gap);
    rr(x, y, w, h, 10, it.on ? '#2fae92' : '#16394a', it.on ? '#7fe0c6' : 'rgba(255,255,255,.2)', 1.5);
    txt(it.label, x + w / 2, y + h / 2 + 1, 17, it.on ? '#06201a' : '#fff', 'center', 800);
    S.menuButtons.push({x, y, w, h, fn: () => { it.fn(); if (!it.toggle) S.toolsOpen = false; }});
  });
}

// Where each palette tile sits. Desktop: every category, a row each.
// Phone: tabs pick a category and its parts fill two rows of big tiles.
function paletteTiles() {
  const out = [];
  if (!PHONE) {
    CATS.forEach((cat, r) => PALETTE[cat].forEach((k, i) => out.push({k, cat, x: PAL_X + i * (PAL_W + PAL_GAP), y: PAL_Y + r * PAL_ROW})));
  } else {
    const cat = S.palCat || 'route';
    PALETTE[cat].forEach((k, i) => out.push({k, cat, x: PAL_X + (i % 7) * (PAL_W + PAL_GAP), y: PAL_Y + Math.floor(i / 7) * PAL_ROW}));
  }
  return out;
}

function drawPalette() {
  rr(8, PAL_Y - 8, W - 16, H - PAL_Y + 4, 12, 'rgba(0,0,0,.2)');
  let hover = null;
  if (PHONE) drawPhoneControls();
  else CATS.forEach((cat, r) => txt(CAT_LABEL[cat], 28, PAL_Y + r * PAL_ROW + PAL_H / 2, 11, COL[cat], 'left', 800));
  const iconS = PAL_H / 72, nameSize = PHONE ? 14 : 10.5, badge = PHONE ? 1.35 : 1;
  for (const {k, cat, x, y} of paletteTiles()) {
    const sel = S.pal === k;
    const hov = !PHONE && mouse.x >= x && mouse.x <= x + PAL_W && mouse.y >= y && mouse.y <= y + PAL_H;
    if (hov) hover = {k, x, y};
    const cc = KINDS[k].pool ? COMPANIES[KINDS[k].pool].col : COL[cat];
    rr(x, y, PAL_W, PAL_H, 7, sel ? '#fff6d8' : (hov ? '#ffffff' : COL.card), sel ? COL.gold : cc, sel ? 3 : (KINDS[k].pool ? 2.5 : 1.5));
    ctx.save(); ctx.translate(x + PAL_H / 2 - 1, y + PAL_H / 2); ctx.scale(iconS, iconS);
    rr(-28, -28, 56, 56, 9, TINT[cat]);
    drawIcon(dummyMachine(k));
    ctx.restore();
    const name = KINDS[k].short, nx0 = x + PAL_H + 1;
    ctx.font = `700 ${nameSize}px system-ui,sans-serif`;
    if (ctx.measureText(name).width > PAL_W - PAL_H - 4) {
      const parts = name.split(/[\s-]/);
      txt(parts[0], nx0, y + PAL_H * .36, nameSize - .5, COL.ink, 'left', 700);
      txt(parts.slice(1).join(' '), nx0, y + PAL_H * .64, nameSize - .5, COL.ink, 'left', 700);
    } else txt(name, nx0, y + PAL_H / 2 + 1, nameSize, COL.ink, 'left', 700);
    // gold star: answers the current phase; hollow star: answers the next one
    const ph = PHASES[S.foe.phase], nxp = PHASES[S.foe.phase + 1];
    const sx = x + PAL_W - 8 * badge, sy = y + 8 * badge;
    if (ph.good.includes(k)) { circle(sx, sy, (7 + Math.sin(S.t * 5) * .8) * badge, COL.gold); txt('★', sx, sy + .5, 10 * badge, '#7a5404', 'center', 900); }
    else if (nxp && nxp.good.includes(k)) ringStroke(sx, sy, 6 * badge, COL.gold, 1.5);
    const ri_ = S.recent.indexOf(k);
    if (ri_ >= 0 && !PHONE) { rr(x + 2, y + 2, 13, 13, 3, '#2b373c'); txt(String(ri_ + 1), x + 8.5, y + 9, 9.5, '#fff', 'center', 800); }
    // cost; dimmed when you can't afford it
    const cost = COST[k] || 0, ok = canAfford(k);
    if (!opts.free) {
      const bw = 24 * badge, bh = 13 * badge;
      rr(x + PAL_W - bw - 2, y + PAL_H - bh - 2, bw, bh, bh / 2, ok ? '#f0b429' : '#5a4a46');
      txt(`${cost}⚙`, x + PAL_W - bw / 2 - 2, y + PAL_H - bh / 2 - 1.5, 9.5 * badge, ok ? '#2a1a00' : '#c9b8b4', 'center', 900);
    }
    if (KINDS[k].pool) stamp(KINDS[k].pool, x + PAL_W - (PHONE ? 52 : 36), y + PAL_H - (PHONE ? 13 : 9), PHONE ? 9 : 6.5);
    if (!ok) rr(x, y, PAL_W, PAL_H, 7, 'rgba(10,25,30,.45)');
  }
  if (!PHONE) txt('★ helps this phase    ○ helps next phase    1-5 picks a recent part', W - 30, PAL_Y + 3 * PAL_ROW + PAL_H / 2, 11.5, 'rgba(255,255,255,.5)', 'right', 600);
  // the companies, with their stamps, along the end of their row
  if (!PHONE) {
    let lx = PAL_X + PALETTE.pool.length * (PAL_W + PAL_GAP) + 12;
    const ly = PAL_Y + 4 * PAL_ROW + PAL_H / 2;
    for (const co of Object.keys(COMPANIES)) {
      stamp(co, lx + 8, ly, 7);
      txt(COMPANIES[co].short, lx + 20, ly + 1, 11, COMPANIES[co].col === '#2f5f9e' ? '#8cb4ef' : COMPANIES[co].col, 'left', 800);
      lx += 36 + ctx.measureText(COMPANIES[co].short).width;
    }
  }
  // keep the picked part's description up for a moment (phones have no hover)
  if (!hover && S.pal && (!PHONE || S.t - (S.palPickT || 0) < 2.5)) {
    const tile = paletteTiles().find(t => t.k === S.pal);
    if (tile) hover = {k: S.pal, x: tile.x, y: tile.y};
  }
  if (PHONE && hover) hover.y = PAL_Y;            // above the palette, not over a tile row
  if (hover) {
    const info = KINDS[hover.k], co = info.pool ? COMPANIES[info.pool] : null;
    const w = 320, h = co ? 74 : 56, x = clamp(hover.x - 20, 16, W - w - 16), y = hover.y - h - 8;
    rr(x, y, w, h, 8, 'rgba(4,18,22,.96)', co ? co.col : COL[info.cat], 2);
    txt(info.name, x + 10, y + 16, 13.5, '#fff', 'left', 800);
    if (!opts.free) txt(`${COST[hover.k] || 0} ⚙`, x + w - 10, y + 16, 13, COL.gold, 'right', 900);
    let ty = y + 34;
    if (co) {
      stamp(info.pool, x + 17, ty, 7);
      txt(`${co.name} · “${co.motto}”`, x + 30, ty + 1, 11.5, '#f0e2b8', 'left', 700);
      ty += 18;
    }
    wrapText(info.text, x + 10, ty, w - 20, 11.5, 'rgba(255,255,255,.8)');
  }
}

function wrapText(s, x, y, w, size, col) {
  ctx.font = `500 ${size}px system-ui,sans-serif`;
  const words = s.split(' '); let ln = '', ly = y;
  ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const wd of words) { const t = ln ? ln + ' ' + wd : wd; if (ctx.measureText(t).width > w) { ctx.fillText(ln, x, ly); ln = wd; ly += size + 3; } else ln = t; }
  if (ln) ctx.fillText(ln, x, ly);
}

const dummies = {};
function dummyMachine(kind) {
  if (!dummies[kind]) dummies[kind] = {kind, dir: R, cell: {x: 0, y: 0}, mode: 0, lever: 0, load: [], busy: 0, launch: 0, work: 0, fire: 0, wind: 0,
    ang: 0, spin: 0, outQ: [], mag: [], hopper: [], fuel: 0, charges: 0, alt: 0, held: null, reel: 0, pop: 1};
  return dummies[kind];
}

function drawHover() {
  const c = mouse.cell;
  if (!inGrid(c) || S.over) return;
  const ce = center(c);
  if (S.pal) {
    const g = {...dummyMachine(S.pal), dir: S.placeDir, ang: Math.atan2(S.placeDir.y, S.placeDir.x)};
    drawMachine(g, ce.x, ce.y, true);
    rr(ce.x - 32, ce.y - 32, 64, 64, 11, null, 'rgba(255,255,150,.9)', 3);
  } else {
    rr(ce.x - 30, ce.y - 30, 60, 60, 9, null, 'rgba(255,255,255,.45)', 2);
    const m = machineAt(c);
    if (m) {
      const info = KINDS[m.kind], co = info.pool ? COMPANIES[info.pool] : null;
      let tx = ce.x + 38; if (tx + 240 > WALL_X0) tx = ce.x - 278;
      rr(tx, ce.y - 36, 240, 70, 8, 'rgba(4,18,22,.94)', co ? co.col : COL[info.cat], 2);
      txt(info.name, tx + 10, ce.y - 20, 13.5, '#fff', 'left', 800);
      if (co) txt(co.short, tx + 230, ce.y - 20, 11.5, '#f0e2b8', 'right', 800);
      wrapText(info.text, tx + 10, ce.y, 220, 11, 'rgba(255,255,255,.75)');
    }
  }
}

function drawOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-20, -20, W + 40, H + 40);
  const won = S.over === 'won', p = 1 + .03 * Math.sin(S.t * 3);
  ctx.save(); ctx.translate(W / 2, 290); ctx.scale(p, p);
  txt(won ? 'THE COLOSSUS FALLS' : 'YOUR FACTORY IS SCRAP', 0, 0, 48, won ? COL.gold : '#ff7a6a', 'center', 900, 8);
  ctx.restore();
  txt(`Dice thrown ${S.stats.thrown} · damage ${Math.round(S.stats.dmg)} · dice lost ${S.stats.lost + S.stats.spilled} · time ${Math.round(S.t)}s`, W / 2, 346, 17, '#fff', 'center', 600);
  txt('Click or press R to pick a foe (your factory stays)', W / 2, 382, 15, 'rgba(255,255,255,.7)', 'center', 600);
}

function draw() {
  ctx.save();
  if (S.shake > 0) ctx.translate(rnd(-1, 1) * S.shake * S.shake * 12, rnd(-1, 1) * S.shake * S.shake * 12);
  ctx.fillStyle = COL.bg; ctx.fillRect(-30, -30, W + 60, H + 60);
  drawFloor();
  drawField();
  for (const [k, d] of S.belts) drawBelt(k, d);
  drawPiles();
  for (const m of S.machines.values()) { const ce = center(m.cell); drawMachine(m, ce.x, ce.y, false); drawMachineLevel(m, ce.x, ce.y); }
  drawHover();
  drawTelegraph();
  drawMines();
  drawWall();
  drawFoe();
  drawUnits();
  drawLensBeams();
  const locks = PHASES[S.foe.phase].locks ? S.foe.locks : null;
  for (const d of S.dice) {
    let s, y = d.y;
    if (d.state === 'fall') { s = 1 - d.fall / .5; y = d.y + 40 * d.fall * d.fall; }
    else s = (d.state === 'proc' ? .82 : 1) * (1 + .45 * d.pop * d.pop);
    // against the Lockbox, dice showing a lock face glow green
    if (locks && d.state !== 'fall' && locks.includes(d.v)) circle(d.x, y, 17 + Math.sin(S.t * 8) * 1.5, 'rgba(120,230,120,.45)');
    drawDie(d.x, y, d, d.rot + (d.state === 'fall' ? d.fall * 9 : 0), s, d.state === 'stop' && d.wait > JAM_TIME ? 1 : 0);
  }
  drawRubbleAndJams();
  drawFlyers();
  drawProj();
  drawDebris();
  drawParticles();
  drawTexts();
  ctx.restore();
  drawHud();
  drawBuildUI();
  drawTurnUI();
  drawPalette();
  drawBanner();
  drawToolsMenu();
  drawPicker();
  if (S.over) drawOverlay();
}

// ============================================================ loop
newGame('blank');
// ?layout=... (from sim/climb.mjs) puts that factory on the floor; ?foe=... skips the picker
if (QS.has('layout')) { applyLayout(QS.get('layout')); opts.free = true; }
if (QS.has('foe') && FOES[QS.get('foe')]) chooseFoe(QS.get('foe'));
if (PHONE) S.paused = true;          // waits behind "Tap to play"
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  update(dt, !!S.pal && (PHONE || inGrid(mouse.cell)));
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ashcan = {get state() { return S; }, opts, newGame, update, draw, setSeed, placeMachine, setBelt, rollNow, raiseParry, KINDS, chooseFoe, FOES, startFight,
  step(seconds) { for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60); draw(); }};
