// Dice Factory · Rows: the view. Draws sim.js on a canvas as three habitat
// rows of card slots with a belt running through them, and the foe as an
// opponent card. Turns mouse, touch and keys into sim actions.
import {
  S, opts, W, H, ROWS, SLOTS, LANE_X0, LANE_X1, SLOT_W, SLOT_H, slotX, rowY, FOE_X, FOE_Y, MITE_Y,
  ROW_KINDS, COL_EXTRA, lerp, clamp, easeOut, easeOutBack, COL, TINT, CAT_LABEL, KINDS, COST, CATS, PALETTE,
  COMPANIES, MEGA, LV_XP, MAX_LVL, HOME_BONUS, fmtDmg, FOES, DUMMY_RULES, PHASES, newGame, chooseFoe, setDummyRule,
  curIntent, shellOpen, effArmor, cardAt, isBuried, cardsInRow, slotCost, homeMult, canAfford, placeCard,
  removeCard, moveCard, tapCard, flipDir, projPos, startRun, update, applyLayout, encodeLayout, layoutCost,
  setSeed, ri, routeRow, STARTER, idx, playFight,
} from './sim.js';

const QS = new URLSearchParams(location.search);
const PHONE = QS.has('phone') || (!QS.has('desktop') && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
if (PHONE) document.body.classList.add('phone');
if (QS.has('seed')) setSeed(+QS.get('seed'));

const BELT_DY = 30;                       // the belt runs along the bottom of each row of cards
const beltY = r => rowY(r) + BELT_DY;
const ICON_DY = -6;
const CARD_X = 952, CARD_Y = 58, CARD_W = 316, CARD_H = 356;     // the foe's card
const PAL_Y = 444, TAB_X = 12, TAB_W = 112, TAB_H = 34, TILE_X = 134, TILE_W = 104, TILE_H = 150, TILE_GAP = 8;
const RUN_X = 1150, RUN_Y = 444, RUN_W = 118, RUN_H = 112;
const INFO_Y = 418;

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let stageRotated = false;
function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (PHONE) {
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
if (PHONE) {
  const st = document.getElementById('start');
  st.classList.add('show');
  document.getElementById('start-btn').addEventListener('click', async () => {
    st.classList.remove('show');
    try { await document.documentElement.requestFullscreen({navigationUI: 'hide'}); } catch (_) { /* not allowed here */ }
    try { await screen.orientation.lock('landscape'); } catch (_) { /* not allowed here */ }
    setTimeout(fitCanvas, 250);
  });
}

// ============================================================ game start
newGame();
applyLayout(QS.get('layout') || (QS.has('blank') ? '' : STARTER));
if (QS.get('deal') === 'pick') opts.deal = 'pick';
if (QS.get('foe') && FOES[QS.get('foe')]) chooseFoe(QS.get('foe'));
const ui = {tab: 'weapon', pal: null, scrap: false, toolsOpen: false, hover: null, info: null};

// ============================================================ drawing helpers
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
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = 'rgba(20,14,8,.9)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function fitTxt(s, x, y, size, maxW, col, align = 'center', weight = 800) {
  ctx.font = `${weight} ${size}px system-ui,sans-serif`;
  while (size > 8 && ctx.measureText(s).width > maxW) { size -= 1; ctx.font = `${weight} ${size}px system-ui,sans-serif`; }
  txt(s, x, y, size, col, align, weight);
}
function wrapText(s, x, y, w, size, col, lh = 1.3, weight = 600, maxLines = 9) {
  ctx.font = `${weight} ${size}px system-ui,sans-serif`;
  const words = String(s).split(' '); let ln = '', yy = y, n = 0;
  for (const wd of words) {
    const t = ln ? ln + ' ' + wd : wd;
    if (ctx.measureText(t).width > w && ln) { txt(ln, x, yy, size, col, 'left', weight); yy += size * lh; ln = wd; if (++n >= maxLines) return yy; }
    else ln = t;
  }
  if (ln) { txt(ln, x, yy, size, col, 'left', weight); yy += size * lh; }
  return yy;
}
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = s => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
function stamp(co, x, y, r = 9) {
  const c = COMPANIES[co];
  circle(x, y, r + 1.5, 'rgba(0,0,0,.35)'); circle(x, y, r, c.col);
  ringStroke(x, y, r - 2, c.ink, 1); txt(c.mark, x, y + .5, r * 1.15, c.ink, 'center', 900);
}
const PIPS = {1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]};
function drawDie(x, y, d, rot = 0, s = 1, size = 22, glow = null) {
  if (s <= .01) return;
  const v = d.show ?? d.v, mega = d.v >= MEGA;
  size += d.v > 6 ? Math.min(mega ? 14 : 7, (d.v - 6) * 1.1) : 0;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  const h = size / 2;
  if (glow) circle(0, 0, h + 7, glow);
  if (mega) circle(0, 0, h + 8 + Math.sin(S.t * 8) * 2, 'rgba(255,210,94,.3)');
  if (d.hot) circle(0, 0, h + 6 + Math.sin(S.t * 20) * 1.2, 'rgba(255,120,50,.28)');
  if (d.ice) circle(0, 0, h + 5, 'rgba(180,230,255,.3)');
  if (d.venom) circle(0, 0, h + 5 + Math.sin(S.t * 6) * 1.2, 'rgba(122,201,67,.35)');
  if (d.spiky) for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; tri(Math.cos(a) * (h + 6), Math.sin(a) * (h + 6), Math.cos(a - .3) * h, Math.sin(a - .3) * h, Math.cos(a + .3) * h, Math.sin(a + .3) * h, '#4a4f54'); }
  rr(-h + 1, -h + 3, size, size, 5, 'rgba(0,0,0,.35)');
  const face = mega ? '#ffe07a' : (d.hot ? COL.hot : (d.ice ? COL.ice : (d.venom ? '#d7f2b8' : '#fff')));
  rr(-h, -h, size, size, 5, face, mega ? '#7a5404' : COL.ink, mega ? 2.6 : 1.8);
  if (PIPS[v]) for (const [px, py] of PIPS[v]) circle(px * size * .26, py * size * .26, size * .1, COL.ink);
  else txt(String(v), 0, 1, size * .6, mega ? '#5a3a00' : COL.ink, 'center', 900);
  if (mega) {
    ctx.beginPath(); ctx.moveTo(-h * .6, -h - 1); ctx.lineTo(-h * .6, -h - 9); ctx.lineTo(-h * .3, -h - 4); ctx.lineTo(0, -h - 11); ctx.lineTo(h * .3, -h - 4); ctx.lineTo(h * .6, -h - 9); ctx.lineTo(h * .6, -h - 1); ctx.closePath();
    ctx.fillStyle = COL.gold; ctx.fill(); ctx.strokeStyle = '#7a5404'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
}
function miniDie(x, y, v, s = 10, fill = '#fff') {
  rr(x - s / 2, y - s / 2, s, s, 2, fill, COL.ink, 1);
  if (PIPS[v]) for (const [px, py] of PIPS[v]) circle(x + px * s * .26, y + py * s * .26, s * .09, COL.ink);
}

// ============================================================ card art (shared with the ashcan sandbox)
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

// icons the rows version draws its own way
function drawCardIcon(m) {
  const b = m.work > 0 ? Math.sin((1 - m.work) * Math.PI) : 0;
  if (m.kind === 'switch') {
    const on = m.mode === 1, up = m.dir === 'U';
    line(-18, 0, 0, 0, '#2b373c', 5); circle(0, 0, 5, '#2b373c');
    const a = on ? (up ? -.9 : .9) : 0;
    ctx.save(); ctx.rotate(a); line(0, 0, 14, 0, COL.gold, 6); tri(22, 0, 12, -8, 12, 8, COL.gold); ctx.restore();
    return;
  }
  if (m.kind === 'trisplit') {
    tri(-14, 0, 4, -14, 4, 14, '#bfe8dd');
    ringStroke(-4, 0, 5, '#1b6b59', 2);
    for (const [yy, c] of [[-14, COL.weapon], [0, COL.pool], [14, COL.defense]]) { line(4, yy * .5, 20, yy, c, 3); circle(22, yy, 3 + b, c); }
    return;
  }
  drawIcon(m);
}

// ============================================================ layout of things
const slotRect = (r, c) => ({x: slotX(c) - SLOT_W / 2, y: rowY(r) - SLOT_H / 2, w: SLOT_W, h: SLOT_H});
function slotAt(p) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < SLOTS; c++) {
    const q = slotRect(r, c);
    if (p.x >= q.x - 6 && p.x <= q.x + q.w + 6 && p.y >= q.y && p.y <= q.y + q.h) return {r, c};
  }
  return null;
}
const HEAD_X = 10, HEAD_W = 112;
function headerAt(p) {
  for (let r = 0; r < ROWS; r++) if (p.x >= HEAD_X && p.x <= HEAD_X + HEAD_W + 30 && Math.abs(p.y - rowY(r)) <= SLOT_H / 2) return r;
  return -1;
}
function paletteTiles() {
  const list = PALETTE[ui.tab] || [];
  return list.map((k, i) => ({k, x: TILE_X + i * (TILE_W + TILE_GAP), y: PAL_Y, w: TILE_W, h: TILE_H}));
}
const inBox = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

// ============================================================ the board
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a2119'); g.addColorStop(1, '#1b1611');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // the table's felt
  rr(4, 54, 940, 362, 16, '#30271e', 'rgba(255,240,210,.06)', 2);
}

function drawRow(r) {
  const rk = ROW_KINDS[S.rows[r]], y = rowY(r), n = cardsInRow(r), boost = 1 + .1 * n;
  // the habitat band
  const top = y - SLOT_H / 2 - 4;
  rr(HEAD_X, top, LANE_X1 + 72 - HEAD_X, SLOT_H + 8, 12, rk.tint);
  // header: the habitat's name, its end action, and the dice waiting to come in
  const pick = opts.deal === 'pick' && S.pickRow === r;
  rr(HEAD_X, top, HEAD_W, SLOT_H + 8, 12, mix(rk.col, '#1b1611', .45), pick ? '#ffffff' : null, 3);
  rr(HEAD_X, top, 8, SLOT_H + 8, [12, 0, 0, 12], rk.col);
  txt(rk.name.toUpperCase(), HEAD_X + 18, top + 16, 14, '#fff6e6', 'left', 900);
  txt(`end: ${rk.end}`, HEAD_X + 18, top + 34, 11, 'rgba(255,240,220,.75)', 'left', 700);
  if (opts.deal === 'pick') txt(pick ? '▶ dice go here' : 'tap to pour', HEAD_X + 18, top + 50, 10, pick ? COL.gold : 'rgba(255,240,220,.5)', 'left', 800);
  // the roll, waiting at the row's mouth (planning) or queued (running)
  const waiting = S.tphase === 'plan' ? previewFor(r) : S.queue[r];
  waiting.slice(0, 8).forEach((v, i) => drawDie(HEAD_X + 28 + (i % 4) * 22, top + 76 + Math.floor(i / 4) * 22, {v}, 0, 1, 17));
  if (waiting.length > 8) txt(`+${waiting.length - 8}`, HEAD_X + 104, top + 98, 11, '#fff', 'center', 800);
  // the belt through every slot
  const by = beltY(r);
  rr(LANE_X0 - 8, by - 12, LANE_X1 - LANE_X0 + 16, 24, 8, '#1c1712');
  ctx.save(); ctx.beginPath(); ctx.roundRect(LANE_X0 - 8, by - 12, LANE_X1 - LANE_X0 + 16, 24, 8); ctx.clip();
  const off = (S.tphase === 'run' ? S.t * 40 : 0) % 16;
  ctx.strokeStyle = 'rgba(255,240,210,.08)'; ctx.lineWidth = 2;
  for (let x = LANE_X0 - 16 + off; x < LANE_X1 + 16; x += 16) { ctx.beginPath(); ctx.moveTo(x, by - 12); ctx.lineTo(x + 8, by); ctx.lineTo(x, by + 12); ctx.stroke(); }
  ctx.restore();
  // the row's end: what leftovers turn into
  const ex = LANE_X1 + 8;
  rr(ex - 4, top + 6, 58, SLOT_H - 4, 10, mix(rk.col, '#1b1611', .3), 'rgba(255,255,255,.15)', 1.5);
  const icon = {armory: '✹', exchange: '⚙', masonry: '▦'}[S.rows[r]];
  txt(icon, ex + 25, y - 18, 24, '#fff6e6', 'center', 900);
  txt(rk.end.toUpperCase(), ex + 25, y + 6, 10, '#fff6e6', 'center', 900);
  txt(`+${Math.round((boost - 1) * 100)}%`, ex + 25, y + 22, 11, n ? COL.gold : 'rgba(255,255,255,.4)', 'center', 800);
  txt(`${n} card${n === 1 ? '' : 's'}`, ex + 25, y + 36, 9, 'rgba(255,240,220,.6)', 'center', 700);
}
function previewFor(r) {
  if (!S.roll) return [];
  if (opts.deal === 'pick') return S.pickRow === r ? S.roll : [];
  return S.roll.filter((_, i) => i % ROWS === r);
}

function drawSlot(r, c) {
  const q = slotRect(r, c), card = cardAt(r, c), rk = ROW_KINDS[S.rows[r]];
  const hov = ui.hover && ui.hover.r === r && ui.hover.c === c;
  if (!card) {
    ctx.setLineDash([6, 5]);
    rr(q.x, q.y, q.w, q.h, 10, 'rgba(0,0,0,.18)', hov && ui.pal ? '#ffffff' : 'rgba(255,240,210,.18)', 2);
    ctx.setLineDash([]);
    // the slot's extra cost (further right costs more)
    if (COL_EXTRA[c]) txt(`+${COL_EXTRA[c]}⚙`, q.x + q.w / 2, q.y + 18, 11, 'rgba(255,240,210,.35)', 'center', 800);
    if (ui.pal && hov) {
      const cost = slotCost(ui.pal, c), ok = canAfford(ui.pal, c);
      ctx.globalAlpha = .55; drawCardFace(card || {kind: ui.pal, dir: 'D', mode: ui.pal === 'switch' ? 1 : 0, work: 0, fire: 0, lvl: 1, xp: 0, load: [], mag: [], stack: [], lever: 0}, r, c, true); ctx.globalAlpha = 1;
      txt(`${cost}⚙`, q.x + q.w / 2, q.y - 10, 13, ok ? COL.gold : COL.drop, 'center', 900, 3);
    }
  } else drawCardFace(card, r, c, false);
  if (isBuried(r, c)) {
    rr(q.x - 2, q.y - 2, q.w + 4, q.h + 4, 10, 'rgba(70,50,35,.92)');
    for (let i = 0; i < 9; i++) circle(q.x + 14 + (i * 37) % (q.w - 20), q.y + 18 + (i * 23) % (q.h - 30), 6 + (i % 3) * 3, i % 2 ? '#6b5236' : '#5a4630');
    txt('BURIED', q.x + q.w / 2, q.y + q.h / 2 - 6, 13, '#ffd9b0', 'center', 900, 3);
    txt(`${S.buried.get(idx(r, c))} turn${S.buried.get(idx(r, c)) === 1 ? '' : 's'}`, q.x + q.w / 2, q.y + q.h / 2 + 12, 11, '#ffd9b0', 'center', 800, 3);
  }
  void rk;
}

function drawCardFace(card, r, c, ghost) {
  const q = slotRect(r, c), info = KINDS[card.kind], cat = info.cat;
  const pop = ghost ? 1 : easeOutBack(card.pop ?? 1);
  const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy);
  const lift = card.work > 0 ? -2 * Math.sin((1 - card.work) * Math.PI) : 0;
  rr(q.x + 2, q.y + 4, q.w, q.h, 10, 'rgba(0,0,0,.4)');
  rr(q.x, q.y + lift, q.w, q.h, 10, COL.card, card.lvlFlash > 0 ? COL.gold : mix(COL[cat], '#2b2620', .35), card.lvlFlash > 0 ? 4 : 2.5);
  // the title strip in the card's colour
  rr(q.x + 4, q.y + 4 + lift, q.w - 8, 18, 6, COL[cat]);
  fitTxt(info.short, cx, q.y + 13 + lift, 11, q.w - 20, '#fff', 'center', 900);
  // art panel
  rr(q.x + 6, q.y + 26 + lift, q.w - 12, 44, 6, TINT[cat]);
  ctx.save(); ctx.translate(cx, q.y + 48 + lift); ctx.scale(.85, .85); drawCardIcon(card); ctx.restore();
  // home row: +25% when the card sits in the row it likes
  if (info.home) {
    const hk = ROW_KINDS[info.home], at = info.home === S.rows[r];
    circle(q.x + q.w - 12, q.y + 32 + lift, 6, hk.col);
    if (at) ringStroke(q.x + q.w - 12, q.y + 32 + lift, 8.5, COL.gold, 2);
  }
  if (info.pool) stamp(info.pool, q.x + 14, q.y + 34 + lift, 7);
  // routers: where a changed-row die goes
  if (info.role === 'route') {
    const to = routeRow(card, r), up = to < r, ax = q.x + q.w - 14, ay = up ? q.y + 4 : q.y + q.h - 4;
    if (card.kind !== 'trisplit') {
      rr(ax - 11, ay - 9, 22, 18, 6, '#1b6b59');
      if (up) tri(ax, ay - 6, ax - 7, ay + 5, ax + 7, ay + 5, '#fff'); else tri(ax, ay + 6, ax - 7, ay - 5, ax + 7, ay - 5, '#fff');
    }
    if (card.kind === 'sorter') txt(card.mode ? 'lo stays' : 'hi stays', cx - 6, q.y + q.h - 44 + lift, 9, '#1b6b59', 'center', 800);
    if (card.kind === 'switch') txt(card.mode ? 'all move' : 'all stay', cx - 6, q.y + q.h - 44 + lift, 9, '#1b6b59', 'center', 800);
  }
  // level stars and xp
  if (!ghost) {
    for (let i = 0; i < MAX_LVL; i++) txt('★', q.x + 10 + i * 10, q.y + q.h - 44 + lift, 9, i < card.lvl ? '#d19a06' : 'rgba(43,38,32,.18)', 'center', 900);
    if (card.lvl < MAX_LVL) {
      const a = LV_XP[card.lvl - 1], b = LV_XP[card.lvl];
      rr(q.x + 6, q.y + q.h - 36 + lift, q.w - 12, 3, 1.5, 'rgba(43,38,32,.15)');
      rr(q.x + 6, q.y + q.h - 36 + lift, (q.w - 12) * clamp((card.xp - a) / (b - a), 0, 1), 3, 1.5, '#d19a06');
    }
  }
  // the belt crossing the card's foot
  rr(q.x + 2, beltY(r) - 13 + lift, q.w - 4, 26, 6, 'rgba(43,38,32,.82)');
  // what a terminal holds
  const held = card.load && card.load.length ? card.load.length : (card.mag && card.mag.length ? card.mag.length : (card.stack && card.stack.length ? card.stack.length : 0));
  if (held && !ghost) txt(`${held}`, q.x + 12, beltY(r) + lift, 10, COL.gold, 'center', 900);
  if (card.kind === 'parry' && !ghost) txt(`${card.charges}/3`, q.x + q.w - 14, beltY(r) + lift, 10, COL.blk, 'center', 900);
  if (card.busy > 0 && info.role === 'term' && !ghost) rr(q.x + 6, q.y + q.h - 31 + lift, (q.w - 12) * clamp(card.busy / 1.4, 0, 1), 2, 1, 'rgba(226,83,61,.6)');
  ctx.restore();
}

function drawDice() {
  for (const d of S.dice) {
    const y = d.y + BELT_DY;
    const lk = PHASES[S.foe.phase].locks;
    const glow = lk && S.foe.locks.includes(d.v) ? 'rgba(120,230,120,.45)' : null;
    drawDie(d.x, y, d, d.rot, 1 + .3 * d.pop, 20, glow);
  }
}

// ============================================================ the foe's card
function drawFoeCard() {
  const f = S.foe, def = FOES[S.enc], ph = PHASES[f.phase];
  const lx = -f.lunge * 30 * Math.sin(f.lunge * Math.PI);
  const shk = f.hit > 0 ? (Math.random() - .5) * 6 : 0;
  ctx.save(); ctx.translate(lx + shk, 0);
  const x = CARD_X, y = CARD_Y;
  rr(x + 3, y + 5, CARD_W, CARD_H, 16, 'rgba(0,0,0,.45)');
  rr(x, y, CARD_W, CARD_H, 16, '#3a2c22', f.enraged ? '#e2533d' : '#a07c5a', 3);
  rr(x + 8, y + 8, CARD_W - 16, 26, 8, '#241a12');
  fitTxt(def.name.toUpperCase(), x + CARD_W / 2, y + 21, 15, CARD_W - 30, '#ffe7c4', 'center', 900);
  txt(`${def.tag} · PHASE ${f.phase + 1}/${S.enc === 'dummy' ? 1 : def.phases.length}: ${ph.name}`, x + CARD_W / 2, y + 44, 10, '#d9b892', 'center', 800);
  // hp
  const frac = S.enc === 'dummy' ? 1 : f.hp / f.max;
  rr(x + 14, y + 54, CARD_W - 28, 16, 8, 'rgba(0,0,0,.45)');
  rr(x + 14, y + 54, (CARD_W - 28) * frac, 16, 8, f.flash > 0 ? '#ffffff' : '#d94c35');
  // where the next phase starts
  for (const p of (S.enc === 'dummy' ? [] : def.phases.slice(1))) line(x + 14 + (CARD_W - 28) * p.at, y + 52, x + 14 + (CARD_W - 28) * p.at, y + 72, '#ffd25e', 2);
  txt(S.enc === 'dummy' ? `${fmtDmg(S.practice || 0)} damage dealt` : `${Math.ceil(f.hp)} / ${f.max}`, x + CARD_W / 2, y + 62, 11, '#fff', 'center', 900, 3);
  // portrait
  rr(x + 14, y + 78, CARD_W - 28, 150, 10, '#1f1812');
  ctx.save(); ctx.beginPath(); ctx.roundRect(x + 14, y + 78, CARD_W - 28, 150, 10); ctx.clip();
  drawPortrait(FOE_X, FOE_Y + 6);
  ctx.restore();
  // status badges along the portrait's foot
  const badges = [];
  const arm = effArmor();
  if (ph.armor) badges.push([shellOpen() ? 'OPEN ×1.5' : `⛨ ${arm}`, shellOpen() ? COL.gold : '#c9d6da']);
  if (f.poison >= 1) badges.push([`☠ ${Math.round(f.poison)}`, COL.venom]);
  if (f.burn > 0) badges.push([`🔥 ${f.burn}`, COL.ember]);
  if (f.bombs.length) badges.push([`💣 ${f.bombs.length}`, '#ffb0a0']);
  if (f.stun > 0) badges.push(['STUNNED', '#7fe0c6']);
  if (ph.meltdown) badges.push(['ice ×2 · fire ✕', COL.ice]);
  let bx = x + 20;
  for (const [t, c] of badges) {
    ctx.font = '900 11px system-ui,sans-serif'; const w = ctx.measureText(t).width + 14;
    rr(bx, y + 206, w, 18, 9, 'rgba(0,0,0,.65)', c, 1.5); txt(t, bx + w / 2, y + 215, 11, c, 'center', 900); bx += w + 5;
  }
  // locks
  if (ph.locks) {
    txt('LOCK', x + 24, y + 92, 10, '#8fe08f', 'left', 900);
    f.locks.forEach((v, i) => { rr(x + 20 + i * 30, y + 100, 26, 26, 5, '#d7f7d0', '#2f8f3a', 2.5); miniDie(x + 33 + i * 30, y + 113, v, 18, '#d7f7d0'); });
    txt('next', x + CARD_W - 60, y + 92, 9, '#c9d6da', 'left', 800);
    f.nextLocks.forEach((v, i) => miniDie(x + CARD_W - 50 + i * 16, y + 110, v, 13, '#e8e8e8'));
  }
  // the intent
  drawIntent(x + 14, y + 234, CARD_W - 28);
  // mites
  rr(x + 14, y + 278, CARD_W - 28, 68, 10, 'rgba(0,0,0,.3)');
  if (!S.mites.length) txt(S.enc === 'swarm' || f.phase === 1 ? 'no mites... yet' : '', x + CARD_W / 2, y + 312, 11, 'rgba(255,240,220,.35)', 'center', 700);
  ctx.restore();
  for (const m of S.mites) drawMite(m);
  if (S.mites.length > 16) txt(`+${S.mites.length - 16}`, x + CARD_W - 26, MITE_Y + 26, 11, '#ffb0a0', 'center', 900);
}

function drawIntent(x, y, w) {
  const f = S.foe, it = curIntent();
  if (it.type === 'none') { rr(x, y, w, 38, 10, 'rgba(0,0,0,.3)'); txt('never fights back', x + w / 2, y + 19, 12, 'rgba(255,240,220,.6)', 'center', 800); return; }
  const now = f.count <= 1 && f.stun <= 0;
  const pulse = now ? .5 + .5 * Math.sin(S.t * 8) : 0;
  rr(x, y, w, 38, 10, now ? mix('#5a1d14', '#a0301e', pulse) : '#2a1f17', now ? '#ff8a73' : '#7a5a40', 2);
  const icon = {slam: '✊', rocks: '☄', brood: '🕷', bury: '⛏'}[it.type];
  txt(icon, x + 22, y + 19, 20, '#fff', 'center', 900);
  let what = it.label;
  if (it.type === 'slam') what += ` ${it.dmg}`;
  if (it.type === 'rocks') what += ` ${it.dmg} × ${it.n}`;
  if (it.type === 'brood') what += ` × ${it.n}`;
  if (it.type === 'bury') what += ` ${it.n} slots`;
  txt(what, x + 42, y + 19, 16, '#fff', 'left', 900);
  const lbl = f.stun > 0 ? 'stunned' : (f.count <= 1 ? 'NEXT TURN' : `in ${f.count} turns`);
  txt(lbl, x + w - 10, y + 19, 12, now ? '#ffe0d8' : '#d9b892', 'right', 900);
  // the incoming hit against your block
  if ((it.type === 'slam' || it.type === 'rocks') && now) {
    const dmg = it.type === 'slam' ? it.dmg : it.dmg * it.n;
    const parry = it.type === 'slam' && S.slots.some(cd => cd && cd.kind === 'parry' && cd.charges >= 3);
    txt(parry ? 'PARRY READY' : `after block: ${Math.max(0, dmg - S.block)}`, x + w / 2, y + 48, 10, parry ? '#7fe0c6' : (dmg > S.block ? '#ffb0a0' : COL.blk), 'center', 900, 3);
  }
}

function drawMite(m) {
  const i = S.mites.indexOf(m);
  if (i >= 16) return;
  const y = MITE_Y + (i >= 8 ? 14 : -8), s = m.big ? 1.4 : 1, x = m.x + (m.hit > 0 ? (Math.random() - .5) * 4 : 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  for (let k = 0; k < 3; k++) { line(-8, 2 + k * 3, -13, 6 + k * 3 + Math.sin(S.t * 14 + k + m.id) * 2, '#3a2a1e', 1.6); line(8, 2 + k * 3, 13, 6 + k * 3 + Math.sin(S.t * 14 + k + m.id + 1) * 2, '#3a2a1e', 1.6); }
  ctx.beginPath(); ctx.ellipse(0, 4, 10, 8, 0, 0, Math.PI * 2); ctx.fillStyle = m.hit > 0 ? '#ffffff' : (m.big ? '#8a4a3a' : '#b0845c'); ctx.fill();
  circle(-3, 1, 2, '#ff5a4a'); circle(3, 1, 2, '#ff5a4a');
  ctx.restore();
  rr(x - 11, y + 14 * s, 22, 3, 1.5, 'rgba(0,0,0,.5)'); rr(x - 11, y + 14 * s, 22 * clamp(m.hp / m.max, 0, 1), 3, 1.5, '#ff8a73');
}

function drawPortrait(x, y) {
  const f = S.foe, t = S.t;
  const tint = c => f.flash > 0 ? mix(c, '#ffffff', Math.min(.75, f.flash)) : c;
  const ph = PHASES[f.phase];
  if (S.enc === 'colossus') {
    const body = tint(f.enraged ? '#b0573c' : '#9a6a48'), dark = f.enraged ? '#5a2618' : '#4a3424';
    const bob = Math.sin(t * 2) * 2;
    rr(x - 70, y - 40 + bob, 140, 110, 30, body, dark, 4);
    rr(x - 108, y - 22 + bob, 34, 80, 14, body, dark, 3); rr(x + 74, y - 22 + bob, 34, 80, 14, body, dark, 3);
    circle(x - 91, y + 62 + bob, 18, dark); circle(x + 91, y + 62 + bob, 18, dark);
    rr(x - 44, y - 64 + bob, 88, 46, 16, body, dark, 4);
    circle(x - 16, y - 42 + bob, 12, '#2a1d14'); circle(x - 18, y - 42 + bob, 8 + Math.sin(t * 4), f.stun > 0 ? '#9aa4aa' : (f.enraged ? '#ff4a3a' : COL.gold));
    rr(x + 2, y - 50 + bob, 30, 10, 4, '#2a1d14');
    if (ph.armor) for (const [px, py] of [[-64, -30], [4, -30], [-64, 14], [4, 14]]) rr(x + px, y + py + bob, 60, 38, 6, '#6b767d', '#2b373c', 3);
    if (f.phase === 1) { rr(x + 10, y - 20 + bob, 46, 26, 8, '#2a1d14', '#c9a56a', 2); for (let i = 0; i < 3; i++) circle(x + 21 + i * 12, y - 7 + bob, 3, Math.sin(t * 6 + i) > 0 ? '#ff5a4a' : '#5a1d10'); }
    if (ph.meltdown) { ctx.strokeStyle = `rgba(255,${140 + 60 * Math.sin(t * 6)},40,.9)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 50, y - 30); ctx.lineTo(x - 30, y + 10); ctx.lineTo(x - 48, y + 40); ctx.moveTo(x + 30, y - 20); ctx.lineTo(x + 46, y + 20); ctx.lineTo(x + 30, y + 50); ctx.stroke(); }
  } else if (S.enc === 'swarm') {
    const pulse = Math.sin(t * 3) * 4;
    for (let i = 0; i < 6; i++) { const lx = x - 60 + i * 24; line(lx, y + 20, lx + (i < 3 ? -24 : 24), y + 70, '#4a3424', 5); }
    ctx.beginPath(); ctx.ellipse(x, y, 90 + pulse, 56 + pulse * .6, -.08, 0, Math.PI * 2); ctx.fillStyle = tint(f.enraged ? '#b0573c' : '#9a6a48'); ctx.fill();
    for (let i = 0; i < 7; i++) circle(x - 60 + i * 20, y - 10 + Math.sin(i * 2) * 18, 7 + Math.sin(t * 4 + i) * 2, 'rgba(255,210,160,.4)');
    circle(x - 70, y - 30, 10, '#2a1d14'); circle(x - 72, y - 30, 6, f.stun > 0 ? '#9aa4aa' : '#ff4a3a');
  } else if (S.enc === 'shell') {
    const open = shellOpen(), gap = open ? 14 + Math.sin(t * 6) * 3 : 0;
    if (open) { circle(x, y + 6, 40, '#c25a5a'); circle(x - 10, y, 8, '#ffe07a'); }
    ctx.beginPath(); ctx.ellipse(x, y - gap, 110, 60, 0, Math.PI, 0); ctx.fillStyle = tint('#5d6e75'); ctx.fill(); ctx.strokeStyle = '#2b373c'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y + 10 + gap, 110, 50, 0, 0, Math.PI); ctx.fillStyle = tint('#4c5a60'); ctx.fill(); ctx.stroke();
    for (let i = -3; i <= 3; i++) line(x + i * 28, y - gap - 4, x + i * 22, y - gap - 52 + Math.abs(i) * 6, 'rgba(0,0,0,.3)', 3);
    if (f.shred) txt(`−${f.shred} armor`, x, y + 56, 11, '#d8c79a', 'center', 900, 3);
  } else if (S.enc === 'lock') {
    rr(x - 80, y - 40, 160, 110, 14, tint('#6b767d'), '#2b373c', 4);
    ctx.beginPath(); ctx.arc(x, y - 40, 44, Math.PI, 0); ctx.strokeStyle = '#9aa4aa'; ctx.lineWidth = 14; ctx.stroke();
    circle(x, y + 12, 18, '#2b373c'); rr(x - 5, y + 14, 10, 30, 4, '#2b373c');
  } else {
    // the scrap dummy
    line(x, y + 70, x, y - 10, '#6b5236', 8);
    rr(x - 40, y - 50, 80, 70, 14, tint('#9a8460'), '#4a3a28', 3);
    circle(x, y - 70, 24, tint('#b09870')); ringStroke(x, y - 70, 24, '#4a3a28', 3);
    line(x - 9, y - 76, x - 3, y - 70, '#4a3a28', 3); line(x - 3, y - 76, x - 9, y - 70, '#4a3a28', 3);
    line(x + 3, y - 76, x + 9, y - 70, '#4a3a28', 3); line(x + 9, y - 76, x + 3, y - 70, '#4a3a28', 3);
    for (let i = 0; i < 3; i++) ringStroke(x, y - 15, 10 + i * 10, i % 2 ? '#ffffff' : '#e2533d', 4);
  }
}

// ============================================================ shots, particles, words
function drawProj() {
  for (const p of S.proj) {
    if (p.t < 0) continue;
    const q = projPos(p), d = p.dice || [];
    if (p.kind === 'pip') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.PI / 4); ctx.fillStyle = COL.pip; ctx.fillRect(-3, -3, 6, 6); ctx.restore(); continue; }
    if (p.kind === 'rocket') {
      const a = Math.atan2(p.y1 - p.y0, p.x1 - p.x0) - (1 - 2 * p.t / p.dur) * .9;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a);
      circle(-22, 0, 7 + Math.random() * 3, 'rgba(255,190,90,.8)');
      ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(10, -8); ctx.quadraticCurveTo(24, 0, 10, 8); ctx.lineTo(-16, 8); ctx.closePath(); ctx.fillStyle = '#e8e2d4'; ctx.fill();
      tri(-16, -8, -22, -14, -12, -8, COL.weapon); tri(-16, 8, -22, 14, -12, 8, COL.weapon);
      ctx.restore();
      txt(`×${d.length}`, q.x, q.y - 18, 11, COL.gold, 'center', 900, 3);
      continue;
    }
    if (p.kind === 'meteor') { circle(q.x, q.y, 16, '#5a3a2a'); circle(q.x - 10, q.y - 10, 9, 'rgba(255,160,60,.6)'); }
    const show = d.slice(0, 4);
    show.forEach((dd, i) => drawDie(q.x + (i - (show.length - 1) / 2) * 12, q.y + (i % 2) * 6, dd, p.rot, 1, p.kind === 'bullet' ? 14 : 18));
    if (p.kind === 'sand') for (let i = 0; i < 4; i++) circle(q.x - i * 6, q.y + Math.sin(i) * 4, 2, '#d8c79a');
  }
}
function drawParticles() {
  for (const p of S.parts) {
    const k = 1 - p.t / p.life;
    ctx.globalAlpha = clamp(k, 0, 1);
    if (p.shape === 3) ringStroke(p.x, p.y, lerp(p.size, p.end, 1 - k), p.col, 3);
    else if (p.shape === 1) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2); ctx.restore(); }
    else if (p.shape === 2) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); tri(0, -p.size * 1.6, -p.size, p.size, p.size, p.size, p.col); ctx.restore(); }
    else circle(p.x, p.y, p.size * k, p.col);
  }
  ctx.globalAlpha = 1;
}
function drawTexts() {
  for (const t of S.texts) {
    const k = t.t / t.life;
    ctx.globalAlpha = clamp(1.4 - k * 1.4, 0, 1);
    txt(t.txt, t.x, t.y - 30 * easeOut(k), t.size, t.col, 'center', 900, 4);
  }
  ctx.globalAlpha = 1;
}

// ============================================================ HUD, palette, buttons
const buttons = [];
function button(x, y, w, h, label, on, fn, col = '#4a3a2c', size = 13) {
  buttons.push({x, y, w, h, fn});
  rr(x, y, w, h, 9, on ? '#e0a214' : col, on ? '#ffe7a0' : 'rgba(255,240,210,.25)', 1.5);
  fitTxt(label, x + w / 2, y + h / 2 + 1, size, w - 10, on ? '#2b2010' : '#fff6e6', 'center', 900);
}
function drawHud() {
  rr(0, 0, W, 50, 0, '#1b1611');
  line(0, 50, W, 50, 'rgba(255,240,210,.12)', 2);
  const ph = S.tphase === 'plan' ? 'PLAN' : (S.tphase === 'run' ? 'RUNNING' : 'FOE’S TURN');
  txt(`TURN ${S.turn}`, 16, 18, 16, '#fff6e6', 'left', 900);
  txt(ph, 16, 37, 11, S.tphase === 'plan' ? COL.gold : (S.tphase === 'run' ? '#7fe0c6' : '#ffb0a0'), 'left', 900);
  // factory health
  const hx = 120;
  txt('FACTORY', hx, 14, 10, 'rgba(255,240,220,.6)', 'left', 800);
  rr(hx, 22, 200, 18, 9, 'rgba(0,0,0,.5)');
  rr(hx, 22, 200 * S.hp / S.maxHp, 18, 9, S.hitFlash > 0 ? '#ffffff' : '#7fe08a');
  txt(`${Math.ceil(S.hp)} / ${S.maxHp}${opts.god ? ' · god' : ''}`, hx + 100, 31, 11, '#10240f', 'center', 900);
  // block, thorns, gears, pips
  const stat = (x, icon, v, col, label) => { txt(icon, x, 28, 20, col, 'center', 900); txt(String(v), x + 16, 24, 17, '#fff6e6', 'left', 900); txt(label, x + 16, 41, 9, 'rgba(255,240,220,.55)', 'left', 800); };
  stat(352, '▦', Math.round(S.block), COL.blk, 'block');
  stat(432, '✣', Math.round(S.thorns), '#d9b8f2', 'thorns');
  stat(512, '⚙', opts.free ? '∞' : S.gears, COL.gold, 'gears');
  stat(592, '◆', Math.floor(S.pips), COL.pip, 'pip tank');
  // deal mode
  button(672, 10, 138, 30, opts.deal === 'pick' ? 'Deal: pour in one row' : 'Deal: even', opts.deal === 'pick', () => { if (S.tphase === 'plan') opts.deal = opts.deal === 'pick' ? 'even' : 'pick'; });
  button(818, 10, 60, 30, `×${opts.speed}`, opts.speed !== 1, () => { opts.speed = opts.speed === 1 ? 2 : (opts.speed === 2 ? .5 : 1); });
  button(886, 10, 58, 30, 'Tools', ui.toolsOpen, () => { ui.toolsOpen = !ui.toolsOpen; });
  txt(S.enc === 'dummy' ? 'Free play' : `${FOES[S.enc].name}`, W - 16, 25, 13, '#d9b892', 'right', 800);
}

function drawPalette() {
  rr(0, PAL_Y - 10, W, H - PAL_Y + 10, 0, '#16120e');
  CATS.forEach((c, i) => {
    const y = PAL_Y + i * (TAB_H + 4), on = ui.tab === c;
    buttons.push({x: TAB_X, y, w: TAB_W, h: TAB_H, fn: () => { ui.tab = c; }});
    rr(TAB_X, y, TAB_W, TAB_H, 8, on ? COL[c] : '#2a221a', on ? '#fff' : 'rgba(255,240,210,.15)', on ? 2 : 1);
    fitTxt(CAT_LABEL[c], TAB_X + TAB_W / 2, y + TAB_H / 2 + 1, 11, TAB_W - 12, on ? '#fff' : '#d9c8b0', 'center', 900);
  });
  for (const t of paletteTiles()) drawTile(t);
}
function drawTile(t) {
  const info = KINDS[t.k], cat = info.cat, on = ui.pal === t.k, cost = COST[t.k];
  const lift = on ? -6 : 0;
  rr(t.x + 2, t.y + 4, t.w, t.h, 10, 'rgba(0,0,0,.45)');
  rr(t.x, t.y + lift, t.w, t.h, 10, COL.card, on ? COL.gold : mix(COL[cat], '#2b2620', .35), on ? 4 : 2);
  rr(t.x + 4, t.y + 4 + lift, t.w - 8, 18, 6, COL[cat]);
  fitTxt(info.short, t.x + t.w / 2, t.y + 13 + lift, 11, t.w - 14, '#fff', 'center', 900);
  rr(t.x + 6, t.y + 26 + lift, t.w - 12, 50, 6, TINT[cat]);
  ctx.save(); ctx.translate(t.x + t.w / 2, t.y + 51 + lift); ctx.scale(.9, .9);
  drawCardIcon({kind: t.k, dir: 'D', mode: t.k === 'switch' ? 1 : 0, work: 0, fire: 0, lvl: 1, load: [], mag: [], stack: [], lever: 0, charges: 0, alt: 0});
  ctx.restore();
  wrapText(info.text, t.x + 7, t.y + 86 + lift, t.w - 14, 9, '#4a3f33', 1.2, 600, 4);
  // cost coin
  circle(t.x + t.w - 12, t.y + t.h - 13 + lift, 11, opts.free || S.gears >= cost ? '#e0a214' : '#7a5a40');
  txt(String(cost), t.x + t.w - 12, t.y + t.h - 12 + lift, 11, '#2b2010', 'center', 900);
  if (info.home) { const hk = ROW_KINDS[info.home]; circle(t.x + 12, t.y + t.h - 13 + lift, 6, hk.col); txt(hk.name, t.x + 22, t.y + t.h - 12 + lift, 9, '#6b5a48', 'left', 800); }
  if (info.pool) stamp(info.pool, t.x + 16, t.y + 34 + lift, 8);
  // a gold star: good against the current phase
  if ((PHASES[S.foe.phase].good || []).includes(t.k)) txt('★', t.x + t.w - 12, t.y + 34 + lift, 14, '#d19a06', 'center', 900, 2);
}

function drawRunButton() {
  const x = RUN_X, y = RUN_Y, w = RUN_W, h = RUN_H;
  let label = 'RUN ▶', sub = 'Space', col = '#2fae92', fn = () => startRun();
  if (S.over) { label = S.over === 'won' ? 'NEXT FOE' : 'RETRY'; sub = 'keep your board'; col = '#e0a214'; fn = () => newGame(true); }
  else if (S.tphase === 'run') { label = 'FAST ⏩'; sub = 'skip ahead'; col = '#4a6a7a'; fn = () => { S.skip = true; }; }
  else if (S.tphase === 'foe') { label = 'FOE…'; sub = ''; col = '#7a3a2c'; fn = () => { S.skip = true; }; }
  buttons.push({x, y, w, h, fn});
  const pulse = S.tphase === 'plan' && !S.over ? 2 * Math.sin(S.t * 0 + performance.now() / 300) : 0;
  rr(x + 2, y + 5, w, h, 14, 'rgba(0,0,0,.45)');
  rr(x, y - pulse, w, h, 14, col, '#ffffff', 2);
  txt(label, x + w / 2, y + h / 2 - 8 - pulse, 21, '#fff', 'center', 900, 3);
  if (sub) txt(sub, x + w / 2, y + h / 2 + 18 - pulse, 10, 'rgba(255,255,255,.8)', 'center', 800);
  // scrap toggle (phones have no right-click)
  const sy = y + h + 10;
  button(x, sy, w, 36, ui.scrap ? '✕ Scrapping' : '✕ Scrap', ui.scrap, () => { ui.scrap = !ui.scrap; ui.pal = null; });
  button(x, sy + 44, w, 30, ui.pal ? 'Drop card' : (S.tphase === 'plan' && S.turn === 1 ? 'full refunds' : 'half refunds'), false, () => { ui.pal = null; ui.scrap = false; });
}

function drawInfo() {
  const y = INFO_Y;
  let s = '';
  if (ui.pal) {
    const i = KINDS[ui.pal];
    s = `${i.name} · ${COST[ui.pal]}⚙ (+1⚙ in slots 3–4, +2⚙ in 5–6) · ${i.text}${i.home ? ` · +${Math.round((HOME_BONUS - 1) * 100)}% in the ${ROW_KINDS[i.home].name}` : ''}`;
  } else if (ui.hover && cardAt(ui.hover.r, ui.hover.c)) {
    const card = cardAt(ui.hover.r, ui.hover.c), i = KINDS[card.kind];
    s = `${i.name} · level ${card.lvl}${card.lvl < MAX_LVL ? ` (${card.xp}/${LV_XP[card.lvl]} xp)` : ' (max)'} · ${fmtDmg(card.totalDmg)} damage this fight · ${i.text}`;
    if (i.role === 'route') s += ' · Tap to flip; tap the arrow to send the other way; drag to move.';
  } else if (ui.hover && ui.hover.head >= 0) {
    const rk = ROW_KINDS[S.rows[ui.hover.head]];
    s = `${rk.name}: ${rk.text} +10% for each card in the row.`;
  } else if (S.tphase === 'plan') s = PHASES[S.foe.phase].desc;
  else s = S.tphase === 'run' ? 'Your rows are working: watch the dice.' : 'The foe takes its turn.';
  ctx.save(); ctx.beginPath(); ctx.rect(8, y - 12, 930, 24); ctx.clip();
  fitTxt(s, 14, y, 12, 920, '#d9c8b0', 'left', 600);
  ctx.restore();
}

function drawBanner() {
  const b = S.banner;
  if (!b) return;
  const a = clamp(Math.min(b.t / .25, (b.life - b.t) / .4), 0, 1);
  ctx.globalAlpha = a;
  const w = b.small ? 420 : 620, h = b.small ? 56 : 80, x = 474 - w / 2, y = b.small ? 64 : 150;
  rr(x, y, w, h, 14, 'rgba(20,14,8,.92)', b.small ? 'rgba(255,240,210,.3)' : COL.gold, 2);
  txt(b.title, x + w / 2, y + (b.small ? 20 : 28), b.small ? 17 : 24, b.small ? '#fff6e6' : COL.gold, 'center', 900);
  fitTxt(b.desc, x + w / 2, y + (b.small ? 40 : 56), 12, w - 30, '#d9c8b0', 'center', 600);
  ctx.globalAlpha = 1;
}

// ============================================================ menus
const menu = [];
function menuButton(x, y, w, h, label, on, fn, col, size) { menu.push({x, y, w, h, fn}); const n = buttons.length; button(x, y, w, h, label, on, fn, col, size); buttons.length = n; }
function drawPicker() {
  ctx.fillStyle = 'rgba(12,9,6,.88)'; ctx.fillRect(0, 0, W, H);
  txt('DICE FACTORY · ROWS', W / 2, 52, 30, COL.gold, 'center', 900);
  txt('Three habitat rows of card slots. Dice ride each row through your cards; leftovers do the row’s action.', W / 2, 86, 14, '#d9c8b0', 'center', 600);
  const ids = ['colossus', 'swarm', 'shell', 'lock', 'dummy'];
  const cw = 228, gap = 14, x0 = (W - ids.length * cw - (ids.length - 1) * gap) / 2;
  ids.forEach((id, i) => {
    const f = FOES[id], x = x0 + i * (cw + gap), y = 118, h = 420;
    menu.push({x, y, w: cw, h, fn: () => chooseFoe(id)});
    rr(x + 3, y + 5, cw, h, 16, 'rgba(0,0,0,.5)');
    rr(x, y, cw, h, 16, '#3a2c22', '#a07c5a', 2.5);
    txt(f.tag, x + cw / 2, y + 22, 11, '#d9b892', 'center', 900);
    fitTxt(f.name, x + cw / 2, y + 44, 17, cw - 20, '#ffe7c4', 'center', 900);
    rr(x + 12, y + 60, cw - 24, 150, 10, '#1f1812');
    const keep = S.enc; S.enc = id;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x + 12, y + 60, cw - 24, 150, 10); ctx.clip();
    ctx.translate(x + cw / 2, y + 140); ctx.scale(.72, .72); drawPortrait(0, 0);
    ctx.restore();
    S.enc = keep;
    txt(id === 'dummy' ? 'no HP' : `${f.hp} HP · ${f.phases.length} phase${f.phases.length > 1 ? 's' : ''}`, x + cw / 2, y + 226, 12, '#ff8a73', 'center', 900);
    let yy = wrapText(f.desc, x + 14, y + 252, cw - 28, 12, '#e8dccb', 1.3, 600);
    wrapText('Try: ' + f.counters, x + 14, yy + 8, cw - 28, 11, '#d9b892', 1.3, 700);
    rr(x + 30, y + h - 46, cw - 60, 34, 10, '#2fae92', '#fff', 1.5);
    txt('FIGHT', x + cw / 2, y + h - 28, 15, '#fff', 'center', 900);
  });
  txt('Tap a foe to start. Your board is kept between fights.', W / 2, 570, 13, '#a8987f', 'center', 600);
}
function drawTools() {
  ctx.fillStyle = 'rgba(12,9,6,.75)'; ctx.fillRect(0, 0, W, H);
  const x = 380, y = 90, w = 520, h = 440;
  rr(x, y, w, h, 16, '#2a2119', '#a07c5a', 2);
  txt('TOOLS', x + w / 2, y + 30, 20, COL.gold, 'center', 900);
  const bw = 230, c1 = x + 20, c2 = x + 270;
  let yy = y + 60;
  menuButton(c1, yy, bw, 38, opts.free ? 'Free build: on' : 'Free build: off', opts.free, () => { opts.free = !opts.free; });
  menuButton(c2, yy, bw, 38, opts.god ? 'God mode: on' : 'God mode: off', opts.god, () => { opts.god = !opts.god; });
  yy += 48;
  menuButton(c1, yy, bw, 38, opts.deal === 'pick' ? 'Deal: pour into one row' : 'Deal: even across rows', opts.deal === 'pick', () => { opts.deal = opts.deal === 'pick' ? 'even' : 'pick'; });
  menuButton(c2, yy, bw, 38, 'Change foe', false, () => { ui.toolsOpen = false; newGame(true); });
  yy += 48;
  menuButton(c1, yy, bw, 38, 'Shuffle row order', false, () => { if (S.tphase === 'plan') { S.rows.push(S.rows.shift()); } });
  menuButton(c2, yy, bw, 38, 'Clear the board', false, () => { for (let r = 0; r < ROWS; r++) for (let c = 0; c < SLOTS; c++) if (cardAt(r, c)) removeCard(r, c, true); });
  yy += 48;
  menuButton(c1, yy, bw, 38, 'Starter board', false, () => { applyLayout(STARTER); });
  menuButton(c2, yy, bw, 38, 'Copy board link', false, () => {
    const url = `${location.origin}${location.pathname}?layout=${encodeURIComponent(encodeLayout())}&foe=${S.enc}`;
    navigator.clipboard?.writeText(url).then(() => { S.banner = {title: 'Link copied', desc: url.slice(0, 90), t: 0, life: 2.5, small: true}; }, () => { prompt('Board link', url); });
  });
  yy += 48;
  if (S.enc === 'dummy') {
    txt('Dummy rules', c1, yy + 12, 12, '#d9c8b0', 'left', 800);
    yy += 24;
    ['plain', 'armor', 'lock'].forEach((k, i) => menuButton(c1 + i * 162, yy, 154, 34, DUMMY_RULES[k].name.replace('Free play · ', '').replace('Free play', 'plain'), S.dummyRule === k, () => setDummyRule(k)));
    yy += 44;
  }
  txt(`Board: ${layoutCost(encodeLayout())}⚙ of cards`, x + w / 2, y + h - 70, 12, '#a8987f', 'center', 700);
  menuButton(x + w / 2 - 90, y + h - 52, 180, 38, 'Close', false, () => { ui.toolsOpen = false; });
}
function drawGameOver() {
  if (!S.over) return;
  ctx.fillStyle = 'rgba(12,9,6,.6)'; ctx.fillRect(0, 54, 946, 364);
  txt(S.over === 'won' ? 'FOE DOWN!' : 'FACTORY WRECKED', 474, 190, 40, S.over === 'won' ? COL.gold : COL.drop, 'center', 900, 5);
  txt(`${S.turn} turns · ${fmtDmg(S.stats.dmg)} damage · ${S.stats.thrown} dice thrown`, 474, 232, 15, '#fff6e6', 'center', 700, 3);
  const top = S.slots.map((c, i) => c ? [c, i] : null).filter(Boolean).sort((a, b) => b[0].totalDmg - a[0].totalDmg).slice(0, 3);
  txt('Top cards: ' + top.map(([c]) => `${KINDS[c.kind].short} ${fmtDmg(c.totalDmg)}`).join(' · '), 474, 260, 13, '#d9c8b0', 'center', 700, 3);
  txt('Tap NEXT FOE / RETRY to go again with this board', 474, 296, 13, '#a8987f', 'center', 700, 3);
}

// ============================================================ input
function toLocal(e) {
  const r = cv.getBoundingClientRect();
  if (stageRotated) return {x: (e.clientY - r.top) * W / r.height, y: (r.right - e.clientX) * H / r.width};
  return {x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height};
}
const mouse = {x: -1, y: -1, down: null};
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointermove', e => {
  const p = toLocal(e); mouse.x = p.x; mouse.y = p.y;
  const s = slotAt(p);
  ui.hover = s ? s : {head: headerAt(p)};
  const t = paletteTiles().find(tt => inBox(p, tt));
  if (t && e.pointerType !== 'touch') ui.hoverTile = t.k; else ui.hoverTile = null;
});
cv.addEventListener('pointerdown', e => {
  const p = toLocal(e); mouse.x = p.x; mouse.y = p.y;
  if (S.picker || ui.toolsOpen) {
    const b = menu.find(bb => inBox(p, bb));
    if (b) b.fn(); else if (ui.toolsOpen) ui.toolsOpen = false;
    return;
  }
  const b = buttons.find(bb => inBox(p, bb));
  if (b && e.button === 0) { b.fn(); return; }
  const t = paletteTiles().find(tt => inBox(p, tt));
  if (t) { ui.pal = ui.pal === t.k ? null : t.k; ui.scrap = false; return; }
  if (S.over) return;
  const h = headerAt(p);
  if (h >= 0 && S.tphase === 'plan') { if (opts.deal === 'pick') S.pickRow = h; else { opts.deal = 'pick'; S.pickRow = h; } return; }
  const s = slotAt(p);
  if (!s) { if (e.button === 2) ui.pal = null; return; }
  if (S.tphase !== 'plan' && !opts.free) return;           // hands off while the rows run
  ui.hover = s;
  if (e.button === 2 || ui.scrap) { if (cardAt(s.r, s.c)) removeCard(s.r, s.c, true); else ui.pal = null; return; }
  if (ui.pal) { placeCard(s.r, s.c, ui.pal); return; }
  if (cardAt(s.r, s.c)) { mouse.down = {...s, x: p.x, y: p.y}; try { cv.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } }
});
cv.addEventListener('pointerup', e => {
  const p = toLocal(e);
  const d = mouse.down; mouse.down = null;
  if (e.pointerType === 'touch') { ui.hover = slotAt(p) || null; }
  if (!d) return;
  const s = slotAt(p);
  if (s && (s.r !== d.r || s.c !== d.c)) { moveCard(d.r, d.c, s.r, s.c); return; }
  if (!s) return;
  // tapped: the arrow corner flips where dice go, anywhere else uses the card
  const q = slotRect(d.r, d.c), card = cardAt(d.r, d.c);
  const up = routeRow(card, d.r) < d.r, ay = up ? q.y + 4 : q.y + q.h - 4;
  if (KINDS[card.kind].role === 'route' && Math.abs(p.x - (q.x + q.w - 14)) < 18 && Math.abs(p.y - ay) < 18) flipDir(d.r, d.c);
  else tapCard(d.r, d.c);
});
window.addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); if (S.over) newGame(true); else if (S.tphase === 'plan') startRun(); else S.skip = true; }
  else if (e.key === 'Escape') { ui.pal = null; ui.scrap = false; ui.toolsOpen = false; }
  else if (e.key === 'p') S.paused = !S.paused;
  else if (e.key === 'd' && S.tphase === 'plan') opts.deal = opts.deal === 'pick' ? 'even' : 'pick';
  else if (/^[1-3]$/.test(e.key) && S.tphase === 'plan') { opts.deal = 'pick'; S.pickRow = +e.key - 1; }
});

// ============================================================ frame
function draw() {
  buttons.length = 0; menu.length = 0;
  ctx.save();
  if (S.shake > 0) ctx.translate((Math.random() - .5) * S.shake * 10, (Math.random() - .5) * S.shake * 10);
  drawBackground();
  for (let r = 0; r < ROWS; r++) drawRow(r);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < SLOTS; c++) drawSlot(r, c);
  drawDice();
  drawFoeCard();
  drawProj();
  drawParticles();
  drawTexts();
  ctx.restore();
  drawHud();
  drawInfo();
  drawPalette();
  drawRunButton();
  drawBanner();
  drawGameOver();
  if (S.hitFlash > 0) { ctx.fillStyle = `rgba(255,60,40,${S.hitFlash * .25})`; ctx.fillRect(0, 0, W, H); }
  if (S.paused) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H); txt('PAUSED · P', W / 2, H / 2, 30, '#fff', 'center', 900); }
  if (ui.toolsOpen) drawTools();
  if (S.picker) drawPicker();
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hook
window.__rows = {S: () => S, opts, startRun, step: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) update(dt); draw(); }, placeCard, chooseFoe, applyLayout, encodeLayout, playFight, ri};
