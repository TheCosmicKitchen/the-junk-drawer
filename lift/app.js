// Sisyfitness on the web: the interface. Storage lives in data.js, the maths in logic.js.
import * as L from './logic.js';
import * as TR from './tracking.js';
import * as PL from './plans.js';
import { connect } from './data.js';
import { SESSIONS, SPLIT_IDS, PROGRAMS, TIPS } from './starters.js';
import * as G from './generate.js';
import * as C from './charts.js';
import { shareCard } from './share.js';
import * as LIB from './library.js';
import { THEMES, ORDER, swatch, applyTheme } from './themes.js';
import { PACKS, PACK_ORDER, progress as packProgressOf, runWindow, eventDates } from './seasons.js';
import { WIDGETS, widgetById } from './widgets/index.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEMO = new URLSearchParams(location.search).has('demo');
const RECENT_DAYS = 120;
const today = () => L.localDate();
const view = $('view');

// Per-browser conveniences only (default unit, last bodyweight). Real data lives in Supabase.
const prefs = (() => {
  try { return { unit: 'lb', bodyweight: null, ...JSON.parse(localStorage.getItem('lift.prefs') || '{}') }; }
  catch (e) { return { unit: 'lb', bodyweight: null }; }
})();
const savePrefs = () => { try { localStorage.setItem('lift.prefs', JSON.stringify(prefs)); } catch (e) {} };
// The theme: look and words. T is read at render time, so switching re-renders in the new voice.
let T = applyTheme(prefs.theme);
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);

let store, me;
const S = {
  exercises: [], byId: new Map(), aliases: new Map(),
  recent: [],          // own sets from the last RECENT_DAYS days, newest first
  days: [],            // lift_days: one row per day ever
  bests: new Map(), bestRows: [],
  dayCache: new Map(), open: new Set(), historyLimit: 40,
  period: 'all', bestQuery: '',
};

// ===========================================================================
// Small helpers
// ===========================================================================
const exName = id => (S.byId.get(id) || {}).name || 'Unknown exercise';
const DAY_DEFAULT = { weekday: 'short', month: 'short', day: 'numeric' };
const fmtDay = (iso, opts) => L.fmtDate(L.parseDate(iso), opts || DAY_DEFAULT);
const unitTag = u => (u === prefs.unit ? '' : ' ' + u);
// What a set records and how it reads come from tracking.js: a set is read from the fields it holds,
// an exercise's log type says which fields it asks for. TRO: the viewer's display choices.
const carryUnit = () => prefs.carryUnit || (prefs.unit === 'kg' ? 'm' : 'yd');
const TRO = () => ({ unitTag, carryUnit: carryUnit() });
const exType = id => TR.typeOf(S.byId.get(id));
const setText = s => TR.setText(s, TRO());
// A step's measures, copied as they are (reps, time, distance: whichever it holds).
const stepMeasures = src => ({ reps: src.reps ?? null, duration_s: src.duration_s ?? null, distance_m: src.distance_m ?? null });
// A new step's target: its exercise's main measure at what you usually do, else the field's start.
function stepTarget(exId, u) {
  const f = TR.mainField(exType(exId)), F = TR.FIELDS[f], out = { reps: null, duration_s: null, distance_m: null };
  out[f] = Math.min(F.stepMax || Infinity, F.clamp(u && u[f] != null ? u[f] : F.start));
  return out;
}
// The main measure of a set, as text: "5", "0:45", "40 yd".
const mainText = x => { const m = TR.mainOf(x); return m ? TR.FIELDS[m].text(x[m], TRO()) : ''; };
// A PR line from a post's summary (any kind of set), with its unit.
const prText = m => TR.setText({ weight: m.weight, reps: m.reps ?? null, duration_s: m.duration_s ?? null, distance_m: m.distance_m ?? null,
  count_bodyweight: !!m.count_bodyweight || (m.reps != null && !(Number(m.weight) > 0)), unit: m.unit || 'lb' }, { unitTag: u => ' ' + u, carryUnit: carryUnit() });
// A feed item's sets line: [name, sets, reps (or a time or distance as text), weight, unit, bodyweight, pr].
function itemLine(it, num) {
  const measured = typeof it[2] === 'string', w = Number(it[3]);
  const load = w > 0 ? L.fmtLoad(w) + ' ' + (it[4] || 'lb') : measured ? '' : 'bodyweight';
  return num(it[1]) + ' × ' + (measured ? it[2] : num(it[2])) + (load ? (w > 0 ? ' @ ' : ' · ') + load : '');
}
// A day's pounds moved with its unit always shown: "25,275 lb".
const volLabel = d => { const v = { lb: Number(d.volume_lb), kg: Number(d.volume_kg) }; return volText(v) + (v.kg ? '' : ' lb'); };
function volText(v) {
  const parts = [];
  if (v.lb || !v.kg) parts.push(L.fmtBig(v.lb) + (v.kg ? ' lb' : ''));
  if (v.kg) parts.push(L.fmtBig(v.kg) + ' kg');
  return parts.join(' + ');
}
// Weeks run Monday to Sunday everywhere: the calendar, the Log tab, seasons and the bulletin.
const weekStartOf = d => L.addDays(d, -((L.parseDate(d).getDay() + 6) % 7));
// ---------------------------------------------------------------------------
// Lookup tables. Built on first use and reused until their source changes: every write to your sets
// makes a new S.recent array (syncCaches), and routines and steps are added and removed by pushing to
// or replacing their arrays, so a new array or a new length means rebuild. They hold the same objects,
// so a change made in place (a set's sync state, a step's reps) shows through without a rebuild.
// ---------------------------------------------------------------------------
function memoOn(src, build) {
  let arr = null, len = -1, val;
  return () => { const a = src(); if (a !== arr || a.length !== len) { arr = a; len = a.length; val = build(a); } return val; };
}
const pushTo = (m, k, v) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
const tplIndex = memoOn(() => S.templates, a => new Map(a.map(t => [t.id, t])));
const itemsByTpl = memoOn(() => S.items, a => { const m = new Map(); for (const i of a) pushTo(m, i.template_id, i); return m; });
// Your recent sets by day and by exercise (newest first, as S.recent is), plus today's in the order logged.
const recentBy = memoOn(() => S.recent, a => {
  const byDay = new Map(), byEx = new Map();
  for (const x of a) { pushTo(byDay, x.performed_on, x); pushTo(byEx, x.exercise_id, x); }
  return { byDay, byEx, today: new Map() };
});
const todaySets = () => {
  const ix = recentBy(), t = today();
  let list = ix.today.get(t);
  if (!list) ix.today.set(t, list = (ix.byDay.get(t) || []).slice().sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
  return list.slice();
};
const recentOf = exId => recentBy().byEx.get(exId) || [];
const recentOn = day => recentBy().byDay.get(day) || [];
// What you're following, worked out once per tap or draw: a render asks for it dozens of times (once
// per step), and nothing it depends on changes in the middle of one.
const FOLLOW = {};
function taskMemo(box, key, v) {
  box[key] = v;
  if (!box.clearing) { box.clearing = true; queueMicrotask(() => { box.ids = box.v = undefined; box.clearing = false; }); }
  return v;
}
function groupByExercise(sets) {
  const out = [];
  for (const s of sets) {
    let g = out.find(x => x.exercise_id === s.exercise_id);
    if (!g) out.push(g = { exercise_id: s.exercise_id, sets: [] });
    g.sets.push(s);
  }
  return out;
}
function recentExerciseIds() {
  const seen = new Set(), out = [];
  for (const s of S.recent) if (!seen.has(s.exercise_id)) { seen.add(s.exercise_id); out.push(s.exercise_id); }
  return out;
}
function totals(fromDate) {
  const days = fromDate ? S.days.filter(d => d.performed_on >= fromDate) : S.days;
  const volume = { lb: 0, kg: 0 };
  let sets = 0;
  for (const d of days) { volume.lb += Number(d.volume_lb); volume.kg += Number(d.volume_kg); sets += Number(d.sets); }
  return { volume, visits: days.filter(d => d.sets > 0).length, sets };
}
const lbEqAll = () => L.lbEquivalent(totals().volume);
function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

let toastTimer;
function toast(msg, action) {
  const t = $('toast');
  // An open sheet is a modal dialog, which sits above everything else on the page, so the toast
  // has to live inside it while it's open to be seen (and tapped for Undo).
  const host = $('sheet').open ? $('sheet') : document.body;
  if (t.parentNode !== host) host.appendChild(t);
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
  const hide = () => t.classList.remove('show');
  if (action) t.querySelector('button').onclick = () => { hide(); action.run(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 6000 : 3000);
}
const fail = e => toast(e && e.message ? e.message : 'Something went wrong.');

// A rack of tokens, one lit for each club you've joined (the latest six), and the next one catching as
// you get closer to it. Each theme draws its own token (themes.js): a candle, a signal lamp, a jar, a building.
function candlesSVG(lit, ratio, label) {
  // A theme can draw the whole rack as one thing (a tree being decorated, a circle of runes)
  // instead of a row of tokens: rack(lit, ratio) returns the inside of the same 320 x 130 box.
  if (T.rack) return '<svg class="candles" viewBox="0 0 320 130" role="img" aria-label="' + esc(label) + '">' + T.rack(lit, Math.max(0, Math.min(1, ratio))) + '</svg>';
  const shown = Math.min(lit, 6), n = shown + 1, W = 320, H = 130, gap = W / 7, x0 = (W - gap * n) / 2;
  let s = '<svg class="candles" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">' +
    '<rect x="8" y="112" width="' + (W - 16) + '" height="8" rx="3" fill="var(--chip)"/><rect x="20" y="120" width="6" height="10" fill="var(--chip)"/><rect x="' + (W - 26) + '" y="120" width="6" height="10" fill="var(--chip)"/>';
  for (let i = 0; i < n; i++) {
    const cx = x0 + gap * i + gap / 2, next = i === n - 1, glow = next ? Math.max(0, Math.min(1, ratio)) : 1;
    s += T.token(cx, glow, next);
  }
  return s + '</svg>';
}

// ===========================================================================
// Sign-in gate
// ===========================================================================
function gate(html) {
  $('app').hidden = true; $('tabs').hidden = true; $('fab').hidden = true;
  const g = $('gate');
  g.hidden = false;
  g.innerHTML = '<div class="brand"><span class="brand-logo">' + T.logo + '</span><span class="brand-name">' + esc(T.brand) + '</span></div><p class="motto">' + esc(T.motto) + '</p><p class="muted">' + esc(T.tagline) + '</p>' + html;
  return g;
}
function gateForm(g, onSubmit) {
  const form = g.querySelector('form'), err = g.querySelector('.warn'), btn = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    btn.disabled = true; err.textContent = '';
    try { await onSubmit(new FormData(form)); }
    catch (x) { err.textContent = x.message || 'That didn’t work.'; btn.disabled = false; }
  });
  const signOut = g.querySelector('[data-signout]');
  if (signOut) signOut.onclick = async () => { await store.signOut(); showSignIn(); };
}
function showSignIn(problem) {
  const g = gate(
    (problem ? '<p class="warn" style="text-align:center">' + esc(problem) + '</p>' : '') +
    '<form autocomplete="on"><label for="em">Email</label><input class="plain-input" id="em" name="email" type="email" autocomplete="username" required>' +
    '<label for="pw">Password</label><input class="plain-input" id="pw" name="password" type="password" autocomplete="current-password" required>' +
    '<button class="btn primary block" type="submit">Sign in</button><p class="warn" role="alert"></p></form>' +
    '<p class="muted" style="font-size:13px">Just for the crew. No sign-ups. <a href="?demo" style="color:inherit">Try the demo</a>.</p>');
  gateForm(g, async f => { await store.signIn(f.get('email').trim(), f.get('password')); await afterSignIn(); });
  g.querySelector('#em').focus();
}
function codeField() {
  return '<label for="code">6-digit code from your authenticator app</label>' +
    '<input class="plain-input code-input" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>';
}
function showCode(factor) {
  const g = gate('<form>' + codeField() + '<button class="btn primary block" type="submit">Continue</button><p class="warn" role="alert"></p>' +
    '<button class="btn ghost" type="button" data-signout>Sign out</button></form>');
  gateForm(g, async f => { await store.verifyTotp(factor.id, f.get('code')); await afterSignIn(); });
  g.querySelector('#code').focus();
}
async function showEnroll() {
  const g = gate('<p class="muted">Setting up your authenticator…</p>');
  let enr;
  try { enr = await store.enrollTotp(); } catch (e) { g.innerHTML += '<p class="warn">' + esc(e.message) + '</p>'; return; }
  gate('<form><p><b>Your account needs an authenticator code.</b><br><span class="muted">Scan this with an authenticator app (Google Authenticator, 1Password, Authy…), then type the code it shows.</span></p>' +
    '<img class="qr" alt="QR code for your authenticator app" src="' + esc(enr.totp.qr_code) + '">' +
    '<p class="muted" style="font-size:13px;margin:0">Can’t scan? Enter this key instead:</p><code>' + esc(enr.totp.secret) + '</code>' +
    codeField() + '<button class="btn primary block" type="submit">Turn it on</button><p class="warn" role="alert"></p>' +
    '<button class="btn ghost" type="button" data-signout>Sign out</button></form>');
  gateForm($('gate'), async f => { await store.verifyTotp(enr.id, f.get('code')); await afterSignIn(); });
}
function showNotMember() {
  const g = gate('<form><p>You’re signed in, but this account isn’t on the crew list yet. Ask the admin to add you.</p>' +
    '<p class="warn"></p><button class="btn block" type="submit" data-signout>Sign out</button></form>');
  g.querySelector('form').onsubmit = async e => { e.preventDefault(); await store.signOut(); showSignIn(); };
}

// Opening the app: if this phone has a snapshot of what you last saw, the app draws from it at once,
// then checks your account and fetches fresh data in the background and redraws. With no signal it
// just keeps showing the snapshot (new sets wait in the outbox). No snapshot: the usual loading screen.
async function afterSignIn() {
  const session = await store.session().catch(() => null);
  const snap = readSnap((session && session.user && session.user.id) || (store.demo ? await store.userId() : null));
  if (snap) {
    me = snap.me;
    applyData(snap.data);
    S.wins = snap.wins || null; S.records = snap.records || null;
    S.lastOld = new Map(snap.lastOld || []);
    S.standings = snap.standings || {};
    restoreOutbox();
    showApp();
  } else gate('<p class="muted" style="margin-top:30px">Loading your log…</p>');
  try {
    const aal = await store.aal();
    if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const f = (await store.totpFactors())[0];
      if (f) return showCode(f);
    }
    const who = await store.me();
    if (!who) { clearSnap(); return showNotMember(); }
    me = who;
    if (me.mfa_required && !me.mfa_ok) { clearSnap(); return showEnroll(); }
    applyData(await fetchAll());
    checkStamps(); rolloverCore();
    if (snap) { replay(); S.winsAt = 0; S.recordsAt = 0; render(); }
    else { restoreOutbox(); showApp(); }
    writeSnap();
  } catch (x) {
    if (!snap) throw x;   // nothing to show: the start screen explains
    toast('No signal. Showing what you had; new sets are kept until you’re back.');
  }
}

// ---------------------------------------------------------------------------
// The snapshot: what you last saw, kept on this phone so the app opens instantly. Your own and the
// crew's lifting data, the same things the app already holds in memory. Written after a refresh
// and whenever the app goes to the background; wiped when you sign out.
// ---------------------------------------------------------------------------
const SNAP = 'lift.snap';
const snapOff = () => store.demo && !new URLSearchParams(location.search).has('snap');   // ?demo&snap tries it in the demo
function readSnap(userId) {
  if (!userId || snapOff()) return null;
  try { const o = JSON.parse(localStorage.getItem(SNAP) || 'null'); return o && o.v === 1 && o.user === userId && o.data ? o : null; } catch (e) { return null; }
}
function clearSnap() { try { localStorage.removeItem(SNAP); } catch (e) {} }
function writeSnap() {
  if (snapOff() || !S.myId || !S.recent) return;
  // Sets still waiting in the outbox aren't part of it: they come back from the outbox itself.
  const waitingSets = S.recent.filter(x => x._sync === 'waiting');
  const days = S.days.map(d => ({ ...d }));
  for (const x of waitingSets) {
    const d = days.find(y => y.performed_on === x.performed_on);
    if (d && x.is_warmup !== true) { d.sets = Number(d.sets) - 1; d['volume_' + x.unit] = Number(d['volume_' + x.unit]) - L.setVolume(x); }
  }
  const data = {
    cat: { exercises: S.exercises.concat(S.activities || []), aliases: [...S.aliases].flatMap(([exercise_id, list]) => list.map(alias => ({ exercise_id, alias }))) },
    recent: S.recent.filter(x => x._sync !== 'waiting').map(x => { const { _sync, ...rest } = x; return rest; }), days: days.filter(d => d.sets > 0), bests: S.bestRows,
    routines: { templates: S.templates, items: S.items, subs: S.subs },
    seasons: { seasons: S.seasons, goals: S.goals, subs: S.seasonSubs, plan: S.plan },
    names: [...S.names].map(([user_id, display_name]) => ({ user_id, display_name })), myId: S.myId, wdays: S.wdays, bw: S.bw, runs: S.runs, stamps: S.stampRows, programs: S.programs, cardio: S.cardio,
  };
  try { localStorage.setItem(SNAP, JSON.stringify({ v: 1, user: S.myId, at: Date.now(), me, data, wins: S.wins, records: S.records, lastOld: [...S.lastOld], standings: S.standings })); }
  catch (e) { clearSnap(); }   // full: better none than a half-written one
}
// Coming back to the app after a real break (15 minutes; not the phone sleeping between sets, since
// your own sets come from this phone anyway): refresh everything quietly. Going away: save the snapshot.
let hiddenAt = 0, refreshing = false;
document.addEventListener('visibilitychange', async () => {
  if (!store || !S.myId) return;
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); writeSnap(); return; }
  if (!hiddenAt || Date.now() - hiddenAt < 15 * 60000 || refreshing || store.demo) return;
  refreshing = true;
  try { applyData(await fetchAll()); replay(); S.winsAt = 0; S.recordsAt = 0; render(); refreshLoggerList(); writeSnap(); } catch (x) { /* keep what's on screen */ }
  refreshing = false;
});
window.addEventListener('pagehide', () => { if (store && S.myId) writeSnap(); });

function fetchAll() {
  return Promise.all([
    store.catalog(), store.setsSince(L.addDays(today(), -RECENT_DAYS)), store.days(), store.bests(),
    store.routines(), store.seasons(), store.memberNames(), store.userId(),
    store.workoutDays(today()), store.bodyweights(),
    Promise.resolve().then(() => store.seasonRuns()).catch(() => []), Promise.resolve().then(() => store.stamps()).catch(() => []),
    Promise.resolve().then(() => store.programs()).catch(() => []), Promise.resolve().then(() => store.cardio()).catch(() => []),
    Promise.resolve().then(() => store.feats()).catch(() => []), Promise.resolve().then(() => store.planRuns()).catch(() => []),
    // Every lift's last day before the 120 days, so "last time" never waits on the network.
    Promise.resolve().then(() => store.lastDaysBefore(L.addDays(today(), -RECENT_DAYS))).catch(() => null),
  ]).then(([cat, recent, days, bests, routines, seasons, names, myId, wdays, bw, runs, stamps, programs, cardio, feats, planRuns, lastDays]) => ({ cat, recent, days, bests, routines, seasons, names, myId, wdays, bw, runs, stamps, programs, cardio, feats, planRuns, lastDays }));
}
function applyData({ cat, recent, days, bests, routines, seasons, names, myId, wdays, bw, runs, stamps, programs, cardio, feats, planRuns, lastDays }) {
  S.planRuns = planRuns || [];   // which plan you're following, since when
  // With every lift's older last day in hand, a lift missing from it (and from the 120 days) is one
  // you've never done: no need to ask. Without it (offline, or the server is behind), ask per lift.
  if (Array.isArray(lastDays)) {
    S.lastOld = new Map();
    for (const x of lastDays) pushTo(S.lastOld, x.exercise_id, x);
    S.lastAll = true;
  }
  S.wdays = wdays;
  S.runs = runs || []; S.stampRows = stamps || []; S.programs = programs || []; S.cardio = cardio || [];
  S.bw = bw;
  if (bw.length && prefs.bodyweight == null && bw[0].unit === prefs.unit) prefs.bodyweight = Number(bw[0].weight);
  setRoutines(routines);
  S.seasons = seasons.seasons;
  S.goals = seasons.goals;
  S.seasonSubs = seasons.subs || [];
  S.plan = seasons.plan || [];
  S.standings = S.standings || {};   // kept across refreshes: a season shows what you last saw while it refreshes
  S.seasonAt = {};
  S.names = new Map(names.map(n => [n.user_id, n.display_name]));
  S.myId = myId;
  S.exercises = cat.exercises.filter(e => e.kind !== 'cardio');
  S.activities = cat.exercises.filter(e => e.kind === 'cardio' && !e.deleted_at);
  S.actById = new Map(S.activities.map(e => [e.id, e]));
  S.byId = new Map(S.exercises.map(e => [e.id, e]));
  S.aliases = new Map();
  for (const a of cat.aliases) {
    if (!S.aliases.has(a.exercise_id)) S.aliases.set(a.exercise_id, []);
    S.aliases.get(a.exercise_id).push(a.alias);
  }
  // Find an exercise by any of its names (TheLift's names are aliases), and attach form tips.
  S.nameIndex = new Map();
  for (const e of S.exercises) if (!e.deleted_at) S.nameIndex.set(L.norm(e.name), e.id);
  for (const [id, list] of S.aliases) for (const a of list) if (!S.nameIndex.has(L.norm(a))) S.nameIndex.set(L.norm(a), id);
  S.tips = new Map();
  for (const [name, tip] of Object.entries(TIPS)) { const id = S.nameIndex.get(L.norm(name)); if (id && !S.tips.has(id)) S.tips.set(id, tip); }
  S.recent = recent;
  const cut = L.addDays(today(), -RECENT_DAYS);   // the phone's copies of recent days follow the fresh data
  for (const d of [...S.dayCache.keys()]) if (d >= cut) S.dayCache.delete(d);
  S.days = days;
  S.bestRows = bests;
  S.bests = L.bestsMap(bests);
  S.feats = TR.featsMap(feats);   // longest, farthest and heaviest, for sets without reps
}
async function refreshBests() {
  try { S.bestRows = await store.bests(); S.bests = L.bestsMap(S.bestRows); } catch (e) {}
  try { S.feats = TR.featsMap(await store.feats()); } catch (e) {}
}

function showApp() {
  $('gate').hidden = true;
  $('app').hidden = false; $('tabs').hidden = false; $('fab').hidden = false;
  $('demoFlag').hidden = !store.demo;
  route();
  // Signed in from an email link: get a password set while we're here.
  if (typeof store.link === 'string') {
    store.link = null;
    openSettings('You’re in from an email link. Set a password below so you can sign in normally next time.');
  }
}

// ===========================================================================
// Routing
// ===========================================================================
let currentTab = null;
function route() {
  const h = location.hash.slice(1);
  if (/^[rs]-[A-Za-z0-9-]+$/.test(h)) return openLink(h);
  const tab = ['log', 'routines', 'library', 'history', 'seasons', 'progress'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'log';
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + tab ? 'page' : 'false'));
  if (tab !== currentTab) window.scrollTo(0, 0);
  $('fab').hidden = tab !== 'log';   // only on Log, so it never covers buttons elsewhere
  currentTab = tab;
  $('pageTitle').textContent = T.titles[tab];
  render();
}
function render() {
  if (currentTab === 'history') renderHistory();
  else if (currentTab === 'progress') renderProgress();
  else if (currentTab === 'seasons') renderSeasons();
  else if (currentTab === 'routines') renderRoutines();
  else if (currentTab === 'library') renderLibrary();
  else renderLog();
}
window.addEventListener('hashchange', route);
// Links to things in the database: #r-<routine id> and #s-<season id>. Only signed-in crew can
// open the app at all, and the database still decides what each person can see.
function openLink(h) {
  const id = h.slice(2);
  if (h[0] === 'r') {
    history.replaceState(null, '', location.pathname + location.search + '#routines');
    route();
    const el = document.getElementById('rt-' + id);
    if (!el) return toast('That workout isn’t shared with you, or it was deleted.');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2400);
  } else {
    const sn = seasonById(id);
    S.seasonOpen = sn ? id : null;
    history.replaceState(null, '', location.pathname + location.search + '#seasons');
    route();
    if (!sn) toast('That season isn’t shared with you, or it was deleted.');
  }
}
async function copyLink(key) {
  const url = location.origin + location.pathname + location.search + '#' + key;
  try { await navigator.clipboard.writeText(url); toast('Link copied. Send it to the crew.'); }
  catch (e) { toast('Copy this link: ' + url); }
}

// ===========================================================================
// Log (today)
// ===========================================================================
function renderLog() {
  clearTimeout(LOG_LATER); LOG_LATER = null;
  const sets = todaySets();
  const groups = groupByExercise(sets);
  view.innerHTML = themeHint() + heroHtml(sets, groups) +
    widgetCards('log') +   // opt-in extras (Settings → Widgets), up top so you see them react as you log
    (todaysDays().length ? dayCard() : planCard()) +
    followCard() +
    cardioCard() +
    (groups.length ? groups.map(exCard).join('') + (following() ? '' : '<section class="card rest-card">' + restRow() + '</section>') : (following() || cardioCard() ? '' : emptyToday())) +
    (groups.length && !following() ? '<button class="btn block" style="margin-top:14px" data-save-day="' + today() + '">Make a workout from today</button>' : '') +
    weeklyCard() +   // the week's bulletin and quests come after today's logging
    questsCard() +
    winsCard();
  loadWins();
  loadRecords();
  tickClock();
  // Following a routine: the floating button would sit on the steps' ✓s, so it steps aside and the
  // routine card carries "+ Other exercise" instead.
  $('fab').classList.toggle('away', !!following());
}
// Widgets (lift/widgets/): opt-in extras switched on in Settings → Widgets, saved on this device.
// Each gets today's date, the lifting history and its own saved data; it only ever reads.
const widgetOn = id => !!(prefs.widgets && prefs.widgets[id]);
function widgetCtx(w) {
  const all = prefs.widgetData || (prefs.widgetData = {});
  let facts = null;
  const ctx = { today: today(), days: S.days, recent: S.recent, data: all[w.id] || {}, esc,
    get facts() { return facts || (facts = widgetFacts()); },
    save: patch => { all[w.id] = { ...(all[w.id] || {}), ...patch }; ctx.data = all[w.id]; savePrefs(); } };
  return ctx;
}
// What else the app tracks, for widgets that reward it (Kintoremon's hats): clubs, streaks, this
// week's challenges, season goals met, crew records held, seasons finished, stamps.
function widgetFacts() {
  let lb = 0, kg = 0;
  for (const d of S.days) { lb += Number(d.volume_lb) || 0; kg += Number(d.volume_kg) || 0; }
  const mine = (S.seasons || []).filter(inSeason), t = today();
  const safe = (f, or) => { try { return f(); } catch (x) { return or; } };
  return {
    lifetimeLb: L.lbEquivalent({ lb, kg }),
    streakWeeks: safe(streakWeeks, 0),
    questsAllDone: safe(() => { const q = weekQuests(); return q.length > 0 && q.every(x => x.done); }, false),
    goalsDone: mine.reduce((n, sn) => n + safe(() => goalsDone(sn).done, 0), 0),
    recordsHeld: (S.records || []).filter(r => r.user_id === S.myId).length,
    seasonsFinished: mine.filter(sn => sn.ends_on < t).map(sn => sn.ends_on),
    stamps: (S.stampRows || []).filter(x => x.created_by === S.myId).map(x => x.earned_on),
  };
}
// A widget's own page, in the sheet. Taps on it go to the widget, which redraws it.
function openWidgetPage(w) {
  if (!w || !w.page) return;
  LG.mode = 'widget'; LG.widget = w.id;
  inner.innerHTML = w.page(widgetCtx(w));
  openSheet();
}
function widgetSheetClick(b) {
  const w = widgetById(LG.widget);
  if (!w || !w.click(b, widgetCtx(w))) return;
  const body = inner.querySelector('.sheet-body'), top = body ? body.scrollTop : 0;
  inner.innerHTML = w.page(widgetCtx(w));
  const again = inner.querySelector('.sheet-body'); if (again) again.scrollTop = top;
  render();
}
// A widget that throws leaves its card out rather than taking the Log tab down with it.
const widgetCards = where => WIDGETS.filter(w => w.where === where && widgetOn(w.id))
  .map(w => { try { return w.card(widgetCtx(w)); } catch (x) { console.warn('widget ' + w.id, x); return ''; } }).join('');
// Lines for the Finish recap, from widgets that have something to say about today.
const widgetRecaps = () => WIDGETS.filter(w => w.recap && widgetOn(w.id))
  .map(w => { try { return w.recap(widgetCtx(w)) || ''; } catch (x) { console.warn('widget ' + w.id, x); return ''; } }).join('');
// First time in: a one-off note that there are other looks. Gone once you pick a theme or dismiss it.
const themeHint = () => prefs.theme || prefs.themeHint ? '' :
  '<section class="card theme-hint"><p><b>Hey, there are color themes.</b> This is the plain one. There are ' + (ORDER.length - 1) +
  ' more, from royal crimson to a neon arcade, each with its own look and words.</p>' +
  '<div class="row"><button class="btn primary" data-theme-hint="open">See themes</button><button class="btn ghost" data-theme-hint="no">Keep it plain</button></div></section>';
// After a ✓ on a routine step: the day line and the routine card change at once, and the rest of the
// Log tab (exercise cards, bulletin, quests, season) catches up a moment later, so the tap answers
// straight away instead of waiting for the whole tab to be rebuilt.
let LOG_LATER;
function redrawAfterStep() {
  const hero = view.querySelector('.hero'), fc = view.querySelector('.card.follow');
  if (currentTab !== 'log' || !hero || !fc || !following()) return render();
  const sets = todaySets();
  hero.outerHTML = heroHtml(sets, groupByExercise(sets));
  fc.outerHTML = followCard();
  tickClock();
  renderSoon();
}
// A full redraw a moment from now, folding together the ones asked for in the meantime (the set
// landing in the database asks for one too).
function renderSoon() {
  clearTimeout(LOG_LATER); LOG_LATER = null;
  LOG_LATER = setTimeout(() => { LOG_LATER = null; if (!sheet.open) render(); }, 300);
}
function heroHtml(sets, groups) {
  const vol = L.volumeByUnit(sets);
  // The same Monday-to-Sunday week as seasons and the bulletin, counting days you lifted.
  const weekVisits = S.days.filter(d => d.performed_on >= weekStartOf(today()) && d.sets > 0).length;
  const hello = sets.length ? (sets.length >= 15 ? T.helloBig : T.helloSome) : T.helloNone;
  const finishBtn = groups.length && unfinished() ? '<button class="btn primary finish-btn" data-recap>' + esc(T.finish) + '</button>' : '';
  // Following a routine: the day's numbers shrink to one line so the steps sit near the top.
  return following()
    ? '<section class="card hero compact"><div class="date">' + esc(fmtDay(today(), { weekday: 'long', month: 'long', day: 'numeric' })) + '</div>' +
        '<p class="hero-line"><b>' + sets.length + '</b> set' + (sets.length === 1 ? '' : 's') + ' · <b>' + esc(volText(vol)) + '</b> ' + (vol.kg ? '' : 'lb ') + 'today · <b>' + weekVisits + '</b> day' + (weekVisits === 1 ? '' : 's') + ' lifted this week</p>' +
        (groups.length ? sessionClock() : '') + countsLine() + syncLine() + finishBtn + '</section>'
    : '<section class="card hero"><div class="date">' + esc(fmtDay(today(), { weekday: 'long', month: 'long', day: 'numeric' })) + '</div>' +
    '<h1>' + hello + '</h1><div class="stats">' +
      '<div class="stat"><b>' + esc(volText(vol)) + '</b><small>' + (vol.kg ? '' : 'lb ') + 'moved today</small></div>' +
      '<div class="stat"><b>' + sets.length + '</b><small>set' + (sets.length === 1 ? '' : 's') + '</small></div>' +
      '<div class="stat"><b>' + weekVisits + '</b><small>day' + (weekVisits === 1 ? '' : 's') + ' lifted this week</small></div>' +
    '</div>' + countsLine() + syncLine() + (groups.length ? sessionClock() + finishBtn : '') + '</section>';
}
// Save several routine steps in one request (not one per step) and keep them in memory.
async function putItems(rows) {
  const made = await store.addItems(rows);
  for (const it of made) { S.items.push(it); S.itemsById.set(it.id, it); }
  return made;
}
// Turn a day's lifting into a routine: one step per exercise, in the order you did them,
// with the number of working sets and your heaviest set's reps and weight.
async function saveDayAsRoutine(day, btn) {
  const sets = (day === today() ? todaySets() : (localDay(day), S.dayCache.get(day)) || []).filter(s => s.is_warmup !== true);
  const groups = groupByExercise(sets);
  if (!groups.length) return toast('Nothing to save from that day.');
  btn.disabled = true;
  try {
    const t = await store.addRoutine({ name: nameFrom(groups.map(g => g.exercise_id)), kind: 'workout' });
    S.templates.push(t);
    await putItems(groups.slice(0, 100).map((g, i) => {
      const top = g.sets.reduce((a, s) => (Number(s.weight) > Number(a.weight) ? s : a));
      return { template_id: t.id, exercise_id: g.exercise_id, position: i + 1,
        sets: Math.min(20, g.sets.length), ...stepMeasures({ ...top, reps: top.reps == null ? null : Math.min(100, top.reps) }), load_mode: 'last', load_value: 0, unit: top.unit };
    }));
    toast('Saved as “' + t.name + '”. Rename it or tweak away.');
    openDesigner(t.id);
  } catch (x) { fail(x); btn.disabled = false; }
}
function exCard(g) {
  const v = L.volumeByUnit(g.sets);
  return '<section class="card ex-card"><div class="row"><h3>' + esc(exName(g.exercise_id)) + '</h3><span class="muted num">' + (L.lbEquivalent(v) > 0 ? esc(volText(v)) : '') + '</span></div>' +   // holds and carries move no volume
    '<div class="chips">' + g.sets.map(s => '<button class="chip' + (s._pr ? ' pr' : '') + (s.is_warmup ? ' warm' : '') + (unsaved(s) ? ' pending' : '') + '" data-edit="' + esc(s.id) + '" aria-label="Edit ' + esc(setText(s)) + '">' + (s._pr ? T.icons.pr + ' ' : '') + esc(setText(s)) + '</button>').join('') +
      // One small button: log another set, the logger opening with your last one filled in.
      '<button class="chip dup" data-more="' + esc(g.exercise_id) + '" aria-label="Log another set of ' + esc(exName(g.exercise_id)) + ', filled in from your last">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2"/><path d="M14.5 12v6M11.5 15h6"/></svg></button>' +
    '</div></section>';
}
// Sets aren't logged "to" a season: a season is a date range, so today's sets count toward every
// season you're in that's running today. Say so where people log.
function countsLine() {
  const t = today();
  const live = (S.seasons || []).filter(x => inSeason(x) && !isCore(x) && x.starts_on <= t && t <= x.ends_on);
  if (!live.length) return '';
  return '<p class="counts">Counts toward ' + live.map(x => '<button class="linkbtn" data-season="' + esc(x.id) + '">' + esc(x.name) + '</button>').join(', ') + '</p>';
}
function emptyToday() {
  const recents = recentExerciseIds().slice(0, 6);
  const ms = L.milestoneProgress(lbEqAll());
  return '<section class="card empty">' + candlesSVG(ms.count, ms.ratio, '') +
    '<h2>' + esc(T.emptyH) + '</h2><p class="muted">' + esc(T.emptyP) + '</p>' +
    (recents.length ? '<div class="section-title" style="margin-top:14px">Pick up where you left off</div><div class="chips" style="justify-content:center">' +
      recents.map(id => '<button class="chip" data-more="' + esc(id) + '">' + esc(exName(id)) + '</button>').join('') + '</div>' : '') +
    '<button class="btn" style="margin-top:14px" data-generate>🎲 Generate a workout</button>' +
    '</section>';
}
view.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.widgetOpen) return openWidgetPage(widgetById(b.dataset.widgetOpen));
  const wEl = b.closest('[data-widget]');
  if (wEl) { const w = widgetById(wEl.dataset.widget); if (w && w.click(b, widgetCtx(w))) render(); return; }
  if (b.dataset.edit) openEditor(findSet(b.dataset.edit));
  else if (b.dataset.musWeek) { S.musWeek = b.dataset.musWeek; const box = $('musclesBox'); if (box) box.outerHTML = musclesCard(); }
  else if (b.dataset.themeHint) {
    prefs.themeHint = 1; savePrefs();
    const card = view.querySelector('.theme-hint'); if (card) card.remove();
    if (b.dataset.themeHint === 'open') { openSettings(); const sk = inner.querySelector('.skins'); if (sk) sk.scrollIntoView({ block: 'start' }); }
  }
  else if (b.dataset.libMus != null) { S.lib.mus = b.dataset.libMus || null; if (!S.lib.mus) { S.lib.eq = null; S.lib.mine = false; } S.libAll = false; drawLib(); }
  else if (b.dataset.libEq) { S.lib.eq = S.lib.eq === b.dataset.libEq ? null : b.dataset.libEq; S.libAll = false; drawLib(); }
  else if (b.dataset.libMine != null) { S.lib.mine = !S.lib.mine; S.libAll = false; drawLib(); }
  else if (b.dataset.libSort) { S.lib.sort = b.dataset.libSort; drawLib(); }
  else if (b.hasAttribute('data-lib-all')) { S.libAll = true; drawLib(); }
  else if (b.dataset.libEx) openExInfo(b.dataset.libEx);
  else if (b.hasAttribute('data-lib-new')) openNewExercise(b.dataset.libNew || '');
  else if (b.dataset.more) openLogger(b.dataset.more);
  else if (b.dataset.day) toggleDay(b.dataset.day);
  else if (b.dataset.period) { S.period = b.dataset.period; renderProgress(); }
  else if (b.id === 'moreDays') { S.historyLimit += 40; renderHistory(); }
  // routines
  else if (b.dataset.quickItem) quickStep(b.dataset.quickItem, b);
  else if (b.dataset.followItem) { const it = S.itemsById.get(b.dataset.followItem); if (it) openEntry(it.exercise_id, null, it); }
  else if (b.dataset.start) startFollowing(b.dataset.start);
  else if (b.dataset.pack) { S.packOpen = b.dataset.pack; renderSeasons(); window.scrollTo(0, 0); }
  else if (b.dataset.packBack != null) { S.packOpen = null; renderSeasons(); }
  else if (b.dataset.packJoin) joinPack(b.dataset.packJoin, b);
  else if (b.dataset.packLeave) leavePack(b.dataset.packLeave, b);
  else if (b.dataset.trySkin) trySkin(b.dataset.trySkin);
  else if (b.hasAttribute('data-core-edit')) openCore(b);
  else if (b.dataset.progUse) { const p = progById(b.dataset.progUse); if (p) addProgramToWeek(p, b); }
  else if (b.dataset.progEdit) openProgramDesigner(b.dataset.progEdit);
  else if (b.hasAttribute('data-prog-new')) { if (wideScreen()) openPlanDesigner(null); else openProgramDesigner(null); }
  else if (b.dataset.planEdit) { if (wideScreen()) openPlanDesigner(b.dataset.planEdit); else toast('Plans are designed on a computer for now. Open the app there to edit this one.'); }
  else if (b.dataset.planStart) startPlan(b.dataset.planStart, b);
  else if (b.hasAttribute('data-plan-stop')) stopPlan(b);
  else if (b.dataset.saveDay) saveDayAsRoutine(b.dataset.saveDay, b);
  else if (b.hasAttribute('data-stop-follow')) stopFollowing();
  else if (b.hasAttribute('data-add-today-pick')) openAddToday();
  else if (b.hasAttribute('data-log-other')) openLogger();
  else if (b.dataset.unfollow) unfollow(b.dataset.unfollow);
  else if (b.dataset.addToday) startFollowing(b.dataset.addToday, true);
  else if (b.dataset.design) openDesigner(b.dataset.design);
  else if (b.hasAttribute('data-new-routine')) newRoutine(b, 'workout');
  else if (b.hasAttribute('data-new-block')) newRoutine(b, 'block');
  else if (b.dataset.fromBlock) workoutFromBlock(b.dataset.fromBlock, b);
  else if (b.dataset.schedule) openScheduleSheet(b.dataset.schedule);
  else if (b.dataset.use) openUseMenu(b.dataset.use);
  else if (b.dataset.unday) removeDay(b.dataset.unday, b);
  else if (b.hasAttribute('data-weigh')) weighIn(b);
  else if (b.dataset.bwDel) removeWeighIn(b.dataset.bwDel);
  else if (b.dataset.sub) subscribeTo(b.dataset.sub, b);
  else if (b.dataset.unsub) unsubscribeFrom(b.dataset.unsub, b);
  else if (b.dataset.copy) copyRoutine(b.dataset.copy, b);
  // seasons
  else if (b.dataset.season) openSeason(b.dataset.season);
  else if (b.hasAttribute('data-season-back')) { S.seasonOpen = null; S.wrappedOpen = null; renderSeasons(); window.scrollTo(0, 0); }
  else if (b.dataset.seasonProg) openSeasonProgram(b.dataset.seasonProg);
  else if (b.dataset.cdEdit) { const r = (S.cardio || []).find(x => x.id === b.dataset.cdEdit); if (r) openCardio(r.exercise_id, r); }
  else if (b.dataset.cdNew) openCardio(b.dataset.cdNew);
  else if (b.dataset.feedDay) { const k = b.dataset.feedDay; if (feedOpen.has(k)) feedOpen.delete(k); else feedOpen.add(k); render(); }
  else if (b.dataset.wrapped) { S.wrappedOpen = b.dataset.wrapped; openSeason(b.dataset.wrapped); }
  else if (b.hasAttribute('data-wrapped-back')) { S.wrappedOpen = null; renderSeasons(); window.scrollTo(0, 0); }
  else if (b.dataset.szAgain) openSeasonStart(seasonById(b.dataset.szAgain));
  else if (b.hasAttribute('data-programs')) openStarters();
  else if (b.dataset.editSeason) openSeasonSheet(b.dataset.editSeason);
  else if (b.hasAttribute('data-new-season')) openSeasonStart();
  else if (b.hasAttribute('data-new-any')) openNewChooser();
  else if (b.dataset.rerun) openSeasonStart(seasonById(b.dataset.rerun));
  else if (b.dataset.joinSeason) joinSeason(b.dataset.joinSeason, b);
  else if (b.dataset.link) copyLink(b.dataset.link);
  else if (b.hasAttribute('data-recap')) openRecap();
  else if (b.hasAttribute('data-week-seen')) { try { localStorage.setItem('lift.weekSeen', b.dataset.weekSeen); } catch (e) {} render(); }
  else if (b.hasAttribute('data-share-wins')) { prefs.shareWins = prefs.shareWins === false; savePrefs(); render(); toast(prefs.shareWins ? 'Your wins go to the crew again.' : 'Your wins stay private from now on.'); }
  else if (b.dataset.winDel) removeWin(b.dataset.winDel);
  else if (b.dataset.winShare) { const src = SHARE_SRC.get(b.dataset.winShare); if (src) shareWorkout(src.w, src.extras, b); }
  else if (b.dataset.trend) { S.trendEx = b.dataset.trend; S.hist = S.hist || new Map(); location.hash = '#progress'; setTimeout(() => { const t = $('trendBox'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 200); }
  else if (b.dataset.myGoals) openSeasonSheet(b.dataset.myGoals);
  else if (b.hasAttribute('data-starters')) openStarters();
  else if (b.hasAttribute('data-generate')) openGenerator();
  else if (b.dataset.progAll) {
    (S.progAll = S.progAll || new Set()).add(b.dataset.progAll);
    if (b.dataset.progAll === 'bests') drawBests(); else if (b.dataset.progAll === 'records') drawRecords(); else renderProgress();
  }
  else if (b.dataset.rtAll) { (S.rtAll = S.rtAll || new Set()).add(b.dataset.rtAll); renderRoutines(); }
  else if (b.hasAttribute('data-packs-toggle')) { S.packsOpen = !S.packsOpen; renderSeasons(); }
  else if (b.dataset.calMove) { const [y, mo] = S.cal.month.split('-').map(Number); const d = new Date(y, mo - 1 + Number(b.dataset.calMove), 1); S.cal.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); renderHistory(); }
  else if (b.dataset.calDay) selectCalDay(b.dataset.calDay);
  else if (b.dataset.calSchedule) openWorkoutPicker(b.dataset.calSchedule);
  else if (b.dataset.leaveSeason) leaveSeason(b.dataset.leaveSeason, b);
  else if (b.dataset.restPick) pickRest(b);
});
$('fab').addEventListener('click', () => openLogger());
$('navLog').addEventListener('click', () => { if (location.hash !== '#log' && location.hash !== '') location.hash = '#log'; openLogger(); });
const findSet = id => { return S.recent.find(s => s.id === id) || [...S.dayCache.values()].flat().find(s => s.id === id); };

// ===========================================================================
// Weights are per person. A routine step only says exercise, sets and reps, plus a rule:
//   last         your last working weight for that lift (through your estimated 1-rep max when the
//                rep count differs: 5 @ 200 suggests about 180 for 8)
//   progress     the same, plus N when you hit every rep last time (for 3×5 / 5×5 style programs)
//   percent_1rm  a percent of your best estimated 1-rep max
// A lift you've never logged gets no guess: the weight box starts empty.
// ===========================================================================
const roundDown = (w, unit) => { const step = unit === 'kg' ? 1.25 : 2.5; return Math.floor(w / step + 1e-9) * step; };
const roundNear = (w, unit) => { const step = unit === 'kg' ? 2.5 : 5; return Math.round(w / step) * step; };
// Your most recent session of a lift (before today if there is one): its working sets.
function lastSession(exId) {
  const sets = recentOf(exId).filter(x => x.is_warmup !== true);
  if (!sets.length) return null;
  const before = sets.filter(x => x.performed_on < today());
  const pool = before.length ? before : sets;
  const day = pool.reduce((m, x) => (x.performed_on > m ? x.performed_on : m), '');
  return { day, sets: pool.filter(x => x.performed_on === day) };
}
// Copying a step: a set weight stays only when it's yours and stays yours (shared programs and other
// people's steps get each person's last weight instead).
const loadFor = (it, sharing) => (it.load_mode === 'fixed' && (sharing || !ownStep(it)) ? { load_mode: 'last', load_value: 0 } : { load_mode: it.load_mode, load_value: it.load_value });
// Is this step in a routine of yours (a set weight only applies to the person who set it)?
const ownStep = it => { const t = tplById(it.template_id); return !!t && isMine(t); };
// Following a plan: in its workouts, a lift with a progression gets that week's % of your best, and a
// deload week lightens the usual suggestion. Everything else is the step's own rule (baseSuggest).
function suggestFor(it) {
  const g = baseSuggest(it), pn = planNow();
  if (!pn || pn.week < 1 || pn.over || g.field !== 'reps' || !pn.doc.workouts.some(w => w.template_id === it.template_id)) return g;
  const pct = PL.pctFor(pn.doc, pn.week, it.exercise_id), f = PL.loadFactor(pn.doc, pn.week);
  if (pct != null) {
    const unit = g.unit || prefs.unit, basis = L.bestE1rm(it.exercise_id, unit, S.bestRows);
    return basis ? { ...g, unit, weight: roundNear(basis * pct / 100, unit), why: 'week ' + pn.week + ': ' + L.fmtNum(pct, 1) + '% of your best' } : g;
  }
  return f < 1 && g.weight > 0 ? { ...g, weight: roundDown(g.weight * f, g.unit), why: (pn.phase ? pn.phase.name.toLowerCase() : 'deload') + ' week: ' + Math.round(f * 100) + '% of ' + g.why } : g;
}
function baseSuggest(it) {
  // The step's main measure (reps, time or distance) and its target. Weight is worked out the same
  // way for all of them; only a rep target converts your last weight between rep counts.
  const ex = S.byId.get(it.exercise_id), field = TR.stepField(it, ex), target = TR.stepValue(it, ex);
  const reps = field === 'reps' ? target : null;
  let mode = it.load_mode || 'last';
  // A set weight is the author's own number: it's for them, and anyone else following uses their last.
  if (mode === 'fixed') {
    if (ownStep(it)) return { weight: Number(it.load_value), unit: it.unit || prefs.unit, reps, field, target, why: 'the set weight' };
    mode = 'last';
  }
  if (mode === 'percent_1rm') {
    const ls = lastSession(it.exercise_id), unit = ls ? ls.sets[0].unit : it.unit || prefs.unit;
    const basis = L.bestE1rm(it.exercise_id, unit, S.bestRows);
    return basis ? { weight: roundNear(basis * Number(it.load_value) / 100, unit), unit, reps, field, target, why: Number(it.load_value) + '% of your best' }
      : { weight: null, unit, reps, field, target, why: Number(it.load_value) + '% of your best, once you’ve logged it' };
  }
  const ls = lastSession(it.exercise_id);
  let ref = null;
  if (ls) ref = ls.sets.reduce((m, x) => (Number(x.weight) > Number(m.weight) ? x : m), ls.sets[0]);
  else {   // older than what's loaded: your best set by estimated 1-rep max
    const rows = S.bestRows.filter(r => r.exercise_id === it.exercise_id);
    if (rows.length) { const r = rows.reduce((m, x) => ((L.e1rm(Number(x.heaviest), x.reps) || Number(x.heaviest)) > (L.e1rm(Number(m.heaviest), m.reps) || Number(m.heaviest)) ? x : m)); ref = { weight: r.heaviest, reps: r.reps, unit: r.unit }; }
  }
  if (!ref) return { weight: null, unit: it.unit || prefs.unit, reps, field, target, why: 'first time: enter a weight' };
  const unit = ref.unit, w0 = Number(ref.weight);
  let weight = w0, why = 'your last';
  if (w0 > 0 && reps != null && ref.reps != null && ref.reps !== reps) {
    const e = L.e1rm(w0, ref.reps) || w0 * (1 + ref.reps / 30);
    weight = roundDown(e / (1 + reps / 30), unit);
    why = 'from your last ' + ref.reps + ' × ' + L.fmtLoad(w0);
  }
  if (mode === 'progress' && ls && w0 > 0) {
    const hit = ls.sets.filter(x => Number(x.weight) >= w0 && Number(x[field]) >= target).length >= it.sets;
    if (hit) { weight = w0 + Number(it.load_value); why = '+' + L.fmtLoad(Number(it.load_value)) + ': you hit every rep last time'; }
    else if (Number(ref[field]) >= target) { weight = w0; why = 'same again until you hit every rep'; }
  }
  return { weight, unit, reps, field, target, why };
}
// "3 × 8", plus the rule when it isn't plain "your last".
const ruleTag = it => (it.load_mode === 'progress' ? ' · +' + L.fmtLoad(Number(it.load_value)) : it.load_mode === 'percent_1rm' ? ' · ' + L.fmtNum(Number(it.load_value), 0) + '%'
  : it.load_mode === 'fixed' && ownStep(it) ? ' @ ' + (Number(it.load_value) > 0 ? L.fmtLoad(Number(it.load_value)) + ' ' + it.unit : 'bodyweight') : '');
const stepText = it => TR.stepText(it, S.byId.get(it.exercise_id), TRO()) + ruleTag(it);
// For the person following: the step with their own weight.
const loadText = g => (g.weight == null ? '' : g.weight > 0 ? L.fmtLoad(g.weight) + ' ' + g.unit : 'bodyweight');
const myStepText = it => { const g = suggestFor(it); return TR.stepText(it, S.byId.get(it.exercise_id), TRO()) + (g.weight != null ? (g.weight > 0 ? ' @ ' : ' · ') + loadText(g) : ''); };

// Log the next set of a routine step at its planned reps and weight, in one tap: one tap per set,
// the way you actually lift. The step's rest (if it has one) starts by itself.
async function quickStep(itemId, btn) {
  const it = S.itemsById.get(itemId);
  const tg = it && suggestFor(it);
  if (!tg || tg.weight == null) return it && openEntry(it.exercise_id, null, it);   // no history: open the step to type a weight
  const left = it.sets - stepDone(it);
  if (left < 1) return;
  btn.disabled = true;
  const last = todaySets().filter(s => s.exercise_id === it.exercise_id).pop();
  const bw = last ? !!last.count_bodyweight : false;
  try {
    const saved = await logSets({ exercise_id: it.exercise_id, weight: tg.weight, ...TR.stepRecord(it, S.byId.get(it.exercise_id)), unit: tg.unit,
      count_bodyweight: bw, bodyweight: bw ? last.bodyweight : null, is_warmup: false }, 1);
    afterLogToast(saved);
    redrawAfterStep();
    restAfterStep(it);
  } catch (x) { fail(x); btn.disabled = false; render(); }
}
// ===========================================================================
// Writing sets (shared by the logger, same-again, edit and undo)
// ===========================================================================
function bumpDay(s, sign) {
  if (s.is_warmup === true) return;
  let d = S.days.find(x => x.performed_on === s.performed_on);
  if (!d) { d = { performed_on: s.performed_on, sets: 0, exercises: 0, volume_lb: 0, volume_kg: 0 }; S.days.push(d); S.days.sort((a, b) => b.performed_on.localeCompare(a.performed_on)); }
  d.sets = Number(d.sets) + sign;
  d['volume_' + s.unit] = Number(d['volume_' + s.unit]) + sign * L.setVolume(s);
  const pool = S.dayCache.get(s.performed_on) || recentOn(s.performed_on);
  d.exercises = new Set(pool.filter(x => !x.deleted_at && x.is_warmup !== true).map(x => x.exercise_id)).size;
  if (d.sets <= 0) S.days = S.days.filter(x => x !== d);
}
function syncCaches(saved, gone) {
  if (S.hist) S.hist.delete(saved.exercise_id);
  S.recent = S.recent.filter(s => s.id !== saved.id);
  if (!gone && saved.performed_on >= L.addDays(today(), -RECENT_DAYS)) { S.recent.push(saved); S.recent.sort((a, b) => (b.performed_on + b.logged_at).localeCompare(a.performed_on + a.logged_at)); }
  for (const [day, list] of S.dayCache) {
    const rest = list.filter(s => s.id !== saved.id);
    if (!gone && saved.performed_on === day) rest.push(saved);
    S.dayCache.set(day, rest.sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
  }
}
// ---------------------------------------------------------------------------
// The outbox. Every change to your sets (logging, editing, deleting, undoing a delete) shows on
// screen the moment you tap and goes into one outbox kept on the phone until the database has it.
// It sends in order, one request per change. No signal: the changes stay on screen marked as
// waiting, and the outbox keeps trying (on reconnect, on coming back to the app, every 15 s), even
// after the app is closed and opened again. Resending can't double anything up: a new set's id is
// chosen on the phone and the database refuses the same id twice (that counts as saved), and edits,
// deletes and restores land the same however often they're sent. Anything the database refuses is
// put back the way it was, with a message.
//
// A change that hasn't been sent yet is folded into the outbox rather than sent separately: editing
// a set that's still waiting rewrites it, deleting it just takes it out, and undoing a delete that
// hasn't gone yet cancels it.
//
// The changes (each kept on the phone as plain data):
//   { kind: 'add',   rows }               new sets, one request for the whole tap
//   { kind: 'edit',  id, patch, before }  before = the old values, to put back if it's refused
//   { kind: 'del',   id, row }            row = the set as it was, to put back or restore
//   { kind: 'undel', id, row }
// Each set on screen carries its state in _sync:
//   'waiting'   logged, not in the database yet
//   'changing'  in the database, with an edit, delete or restore still to send
//   'gone'      deleted on screen (only old references to it ever see this)
//   (none)      saved, nothing waiting
// ---------------------------------------------------------------------------
const Q = { box: [], busy: false, timer: null, stall: null, inflight: null };   // stall: null, 'net' (no signal) or 'auth' (sign-in needs refreshing)
const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const msgOf = x => String((x && (x.message || x.code)) || x || '');
const authErr = x => /JWT|not authenticated|invalid claim|refresh token|session (has )?expired|401|PGRST30/i.test(msgOf(x));
const retryable = x => /reach the server|Failed to fetch|NetworkError|Load failed|network|Too many changes|timeout/i.test(msgOf(x));
const isDuplicate = x => /duplicate key|23505|already exists/i.test(msgOf(x));
const unsaved = s => s._sync === 'waiting' || s._sync === 'changing';
const outboxKey = () => 'lift.outbox' + (store && store.demo ? '.demo' : '');
const plain = s => { const o = {}; for (const k in s) if (k[0] !== '_') o[k] = s[k]; return o; };   // a set without its on-screen flags
function saveBox() { try { localStorage.setItem(outboxKey(), JSON.stringify({ v: 2, user: S.myId, box: Q.box })); } catch (e) {} }
function loadBox() {
  try {
    const o = JSON.parse(localStorage.getItem(outboxKey()) || 'null');
    if (!o || o.user !== S.myId || !Array.isArray(o.box)) return [];
    return o.box.map(e => (e.kind ? e : { kind: 'add', rows: e.rows || [] }));   // an outbox from before edits went in it: just new sets
  } catch (e) { return []; }
}
const opsFor = (id, all) => Q.box.filter(e => (all || e !== Q.inflight) && (e.kind === 'add' ? e.rows.some(r => r.id === id) : e.id === id));
// What a set's state should be, from what's still in the outbox for it.
function syncOf(id) {
  const ops = opsFor(id, true);
  return ops.some(e => e.kind === 'add') ? 'waiting' : ops.length ? 'changing' : undefined;
}
// Put a set on screen in the state the outbox says it's in (replacing whatever was there).
function show(row, was) {
  const t = { date_only: false, import_batch_id: null, deleted_at: null, count_bodyweight: false, bodyweight: null, ...row };
  t._sync = syncOf(t.id);
  if (was) { t._pr = was._pr; t._crossed = was._crossed; bumpDay(was, -1); }
  syncCaches(t, false); bumpDay(t, +1);
  return t;
}
function hide(cur) { cur._sync = 'gone'; syncCaches(cur, true); bumpDay(cur, -1); }
const waiting = () => Q.box.reduce((a, e) => a + (e.kind === 'add' ? e.rows.length : 1), 0);
function syncText(n) {
  const what = n + (Q.box.every(e => e.kind === 'add') ? ' set' : ' change') + (n === 1 ? '' : 's');
  return '☁️ ' + what + ' waiting to save' + (Q.stall === 'net' ? '. No signal; they’ll go as soon as you’re back.'
    : Q.stall === 'auth' ? '. Your sign-in needs refreshing; if it doesn’t sort itself out, sign out and back in. Nothing is lost.' : '…');
}
const syncLine = () => { const n = waiting(); return '<p class="sync-line"' + (n ? '' : ' hidden') + '>' + esc(syncText(n)) + '</p>'; };
function syncWaiting() {
  const n = waiting();
  document.querySelectorAll('.sync-line').forEach(el => { el.hidden = !n; el.textContent = syncText(n); });
}
function queueStore(st) {
  const signOut = st.signOut.bind(st);
  st.signOut = async () => { clearSnap(); S.lastOld.clear(); S.lastAll = false; S.standings = {}; S.seasonAt = {}; lastAsked.clear(); return signOut(); };
  if (!st.addSets) st.addSets = async rows => { const out = []; for (const r of rows) out.push(await st.addSet(r)); return out; };
  return st;
}
window.addEventListener('online', () => flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Q.box.length) flush(); });
function queue(op) { Q.box.push(op); saveBox(); syncWaiting(); flush(); }

function logSets(fields, count) {
  const rows = [];
  for (let i = 0; i < count; i++) rows.push({ id: newId(), performed_on: today(), logged_at: new Date(Date.now() + i).toISOString(), notes: null, is_warmup: false, ...fields });
  return logRows(rows, true);
}
function logSet(fields) { return { saved: logSets(fields, 1)[0] }; }
// Put new sets on screen and in the outbox. fresh = just tapped (counts PRs, clubs, quests); otherwise
// it's a set coming back (undoing the delete of one that hadn't saved yet).
function logRows(rows, fresh) {
  S.seasonAt = {};
  Q.box.push({ kind: 'add', rows: rows.map(plain) });
  const temps = rows.map(r => {
    const t = { date_only: false, import_batch_id: null, deleted_at: null, count_bodyweight: false, bodyweight: null, ...r, _sync: 'waiting' };
    if (fresh) return applyNewSet(t);
    syncCaches(t, false); bumpDay(t, +1); return t;
  });
  saveBox(); syncWaiting(); flush();
  return temps;
}
// Change a set: on screen now, and into the outbox (folded into a change still waiting, if there is one).
function editSet(old, patch) {
  const cur = findSet(old.id);
  if (!cur || cur._sync === 'gone') return;
  const add = Q.box.find(e => e.kind === 'add' && e !== Q.inflight && e.rows.some(r => r.id === cur.id));
  const prev = Q.box.find(e => e.kind === 'edit' && e !== Q.inflight && e.id === cur.id);
  if (add) Object.assign(add.rows.find(r => r.id === cur.id), patch);
  else if (prev) { for (const k in patch) if (!(k in prev.before)) prev.before[k] = cur[k]; Object.assign(prev.patch, patch); }
  else { const before = {}; for (const k in patch) before[k] = cur[k]; Q.box.push({ kind: 'edit', id: cur.id, patch: { ...patch }, before }); }
  show({ ...plain(cur), ...patch }, cur);
  saveBox(); syncWaiting(); flush();
}
async function flush() {
  if (Q.busy || !store) return;
  Q.busy = true; clearTimeout(Q.timer);
  while (Q.box.length) {
    const e = Q.box[0];
    Q.inflight = e;
    let res = null, err = null;
    try {
      res = e.kind === 'add' ? await store.addSets(e.rows)
        : e.kind === 'edit' ? await store.updateSet(e.id, e.patch)
        : e.kind === 'del' ? await store.deleteSet(e.id)
        : await store.restoreSet(e.id);
    } catch (x) {
      err = x;
      if (e.kind === 'add' && isDuplicate(x)) { try { res = await store.setsByIds(e.rows.map(r => r.id)); err = null; } catch (y) { err = y; } }
    }
    Q.inflight = null;
    if (err && (retryable(err) || authErr(err))) {
      const stall = authErr(err) ? 'auth' : 'net';
      if (Q.stall !== stall) toast(stall === 'auth' ? 'Your sign-in needs refreshing. Changes are kept on this phone until it does.' : 'No signal. Your changes are kept on this phone and will save when you’re back.');
      Q.stall = stall;
      syncWaiting();
      Q.timer = setTimeout(flush, 15000);
      Q.busy = false;
      return;
    }
    Q.box.shift(); saveBox();
    if (err) refused(e, err); else landed(e, res);
  }
  if (Q.stall) { Q.stall = null; toast('Back online. Everything’s saved.'); }
  Q.busy = false;
  syncWaiting();
}
function landed(e, res) {
  if (e.kind === 'add') {
    for (const real of res || []) {
      const cur = findSet(real.id);
      if (!cur || cur._sync === 'gone') continue;   // deleted while it was on its way (the delete follows it out)
      for (const o of opsFor(real.id, true)) if (o.kind === 'edit') Object.assign(real, o.patch);   // edited while on its way
      show(real, cur);
      if (cur._pr) postWin('pr', exName(real.exercise_id) + ' PR', { weight: Number(real.weight), reps: real.reps, duration_s: real.duration_s ?? null,
        distance_m: real.distance_m == null ? null : Number(real.distance_m), count_bodyweight: !!real.count_bodyweight, unit: real.unit });
      if (cur._crossed) postWin('club', cur._crossed.title, {});
      checkRecord(real);
    }
  } else if (!opsFor(e.id, true).length) {   // nothing newer waiting for this set: the database's copy is the truth
    const cur = findSet(e.id);
    if (e.kind !== 'del' && res && cur && cur._sync !== 'gone') show(res, cur);
    refreshBests().then(() => { if (!sheet.open) render(); });
  } else { const cur = findSet(e.id); if (cur) cur._sync = syncOf(e.id); }
  refreshLoggerList();
  if (e.kind === 'add') checkStamps();
  // The sheet re-renders the page when it closes. On Log, mid-workout, fold this into the redraw a
  // ✓ already scheduled rather than rebuilding the tab twice in a row.
  if (!sheet.open) { if (currentTab === 'log' && LOG_LATER) renderSoon(); else render(); }
}
function refused(e, err) {
  const why = msgOf(err);
  if (e.kind === 'add') {
    for (const r of e.rows) {
      const cur = findSet(r.id); if (cur) hide(cur);
      for (const o of opsFor(r.id)) Q.box.splice(Q.box.indexOf(o), 1);   // its later edits and deletes have nothing to change
    }
    saveBox(); refreshBests(); render(); refreshLoggerList();
    const n = e.rows.length;
    return toast('Couldn’t save ' + (n > 1 ? n + ' sets' : 'that set') + ': ' + why, { label: 'Try again', run: () => { logRows(e.rows.map(r => ({ ...r, id: newId() })), true); render(); refreshLoggerList(); } });
  }
  const cur = findSet(e.id), live = cur && cur._sync !== 'gone';
  if (e.kind === 'edit' && live) show({ ...plain(cur), ...e.before }, cur);
  if (e.kind === 'del' && !live) show(e.row);
  if (e.kind === 'undel' && live) hide(cur);
  refreshBests(); render(); refreshLoggerList();
  toast((e.kind === 'edit' ? 'Couldn’t save that change: ' : e.kind === 'del' ? 'Couldn’t delete: ' : 'Couldn’t restore: ') + why);
}
// Fresh data from the database (or the snapshot) replaces what was on screen: lay everything still
// in the outbox back on top of it. Safe to do more than once.
function replay() {
  for (const e of Q.box) {
    if (e.kind === 'add') { for (const r of e.rows) if (!findSet(r.id)) show(r); continue; }
    const cur = findSet(e.id);
    if (e.kind === 'edit' && cur) show({ ...plain(cur), ...e.patch }, cur);
    if (e.kind === 'del' && cur) hide(cur);
    if (e.kind === 'undel' && !cur) show(e.row);
  }
  for (const s of S.recent) if (s._sync !== 'gone') s._sync = syncOf(s.id);
}
// After signing in: anything the last visit didn't get to send goes back on screen and out again.
function restoreOutbox() {
  Q.box = loadBox();
  replay();
  saveBox(); syncWaiting();
  if (Q.box.length) { refreshBests(); flush(); }
}
// Everything a new set changes on screen, done straight away with the stand-in row.
function applyNewSet(t) {
  t._pr = TR.isPr(t, S.bests, S.feats);
  const before = lbEqAll();
  syncCaches(t, false);
  bumpDay(t, +1);
  if (t.reps == null) TR.raiseFeats(t, S.feats);
  else { const k = L.bestKey(t); if (t.is_warmup !== true && !(S.bests.get(k) >= Number(t.weight))) S.bests.set(k, Number(t.weight)); }
  const after = lbEqAll();
  t._crossed = L.MILESTONES.filter(m => before < m.lb && after >= m.lb).pop();
  vibrate(t._pr || t._crossed ? [20, 40, 20] : 12);
  checkGoalWins();
  checkQuestWins();
  prefs.unit = t.unit;
  if (t.count_bodyweight) prefs.bodyweight = Number(t.bodyweight);
  savePrefs();
  return t;
}
function afterLogToast(saved) {
  const list = Array.isArray(saved) ? saved : [saved];
  const first = list[0], n = list.length;
  const undo = { label: 'Undo', run: () => (n === 1 ? removeSet(first, true) : removeSets(list)) };
  const crossed = list.map(x => x._crossed).filter(Boolean).pop();
  const what = (n > 1 ? n + ' × ' : '') + setText(first);
  if (crossed) toast(T.clubToast + crossed.title, undo);
  else if (list.some(x => x._pr)) toast(T.prToast + what + ' on ' + exName(first.exercise_id), undo);
  else toast('Logged ' + what, undo);
}
// Deleting works the same way as logging: gone from the screen at once and into the outbox. A set
// that hasn't been sent yet is just taken back out of it. Undo puts each set back the way it went:
// a never-sent set goes back in the outbox as new, a delete still waiting is cancelled, and one
// that already reached the database is restored.
function dropSets(list, quiet) {
  const undo = [];
  for (const s of list) {
    const cur = findSet(s.id) || s;
    if (cur._sync === 'gone') continue;
    if (cur._pr) unpostWin('pr', exName(cur.exercise_id) + ' PR', cur.performed_on);   // undoing a PR takes its line back
    const row = plain(cur), add = Q.box.find(e => e.kind === 'add' && e !== Q.inflight && e.rows.some(r => r.id === cur.id));
    hide(cur); s._sync = 'gone';
    if (add) {   // never sent: take it (and anything queued for it) back out
      add.rows = add.rows.filter(r => r.id !== cur.id);
      if (!add.rows.length) Q.box.splice(Q.box.indexOf(add), 1);
      for (const o of opsFor(cur.id)) Q.box.splice(Q.box.indexOf(o), 1);
      undo.push({ row, pr: cur._pr, sent: false });
    } else {
      const back = Q.box.find(e => e.kind === 'undel' && e !== Q.inflight && e.id === cur.id);
      if (back) Q.box.splice(Q.box.indexOf(back), 1); else Q.box.push({ kind: 'del', id: cur.id, row });
      undo.push({ row, pr: cur._pr, sent: true });
    }
  }
  saveBox(); syncWaiting(); flush();
  refreshBests(); render(); refreshLoggerList();
  if (quiet) toast('Undone');
  else toast(undo.length > 1 ? undo.length + ' sets deleted' : 'Set deleted', { label: 'Undo', run: () => restoreSets(undo) });
}
function removeSets(list) { dropSets(list, true); }
function removeSet(s, quiet) { dropSets([s], quiet); }
function restoreSets(undo) {
  for (const u of undo) {
    if (findSet(u.row.id)) continue;
    if (!u.sent) { logRows([u.row], false); continue; }
    const del = Q.box.find(e => e.kind === 'del' && e !== Q.inflight && e.id === u.row.id);
    if (del) Q.box.splice(Q.box.indexOf(del), 1); else Q.box.push({ kind: 'undel', id: u.row.id, row: u.row });
    show(u.row)._pr = u.pr;
  }
  saveBox(); syncWaiting(); flush();
  refreshBests(); render(); refreshLoggerList();
  toast('Restored');
}

// ===========================================================================
// The logger sheet
// ===========================================================================
const sheet = $('sheet'), inner = $('sheetInner');
const LG = { mode: 'pick', exId: null, editing: null };
// Sheets with something to type in (search, routine editor, seasons) open full height,
// so the text box sits at the top instead of down where the phone keyboard pops up.
// Building a workout or a program opens as a page of its own (the whole screen, ← Back at the top),
// not a sheet over the app; picking exercises or blocks for it stays on that page. The phone's back
// gesture closes it too.
const PAGE_MODES = ['design', 'progdesign', 'plandesign'];
// The page's history entry is marked { liftPage: 1 }; what's on top of the history decides, never a
// remembered flag (which went stale when a page closed by moving to another tab).
let pageHome = null;   // what the page was opened for
const onPageEntry = () => !!(history.state && history.state.liftPage);
function openSheet() {
  const el = sheet.querySelector('.sheet');
  if (LG.mode !== 'design' && LG.mode !== 'plandesign') el.classList.remove('wide');
  const page = PAGE_MODES.includes(LG.mode) || (sheet.open && el.classList.contains('page') && ['pick', 'chunk'].includes(LG.mode));
  el.classList.toggle('page', page);
  if (PAGE_MODES.includes(LG.mode)) pageHome = LG.mode;
  el.classList.toggle('tall', ['pick', 'design', 'season', 'chunk', 'starters', 'program', 'pickwk', 'wizard', 'progdesign', 'seasonstart', 'seasonprog'].includes(LG.mode));
  const x = inner.querySelector('.sheet-head [data-close]');
  if (x) { x.textContent = page ? '←' : '✕'; x.setAttribute('aria-label', page ? 'Back' : 'Close'); }
  if (page && !onPageEntry()) history.pushState({ liftPage: 1 }, '');
  if (!sheet.open) sheet.showModal();
}
function closeSheet() {
  flushSaves();
  // A page put an entry in the history: going back removes it, and popstate below does the closing.
  if (sheet.open && sheet.querySelector('.sheet').classList.contains('page') && onPageEntry()) return history.back();
  if (sheet.open) sheet.close();
  render();
}
// Back (the phone's gesture, or ← above) while a page is open: close it.
window.addEventListener('popstate', () => {
  if (!onPageEntry() && sheet.open && sheet.querySelector('.sheet').classList.contains('page')) { flushSaves(); sheet.close(); render(); }
});
// Closed some other way (finished, saved): drop the page's history entry if it's still on top.
sheet.addEventListener('close', () => {
  const wasPage = sheet.querySelector('.sheet').classList.contains('page');
  sheet.querySelector('.sheet').classList.remove('page');
  if (wasPage && onPageEntry()) history.back();
});
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });

function openLogger(exId) {
  LG.editing = null; LG.item = null;
  if (exId) return openEntry(exId);
  openPicker('What are you lifting?', null);
}
// The exercise search sheet. onPick = null logs a set; otherwise it hands the chosen id back.
// multi: tap to tick several, then one button hands them all back (as an array) in the order ticked.
function openPicker(title, onPick, multi) {
  LG.mode = 'pick';
  LG.pickFor = onPick;
  LG.multi = multi ? [] : null;
  LG.pf = { mus: null, eq: null, mine: false, sort: 'used' };
  LG.pkAll = false;
  LG.pkCardio = false;
  // Logging (not building): a Weights / Cardio switch beside the title, so the list sits right under the
  // filters and the first results stay in view with the keyboard up.
  const both = !onPick && !multi && (S.activities || []).length;
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">' + esc(title) + '</h2>' +
      (both ? '<span class="seg pk-kind" role="group" aria-label="Weights or cardio"><button type="button" data-pk-kind="w" aria-pressed="true">Weights</button><button type="button" data-pk-kind="c" aria-pressed="false">Cardio</button></span>' : '') +
      '<button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    // Search and filters stay pinned at the top while the list scrolls under them.
    '<div class="sheet-body"><div class="pick-top"><input class="search" id="exSearch" type="search" placeholder="' + pickHolder() + '" autocomplete="off" enterkeyhint="go" aria-label="Search exercises">' +
    '<div id="pkFilters">' + libChips(LG.pf, 'pk') + '</div></div>' +
    '<p class="res-title" id="resTitle" hidden></p><ul class="results" id="exResults"></ul>' +
    (multi ? '<div class="pick-foot"><button class="btn primary block" data-add-selected disabled>Tick exercises to add</button></div>' : '') + '</div>';
  openSheet();
  const input = $('exSearch');
  // Search after a short pause in typing, not on every key.
  let typing;
  input.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { LG.pkAll = false; drawResults(input.value); }, 120); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(typing); drawResults(input.value); const first = $('exResults').querySelector('button'); if (first) { e.preventDefault(); first.click(); } }
  });
  drawResults('');
  // With a mouse, type straight away. On a phone, wait for a tap: the keyboard would cover the list.
  if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 60);
}
function lastSummary(exId) {
  const s = recentOf(exId)[0];
  return s ? setText(s) + ' · ' + fmtDay(s.performed_on, { month: 'short', day: 'numeric' }) : '';
}
const pickHolder = () => LG.pkCardio ? 'Search cardio' : 'Search ' + S.exercises.filter(e => !e.deleted_at).length + ' exercises';
// Weights / Cardio in the picker's header.
function setPickKind(cardio) {
  LG.pkCardio = cardio; LG.pkAll = false;
  inner.querySelectorAll('[data-pk-kind]').forEach(b => b.setAttribute('aria-pressed', (b.dataset.pkKind === 'c') === cardio));
  $('pkFilters').hidden = cardio;
  const input = $('exSearch'); input.placeholder = pickHolder();
  drawResults(input.value);
}
function drawCardioResults(q) {
  // What you've done most recently first, each with its last outing.
  const last = new Map();
  for (const c of S.cardio || []) if (!c.deleted_at && (!last.has(c.exercise_id) || c.performed_on > last.get(c.exercise_id).performed_on)) last.set(c.exercise_id, c);
  const lastOf = id => last.get(id), when = a => (lastOf(a.id) || {}).performed_on || '';
  const t = L.norm(q.trim()), list = S.activities.filter(a => !t || L.norm(a.name).includes(t)).sort((a, b) => when(b).localeCompare(when(a)));
  setResTitle(list.length ? '' : 'No matches');
  $('exResults').innerHTML = list.map(a => { const c = lastOf(a.id);
    return '<li><button data-cardio-new="' + esc(a.id) + '"><span>' + esc(a.name) + '</span><small>' + (c ? esc(cardioText(c) + ' · ' + fmtDay(c.performed_on, { month: 'short', day: 'numeric' })) : '') + '</small></button></li>'; }).join('');
}
function setResTitle(text) { const el = $('resTitle'); el.textContent = text; el.hidden = !text; }
function drawResults(q) {
  if (LG.pkCardio) return drawCardioResults(q);
  const f = LG.pf || {}, filtering = !!(f.mus || f.eq || f.mine);
  // Nothing typed or filtered: your recent lifts when logging, the whole library (yours first) when building.
  let list = !q.trim() && !filtering && !LG.multi ? L.searchExercises('', S.exercises, S.aliases, recentExerciseIds()) : [];
  if (!list.length) list = libList({ ...f, q: q.trim(), sort: 'used' });
  // A one-line label only when it says something: a filter's count, or nothing found. Recent and
  // matches need no heading, so the first results sit right under the filters.
  setResTitle(q.trim() ? (list.length ? '' : 'No matches')
    : filtering ? (list.length ? list.length + ' ' + [f.mus && LIB.muscleName(f.mus), f.eq && LIB.equipmentName(f.eq)].filter(Boolean).join(' · ') + ' exercise' + (list.length === 1 ? '' : 's') : 'Nothing here yet')
    : LG.multi ? 'The library · yours first' : '');
  const picked = id => LG.multi && LG.multi.includes(id);
  // What's already ticked comes first (easy to see and untick); ticking more updates rows in place.
  const all = LG.multi && !q.trim() ? LG.multi.map(id => S.byId.get(id)).filter(Boolean).concat(list.filter(e => !picked(e.id))) : list;
  // The first 40, then "Show all": drawing all ~250 rows on a phone is slow, and search finds the rest.
  const shown = LG.pkAll ? all : all.slice(0, PICK_SHOW);
  let html = shown.map(e => '<li><button data-pick="' + esc(e.id) + '"' + (LG.multi ? ' class="' + (picked(e.id) ? 'sel' : '') + '" aria-pressed="' + picked(e.id) + '"' : '') + '><span>' +
    (LG.multi ? '<i class="tickbox" aria-hidden="true">' + (picked(e.id) ? LG.multi.indexOf(e.id) + 1 : '') + '</i>' : '') + '<span class="lib-name">' + esc(e.name) + '<small class="lib-sub">' + esc(akaTag(q, e) + libTag(e)) + '</small></span></span><small>' + esc(lastSummary(e.id)) + '</small></button></li>').join('');
  const typed = q.trim();
  const exact = e => [e.name, ...(S.aliases.get(e.id) || [])].some(n => L.norm(n) === L.norm(typed));
  if (typed && me && me.is_admin && !S.exercises.some(e => !e.deleted_at && exact(e))) {
    const near = L.suggestMatch(typed, S.exercises.filter(e => !e.deleted_at).map(e => e.name));
    html += '<li><button data-add="' + esc(typed) + '"><span>+ Add “' + esc(typed) + '” to the catalogue</span><small>admin</small></button>' +
      (near ? '<p class="warn" style="margin:-2px 4px 10px">Did you mean <b>' + esc(near) + '</b>? It’s already there.</p>' : '') + '</li>';
  }
  if (typed && !LG.pickFor && !LG.multi) html = (S.activities || []).filter(a => L.norm(a.name).includes(L.norm(typed)))
    .map(a => '<li><button data-cardio-new="' + esc(a.id) + '"><span>' + esc(a.name) + '</span><small>cardio</small></button></li>').join('') + html;
  if (shown.length < all.length) html += '<li><button class="pk-all" data-pk-all><span>Show all ' + all.length + '</span><small>or search</small></button></li>';
  $('exResults').innerHTML = html;
  syncPickFoot();
}
const PICK_SHOW = 40;
// Ticking several: update the tapped rows' boxes and numbers without redrawing the list.
function syncTicks() {
  inner.querySelectorAll('#exResults [data-pick]').forEach(btn => {
    const k = LG.multi.indexOf(btn.dataset.pick), on = k >= 0;
    btn.classList.toggle('sel', on); btn.setAttribute('aria-pressed', on);
    const box = btn.querySelector('.tickbox');
    if (box) box.textContent = on ? k + 1 : '';
  });
  syncPickFoot();
}
function syncPickFoot() {
  const b = inner.querySelector('[data-add-selected]');
  if (!b) return;
  const n = LG.multi.length;
  b.disabled = !n;
  b.textContent = n ? 'Add ' + n + ' exercise' + (n === 1 ? '' : 's') : 'Tick exercises to add';
}

// "3 × 5 @ 235, 1 × 4 @ 235": runs of identical working sets collapsed.
// "3 × 5 @ 235 lb, 1 × 4 @ 235 lb", "2 × 0:45", "2 × 40 yd @ 70 lb": runs of identical working sets.
function summarizeSets(sets) {
  const runs = [];
  for (const x of sets.filter(y => y.is_warmup !== true)) {
    const last = runs[runs.length - 1], key = TR.MEASURES.map(f => x[f]).join('|') + '|' + Number(x.weight) + '|' + x.unit + '|' + !!x.count_bodyweight;
    if (last && last.key === key) last.n++; else runs.push({ key, n: 1, x });
  }
  return runs.map(r => { const load = TR.loadText(r.x, u => ' ' + u, true); return r.n + ' × ' + mainText(r.x) + (load && load !== 'BW' ? ' @ ' + load : ''); }).join(', ')
    || sets.map(setText).join(', ');
}
// Do you log a whole exercise at the end, or each set as you go? Judged from your own history: on past
// days, were an exercise's sets logged within a few seconds of each other (one tap) or spread out?
// Both work either way; this only decides whether an exercise opens set to the full count or to 1.
function logsAtEnd() {
  const t = today(), at = new Map();
  for (const x of S.recent) {
    if (x.performed_on >= t || x.is_warmup === true) continue;
    const k = x.performed_on + '|' + x.exercise_id;
    if (!at.has(k)) at.set(k, []);
    at.get(k).push(Date.parse(x.logged_at));
  }
  let whole = 0, each = 0;
  for (const ts of at.values()) if (ts.length > 1) { if (Math.max(...ts) - Math.min(...ts) < 5000) whole++; else each++; }
  return whole + each < 3 || whole >= each;   // too little to go on: the full count
}
// Last time for lifts older than the 120 days on the phone: asked for once, then kept (in the
// snapshot too), and asked for ahead of time for every step of a routine you're following.
S.lastOld = new Map();
const lastAsked = new Set();
function fetchLast(exId) {
  if (lastAsked.has(exId) || S.lastAll) return;
  lastAsked.add(exId);
  store.lastFor(exId, today()).then(rows => { S.lastOld.set(exId, rows); }).catch(() => { lastAsked.delete(exId); });
}
function prefetchLast(exIds) { for (const id of exIds) if (!localLast(id) && !S.lastOld.has(id)) fetchLast(id); }
// Your most recent day of this lift before today, from what's already loaded. Null if it isn't there.
function localLast(exId) {
  const t = today();
  let day = null;
  const mine = recentOf(exId);
  for (const x of mine) if (x.performed_on < t && (!day || x.performed_on > day)) day = x.performed_on;
  return day ? mine.filter(x => x.performed_on === day).sort((a, b) => a.logged_at.localeCompare(b.logged_at)) : null;
}
async function openEntry(exId, editing, item) {
  LG.next = null;
  LG.mode = editing ? 'edit' : 'entry';
  LG.exId = exId;
  LG.editing = editing || null;
  LG.item = editing ? null : item || null;
  // The box beside the weight is the exercise's main field (reps, time or distance); editing a set,
  // it's whatever that set holds. Any other fields the type asks for go under More.
  const TY = exType(exId);
  LG.field = editing ? TR.mainOf(editing) || TR.mainField(TY) : TR.mainField(TY);
  const FD = TR.FIELDS[LG.field];
  const base = editing || todaySets().filter(s => s.exercise_id === exId).pop();
  const atEnd = logsAtEnd();
  const unit = base ? base.unit : prefs.unit;
  const st = LG.st = {
    weight: base ? Math.abs(Number(base.weight)) : null,   // filled from your last time below; a lift you've never done starts empty
    assist: base ? Number(base.weight) < 0 : false,   // assisted: the weight box is the help, saved as a negative load
    amount: base && base[LG.field] != null ? Number(base[LG.field]) : FD.start, unit,
    rpe: editing && editing.rpe != null ? Number(editing.rpe) : null,
    extra: Object.fromEntries(TY.fields.filter(f => f !== LG.field).map(f => [f, editing ? editing[f] ?? null : null])),
    bw: base ? !!base.count_bodyweight : !!(S.byId.get(exId) || {}).supports_bodyweight,
    bodyweight: base && base.bodyweight != null ? Number(base.bodyweight) : prefs.bodyweight,
    warm: base ? base.is_warmup === true : false,
    note: editing ? editing.notes || '' : '', date: editing ? editing.performed_on : today(),
    showNote: !!(editing && editing.notes),
    // How many sets one tap logs. Set by set: always 1. At the end: what's left of the routine step, or
    // 1 if you're already going on this lift today, else 3 until last time is known.
    sets: !atEnd ? 1 : item ? Math.max(1, item.sets - stepDone(item)) : base ? 1 : 3,
  };
  // Following a routine: the step's sets and reps, with your own weight for it (unless you're mid-way today).
  const target = LG.item ? suggestFor(LG.item) : null;
  if (target) {
    if (target.field === LG.field) st.amount = target.target;
    if (!base) { st.unit = target.unit; st.weight = target.weight; }
  }
  const planLine = LG.item
    ? '<div class="plan-chip">📋 Plan <b>' + esc(stepText(LG.item)) + '</b>' +
      '<span class="muted" style="font-weight:500"> · ' + esc(target.weight != null ? loadText(target) + ', ' + target.why : target.why) + '</span></div>' +
      (LG.item.note ? '<p class="tip">📝 ' + esc(LG.item.note) + '</p>' : '')
    : '';
  inner.innerHTML =
    // Simple by default: last time, three prefilled boxes, one button. Everything else is under More.
    '<div class="sheet-head"><div class="lg-title"><h2 id="sheetTitle">' + esc(exName(exId)) + '</h2>' +
      (editing ? '' : '<button class="linkbtn" data-change>Change</button>') + '</div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      planLine +
      (editing ? '' : dryHint(exId)) +
      (editing ? '' : syncLine()) +
      '<p class="last-line" id="lastLine">' + (editing ? 'Editing a set from ' + esc(fmtDay(editing.performed_on)) : 'Looking up last time…') + '</p>' +
      '<div class="trio' + (editing ? ' two' : '') + '">' +
        '<div class="boxwrap"><label class="box"><span><span id="wLabel">' + (st.assist ? 'Assist' : 'Weight') + '</span> <i id="wUnit">' + esc(st.unit) + '</i></span><input id="wIn" inputmode="decimal" enterkeyhint="done" placeholder="–" value="' + esc(st.weight == null ? '' : L.fmtLoad(st.weight)) + '"></label>' + steppers('w', 'weight') + '</div>' +
        '<div class="boxwrap"><label class="box"><span>' + esc(FD.label) + (FD.unitOf ? ' <i id="aUnit">' + esc(FD.unitOf(TRO())) + '</i>' : '') + '</span>' +
          '<input id="aIn" inputmode="' + FD.inputmode + '" enterkeyhint="done" value="' + esc(FD.show(st.amount, TRO())) + '"></label>' + steppers('a', FD.label.toLowerCase()) + '</div>' +
        (editing ? '' : '<div class="boxwrap"><label class="box"><span>Sets</span><input id="nIn" inputmode="numeric" enterkeyhint="done" value="' + esc(st.sets) + '"></label>' + steppers('n', 'sets') + '</div>') +
      '</div>' +
      (editing ? '<div class="field-label"><span>Day</span></div><input class="plain-input" id="dateIn" type="date" value="' + esc(st.date) + '" max="' + today() + '">' : '') +
      '<div id="prFlag"></div><p class="warn" id="formErr" role="alert"></p>' +
      '<button class="btn primary block big" id="saveBtn">' + (editing ? 'Save changes' : 'Log set') + '</button>' +
      '<details class="more" id="moreBox"' + (st.bw || st.warm || st.showNote || st.assist || st.rpe ? ' open' : '') + '><summary>More: units, warm-up, bodyweight, effort, note</summary>' +
        '<div class="more-body">' +
          '<div class="row"><span class="seg" role="group" aria-label="Unit">' + ['lb', 'kg'].map(u => '<button type="button" data-unit="' + u + '" aria-pressed="' + (u === st.unit) + '">' + u + '</button>').join('') + '</span>' +
            '<span class="muted" style="font-size:13px">Fine-tune</span></div>' +
          '<div class="nudges" id="nudges" role="group" aria-label="Fine-tune the weight"></div>' +
          '<div class="hint-line" id="plates"></div>' +
          moreFields(TY, st) +
          '<div class="toggles">' +
            '<button type="button" class="toggle" data-t="warm" aria-pressed="' + st.warm + '">Warm-up</button>' +
            '<button type="button" class="toggle" data-t="bw" aria-pressed="' + st.bw + '">Count bodyweight</button>' +
            '<button type="button" class="toggle" data-t="assist" aria-pressed="' + st.assist + '">Assisted</button>' +
            '<button type="button" class="toggle" data-t="note" aria-pressed="' + st.showNote + '">Note</button></div>' +
          '<div id="bwRow"' + (st.bw ? '' : ' hidden') + '><div class="field-label"><span>Bodyweight</span><small>added to the load for volume</small></div>' +
            '<input class="plain-input" id="bwIn" inputmode="decimal" aria-label="Bodyweight" value="' + esc(st.bodyweight != null ? L.fmtLoad(st.bodyweight) : '') + '" placeholder="e.g. 180"></div>' +
          '<div id="noteRow"' + (st.showNote ? '' : ' hidden') + '><div class="field-label"><span>Note</span></div><input class="plain-input" id="noteIn" maxlength="300" value="' + esc(st.note) + '" placeholder="How did it feel?"></div>' +
          '<div id="bestLine"></div>' + tipLine(exId) +
        '</div></details>' +
      (editing ? '<button class="btn block ghost" style="margin-top:10px;color:var(--accent)" id="delBtn">Delete this set</button>' : '<div id="doneToday"></div>' + restRow()) +
    '</div>';
  openSheet();
  wireEntry();
  drawNudges();
  updateLive();
  refreshLoggerList();
  if (!editing) {
    // Prefill from last time, unless already lifting this today. The phone already has the last
    // 120 days and anything older it has looked up before, so this is instant; only an older lift
    // it has never seen asks the server.
    let prev = localLast(exId) || S.lastOld.get(exId) || (S.lastAll ? [] : null);
    if (!prev) { prev = await store.lastFor(exId, today()).catch(() => []); S.lastOld.set(exId, prev); lastAsked.add(exId); }
    if (LG.exId !== exId || LG.mode !== 'entry') return;
    LG.last = prev;
    const working = prev.find(s => s.is_warmup !== true) || prev[0];
    if (working && !base && (!LG.item || st.weight == null)) {
      const top = prev.filter(s => s.is_warmup !== true).reduce((a, s) => (Number(s.weight) > Number(a.weight) ? s : a), working);
      const same = prev.filter(s => s.is_warmup !== true && Number(s.weight) === Number(top.weight) && s.unit === top.unit).length;
      Object.assign(st, { weight: Math.abs(Number(top.weight)), assist: Number(top.weight) < 0, amount: top[LG.field] != null ? Number(top[LG.field]) : st.amount, unit: top.unit, bw: !!top.count_bodyweight,
        bodyweight: top.bodyweight != null ? Number(top.bodyweight) : st.bodyweight, sets: atEnd ? Math.min(10, Math.max(1, same)) : 1 });
      syncInputs();
    }
    $('lastLine').innerHTML = prev.length
      ? 'Last time, ' + esc(fmtDay(prev[0].performed_on, { month: 'short', day: 'numeric' })) + ': <b>' + esc(summarizeSets(prev)) + '</b>'
      : 'First time logging this one. Type a weight to start.';
    updateLive();
  }
}
// Under More: the type's other fields (a carry's time), the carry unit when a field has one, and
// effort (RPE). All drawn from the field table, nothing per exercise.
function moreFields(TY, st) {
  const o = TRO(), extras = TY.fields.filter(f => f !== LG.field);
  const box = f => { const F = TR.FIELDS[f], v = st.extra[f];
    return '<div class="field-label"><span>' + esc(F.label) + '</span><small>optional</small></div>' +
      '<input class="plain-input" id="x_' + f + '" inputmode="' + F.inputmode + '" aria-label="' + esc(F.label) + '" value="' + esc(v == null ? '' : F.show(v, o)) + '" placeholder="' + esc(F.show(F.start, o)) + '">'; };
  const units = [LG.field, ...extras].some(f => TR.FIELDS[f].unitOf)
    ? '<div class="row" style="margin-top:10px"><span class="seg" role="group" aria-label="Distance unit">' + Object.keys(TR.CARRY_UNITS).map(u =>
      '<button type="button" data-carry="' + u + '" aria-pressed="' + (u === o.carryUnit) + '">' + u + '</button>').join('') + '</span><span class="muted" style="font-size:13px">Distance in</span></div>' : '';
  return extras.map(box).join('') + units +
    '<div class="field-label"><span>Effort</span><small>RPE: 10 is nothing left</small></div><div class="seg seg-wrap" role="group" aria-label="Effort">' +
    [6, 7, 8, 9, 10].map(v => '<button type="button" data-rpe="' + v + '" aria-pressed="' + (st.rpe === v) + '">' + v + '</button>').join('') + '</div>';
}
// − and + under each box: the weight moves by your usual jump (5 lb or 2.5 kg), the main field by its own step, sets by one.
const steppers = (k, what) => '<div class="nudge"><button type="button" data-' + k + '="-1" aria-label="Less ' + what + '">−</button><button type="button" data-' + k + '="1" aria-label="More ' + what + '">+</button></div>';
// Small jumps for fine-tuning: micro plates in lb, and half that in kg.
const NUDGES = { lb: [-10, -5, -2.5, 2.5, 5, 10], kg: [-5, -2.5, -1.25, 1.25, 2.5, 5] };
function drawNudges() {
  const box = $('nudges');
  if (box) box.innerHTML = NUDGES[st().unit].map(n => '<button type="button" data-nudge="' + n + '" aria-label="' + (n > 0 ? 'Add ' : 'Take off ') + Math.abs(n) + ' ' + st().unit + '">' + (n > 0 ? '+' : '−') + L.fmtLoad(Math.abs(n)) + '</button>').join('');
}
function syncInputs() {
  drawNudges();
  $('wIn').value = st().weight == null ? '' : L.fmtLoad(st().weight);
  $('aIn').value = TR.FIELDS[LG.field].show(st().amount, TRO());
  if ($('aUnit')) $('aUnit').textContent = carryUnit();
  if ($('wLabel')) $('wLabel').textContent = st().assist ? 'Assist' : 'Weight';
  inner.querySelectorAll('[data-t="assist"]').forEach(b => b.setAttribute('aria-pressed', st().assist));
  inner.querySelectorAll('[data-rpe]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.rpe) === st().rpe));
  inner.querySelectorAll('[data-carry]').forEach(b => b.setAttribute('aria-pressed', b.dataset.carry === carryUnit()));
  if ($('nIn')) $('nIn').value = st().sets;
  inner.querySelectorAll('[data-unit]').forEach(b => b.setAttribute('aria-pressed', b.dataset.unit === st().unit));
  if ($('wUnit')) $('wUnit').textContent = st().unit;
  inner.querySelector('[data-t="bw"]').setAttribute('aria-pressed', st().bw);
  $('bwRow').hidden = !st().bw;
  if (st().bodyweight != null) $('bwIn').value = L.fmtLoad(st().bodyweight);
}
const st = () => LG.st;
function wireEntry() {
  inner.querySelectorAll('.trio input').forEach(i => i.addEventListener('input', () => { LG.next = null; }, true));
  $('wIn').addEventListener('input', () => { const v = L.parseLoad($('wIn').value); if (v != null) st().weight = v; updateLive(); });
  $('aIn').addEventListener('input', () => { const v = TR.FIELDS[LG.field].read($('aIn').value, TRO()); if (v != null) st().amount = v; updateLive(); });
  if ($('nIn')) { $('nIn').addEventListener('input', () => { const v = parseInt($('nIn').value, 10); if (v > 0) st().sets = Math.min(20, v); updateLive(); }); $('nIn').addEventListener('focus', () => $('nIn').select()); }
  $('bwIn').addEventListener('input', () => { st().bodyweight = L.parseLoad($('bwIn').value); });
  [$('wIn'), $('aIn')].forEach(i => i.addEventListener('focus', () => i.select()));
  inner.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('saveBtn').click(); } }));
}
function updateLive() {
  const s = st();
  const btn = $('saveBtn');
  if (btn && LG.mode === 'entry' && !btn.disabled && LG.next) btn.textContent = LG.next.label;
  else if (btn && LG.mode === 'entry' && !btn.disabled) {
    const F = TR.FIELDS[LG.field];
    const load = s.weight > 0 ? ' @ ' + (s.assist ? 'BW−' : '') + L.fmtLoad(s.weight) + ' ' + s.unit : s.weight == null && F.needsLoad ? ' (enter a weight)' : '';
    btn.textContent = 'Log ' + (s.sets > 1 ? s.sets + ' × ' : '') + F.text(s.amount, TRO()) + (F.noun && s.sets === 1 ? ' ' + F.noun(s.amount) : '') + load;
  }
  // plates, for barbell-ish loads
  const pl = s.weight != null && s.weight >= L.BAR[s.unit] ? L.plateLoadout(s.weight, L.BAR[s.unit], L.PLATES[s.unit]) : null;
  $('plates').textContent = pl && pl.perSide.length
    ? 'Plates per side on a ' + L.BAR[s.unit] + ' ' + s.unit + ' bar: ' + pl.perSide.map(L.fmtLoad).join(' · ') + (Math.abs(pl.total - s.weight) > 1e-6 ? ' (= ' + L.fmtLoad(pl.total) + ')' : '')
    : '';
  // PR flag
  // The set as it stands, read the same way it will be saved. Rep sets compare with your best at that
  // rep count; others with your longest, farthest or heaviest.
  const probe = { exercise_id: LG.exId, unit: s.unit, weight: (s.assist ? -1 : 1) * (s.weight || 0), count_bodyweight: s.bw, is_warmup: s.warm,
    ...stepMeasures({}), [LG.field]: s.amount };
  const flag = $('prFlag'), live = LG.mode === 'entry' && !s.warm;
  if (probe.reps != null) {
    const prev = S.bests.get(L.bestKey(probe)), est = prev != null ? L.e1rm(prev, probe.reps) : null;
    flag.innerHTML = live && prev != null && probe.weight > prev ? '<div class="pr-flag">' + T.icons.pr + ' ' + esc(T.prFlag(probe.reps, L.fmtLoad(prev) + ' ' + s.unit)) + '</div>' : '';
    if ($('bestLine')) $('bestLine').innerHTML = prev != null ? '<p class="hint-line">Best at ' + probe.reps + ' reps: <b>' + esc(L.fmtLoad(prev) + ' ' + s.unit) + '</b>' +
      (est ? ' · estimated 1-rep max ' + esc(L.fmtLoad(Math.round(est))) + ' ' + s.unit : '') + '</p>' : '';
  } else {
    const beats = TR.featsOf(probe).some(([m, u, v]) => { const p = S.feats.get(TR.featKey(LG.exId, m, u)); return p != null && v > p; });
    flag.innerHTML = live && beats ? '<div class="pr-flag">' + T.icons.pr + ' A new best</div>' : '';
    const line = TR.featLine(LG.exId, S.feats, TRO());
    if ($('bestLine')) $('bestLine').innerHTML = line ? '<p class="hint-line">Your bests: <b>' + esc(line) + '</b></p>' : '';
  }
}
function refreshLoggerList() {
  const box = $('doneToday');
  if (!box || LG.mode !== 'entry') return;
  const sets = todaySets().filter(s => s.exercise_id === LG.exId);
  // Following a routine: once this step's sets are in, offer the next step.
  let next = '';
  const f = following();
  LG.next = null;
  if (f && LG.item) {
    const working = sets.filter(s => s.is_warmup !== true).length;
    const nextItem = nextItemOf(f.items, LG.item.id);
    // Step done: the big button moves on (to the next step, or to finishing), and one more set is a small link.
    if (working >= LG.item.sets) {
      LG.next = nextItem ? { id: nextItem.id, label: 'Next: ' + exName(nextItem.exercise_id) + ' →' } : { finish: true, label: T.finish };
      next = '<p class="hint-line">' + (nextItem ? 'Step done. ' : esc(T.routineDone) + ' ') + '<button class="linkbtn" data-again>Log another set of ' + esc(exName(LG.exId)) + '</button></p>';
    } else next = '<p class="hint-line">' + working + ' of ' + LG.item.sets + ' sets done for this step.</p>';
  }
  box.innerHTML = (sets.length
    ? '<div class="section-title">Today</div><div class="chips">' + sets.map(s => '<span class="chip' + (s._pr ? ' pr' : '') + (s.is_warmup ? ' warm' : '') + (unsaved(s) ? ' pending' : '') + '" data-edit="' + esc(s.id) + '">' + (s._pr ? T.icons.pr + ' ' : '') + esc(setText(s)) + '</span>').join('') + '</div>' +
      (next ? '' : '<button class="btn block" style="margin-top:14px" data-close>Done with ' + esc(exName(LG.exId)) + '</button>')
    : '') + next;
  updateLive();
}
inner.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.hasAttribute('data-close')) {
    if (LG.mode === 'plandesign' && PLD.dirty && !confirm('Leave without saving this plan?')) return;
    // On a workout page, back from picking exercises or blocks goes back to the workout.
    if (['pick', 'chunk'].includes(LG.mode) && sheet.querySelector('.sheet').classList.contains('page') && pageHome === 'design' && D.id && tplById(D.id)) return openDesigner(D.id);
    return closeSheet();
  }
  if (b.hasAttribute('data-change')) return openLogger();
  if (LG.mode === 'pick' && (b.dataset.pkMus != null || b.dataset.pkEq || b.dataset.pkMine != null)) {
    const f = LG.pf;
    if (b.dataset.pkMus != null) { f.mus = b.dataset.pkMus || null; if (!f.mus) { f.eq = null; f.mine = false; } }
    else if (b.dataset.pkEq) f.eq = f.eq === b.dataset.pkEq ? null : b.dataset.pkEq;
    else f.mine = !f.mine;
    $('pkFilters').innerHTML = libChips(f, 'pk');
    LG.pkAll = false;
    return drawResults($('exSearch').value);
  }
  if (LG.mode === 'exinfo' || LG.mode === 'libaddto' || LG.mode === 'newex') return libSheetClick(b);
  if (LG.mode === 'widget') return widgetSheetClick(b);
  if (b.dataset.pick && LG.multi) {
    const id = b.dataset.pick, i = LG.multi.indexOf(id);
    if (i >= 0) LG.multi.splice(i, 1); else LG.multi.push(id);
    vibrate(5);
    return syncTicks();   // in place: redrawing the whole list on every tap is what made it chug
  }
  if (b.dataset.pkKind) return setPickKind(b.dataset.pkKind === 'c');
  if (b.hasAttribute('data-pk-all')) { LG.pkAll = true; return drawResults($('exSearch').value); }
  if (b.hasAttribute('data-add-selected')) { b.disabled = true; return LG.pickFor(LG.multi.slice()); }
  if (b.dataset.pick) return LG.pickFor ? LG.pickFor(b.dataset.pick) : openEntry(b.dataset.pick);
  if (b.dataset.nextItem) { const it = S.itemsById.get(b.dataset.nextItem); return it && openEntry(it.exercise_id, null, it); }
  if (b.dataset.add) return addExercise(b.dataset.add, b);
  if (b.dataset.start) return startFollowing(b.dataset.start);
  if (b.dataset.addToday) return startFollowing(b.dataset.addToday, true);
  if (b.dataset.cardioNew) return openCardio(b.dataset.cardioNew);
  if (LG.mode === 'cardio') return cardioClick(b);
  if (LG.mode === 'chunk') return chunkClick(b);
  if (LG.mode === 'recap') return recapClick(b);
  if (LG.mode === 'wizard') return wizardClick(b);
  if (LG.mode === 'newpick') return newPickClick(b);
  if (LG.mode === 'addtoday') return;
  if (LG.mode === 'gen') return genClick(b);
  if (LG.mode === 'starters') return starterClick(b);
  if (LG.mode === 'progdesign') return programDesignerClick(b);
  if (LG.mode === 'plandesign') return planDesignerClick(b);
  if (LG.mode === 'seasonstart') return seasonStartClick(b);
  if (LG.mode === 'seasonprog') return seasonProgClick(b);
  if (LG.mode === 'program') return programClick(b);
  if (LG.mode === 'pickwk') return pickWkClick(b);
  if (LG.mode === 'sched') return schedClick(b);
  if (LG.mode === 'use') return useClick(b);
  if (LG.mode === 'design') return designerClick(b);
  if (LG.mode === 'season') return seasonClick(b);
  if (LG.mode !== 'entry' && LG.mode !== 'edit') return;
  if (b.dataset.restPick) return pickRest(b);
  const s = st();
  if (b.dataset.unit && b.dataset.unit !== s.unit) {
    const factor = b.dataset.unit === 'kg' ? 1 / L.LB_PER_KG : L.LB_PER_KG;
    if (s.weight != null) s.weight = Math.round(s.weight * factor * 2) / 2;
    if (s.bodyweight != null) s.bodyweight = Math.round(s.bodyweight * factor * 2) / 2;
    s.unit = b.dataset.unit;
    syncInputs(); updateLive(); return;
  }
  if (b.dataset.w) { LG.next = null; s.weight = Math.max(0, Math.round(((s.weight || 0) + Number(b.dataset.w) * (s.unit === 'kg' ? 2.5 : 5)) * 4) / 4); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.nudge) { LG.next = null; s.weight = Math.min(2000, Math.max(0, Math.round(((s.weight || 0) + Number(b.dataset.nudge)) * 4) / 4)); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.a) { LG.next = null; const F = TR.FIELDS[LG.field]; s.amount = F.clamp(Number(s.amount) + Number(b.dataset.a) * F.step(TRO())); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.rpe) { const v = Number(b.dataset.rpe); s.rpe = s.rpe === v ? null : v; syncInputs(); return; }
  if (b.dataset.carry) { prefs.carryUnit = b.dataset.carry; savePrefs(); syncInputs(); updateLive(); return; }
  if (b.dataset.n) { LG.next = null; s.sets = Math.max(1, Math.min(20, s.sets + Number(b.dataset.n))); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.t) {
    const t = b.dataset.t;
    if (t === 'assist') {   // assisted is a bodyweight set with help taken off
      s.assist = !s.assist;
      if (s.assist && !s.bw) { s.bw = true; $('bwRow').hidden = false; inner.querySelector('[data-t="bw"]').setAttribute('aria-pressed', true); if ($('bwIn').value === '') $('bwIn').focus(); }
      syncInputs(); updateLive(); return;
    }
    if (t === 'bw') { s.bw = !s.bw; $('bwRow').hidden = !s.bw; if (s.bw && $('bwIn').value === '') $('bwIn').focus(); if (!s.bw && s.assist) { s.assist = false; syncInputs(); updateLive(); } }
    if (t === 'warm') { s.warm = !s.warm; updateLive(); }
    if (t === 'note') { s.showNote = !s.showNote; $('noteRow').hidden = !s.showNote; if (s.showNote) $('noteIn').focus(); }
    b.setAttribute('aria-pressed', t === 'bw' ? s.bw : t === 'warm' ? s.warm : s.showNote);
    return;
  }
  if (b.id === 'saveBtn' && LG.next) {
    const n = LG.next;
    LG.next = null;
    if (n.finish) return openRecap();
    const it = S.itemsById.get(n.id);
    return it && openEntry(it.exercise_id, null, it);
  }
  if (b.hasAttribute('data-again')) { LG.next = null; s.sets = 1; syncInputs(); updateLive(); return saveEntry($('saveBtn')); }
  if (b.id === 'saveBtn') return saveEntry(b);
  if (b.id === 'delBtn') { const s0 = LG.editing; sheet.close(); return removeSet(s0, false); }
});

// The whole record, read from the boxes the exercise's fields put on screen: the weight, the main
// field, any other fields under More, and effort. Every measure is in the record (null if unused).
function readForm() {
  const s = st(), o = TRO(), F = TR.FIELDS[LG.field];
  let weight = L.parseLoad($('wIn').value);
  const amount = F.read($('aIn').value, o);
  const bodyweight = s.bw ? L.parseLoad($('bwIn').value) : null;
  if (weight == null) { if (F.needsLoad) throw new Error('Enter a weight. Use 0 for bodyweight moves.'); weight = 0; }
  if (weight < 0 || weight > 2000) throw new Error('Enter a weight between 0 and 2000.');
  if (amount == null) throw new Error(F.error);
  if (s.bw && !(bodyweight >= 1 && bodyweight <= 1000)) throw new Error('Enter your bodyweight to count it.');
  if (s.assist && weight > bodyweight) throw new Error('The help can’t be more than your bodyweight.');
  const rec = { ...stepMeasures({}), [LG.field]: amount };
  for (const f of Object.keys(s.extra)) {
    const box = $('x_' + f), text = box ? box.value.trim() : '';
    if (!text) continue;
    const v = TR.FIELDS[f].read(text, o);
    if (v == null) throw new Error(TR.FIELDS[f].error);
    rec[f] = v;
  }
  const note = $('noteIn') ? $('noteIn').value.trim() : '';
  return { weight: s.assist ? -weight : weight, ...rec, rpe: s.rpe, unit: s.unit, count_bodyweight: s.bw, bodyweight: s.bw ? bodyweight : null,
    is_warmup: s.warm, notes: s.showNote && note ? note : null };
}
async function saveEntry(btn) {
  $('formErr').textContent = '';
  let fields;
  try { fields = readForm(); } catch (x) { $('formErr').textContent = x.message; return; }
  btn.disabled = true;
  try {
    if (LG.mode === 'edit') {
      const old = LG.editing;
      const patch = { ...fields, exercise_id: old.exercise_id, performed_on: $('dateIn').value || old.performed_on };
      sheet.close();
      editSet(old, patch);   // shows at once, saves in the background (put back with a message if refused)
      render();
      toast('Saved');
    } else {
      const n = Math.max(1, Math.min(20, parseInt(($('nIn') || {}).value, 10) || st().sets || 1));
      const item = LG.item;
      const saved = await logSets({ exercise_id: LG.exId, ...fields }, n);
      afterLogToast(saved);
      // Done: back to today. A running rest timer moves out of the sheet with you; a routine step
      // with a rest time starts its own.
      const timing = REST.el && !REST.el.hidden;
      sheet.close(); render();
      if (!(item && fields.is_warmup !== true && restAfterStep(item)) && timing) restEl();
    }
  } catch (x) { $('formErr').textContent = x.message; btn.disabled = false; }
}
function openEditor(set) { if (set) openEntry(set.exercise_id, set); }

async function addExercise(name, btn) {
  btn.disabled = true;
  try {
    const e = await store.addExercise(name.trim().replace(/\s+/g, ' '));
    S.exercises.push(e); S.byId.set(e.id, e);
    toast('Added “' + e.name + '” to the catalogue');
    if (LG.multi) { LG.multi.push(e.id); $('exSearch').value = ''; drawResults(''); }
    else if (LG.pickFor) LG.pickFor(e.id); else openEntry(e.id);
  } catch (x) { fail(x); btn.disabled = false; }
}

// ===========================================================================
// Routines: yours, ones you subscribe to (they follow the owner's edits), and
// ones the other person shares. Follow one and the Log tab becomes a checklist.
// ===========================================================================
function setRoutines(r) {
  S.templates = r.templates; S.items = r.items; S.subs = r.subs;
  S.itemsById = new ItemMap(r.items.map(i => [i.id, i]));
}
// A routine's rows, as stored. A row is an exercise, or (in a workout) a link to a block.
const rawItems = id => (itemsByTpl().get(id) || []).slice().sort((a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id)));
// A linked block's steps, standing in for the link: ids are "<link id>~<block step id>", so
// following, logging and counting work as if they were the workout's own. Edits go to the block.
function linkedSteps(ref) {
  if (!tplById(ref.block_id)) return [];   // deleted, or no longer shared with you
  const list = rawItems(ref.block_id).filter(b => !b.block_id);
  return list.map((b, k) => ({ ...b, id: ref.id + '~' + b.id, template_id: ref.template_id, position: ref.position, _ref: ref.id, _block: ref.block_id, with_next: !!b.with_next && k < list.length - 1 }));
}
// The steps you do, in order, with linked blocks opened out.
const routineItems = id => rawItems(id).flatMap(it => (it.block_id ? linkedSteps(it) : [it]));
// itemsById also finds a linked block's steps by their "<link>~<step>" id.
class ItemMap extends Map {
  get(id) {
    const v = super.get(id);
    if (v || typeof id !== 'string' || !id.includes('~')) return v;
    const ref = super.get(id.split('~')[0]);
    return ref && ref.block_id ? linkedSteps(ref).find(x => x.id === id) : undefined;
  }
}
const linksTo = blockId => S.items.filter(i => i.block_id === blockId);
const usedInCount = blockId => new Set(linksTo(blockId).map(i => i.template_id)).size;
// Supersets: a step with with_next is done back and forth with the step after it (in the same
// routine part). groupOf gives the run a step belongs to; ssLabels names the runs A1, A2, B1…
function groupRuns(items) {
  const runs = [];
  for (let i = 0; i < items.length; i++) {
    const run = [items[i]];
    while (items[i].with_next && i + 1 < items.length && !items[i].block_id && !items[i + 1].block_id &&
      items[i + 1].template_id === items[i].template_id && (items[i + 1]._ref || null) === (items[i]._ref || null)) run.push(items[++i]);
    runs.push(run);
  }
  return runs;
}
function ssLabels(items) {
  const out = new Map();
  let letter = 0;
  for (const run of groupRuns(items)) if (run.length > 1) { const L1 = String.fromCharCode(65 + (letter++ % 26)); run.forEach((it, k) => out.set(it.id, L1 + (k + 1))); }
  return out;
}
// The step to do next: the first unfinished one, and inside a superset whichever has the fewest
// sets done (so you go back and forth). skip: a step to leave out (the one you just finished).
function nextItemOf(items, skip) {
  const left = it => stepDone(it) < it.sets && (!skip || it.id !== skip);
  const first = items.find(left);
  if (!first) return null;
  const run = groupRuns(items).find(r => r.includes(first)).filter(left);
  return run.reduce((a, b) => (stepDone(b) < stepDone(a) ? b : a), run[0]);
}
const isMine = t => t.created_by === S.myId;
const isBlock = t => t.kind === 'block';
const ownerName = t => (isMine(t) ? 'you' : S.names.get(t.created_by) || 'a friend');
const subFor = id => S.subs.find(s => s.template_id === id);

// Today's routine: one or more workouts and blocks, done in the order you added them. Kept in this
// browser and forgotten tomorrow.
function followIds() {
  if (FOLLOW.ids) return FOLLOW.ids;
  let f = null;
  try { f = JSON.parse(localStorage.getItem('lift.follow') || 'null'); } catch (e) {}
  if (!f || f.day !== today()) return taskMemo(FOLLOW, 'ids', []);
  return taskMemo(FOLLOW, 'ids', (f.ids || (f.id ? [f.id] : [])).filter(id => tplById(id)));
}
function saveFollow(ids) {
  FOLLOW.ids = FOLLOW.v = undefined;
  try { if (ids.length) localStorage.setItem('lift.follow', JSON.stringify({ ids, day: today() })); else localStorage.removeItem('lift.follow'); } catch (e) {}
}
function following() {
  if (FOLLOW.v !== undefined) return FOLLOW.v;
  const templates = followIds().map(tplById).filter(t => routineItems(t.id).length);
  if (!templates.length) return taskMemo(FOLLOW, 'v', null);
  return taskMemo(FOLLOW, 'v', { template: { id: templates[0].id, name: templates.map(t => t.name).join(' + ') }, templates, ids: templates.map(t => t.id),
    items: templates.flatMap(t => routineItems(t.id)) });
}
// How many of a step's sets are in today. When the same lift is in two parts of today's routine,
// the earlier step takes its sets first and the later one gets the rest.
function stepDone(item) {
  let left = todaySets().filter(s => s.exercise_id === item.exercise_id && s.is_warmup !== true).length;
  const f = following(), same = f ? f.items.filter(it => it.exercise_id === item.exercise_id) : [];
  if (!same.some(it => it.id === item.id)) return left;
  for (const it of same) {
    if (it.id === item.id) return it === same[same.length - 1] ? left : Math.min(left, it.sets);
    left = Math.max(0, left - it.sets);
  }
  return left;
}
// Start a routine for today, or (add) put it after what you're already doing.
function startFollowing(id, add) {
  const t = tplById(id);
  if (!t) return;
  prefetchLast(routineItems(t.id).map(it => it.exercise_id));
  const cur = add ? followIds() : [];
  const adding = add && cur.length && !cur.includes(id);
  saveFollow(add ? (cur.includes(id) ? cur : cur.concat(id)) : [id]);
  if (sheet.open) { flushSaves(); sheet.close(); }
  if (location.hash !== '#log') location.hash = '#log'; else render();
  toast(adding ? 'Added ' + t.name + ' to today.' : 'Following ' + t.name + '. Tap a step to start.');
}
function unfollow(id) { saveFollow(followIds().filter(x => x !== id)); render(); }
function stopFollowing() { saveFollow([]); render(); }
// Pick a workout or block to add to today's routine.
function openAddToday() {
  LG.mode = 'addtoday';
  const have = new Set(followIds());
  const list = S.templates.filter(t => routineItems(t.id).length && !have.has(t.id))
    .sort((a, b) => Number(isBlock(a)) - Number(isBlock(b)) || Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name));
  const row = t => '<li><button data-add-today="' + esc(t.id) + '"><span>' + esc(t.name) + '</span><small>' +
    esc(routineItems(t.id).map(it => exName(it.exercise_id)).slice(0, 4).join(', ') + (routineItems(t.id).length > 4 ? '…' : '')) + '</small></button></li>';
  const ws = list.filter(t => !isBlock(t)), bs = list.filter(isBlock);
  inner.innerHTML = '<div class="sheet-head"><h2 id="sheetTitle">Add to today</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><p class="hint-line" style="margin-top:0">It goes after what you’re already doing.</p>' +
      (bs.length ? '<div class="section-title">Blocks</div><ul class="results">' + bs.map(row).join('') + '</ul>' : '') +
      (ws.length ? '<div class="section-title">Workouts</div><ul class="results">' + ws.map(row).join('') + '</ul>' : '') +
      (list.length ? '' : '<p class="muted">Nothing else to add yet. Make a workout or a block on the Routines tab.</p>') + '</div>';
  openSheet();
}
function followCard() {
  const f = following();
  if (!f) return '';
  prefetchLast(f.items.map(it => it.exercise_id));
  const nx = nextItemOf(f.items), nextIdx = nx ? f.items.indexOf(nx) : -1, labels = ssLabels(f.items);
  const done = f.items.filter(it => stepDone(it) >= it.sets).length;
  const multi = f.templates.length > 1, firstOf = new Map(f.templates.map(t => [routineItems(t.id)[0].id, t]));
  return '<section class="card follow"><div class="row"><div><div class="date">Today’s routine</div><h2>' + esc(f.template.name) + '</h2></div>' +
      '<span class="muted num">' + done + ' / ' + f.items.length + '</span></div>' +
    '<div class="bar" style="margin-top:10px;--p:' + (f.items.length ? (done / f.items.length) * 100 : 0) + '%"><i></i></div>' +
    '<ol class="steps">' + f.items.map((it, i) => {
      const part = multi && firstOf.get(it.id);
      const head = part ? '<li class="step-part"><span>' + (isBlock(part) ? 'Block · ' : '') + esc(part.name) + '</span>' +
        '<button class="linkbtn" data-unfollow="' + esc(part.id) + '" aria-label="Take ' + esc(part.name) + ' out of today">Remove</button></li>' : '';
      const d = stepDone(it), full = d >= it.sets;
      const tg = full ? null : suggestFor(it);
      const quick = tg && tg.weight != null ? '<button class="quick" data-quick-item="' + esc(it.id) + '" aria-label="Log set ' + (d + 1) + ' of ' + it.sets + ': ' + TR.FIELDS[tg.field].text(tg.target, TRO()) + (TR.FIELDS[tg.field].noun ? ' ' + TR.FIELDS[tg.field].noun(tg.target) : '') + (tg.weight > 0 ? ' at ' + esc(L.fmtLoad(tg.weight)) + ' ' + tg.unit : ', bodyweight') + '">✓</button>' : '';
      const ss = labels.get(it.id);
      return head + '<li class="step-row' + (ss ? ' ss' + (ss.endsWith('1') ? ' ss-first' : '') : '') + '"><button class="step' + (full ? ' done' : i === nextIdx ? ' next' : '') + '" data-follow-item="' + esc(it.id) + '">' +
        '<span class="tick" aria-hidden="true">' + (full ? '✓' : ss || i + 1) + '</span>' +
        '<span class="what"><b>' + esc(exName(it.exercise_id)) + '</b><small>' + esc(myStepText(it)) + '</small></span>' +
        '<span class="count num">' + Math.min(d, it.sets) + '/' + it.sets + '</span></button>' + quick + '</li>';
    }).join('') + '</ol>' +
    (nextIdx < 0 && f.items.length ? '<div class="pr-flag" style="animation:none">' + esc(T.routineDone) + '</div>' + (unfinished() ? '<button class="btn primary block" style="margin-top:10px" data-recap>' + esc(T.finish) + '</button>' : '')
      : '<p class="hint-line">Tap ✓ after each set to log it as planned, or tap the step to change the weight or reps first.</p>' + restRow()) +
    '<div class="actions"><button class="btn" data-log-other>+ Other exercise</button><button class="btn" data-add-today-pick>+ Block or workout</button><button class="btn ghost" data-stop-follow>Stop</button></div></section>';
}

// A routine's first five steps as chips, then "+N more", so a long routine stays one short card.
function chipsOf(tid) {
  const items = routineItems(tid);
  return items.slice(0, 5).map(it => '<span class="chip">' + esc(exName(it.exercise_id)) + ' <small>' + esc(stepText(it)) + '</small></span>').join('') +
    (items.length > 5 ? '<span class="chip muted">+' + (items.length - 5) + ' more</span>' : '');
}
// Each list on Rites shows six, with "Show all" for the rest; a search box appears once there are lots.
const RT_SHOW = 6;
function rtList(key, list, draw) {
  const all = !!S.rtQuery || (S.rtAll && S.rtAll.has(key)), shown = all ? list : list.slice(0, RT_SHOW);
  return shown.map(draw).join('') + (shown.length < list.length ? '<button class="btn block rt-more" data-rt-all="' + key + '">Show all ' + list.length + '</button>' : '');
}
const rtMatch = t => !S.rtQuery || (t.name + ' ' + routineItems(t.id).map(it => exName(it.exercise_id)).join(' ')).toLowerCase().includes(S.rtQuery.toLowerCase());
function renderRoutines() {
  const everyone = S.templates.filter(rtMatch);
  const workouts = everyone.filter(t => !isBlock(t)), blocks = everyone.filter(isBlock);
  const mine = workouts.filter(isMine);
  const subscribed = workouts.filter(t => !isMine(t) && subFor(t.id));
  const shared = workouts.filter(t => !isMine(t) && !subFor(t.id));
  const f = following();
  const start = t => !routineItems(t.id).length ? '' : f && f.ids.includes(t.id) ? '<button class="btn" disabled>Today ✓</button>'
    : f ? '<button class="btn primary" data-add-today="' + esc(t.id) + '">+ Add to today</button>'
    : '<button class="btn primary" data-start="' + esc(t.id) + '">Start</button>';
  // Every card has the same buttons: Start (or add to today), Edit when it's yours, and More, which
  // holds everything else you can do with it (schedule, subscribe, copy, link, new workout from a block).
  const card = t => {
    return '<section class="card routine' + (isBlock(t) ? ' block' : '') + '" id="rt-' + esc(t.id) + '"><div class="row"><h3>' + esc(t.name) + '</h3>' +
      (isMine(t) ? (t.is_shared ? '<span class="tag">Shared</span>' : '') : '<span class="tag">by ' + esc(ownerName(t)) + (subFor(t.id) ? ' · subscribed' : '') + '</span>') + '</div>' +
    (t.notes ? '<p class="muted" style="margin:6px 0 0">' + esc(t.notes) + '</p>' : '') +
    '<div class="chips">' + (chipsOf(t.id) || '<span class="muted">No exercises yet</span>') + '</div>' +
    '<div class="actions">' + start(t) + (isMine(t) ? '<button class="btn" data-design="' + esc(t.id) + '">Edit</button>' : '') +
      '<button class="btn ghost" data-use="' + esc(t.id) + '" aria-label="More for ' + esc(t.name) + '">More ▾</button></div></section>';
  };
  view.innerHTML =
    '<div class="row page-actions"><h2 style="font-size:28px">' + esc(T.titles.routines) + '</h2><span class="head-actions"><button class="btn" data-starters>📚 Starters</button><button class="btn primary" data-new-any>+ New</button></span></div>' +
    (S.rtQuery ? '' : weekCard() + programsSection()) +
    (S.templates.length > 8 ? '<input class="search rt-search" id="rtSearch" type="search" placeholder="Find a workout or block by name or exercise" autocomplete="off" aria-label="Find a workout or block" value="' + esc(S.rtQuery || '') + '">' : '') +
    (S.rtQuery && !everyone.length ? '<section class="card"><p class="muted" style="margin:0">Nothing matches “' + esc(S.rtQuery) + '”.</p></section>' : '') +
    (S.rtQuery && !mine.length ? '' : '<h3 class="section-title">Workouts</h3>') +
    (mine.length ? rtList('mine', mine, card)
      : S.rtQuery ? '' : '<section class="card empty"><h2>No workouts yet.</h2><p class="muted">Tap <b>+ New</b> to build one from the library, or subscribe to one the crew shares.</p></section>') +
    (subscribed.length ? '<h3 class="section-title">Subscribed</h3>' + rtList('subs', subscribed, card) : '') +
    (shared.length ? '<h3 class="section-title">Shared by the crew</h3><p class="hint-line" style="margin-top:-4px">Try one with Start, or <b>More › Subscribe</b> to keep it.</p>' + rtList('shared', shared, card) : '') +
    (S.rtQuery && !blocks.length ? '' : '<h3 class="section-title">Blocks</h3><p class="hint-line" style="margin-top:-4px">Small chunks you reuse, like “Bench & triceps”. Drop one into a workout with <b>+ Blocks</b> in the workout editor.</p>') +
    (blocks.length ? rtList('blocks', blocks.sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name)), card)
      : S.rtQuery ? '' : '<section class="card"><p class="muted" style="margin:0">No blocks yet. Tap <b>+ New</b> › A block to make one.</p></section>');
}
view.addEventListener('input', e => {
  if (e.target.id !== 'libSearch') return;
  S.lib.q = e.target.value.trim(); S.libAll = false;
  $('libList').innerHTML = libListHtml();
});
// Typing in the Rites search box filters as you go, keeping the box focused.
view.addEventListener('input', e => {
  if (e.target.id !== 'rtSearch') return;
  S.rtQuery = e.target.value.trim();
  const at = e.target.selectionStart;
  renderRoutines();
  const box = $('rtSearch');
  if (box) { box.focus(); try { box.setSelectionRange(at, at); } catch (x) {} }
});
// A name from what's in it: "Bench Press + Rows", "+ 2 more" when there's more.
const shortName = id => exName(id).replace(/^(Barbell|Dumbbell|Cable|Machine|Seated|Standing) /, '');
function nameFrom(exIds) {
  const u = [...new Set(exIds)];
  if (!u.length) return 'New workout';
  return (u.slice(0, 2).map(shortName).join(' + ') + (u.length > 2 ? ' + ' + (u.length - 2) + ' more' : '')).slice(0, 60);
}
const DEFAULT_NAMES = new Set(['New workout', 'New block', 'Untitled routine']);
async function autoName(tid) {
  const t = S.templates.find(x => x.id === tid);
  if (!t || !DEFAULT_NAMES.has(t.name)) return;
  const name = nameFrom(routineItems(tid).map(i => i.exercise_id));
  if (DEFAULT_NAMES.has(name)) return;
  try { Object.assign(t, await store.updateRoutine(tid, { name })); } catch (x) { return; }
  const inp = $('rtName'); if (inp && D.id === tid) inp.value = t.name;
}
// What you usually do for a lift: your typical number of working sets per session and most common reps.
function usualFor(exId) {
  const sets = recentOf(exId).filter(x => x.is_warmup !== true);
  if (!sets.length) return { sets: 3, unit: prefs.unit };
  const perDay = new Map();
  for (const x of sets) perDay.set(x.performed_on, (perDay.get(x.performed_on) || 0) + 1);
  const counts = [...perDay.values()].sort((a, b) => a - b);
  // Your most common value of each measure (reps, time, distance), where you've logged it.
  const common = f => { const c = new Map(); for (const x of sets) if (x[f] != null) c.set(Number(x[f]), (c.get(Number(x[f])) || 0) + 1); const top = [...c].sort((a, b) => b[1] - a[1])[0]; return top ? top[0] : null; };
  return { sets: Math.min(10, Math.max(1, counts[Math.floor(counts.length / 2)])), ...Object.fromEntries(TR.MEASURES.map(f => [f, common(f)])), unit: sets[0].unit };
}
async function newRoutine(btn, kind) {
  if (btn) btn.disabled = true;
  try {
    const t = await store.addRoutine({ name: kind === 'block' ? 'New block' : 'New workout', kind: kind || 'workout' });
    S.templates.push(t);
    openDesigner(t.id);
    openPicker('Add to ' + t.name, ids => addItemsTo(t.id, ids), true);   // the name fills itself in from what you add
  } catch (x) { fail(x); } finally { if (btn) btn.disabled = false; }
}
async function copySteps(fromIds, tid) {
  let pos = Math.max(0, ...rawItems(tid).map(i => i.position));
  await putItems(fromIds.map(id => S.itemsById.get(id)).filter(Boolean).map(src => ({ template_id: tid, exercise_id: src.exercise_id, position: ++pos, sets: src.sets, ...stepMeasures(src),
    ...loadFor(src), unit: src.unit, rest_s: src.rest_s ?? null, note: src.note ?? null, with_next: !!src.with_next })));
}
// Link a block into a workout (at the end, or at a position): it stays one block, so changing the
// block changes it here too. Sharing the workout shares your block with it, so the crew can see it.
async function linkBlock(blockId, tid, at) {
  const w = tplById(tid), blk = tplById(blockId);
  if (!w || !blk || isBlock(w)) return copySteps(routineItems(blockId).map(i => i.id), tid);
  if (w.is_shared && isMine(blk) && !blk.is_shared) { await store.updateRoutine(blk.id, { is_shared: true }); blk.is_shared = true; }
  const rows = rawItems(tid);
  const pos = at == null ? Math.max(0, ...rows.map(i => i.position)) + 1 : at;
  if (at != null) await shiftFrom(tid, at);
  await putItems([{ template_id: tid, block_id: blockId, exercise_id: null, position: Math.min(100, pos), sets: 1, reps: 1, load_mode: 'last', load_value: 0, unit: 'lb' }]);
}
// Make room at a position: every row from there on moves down one.
async function shiftFrom(tid, at) {
  await Promise.all(rawItems(tid).filter(x => x.position >= at).map(later => store.updateItem(later.id, { position: Math.min(100, later.position + 1) }).then(r => Object.assign(later, r))));
}
// Unlink: the block's steps are copied into the workout where the link was, so you can change
// them here without changing the block.
async function unlinkBlock(refId) {
  const ref = S.itemsById.get(refId);
  if (!ref || !ref.block_id) return;
  const steps = linkedSteps(ref), tid = ref.template_id;
  const rows = rawItems(tid), after = rows.filter(x => x.position > ref.position);
  if (rows.length - 1 + steps.length > 100) return toast('That would be more than 100 steps.');
  // Renumber: everything after the link moves down to make room for the copied steps.
  await Promise.all(after.map((x, k) => store.updateItem(x.id, { position: Math.min(100, ref.position + steps.length + k) }).then(r => Object.assign(x, r))));
  await putItems(steps.map((b, k) => ({ template_id: tid, exercise_id: b.exercise_id, position: Math.min(100, ref.position + k), sets: b.sets, ...stepMeasures(b),
    ...loadFor(b), unit: b.unit, rest_s: b.rest_s ?? null, note: b.note ?? null, with_next: !!b.with_next })));
  await store.removeItem(ref.id);
  S.items = S.items.filter(x => x.id !== ref.id);
}
async function workoutFromBlock(blockId, btn) {
  const b = S.templates.find(t => t.id === blockId);
  btn.disabled = true;
  try {
    const t = await store.addRoutine({ name: (b.name + ' day').slice(0, 60), kind: 'workout' });
    S.templates.push(t);
    await linkBlock(blockId, t.id);
    toast('Started a workout from “' + b.name + '”. It stays linked: change the block and this changes too.');
    openDesigner(t.id, true);
  } catch (x) { fail(x); btn.disabled = false; }
}

// ----- workout days: put a workout on a date, and it's waiting on the Log tab that day -----
const dayLabel = d => (d === today() ? 'Today' : d === L.addDays(today(), 1) ? 'Tomorrow' : fmtDay(d));
const todaysDays = () => (S.wdays || []).filter(d => d.on_date === today() && tplById(d.template_id));
// What's on for today, one answer everywhere (the Log tab, the Calendar, Routines › Coming up):
// what you're following, then workouts put on today's date, then today's pick from your week or a
// season's plan.
function todayList() {
  const out = [], seen = new Set();
  const add = (tid, why, extra) => { if (!seen.has(tid) && tplById(tid)) { seen.add(tid); out.push({ tid, why, ...extra }); } };
  const f = following();
  if (f) f.ids.forEach(id => add(id, 'following now', { following: true }));
  const pt = planToday();
  if (pt && pt.tid) add(pt.tid, pt.p.name + ', week ' + pt.week + (pt.phase ? ' · ' + pt.phase.name : ''));
  todaysDays().forEach(d => add(d.template_id, 'on the calendar', { wday: d }));
  const tp = pt ? null : todaysPlan();   // a plan you're following replaces your week
  if (tp && tp.entry) add(tp.entry.template_id, (isCore(tp.season) ? 'your week' : tp.season.name) + ', ' + tp.why);
  return out;
}
const todayRow = x => '<div class="row day-row"><span><b>Today</b> · ' + esc(tplById(x.tid).name) + ' <small class="muted">· ' + esc(x.why) + '</small></span><span>' +
  (x.following ? '<span class="tag">Now</span>' : '<button class="btn primary sm" data-start="' + esc(x.tid) + '">Start</button>') +
  (x.wday ? '<button class="iconbtn sm" data-unday="' + esc(x.wday.id) + '" aria-label="Take ' + esc(tplById(x.tid).name) + ' off today">✕</button>' : '') + '</span></div>';
// More: everything you can do with a routine, in one list, the same for every card.
function openUseMenu(tid) {
  const t = tplById(tid);
  if (!t) return;
  LG.mode = 'use';
  const has = routineItems(t.id).length, sub = subFor(t.id), f = following(), today_ = f && f.ids.includes(t.id);
  const opt = (attr, icon, title, sub_) => '<li><button ' + attr + '><span>' + icon + ' ' + esc(title) + '</span><small>' + esc(sub_) + '</small></button></li>';
  const id = esc(t.id);
  inner.innerHTML = '<div class="sheet-head"><div><small class="muted">' + (isBlock(t) ? 'Block' : 'Workout') + (isMine(t) ? '' : ' · by ' + esc(ownerName(t))) + '</small><h2 id="sheetTitle">' + esc(t.name) + '</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><ul class="results use-menu">' +
      (has && !today_ ? opt(f ? 'data-add-today="' + id + '"' : 'data-start="' + id + '"', '▶', f ? 'Add to today' : 'Start today', f ? 'After what you’re already doing' : 'Follow it on the Log tab') : '') +
      (has ? opt('data-use-sched="' + id + '"', '📅', 'Schedule', isBlock(t) ? 'Put it on a day' : 'Every week, or just once on a day') : '') +
      (isMine(t) ? opt('data-design="' + id + '"', '✎', 'Edit', 'Steps, sets, reps, weight') : '') +
      (isBlock(t) && has ? opt('data-from-block="' + id + '"', '＋', 'New workout from it', 'Linked: change the block and the workout changes too') : '') +
      (!isMine(t) && !isBlock(t) ? (sub ? opt('data-unsub="' + esc(sub.id) + '"', '✕', 'Unsubscribe', 'Take it off your list') : opt('data-sub="' + id + '"', '★', 'Subscribe', 'Keep it on your list; it follows ' + ownerName(t) + '’s edits')) : '') +
      opt('data-copy="' + id + '"', '⧉', isMine(t) ? 'Duplicate' : 'Make my own copy', isMine(t) ? 'A copy to change' : 'Yours to change; their edits won’t reach it') +
      (t.is_shared || !isMine(t) ? opt('data-link="r-' + id + '"', '🔗', 'Copy link', 'Send it to someone in the crew') : '') +
    '</ul></div>';
  openSheet();
}
function useClick(b) {
  if (b.dataset.useSched) return openScheduleSheet(b.dataset.useSched);
  if (b.dataset.design) return openDesigner(b.dataset.design);
  sheet.close();
  if (b.dataset.fromBlock) workoutFromBlock(b.dataset.fromBlock, b);
  else if (b.dataset.sub) subscribeTo(b.dataset.sub, b);
  else if (b.dataset.unsub) unsubscribeFrom(b.dataset.unsub, b);
  else if (b.dataset.copy) copyRoutine(b.dataset.copy, b);
  else if (b.dataset.link) copyLink(b.dataset.link);
}
// The coming days: workouts put on a date after today.
function comingRows() {
  return (S.wdays || []).filter(d => d.on_date > today() && tplById(d.template_id)).slice(0, 10).map(d => {
    const t = tplById(d.template_id);
    return '<div class="row day-row"><span><b>' + esc(dayLabel(d.on_date)) + '</b> · ' + esc(t.name) + '</span><span>' +
      '<button class="iconbtn sm" data-unday="' + esc(d.id) + '" aria-label="Take ' + esc(t.name) + ' off ' + esc(dayLabel(d.on_date)) + '">✕</button></span></div>';
  }).join('');
}
function dayCard() {
  if (following()) return '';
  return todaysDays().map(d => {
    const t = tplById(d.template_id);
    const done = matchRoutine([{ template_id: t.id }], today()) >= 0;
    return '<section class="card plan-card"><div class="date">On the schedule</div>' +
      '<div class="row" style="margin-top:4px"><h2>' + esc(t.name) + (done ? ' ✓' : '') + '</h2><button class="btn primary" data-start="' + esc(t.id) + '">' + (done ? 'Again' : 'Start') + '</button></div>' +
      '<div class="chips">' + routineItems(t.id).map(it => '<span class="chip">' + esc(exName(it.exercise_id)) + ' <small>' + esc(stepText(it)) + '</small></span>').join('') + '</div></section>';
  }).join('');
}
async function removeDay(id, btn) {
  btn.disabled = true;
  try { await store.removeWorkoutDay(id); S.wdays = S.wdays.filter(d => d.id !== id); render(); toast('Taken off the schedule'); }
  catch (x) { fail(x); btn.disabled = false; }
}
const SD = { id: null };
function openScheduleSheet(tid) {
  LG.mode = 'sched'; SD.id = tid;
  drawSchedule();
  openSheet();
}
function drawSchedule() {
  const t = tplById(SD.id);
  const on = d => (S.wdays || []).find(x => x.template_id === SD.id && x.on_date === d);
  const days = Array.from({ length: 21 }, (_, i) => L.addDays(today(), i));
  const later = (S.wdays || []).filter(x => x.template_id === SD.id && x.on_date > days[days.length - 1]);
  inner.innerHTML =
    '<div class="sheet-head"><div><small class="muted">Schedule</small><h2 id="sheetTitle">' + esc(t.name) + '</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><p class="hint-line" style="margin-top:0">On the day it’s waiting at the top of Log, ready to follow.</p>' +
      (isBlock(t) ? '' : weekPickHtml(t.id, 'Every week') + '<div class="field-label" style="margin-top:14px"><span>Just once</span></div>') +
      '<div class="cal">' + days.map(d => {
        const dt = L.parseDate(d);
        return '<button type="button" data-sched-day="' + d + '" aria-pressed="' + !!on(d) + '"><small>' + (d === today() ? 'Today' : L.fmtDate(dt, { weekday: 'short' })) + '</small><b>' + dt.getDate() + '</b></button>';
      }).join('') + '</div>' +
      '<div class="goal-add plan-add" style="margin-top:12px"><input class="plain-input" id="schedDate" type="date" min="' + today() + '" max="' + L.addDays(today(), 365) + '" aria-label="Another day"><button class="btn" id="schedAdd" type="button">Add day</button></div>' +
      (later.length ? '<p class="hint-line">Also on: ' + later.map(x => esc(fmtDay(x.on_date))).join(', ') + '</p>' : '') +
      '<button class="btn primary block" style="margin-top:16px" data-close>Done</button>' +
    '</div>';
}
async function schedClick(b) {
  if (b.dataset.weekDay != null) return toggleWeekDay(Number(b.dataset.weekDay), b, SD.id, drawSchedule);
  const d = b.dataset.schedDay || (b.id === 'schedAdd' ? $('schedDate').value : null);
  if (!d) return;
  const have = (S.wdays || []).find(x => x.template_id === SD.id && x.on_date === d);
  b.disabled = true;
  try {
    if (have && b.dataset.schedDay) { await store.removeWorkoutDay(have.id); S.wdays = S.wdays.filter(x => x !== have); }
    else if (!have) { S.wdays.push(await store.addWorkoutDay({ template_id: SD.id, on_date: d })); S.wdays.sort((a, c) => a.on_date.localeCompare(c.on_date)); }
    vibrate(5);
  } catch (x) { fail(x); }
  drawSchedule();
}
async function subscribeTo(id, btn) {
  btn.disabled = true;
  try { S.subs.push(await store.subscribe(id)); toast('Subscribed. It follows their edits.'); render(); }
  catch (x) { fail(x); btn.disabled = false; }
}
async function unsubscribeFrom(subId, btn) {
  btn.disabled = true;
  try { await store.unsubscribe(subId); S.subs = S.subs.filter(s => s.id !== subId); toast('Unsubscribed'); render(); }
  catch (x) { fail(x); btn.disabled = false; }
}
async function copyRoutine(id, btn) {
  btn.disabled = true;
  try {
    const src = S.templates.find(t => t.id === id);
    const t = await store.addRoutine({ name: (src.name + (isMine(src) ? ' (copy)' : '')).slice(0, 60), notes: src.notes || null, kind: src.kind || 'workout' });
    S.templates.push(t);
    const keepLinks = isMine(src) && !isBlock(src);
    await putItems((keepLinks ? rawItems(id) : routineItems(id)).map((it, i) => ({ template_id: t.id, exercise_id: it.block_id ? null : it.exercise_id, block_id: it.block_id || null,
      position: Math.min(100, i + 1), sets: it.sets, ...stepMeasures(it), ...loadFor(it), unit: it.unit,
      rest_s: it.rest_s ?? null, note: it.note ?? null, with_next: !!it.with_next })).filter(r => r.exercise_id || r.block_id));
    toast('Copied. This one’s yours to change.');
    openDesigner(t.id);
  } catch (x) { fail(x); btn.disabled = false; }
}

// ----- the designer: saves as you go -----
const D = { id: null, timers: new Map(), jobs: new Map(), pending: new Map() };
function debounceSave(key, job) {
  clearTimeout(D.timers.get(key));
  D.jobs.set(key, job);
  D.timers.set(key, setTimeout(() => runSave(key), 500));
}
async function runSave(key) {
  const job = D.jobs.get(key);
  D.jobs.delete(key); D.timers.delete(key);
  if (job) { try { await job(); } catch (x) { fail(x); } }
}
function flushSaves() { for (const key of [...D.jobs.keys()]) { clearTimeout(D.timers.get(key)); runSave(key); } }
async function saveRoutine(patch) {
  const t = S.templates.find(x => x.id === D.id);
  Object.assign(t, patch);
  await store.updateRoutine(t.id, patch);
}
function queueItem(id, patch) {
  Object.assign(S.itemsById.get(id), patch);
  D.pending.set(id, { ...(D.pending.get(id) || {}), ...patch });
  debounceSave('item:' + id, async () => {
    const p = D.pending.get(id);
    D.pending.delete(id);
    if (p) await store.updateItem(id, p);
  });
}
function openDesigner(id, fresh) {
  const t = S.templates.find(x => x.id === id);
  if (!t || !isMine(t)) return;
  if (D.id !== id) { D.open = null; if (D.back && D.back !== id && !tplById(D.back)) D.back = null; }
  const back = D.back && D.back !== id && tplById(D.back) ? tplById(D.back) : null;
  if (!back) D.back = null;
  D.id = id; LG.mode = 'design'; LG.pickFor = null; LG.multi = null;
  D.wide = window.matchMedia('(min-width: 1100px)').matches;
  D.pf = D.pf || { mus: null, eq: null, mine: false, q: '' }; D.panelTab = D.panelTab || 'ex';
  inner.innerHTML =
    '<div class="sheet-head"><div class="design-title">' + (back ? '<button class="linkbtn" data-back-to="' + esc(back.id) + '">← ' + esc(back.name) + '</button>' : '') +
      '<input class="title-input" id="rtName" maxlength="60" value="' + esc(t.name) + '" aria-label="Routine name" enterkeyhint="done"></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="design-cols' + (D.wide ? ' wide' : '') + '">' +
    (D.wide ? '<aside class="design-panel" id="dPanel"></aside>' : '') +
    '<div class="sheet-body design-body">' +
      '<div class="design-meta">' +
        '<span class="seg" role="group" aria-label="This is a">' + [['workout', 'Workout'], ['block', 'Block']].map(([k, l]) =>
          '<button type="button" data-kind="' + k + '" aria-pressed="' + ((t.kind || 'workout') === k) + '">' + l + '</button>').join('') + '</span>' +
        '<button type="button" class="toggle" id="rtShare" aria-pressed="' + !!t.is_shared + '">' + (t.is_shared ? '✓ Shared with the crew' : 'Share with the crew') + '</button>' +
        (t.notes ? '' : '<button type="button" class="toggle" id="rtNoteBtn">+ Add a note</button>') +
      '</div>' +
      '<textarea class="plain-input" id="rtNotes" rows="2" maxlength="500" placeholder="Notes: warm-up, rest times, anything" aria-label="Notes"' + (t.notes ? '' : ' hidden') + '>' + esc(t.notes || '') + '</textarea>' +
      '<div id="rtWeek"></div>' +
      '<ol class="items" id="rtItems"></ol>' +
      '<div class="add-tiles"><button type="button" class="add-tile" data-design-add="ex"><b>＋ Exercises</b><small>Browse the library by muscle or equipment</small></button>' +
        '<button type="button" class="add-tile" data-design-add="block"><b>＋ A block</b><small>Reuse a chunk of another workout</small></button></div>' +
      '<p class="hint-line" id="rtHint"></p>' +
      '<button type="button" class="linkbtn danger" id="rtDelete">Delete this routine</button>' +
    '</div></div>' +
    '<div class="design-foot"><button class="btn" id="rtAdd">+ Exercises</button><button class="btn" id="rtFrom">+ Blocks</button>' + (followIds().length && !followIds().includes(id) ? '<button class="btn primary" data-add-today="' + esc(id) + '" id="rtStart">+ Today</button>' : '<button class="btn primary" data-start="' + esc(id) + '" id="rtStart">Start ▸</button>') + '</div>';
  openSheet();
  sheet.querySelector('.sheet').classList.toggle('wide', D.wide);
  drawItems();
  const name = $('rtName'), notes = $('rtNotes');
  name.addEventListener('input', () => debounceSave('name', () => saveRoutine({ name: name.value.trim() || 'Untitled routine' })));
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
  notes.addEventListener('input', () => debounceSave('notes', () => saveRoutine({ notes: notes.value.trim() || null })));
  if (fresh) setTimeout(() => { name.focus(); name.select(); }, 60);
}
function drawItems() {
  const list = rawItems(D.id), t = S.templates.find(x => x.id === D.id);
  D.labels = ssLabels(list);
  $('rtItems').innerHTML = list.length ? list.map((it, i) => (it.block_id ? linkRow(it) : itemRow(it, i === list.length - 1))).join('')
    : '<li class="empty-steps"><b>Nothing in it yet.</b><br>Add exercises from the library, or drop in a block you’ve already built. Sets, reps and weight start from what each person usually does.</li>';
  $('rtStart').disabled = !list.length;
  // The big add tiles help an empty workout get going; after that the bar at the bottom does the job.
  const tiles = inner.querySelector('.add-tiles');
  if (tiles) tiles.hidden = !!list.length;
  drawWeek();
  if (D.wide && !$('dPanel').childElementCount) drawPanel();   // the library panel doesn't change with the steps
  $('rtHint').textContent = (list.length > 1 ? 'Tap a step to change it. Drag ⠿ to reorder. ' : list.length ? 'Tap the step to change it. ' : '') +
    'Saves as you go.' + (t && t.is_shared ? ' Anyone subscribed sees changes straight away.' : '');
}
// Your week, from the workout: tap the days it's on. It's the same week as Rites → Your week, so
// a day you give this workout is taken from whatever was on it before.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
function drawWeek() {
  const box = $('rtWeek'), t = tplById(D.id);
  if (!box) return;
  if (!t || isBlock(t)) { box.innerHTML = ''; return; }
  box.innerHTML = weekPickHtml(t.id, 'On my week');
}
// Mo Tu We… buttons for the weekly days a workout is on (your week). A dot marks a day another
// workout has; picking it moves that day to this one.
function weekPickHtml(tid, label) {
  const c = coreNow(), row = c ? planFor(c.id).find(p => p.template_id === tid) : null, mask = row ? row.weekdays || 0 : 0;
  const taken = d => c && planFor(c.id).find(p => p.template_id !== tid && p.weekdays & (1 << d) && tplById(p.template_id));
  return '<div class="week-pick"><span class="field-label" style="margin:0"><span>' + esc(label) + '</span></span><div class="week-days" role="group" aria-label="Days this workout is on every week">' +
    WEEK_ORDER.map(d => { const o = taken(d); return '<button type="button" data-week-day="' + d + '" aria-pressed="' + !!(mask & (1 << d)) + '" title="' + esc(DAY_NAMES[d] + (o ? ': now ' + tplById(o.template_id).name : '')) + '">' + DAY_NAMES[d].slice(0, 2) + (o && !(mask & (1 << d)) ? '<i></i>' : '') + '</button>'; }).join('') + '</div></div>';
}
async function toggleWeekDay(d, b, tid = D.id, redraw = drawWeek) {
  const t = tplById(tid), bit = 1 << d;
  b.disabled = true;
  try {
    const c = await ensureCore(), row = planFor(c.id).find(p => p.template_id === t.id);
    if (row && row.weekdays & bit) {
      const left = row.weekdays & ~bit;
      if (left) Object.assign(row, await store.updatePlan(row.id, { weekdays: left }));
      else { await store.removePlan(row.id); S.plan = S.plan.filter(p => p !== row); }
    } else {
      const before = planFor(c.id).find(p => p.template_id !== t.id && p.weekdays & bit && tplById(p.template_id));
      await pinToWeek([[t.id, bit]]);
      toast(t.name + ' is on ' + ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][d] + (before ? ' (instead of ' + tplById(before.template_id).name + ')' : '') + '.');
    }
    vibrate(5);
  } catch (x) { fail(x); }
  redraw();
}
// Wide screens: the library sits beside the workout. Click + to add to the end, or drag onto the list.
function drawPanel() {
  const box = $('dPanel');
  if (!box) return;
  const f = D.pf, here = tplById(D.id);
  const tabs = '<div class="seg panel-tabs" role="group" aria-label="Show">' + [['ex', 'Exercises'], ['blocks', 'Blocks']].map(([k, l]) =>
    '<button type="button" data-panel-tab="' + k + '" aria-pressed="' + (D.panelTab === k) + '">' + l + '</button>').join('') + '</div>';
  if (D.panelTab === 'blocks') {
    const blocks = S.templates.filter(t => isBlock(t) && t.id !== D.id && routineItems(t.id).length)
      .sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name));
    box.innerHTML = tabs + '<p class="hint-line">' + (here && !isBlock(here) ? 'Linked blocks stay in step: change the block and every workout using it changes.' : 'A block can’t hold blocks, so these are copied in.') + '</p>' +
      '<ul class="panel-list">' + (blocks.length ? blocks.map(t => '<li draggable="true" data-drag-block="' + esc(t.id) + '"><span class="lib-name"><b>⛓ ' + esc(t.name) + '</b><small class="lib-sub">' +
        esc(routineItems(t.id).map(it => shortName(it.exercise_id)).slice(0, 3).join(', ') + (isMine(t) ? '' : ' · by ' + ownerName(t))) + '</small></span>' +
        '<button type="button" class="iconbtn sm" data-panel-link="' + esc(t.id) + '" aria-label="Add ' + esc(t.name) + '">＋</button></li>').join('')
        : '<li class="muted">No blocks yet. Select steps in a workout and save them as a block, or make one on the Routines tab.</li>') + '</ul>';
    return;
  }
  const list = libList({ ...f, sort: 'used' }).slice(0, 120);
  box.innerHTML = tabs + '<input class="search" id="panelSearch" type="search" placeholder="Search the library" autocomplete="off" value="' + esc(f.q || '') + '" aria-label="Search the library">' +
    '<div id="panelFilters">' + libChips(f, 'panel') + '</div>' +
    '<ul class="panel-list" id="panelList">' + panelRows(list) + '</ul>';
}
function panelRows(list) {
  return list.length ? list.map(e => '<li draggable="true" data-drag-ex="' + esc(e.id) + '"><span class="lib-name"><b>' + esc(e.name) + '</b><small class="lib-sub">' + esc(libTag(e)) + '</small></span>' +
    '<button type="button" class="iconbtn sm" data-panel-add="' + esc(e.id) + '" aria-label="Add ' + esc(e.name) + '">＋</button></li>').join('') : '<li class="muted">Nothing matches.</li>';
}
inner.addEventListener('input', e => {
  if (e.target.id !== 'panelSearch' || LG.mode !== 'design') return;
  D.pf.q = e.target.value.trim();
  clearTimeout(D.panelTyping);
  D.panelTyping = setTimeout(() => { if ($('panelList')) $('panelList').innerHTML = panelRows(libList({ ...D.pf, sort: 'used' }).slice(0, 120)); }, 120);
});
// Drag from the library panel onto the steps: it goes in where you drop it.
inner.addEventListener('dragstart', e => {
  const li = e.target.closest && e.target.closest('[data-drag-ex], [data-drag-block]');
  if (!li) return;
  e.dataTransfer.setData('text/plain', (li.dataset.dragEx ? 'ex:' + li.dataset.dragEx : 'block:' + li.dataset.dragBlock));
  e.dataTransfer.effectAllowed = 'copy';
});
function dropIndex(e) {
  const rows = [...$('rtItems').querySelectorAll('.item')];
  const i = rows.findIndex(r => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
  return i < 0 ? rows.length : i;
}
inner.addEventListener('dragover', e => {
  const ol = e.target.closest && e.target.closest('#rtItems, .design-body');
  if (!ol || LG.mode !== 'design') return;
  e.preventDefault();
  const rows = [...$('rtItems').querySelectorAll('.item')], i = dropIndex(e);
  rows.forEach((r, k) => r.classList.toggle('drop-before', k === i));
  $('rtItems').classList.toggle('drop-end', i === rows.length);
});
inner.addEventListener('dragleave', e => { if (e.target.id === 'rtItems') $('rtItems').classList.remove('drop-end'); });
inner.addEventListener('drop', async e => {
  const ol = e.target.closest && e.target.closest('#rtItems, .design-body');
  const data = e.dataTransfer && e.dataTransfer.getData('text/plain');
  if (!ol || !data || LG.mode !== 'design') return;
  e.preventDefault();
  const rows = rawItems(D.id), i = dropIndex(e), at = i < rows.length ? rows[i].position : null;
  const [kind, id] = data.split(':'), tid = D.id;
  if (rows.length >= 100) return toast('That’s the most steps a routine can have.');
  flushSaves();
  try {
    if (kind === 'block') await linkBlock(id, tid, at);
    else if (at == null) return addItemsTo(tid, [id]);
    else {
      // Dropped inside a superset (the step above pairs with the next): it joins the superset.
      const above = rows[i - 1], join = !!(above && above.with_next && !above.block_id);
      await shiftFrom(tid, at);
      const u = usualFor(id);
      const [made] = await putItems([{ template_id: tid, exercise_id: id, position: at, sets: u.sets, ...stepTarget(id, u), load_mode: 'last', load_value: 0, unit: u.unit, with_next: join }]);
      D.open = made.id;
    }
    await autoName(tid);
  } catch (x) { fail(x); }
  openDesigner(tid);
});

// One line per step; tap it to open big controls for that step (one open at a time).
function itemSummary(it) {
  const g = suggestFor(it);
  return stepText(it) + (g.weight != null && !(it.load_mode === 'fixed' && ownStep(it)) ? ' · you: ' + loadText(g) : '');
}
// A linked block in a workout: one row you can open to see its steps, edit the block, or unlink it.
function linkRow(it) {
  const open = D.open === it.id, blk = tplById(it.block_id), steps = linkedSteps(it), n = usedInCount(it.block_id);
  const name = blk ? blk.name : 'A block you can’t see any more';
  return '<li class="item link-row' + (open ? ' open' : '') + '" data-item="' + esc(it.id) + '">' +
    '<div class="item-head"><button type="button" class="handle" data-handle aria-label="Move ' + esc(name) + ' (drag, or use the arrow keys)">⠿</button>' +
      '<button type="button" class="item-sum" data-toggle-item aria-expanded="' + open + '"><b>⛓ ' + esc(name) + '</b>' +
        '<span class="sum">' + esc(steps.length + ' step' + (steps.length === 1 ? '' : 's') + (n > 1 ? ' · in ' + n + ' workouts' : '') + ' · ' + steps.slice(0, 3).map(x => shortName(x.exercise_id)).join(', ') + (steps.length > 3 ? '…' : '')) + '</span></button>' +
      '<span class="chev" aria-hidden="true">' + (open ? '▴' : '▾') + '</span></div>' +
    (open ? '<div class="item-edit"><ol class="link-steps">' + steps.map(x => '<li><b>' + esc(exName(x.exercise_id)) + '</b><span>' + esc(stepText(x)) + '</span></li>').join('') + '</ol>' +
      '<p class="hint-line" style="margin:0">Linked: changes to the block show up here' + (n > 1 ? ' and in its other workouts' : '') + '.</p>' +
      '<div class="item-actions">' + (blk && isMine(blk) ? '<button type="button" data-edit-block="' + esc(blk.id) + '">✎ Edit block</button>' : '') +
        '<button type="button" data-unlink>⛓̸ Unlink to change here</button><button type="button" class="danger" data-remove-item="' + esc(it.id) + '">✕ Remove</button></div></div>' : '') +
  '</li>';
}
function itemRow(it, last) {
  const open = D.open === it.id, ss = D.labels && D.labels.get(it.id);
  return '<li class="item' + (open ? ' open' : '') + (ss ? ' ss' + (ss.endsWith('1') ? ' ss-first' : '') : '') + '" data-item="' + esc(it.id) + '">' +
    '<div class="item-head"><button type="button" class="handle" data-handle aria-label="Move ' + esc(exName(it.exercise_id)) + ' (drag, or use the arrow keys)">⠿</button>' +
      '<button type="button" class="item-sum" data-toggle-item aria-expanded="' + open + '"><b>' + (ss ? '<span class="ss-tag">' + ss + '</span> ' : '') + esc(exName(it.exercise_id)) + '</b>' +
        '<span class="sum">' + esc(itemSummary(it)) + '</span></button>' +
      '<span class="chev" aria-hidden="true">' + (open ? '▴' : '▾') + '</span></div>' +
    (open ?
      '<div class="item-edit">' +
        '<div class="two">' + bigStep('Sets', 'sets', it.sets) + measureStep(it) + '</div>' +
        '<div class="field-label"><span>Weight</span></div><div class="seg seg-wrap" role="group" aria-label="Weight rule">' + [['last', 'Your last'], ['fixed', 'Set weight'], ['progress', 'Go up'], ['pct', '% of best']].map(([k, l]) =>
          '<button type="button" data-loadmode="' + k + '" aria-pressed="' + ((it.load_mode === 'percent_1rm' ? 'pct' : it.load_mode) === k) + '">' + l + '</button>').join('') + '</div>' +
        (it.load_mode === 'percent_1rm' ? bigStep('% of each person’s best 1-rep max', 'load_value', L.fmtLoad(it.load_value), true)
          : it.load_mode === 'progress' ? bigStep('Add (' + it.unit + ') after a session with every rep hit', 'load_value', L.fmtLoad(it.load_value), true)
          : it.load_mode === 'fixed' ? bigStep('Weight (' + it.unit + ')', 'load_value', L.fmtLoad(it.load_value), true) : '') +
        '<p class="hint-line" data-pct-hint>' + esc(ruleHint(it)) + '</p>' +
        '<input class="plain-input step-note" data-note-for="' + esc(it.id) + '" maxlength="200" placeholder="Note for this step (optional)" value="' + esc(it.note || '') + '" aria-label="Note for this step">' +
        '<div class="field-label"><span>Rest between sets</span><small>starts by itself after each set</small></div>' +
        '<div class="seg seg-wrap" role="group" aria-label="Rest between sets">' + [[null, 'Off'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00'], [240, '4:00']].map(([v, l]) =>
          '<button type="button" data-rest-set="' + (v || '') + '" aria-pressed="' + ((it.rest_s || null) === v) + '">' + l + '</button>').join('') +
          (it.rest_s && ![60, 90, 120, 180, 240].includes(Number(it.rest_s)) ? '<button type="button" aria-pressed="true" disabled>' + restLabel(Number(it.rest_s)) + '</button>' : '') + '</div>' +
        '<div class="item-actions"><button type="button" data-swap>⇄ Swap</button>' +
          (last ? '' : '<button type="button" data-pair aria-pressed="' + !!it.with_next + '">' + (it.with_next ? '✓ Superset with next' : '⇅ Superset with next') + '</button>') +
          '<button type="button" data-dup>⧉ Duplicate</button><button type="button" class="danger" data-remove-item="' + esc(it.id) + '">✕ Remove</button></div>' +
      '</div>' : '') +
  '</li>';
}
function ruleHint(it) {
  const g = suggestFor(it);
  const base = it.load_mode === 'percent_1rm' ? 'Each person gets this percent of their own best.'
    : it.load_mode === 'progress' ? 'Each person starts from their own last weight and adds this after a session where they hit every rep.'
    : it.load_mode === 'fixed' ? 'This weight is for you. Anyone else following uses their own last weight.'
    : 'Each person uses their own last weight for this lift.';
  return base + ' You: ' + (g.weight != null ? loadText(g) + ' (' + g.why + ').' : g.why + '.');
}
// The step's main measure, as a stepper: reps, time or distance, from the field table.
function measureStep(it) {
  const ex = S.byId.get(it.exercise_id), f = TR.stepField(it, ex), F = TR.FIELDS[f];
  return bigStep(F.label + (F.unitOf ? ' (' + F.unitOf(TRO()) + ')' : ''), f, F.show(TR.stepValue(it, ex), TRO()));
}
function bigStep(label, field, value, wide) {
  return '<label class="bs' + (wide ? ' wide' : '') + '"><small>' + esc(label) + '</small><span>' +
    '<button type="button" data-step-field="' + field + '" data-d="-1" aria-label="Less ' + esc(label) + '">−</button>' +
    '<input data-field="' + field + '" inputmode="' + (TR.FIELDS[field] ? TR.FIELDS[field].inputmode : 'decimal') + '" value="' + esc(value) + '" aria-label="' + esc(label) + '">' +
    '<button type="button" data-step-field="' + field + '" data-d="1" aria-label="More ' + esc(label) + '">+</button></span></label>';
}
const ITEM_BOUNDS = { sets: [1, 20], reps: [1, 100], rest_s: [0, 900] };
function clampItem(it, field, v) {
  if (field === 'load_value') return it.load_mode === 'percent_1rm' ? Math.min(150, Math.max(1, v)) : it.load_mode === 'progress' ? Math.min(50, Math.max(0.5, v))
    : it.load_mode === 'fixed' ? Math.min(2000, Math.max(0, v)) : 0;
  const F = TR.FIELDS[field];
  if (F) return Math.min(F.stepMax || Infinity, F.clamp(v));
  const [lo, hi] = ITEM_BOUNDS[field];
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
function redrawItem(id) {
  const li = inner.querySelector('.item[data-item="' + id + '"]');
  if (li) li.outerHTML = itemRow(S.itemsById.get(id));
}
// Update a step's numbers in place (no re-render), so held buttons keep working.
function refreshItemView(id) {
  const li = inner.querySelector('.item[data-item="' + id + '"]'), it = S.itemsById.get(id);
  if (!li || !it) return;
  li.querySelectorAll('input[data-field]').forEach(inp => { if (document.activeElement !== inp) inp.value = inp.dataset.field === 'load_value' ? L.fmtLoad(it.load_value) : TR.FIELDS[inp.dataset.field] ? TR.FIELDS[inp.dataset.field].show(it[inp.dataset.field] ?? TR.FIELDS[inp.dataset.field].start, TRO()) : it[inp.dataset.field]; });
  li.querySelector('.sum').textContent = itemSummary(it);
  const hint = li.querySelector('[data-pct-hint]');
  if (hint) hint.textContent = ruleHint(it);
}
// Add exercises to the end of a routine, each starting from your last numbers for it.
async function addItemsTo(tid, exIds) {
  try {
    const list = routineItems(tid);
    let pos = Math.max(0, ...rawItems(tid).map(i => i.position));
    const made = await putItems(exIds.map(exId => {
      const u = usualFor(exId);
      return { template_id: tid, exercise_id: exId, position: Math.min(100, ++pos), sets: u.sets, ...stepTarget(exId, u), load_mode: 'last', load_value: 0, unit: u.unit };
    }));
    if (made.length === 1) D.open = made[0].id;   // one added: open it, ready to set
    if (exIds.length > 1) toast('Added ' + exIds.length + ' exercises at your usual sets and reps.');
    await autoName(tid);
  } catch (x) { fail(x); }
  openDesigner(tid);
}
function persistOrder() {
  [...$('rtItems').querySelectorAll('.item')].forEach((li, i) => {
    const it = S.itemsById.get(li.dataset.item);
    if (it && it.position !== i + 1) queueItem(it.id, { position: i + 1 });
  });
}
// Press and hold a +/− or a nudge to keep going: starts after a short pause, then repeats.
// The real click that ends a hold is swallowed, so it doesn't add one extra step.
const HOLD = { timer: null, every: null, held: false };
inner.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-w], [data-r], [data-nudge], [data-step-field]');
  if (!b) return;
  HOLD.held = false;
  clearTimeout(HOLD.timer); clearInterval(HOLD.every);
  HOLD.timer = setTimeout(() => {
    HOLD.held = true;
    HOLD.every = setInterval(() => b.dispatchEvent(new MouseEvent('click', { bubbles: true })), 110);
  }, 420);
  const stop = () => {
    clearTimeout(HOLD.timer); clearInterval(HOLD.every);
    document.removeEventListener('pointerup', stop); document.removeEventListener('pointercancel', stop);
  };
  document.addEventListener('pointerup', stop); document.addEventListener('pointercancel', stop);
});
inner.addEventListener('click', e => { if (HOLD.held && e.isTrusted) { HOLD.held = false; e.stopImmediatePropagation(); } }, true);
// Drag to reorder: works with mouse and touch (the handle has touch-action: none).
inner.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-handle]');
  if (!h) return;
  e.preventDefault();
  const row = h.closest('.item'), list = row.parentNode;
  row.classList.add('dragging');
  const move = ev => {
    const after = [...list.querySelectorAll('.item:not(.dragging)')].find(o => { const r = o.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
    if (after) { if (after !== row.nextElementSibling) list.insertBefore(row, after); } else if (row !== list.lastElementChild) list.appendChild(row);
  };
  const up = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
    row.classList.remove('dragging'); persistOrder(); vibrate(8);
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
});
inner.addEventListener('keydown', e => {
  const h = e.target.closest('[data-handle]');
  if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const row = h.closest('.item'), sib = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
  if (!sib) return;
  if (e.key === 'ArrowUp') row.parentNode.insertBefore(row, sib); else row.parentNode.insertBefore(sib, row);
  h.focus(); persistOrder();
});
inner.addEventListener('input', e => {
  const note = e.target.closest('[data-note-for]');
  if (note && LG.mode === 'design') return queueItem(note.dataset.noteFor, { note: note.value.trim() || null });
  const inp = e.target.closest('[data-field]');
  if (!inp || LG.mode !== 'design') return;
  const id = inp.closest('.item').dataset.item, it = S.itemsById.get(id), F = TR.FIELDS[inp.dataset.field], v = F ? F.read(inp.value, TRO()) : L.parseLoad(inp.value);
  if (v == null) return;
  queueItem(id, { [inp.dataset.field]: clampItem(it, inp.dataset.field, v) });
});
// Reuse part of another routine: tick steps from any routine you can see (yours or the crew's),
// and they're copied onto the end of this one with their sets, reps and load.
const CH = { picked: [] };
function openChunkPicker() {
  LG.mode = 'chunk'; CH.picked = [];
  const here = S.templates.find(x => x.id === D.id);
  const others = S.templates.filter(t => t.id !== D.id && routineItems(t.id).length && !(isBlock(t) && rawItems(D.id).some(r => r.block_id === t.id)))
    .sort((a, b) => Number(isBlock(b)) - Number(isBlock(a)) || Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name));
  inner.innerHTML =
    '<div class="sheet-head"><div><button class="btn ghost" style="padding:2px 0;border:0;color:var(--muted);font-size:14px" data-chunk-back>← Back to ' + esc(here ? here.name : 'the routine') + '</button>' +
      '<h2 id="sheetTitle">Add blocks</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      (others.length ? '<p class="hint-line" style="margin-top:0">' + (here && !isBlock(here) ? 'Link a whole block with one tap: it stays in step with the block when that changes. Or tick just the steps you want to copy in.' : 'Add a whole block with one tap, or tick just the steps you want, in the order you’ll do them.') + ' Sets, reps and load come too.</p>' +
        others.map((t, i) => (isBlock(t) !== isBlock(others[i - 1] || {}) || i === 0 ? '<div class="section-title">' + (isBlock(t) ? 'Blocks' : 'Workouts') + '</div>' : '') +
          '<section class="chunk"><div class="row"><h3>' + esc(t.name) + (isMine(t) ? '' : ' <small class="muted">by ' + esc(ownerName(t)) + '</small>') + '</h3>' +
          '<button type="button" class="btn sm primary" data-chunk-all="' + esc(t.id) + '">' + (isBlock(t) ? (here && !isBlock(here) ? '⛓ Link block' : '+ Add block') : '+ Add all') + '</button></div><ul class="results">' +
          routineItems(t.id).map(it => '<li><button data-chunk="' + esc(it.id) + '" aria-pressed="false"><span><i class="tickbox" aria-hidden="true"></i>' + esc(exName(it.exercise_id)) + '</span>' +
            '<small>' + esc(stepText(it)) + '</small></button></li>').join('') + '</ul></section>').join('')
        : '<p class="muted">No other routines with steps yet. Make one, or subscribe to one the crew shares.</p>') +
      '<div class="pick-foot" hidden><button class="btn primary block" data-chunk-add>Add</button></div>' +
    '</div>';
  openSheet();
}
function drawChunk() {
  inner.querySelectorAll('[data-chunk]').forEach(b => {
    const i = CH.picked.indexOf(b.dataset.chunk);
    b.classList.toggle('sel', i >= 0); b.setAttribute('aria-pressed', i >= 0);
    b.querySelector('.tickbox').textContent = i >= 0 ? i + 1 : '';
  });
  const n = CH.picked.length, add = inner.querySelector('[data-chunk-add]');
  add.parentNode.hidden = !n;   // only there once you've ticked something
  add.textContent = 'Add ' + n + ' step' + (n === 1 ? '' : 's');
}
async function chunkClick(b) {
  if (b.hasAttribute('data-chunk-back')) return openDesigner(D.id);
  if (b.dataset.chunk) {
    const id = b.dataset.chunk, i = CH.picked.indexOf(id);
    if (i >= 0) CH.picked.splice(i, 1); else CH.picked.push(id);
    vibrate(5); return drawChunk();
  }
  if (b.dataset.chunkAll || b.hasAttribute('data-chunk-add')) {
    const src = b.dataset.chunkAll && tplById(b.dataset.chunkAll);
    const ids = src ? routineItems(src.id).map(it => it.id) : CH.picked.slice();
    b.disabled = true;
    const tid = D.id;
    if (rawItems(tid).length + (src && isBlock(src) ? 1 : ids.length) > 100) { b.disabled = false; return toast('That would be more than 100 steps.'); }
    try {
      if (src && isBlock(src) && !isBlock(tplById(tid))) await linkBlock(src.id, tid);
      else if (src && !isBlock(src) && !isBlock(tplById(tid))) {
        let pos = Math.max(0, ...rawItems(tid).map(i => i.position));
        for (const r of rawItems(src.id)) {
          if (r.block_id) await linkBlock(r.block_id, tid);
          else await copySteps([r.id], tid);
          pos++;
        }
      } else await copySteps(ids, tid);
      await autoName(tid);
      toast(src ? 'Added ' + src.name + '.' : 'Added ' + ids.length + ' step' + (ids.length === 1 ? '' : 's') + '.');
    } catch (x) { fail(x); }
    openDesigner(tid);
  }
}
async function designerClick(b) {
  if (b.dataset.backTo) { flushSaves(); const to = b.dataset.backTo; D.back = null; return openDesigner(to); }
  if (b.id === 'rtAdd' || b.dataset.designAdd === 'ex') { flushSaves(); return openPicker('Add to ' + (S.templates.find(x => x.id === D.id) || {}).name, ids => addItemsTo(D.id, ids), true); }
  if (b.id === 'rtFrom' || b.dataset.designAdd === 'block') { flushSaves(); return openChunkPicker(); }
  if (b.dataset.kind) {
    const t = S.templates.find(x => x.id === D.id);
    if ((t.kind || 'workout') === b.dataset.kind) return;
    if (b.dataset.kind === 'workout' && linksTo(t.id).length) return toast('Workouts link to this block, so it stays a block. Unlink it there first.');
    if (b.dataset.kind === 'block' && rawItems(t.id).some(r => r.block_id)) return toast('A block can’t hold other blocks. Unlink them first.');
    try { await saveRoutine({ kind: b.dataset.kind }); } catch (x) { return fail(x); }
    inner.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', x.dataset.kind === t.kind));
    toast(t.kind === 'block' ? 'Now a block: a chunk to build workouts from.' : 'Now a workout.');
    return;
  }
  if (b.id === 'rtNoteBtn') { b.remove(); const n = $('rtNotes'); n.hidden = false; n.focus(); return; }
  if (b.id === 'rtShare') {
    const t = S.templates.find(x => x.id === D.id);
    try {
      await saveRoutine({ is_shared: !t.is_shared });
      if (t.is_shared) for (const r of rawItems(t.id)) {
        const blk = r.block_id && tplById(r.block_id);
        if (blk && isMine(blk) && !blk.is_shared) { await store.updateRoutine(blk.id, { is_shared: true }); blk.is_shared = true; }
      }
    } catch (x) { return fail(x); }
    b.setAttribute('aria-pressed', t.is_shared); b.textContent = t.is_shared ? '✓ Shared with the crew' : 'Share with the crew';
    drawItems(); toast(t.is_shared ? 'Shared. The crew can follow or subscribe to it.' : 'Not shared any more.');
    return;
  }
  if (b.id === 'rtDelete') {
    const t = S.templates.find(x => x.id === D.id);
    const links = linksTo(t.id);
    if (!confirm('Delete “' + t.name + '”?' + (links.length ? ' Your workouts that use it keep a copy of its steps.' : '') + (t.is_shared ? ' Anyone subscribed loses it too.' : ''))) return;
    try {
      for (const r of links.filter(r => isMine(tplById(r.template_id) || {}))) await unlinkBlock(r.id);
      await store.deleteRoutine(t.id);
    } catch (x) { return fail(x); }
    S.templates = S.templates.filter(x => x.id !== t.id);
    if (followIds().includes(t.id)) saveFollow(followIds().filter(x => x !== t.id));
    sheet.close(); render(); toast('Routine deleted');
    return;
  }
  if (b.dataset.weekDay != null) return toggleWeekDay(Number(b.dataset.weekDay), b);
  if (b.dataset.panelAdd) { flushSaves(); return addItemsTo(D.id, [b.dataset.panelAdd]); }
  if (b.dataset.panelLink) { flushSaves(); try { await linkBlock(b.dataset.panelLink, D.id); await autoName(D.id); } catch (x) { fail(x); } return openDesigner(D.id); }
  if (b.dataset.panelMus != null || b.dataset.panelEq || b.dataset.panelMine != null || b.dataset.panelTab) {
    const f = D.pf;
    if (b.dataset.panelTab) D.panelTab = b.dataset.panelTab;
    else if (b.dataset.panelMus != null) { f.mus = b.dataset.panelMus || null; if (!f.mus) { f.eq = null; f.mine = false; } }
    else if (b.dataset.panelEq) f.eq = f.eq === b.dataset.panelEq ? null : b.dataset.panelEq;
    else f.mine = !f.mine;
    return drawPanel();
  }
  const li = b.closest('.item');
  if (!li) return;
  const id = li.dataset.item, it = S.itemsById.get(id);
  if (b.hasAttribute('data-pair')) { queueItem(id, { with_next: !it.with_next }); vibrate(5); return drawItems(); }
  if (b.dataset.editBlock) { flushSaves(); D.back = D.id; return openDesigner(b.dataset.editBlock); }
  if (b.hasAttribute('data-unlink')) {
    flushSaves();
    try { await unlinkBlock(id); toast('Unlinked. These steps are this workout’s own now.'); } catch (x) { fail(x); }
    D.open = null; return openDesigner(D.id);
  }
  if (b.hasAttribute('data-toggle-item')) {
    flushSaves();
    D.open = D.open === id ? null : id;
    drawItems();
    const now = inner.querySelector('.item[data-item="' + id + '"]');
    if (now && D.open) now.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (b.hasAttribute('data-swap')) {
    // Swap keeps the step's place, sets, reps and load; only the exercise changes.
    flushSaves();
    const tid = D.id;
    return openPicker('Swap ' + exName(it.exercise_id) + ' for…', async exId => {
      try { const saved = await store.updateItem(id, { exercise_id: exId }); Object.assign(S.itemsById.get(id), saved); }
      catch (x) { fail(x); }
      openDesigner(tid);
    });
  }
  if (b.hasAttribute('data-dup')) {
    // Copy the step right after itself, shuffling the later steps down one.
    flushSaves();
    const list = rawItems(D.id);
    if (list.length >= 100) return toast('That’s the most steps a routine can have.');
    try {
      await Promise.all(list.filter(x => x.position > it.position).map(later => store.updateItem(later.id, { position: later.position + 1 }).then(s => Object.assign(later, s))));
      const copy = await store.addItem({ template_id: D.id, exercise_id: it.exercise_id, position: it.position + 1, sets: it.sets, ...stepMeasures(it),
        load_mode: it.load_mode, load_value: it.load_value, unit: it.unit, rest_s: it.rest_s ?? null, note: it.note ?? null, with_next: !!it.with_next });
      S.items.push(copy); S.itemsById.set(copy.id, copy);
      D.open = copy.id;
      drawItems(); vibrate(8);
    } catch (x) { fail(x); }
    return;
  }
  if (b.dataset.removeItem) {
    try { await store.removeItem(id); } catch (x) { return fail(x); }
    S.items = S.items.filter(x => x.id !== id);
    drawItems();
    toast('Removed ' + (it.block_id ? (tplById(it.block_id) || { name: 'the block' }).name : exName(it.exercise_id)), { label: 'Undo', run: async () => {
      try { const back = await store.updateItem(id, { deleted_at: null }); S.items.push(back); S.itemsById.set(id, back); drawItems(); } catch (x) { fail(x); }
    } });
    return;
  }
  if (b.dataset.stepField) {
    const f = b.dataset.stepField, d = Number(b.dataset.d);
    const F = TR.FIELDS[f];
    const step = F ? F.step(TRO()) : f === 'load_value' ? (it.load_mode === 'percent_1rm' || (it.load_mode === 'fixed' && it.unit === 'lb') ? 5 : 2.5) : f === 'rest_s' ? 15 : 1;
    queueItem(id, { [f]: clampItem(it, f, Number(it[f] ?? (F ? F.start : 0)) + d * step) });
    refreshItemView(id); vibrate(5);
    return;
  }
  if (b.dataset.loadmode) {
    const k = b.dataset.loadmode;
    if (k === 'pct') queueItem(id, { load_mode: 'percent_1rm', load_value: it.load_mode === 'percent_1rm' ? it.load_value : 75 });
    else if (k === 'progress') queueItem(id, { load_mode: 'progress', load_value: it.load_mode === 'progress' ? it.load_value : (it.unit === 'kg' ? 2.5 : 5) });
    else if (k === 'fixed') { const g = suggestFor(it); queueItem(id, { load_mode: 'fixed', load_value: it.load_mode === 'fixed' ? it.load_value : g.weight != null ? Math.min(2000, g.weight) : 0, unit: g.unit || it.unit }); }
    else queueItem(id, { load_mode: 'last', load_value: 0 });
    redrawItem(id);
    return;
  }
  if (b.dataset.restSet != null) {
    queueItem(id, { rest_s: b.dataset.restSet ? Number(b.dataset.restSet) : null });
    redrawItem(id); vibrate(5);
  }
}

// ===========================================================================
// Seasons: your own date ranges with visit and volume goals
// ===========================================================================
const seasonById = id => (S.seasons || []).find(s => s.id === id);
const seasonM = s => L.seasonMetrics(S.days, S.bestRows, s.starts_on, s.ends_on);
function seasonStatus(s) {
  const t = today();
  if (t < s.starts_on) return 'starts ' + fmtDay(s.starts_on, { month: 'short', day: 'numeric' });
  if (t > s.ends_on) return 'ended ' + fmtDay(s.ends_on, { month: 'short', day: 'numeric' });
  const left = L.daysBetween(t, s.ends_on);
  return left === 0 ? 'last day' : left + ' day' + (left === 1 ? '' : 's') + ' left';
}
// Goals in a season. The owner's goals are the season's and apply to everyone in it; anyone who
// joined can add their own on top. Kinds: visits, volume, lift (a weight on one exercise) and
// workout (do a workout N times, a day counting when it covers half its exercises).
const seasonGoals = sn => S.goals.filter(g => g.season_id === sn.id && (!g.created_by || g.created_by === sn.created_by));
const ownGoals = (sn, uid) => S.goals.filter(g => g.season_id === sn.id && g.created_by && g.created_by !== sn.created_by && g.created_by === uid);
const goalsFor = (sn, uid) => seasonGoals(sn).concat(ownGoals(sn, uid));
function myBestIn(exId, unit, from, to) {
  let best = 0;
  for (const x of S.recent) if (x.exercise_id === exId && x.unit === unit && x.is_warmup !== true && x.performed_on >= from && x.performed_on <= to) best = Math.max(best, Number(x.weight));
  for (const r of S.bestRows) if (r.exercise_id === exId && r.unit === unit && r.first_lifted_on >= from && r.first_lifted_on <= to) best = Math.max(best, Number(r.heaviest));
  return best;
}
function myWorkoutTimes(tid, from, to) {
  const days = [...new Set(S.recent.filter(x => x.performed_on >= from && x.performed_on <= to).map(x => x.performed_on))];
  return days.filter(d => matchRoutine([{ template_id: tid }], d) >= 0).length;
}
function goalHave(g, m, ctx) {
  if (g.metric === 'visits' || g.metric === 'volume') return L.goalProgress(g, m).have;
  const sn = ctx && ctx.season;
  if (!sn) return 0;
  const other = ctx.person && ctx.person !== S.myId, st = ctx.st || {};
  if (g.metric === 'lift') {
    if (other) { const r = (st.b || []).find(x => x.user_id === ctx.person && x.exercise_id === g.exercise_id && x.unit === g.unit); return r ? Number(r.best_weight) : 0; }
    return myBestIn(g.exercise_id, g.unit, sn.starts_on, sn.ends_on);
  }
  if (other) { const r = (st.w || []).find(x => x.user_id === ctx.person && x.template_id === g.template_id); return r ? Number(r.times) : 0; }
  return myWorkoutTimes(g.template_id, sn.starts_on, sn.ends_on);
}
function goalLine(g, m, ctx) {
  const have = goalHave(g, m, ctx), need = Number(g.target), done = have >= need, ratio = need > 0 ? Math.min(1, have / need) : 0;
  const label = g.metric === 'visits' ? L.fmtNum(have, 0) + ' / ' + L.fmtNum(need, 0) + ' visits'
    : g.metric === 'workout' ? L.fmtNum(have, 0) + ' / ' + L.fmtNum(need, 0) + ' times'
    : g.metric === 'lift' ? (have ? L.fmtLoad(have) : '–') + ' / ' + L.fmtLoad(need) + ' ' + g.unit
    : L.fmtBig(have) + ' / ' + L.fmtBig(need) + ' ' + g.unit;
  const sn = ctx && ctx.season, own = sn && g.created_by && g.created_by !== sn.created_by;
  return '<div class="goal"><div class="row"><span>' + (done ? T.icons.goal + ' ' : '') + esc(g.name) + (own ? ' <small class="muted">· own goal</small>' : '') + '</span><span class="muted num">' + esc(label) + '</span></div>' +
    '<div class="bar" style="--p:' + (ratio * 100).toFixed(1) + '%"><i></i></div></div>';
}
const myGoalsHtml = (sn, m) => goalsFor(sn, S.myId).map(g => goalLine(g, m, { season: sn })).join('');
const seasonSub = id => (S.seasonSubs || []).find(x => x.season_id === id);
// A season's plan: routines in order. Ticked weekdays pin a routine to those days; the rest take turns.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const byPos = (a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id));
const planFor = sid => (S.plan || []).filter(p => p.season_id === sid).sort(byPos);
const tplById = id => tplIndex().get(id);
const dayList = mask => DAY_NAMES.filter((_, i) => mask & (1 << i)).join(', ');
function planLine(s) {
  const plan = planFor(s.id);
  if (!plan.length) return '';
  return '<p class="hint-line">Plan: ' + esc(plan.map(p => { const t = tplById(p.template_id); return (t ? t.name : 'a private routine') + (p.weekdays ? ' (' + dayList(p.weekdays) + ')' : ''); }).join(' → ')) + '</p>';
}
// Which routine of a rotation was done on a day: the one whose exercises that day covers best (at least half).
// exs: each routine's exercises, when the caller checks many days against the same routines
// (rotExercises(rot) once, instead of gathering every routine's steps again for every day).
const rotExercises = rot => rot.map(p => [...new Set(routineItems(p.template_id).map(it => it.exercise_id))]);
function matchRoutine(rot, day, exs) {
  const done = new Set(recentOn(day).filter(x => x.is_warmup !== true).map(x => x.exercise_id));
  if (!done.size) return -1;
  let best = -1, score = 0.5 - 1e-9;
  rot.forEach((p, i) => {
    const ex = exs ? exs[i] : [...new Set(routineItems(p.template_id).map(it => it.exercise_id))];
    const sc = ex.length ? ex.filter(e => done.has(e)).length / ex.length : 0;
    if (sc > score) { score = sc; best = i; }
  });
  return best;
}
// Today's routine from the plan of a season you're in that's running now.
function todaysPlan() {
  const t = today(), dow = L.parseDate(t).getDay();
  for (const s of (S.seasons || []).filter(s => inSeason(s) && s.starts_on <= t && t <= s.ends_on)) {
    const plan = planFor(s.id).filter(p => tplById(p.template_id) && routineItems(p.template_id).length);
    if (!plan.length) continue;
    const pinned = plan.find(p => p.weekdays & (1 << dow));
    if (pinned) return { season: s, plan, entry: pinned, why: 'it’s ' + DAY_NAMES[dow] };
    const rot = plan.filter(p => !p.weekdays);
    if (!rot.length) {
      for (let k = 1; k <= 7; k++) { const p = plan.find(x => x.weekdays & (1 << ((dow + k) % 7))); if (p) return { season: s, plan, entry: null, next: p, nextDay: DAY_NAMES[(dow + k) % 7] }; }
      continue;
    }
    const todayIdx = matchRoutine(rot, t);
    if (todayIdx >= 0) return { season: s, plan, entry: rot[todayIdx], why: 'on today' };
    const days = [...new Set(S.recent.map(x => x.performed_on))].filter(d => d < t && d >= s.starts_on).sort().reverse();
    for (const d of days) {
      const i = matchRoutine(rot, d);
      if (i >= 0) return { season: s, plan, entry: rot[(i + 1) % rot.length], why: 'next after ' + tplById(rot[i].template_id).name };
    }
    return { season: s, plan, entry: rot[0], why: 'first in the rotation' };
  }
  return null;
}
function planCard() {
  if (following()) return '';
  const pt = planToday();
  if (pt) return planTodayCard(pt);
  const tp = todaysPlan();
  if (!tp) return '';
  const head = '<div class="date">' + esc(isCore(tp.season) ? 'Your week' : tp.season.name) + '</div>';
  if (!tp.entry) return '<section class="card plan-card">' + head + '<p style="margin:6px 0 0">Rest day by the plan. Next up: <b>' + esc(tplById(tp.next.template_id).name) + '</b> on ' + tp.nextDay + '.</p></section>';
  const t = tplById(tp.entry.template_id);
  const others = tp.plan.filter(p => p.template_id !== t.id && !tp.plan.slice(0, tp.plan.indexOf(p)).some(q => q.template_id === p.template_id));
  return '<section class="card plan-card">' + head +
    '<div class="row" style="margin-top:4px"><div><small class="muted">Today’s routine, ' + esc(tp.why) + '</small><h2>' + esc(t.name) + '</h2></div>' +
      '<button class="btn primary" data-start="' + esc(t.id) + '">Start</button></div>' +
    '<div class="chips">' + routineItems(t.id).map(it => '<span class="chip">' + esc(exName(it.exercise_id)) + ' <small>' + esc(stepText(it)) + '</small></span>').join('') + '</div>' +
    (others.length ? '<p class="hint-line">Or: ' + others.map(p => '<button class="linkbtn" data-start="' + esc(p.template_id) + '">' + esc(tplById(p.template_id).name) + '</button>').join(' · ') + '</p>' : '') +
  '</section>';
}
const inSeason = s => isMine(s) || !!seasonSub(s.id);
const seasonDates = s => fmtDay(s.starts_on, { month: 'short', day: 'numeric' }) + ' – ' + fmtDay(s.ends_on, { month: 'short', day: 'numeric', year: 'numeric' });
async function joinSeason(id, b) {
  b.disabled = true;
  try { S.seasonSubs.push(await store.joinSeason(id)); } catch (x) { b.disabled = false; return fail(x); }
  delete S.standings[id];
  openSeason(id);
  if ((S.programs || []).length) openSeasonProgram(id);
  toast('You’re in. Game on.');
}
async function leaveSeason(id, b) {
  const s = seasonById(id), sub = seasonSub(id);
  if (!sub || !confirm('Leave “' + s.name + '”? You can join again any time.')) return;
  b.disabled = true;
  try { await store.leaveSeason(sub.id); } catch (x) { b.disabled = false; return fail(x); }
  S.seasonSubs = S.seasonSubs.filter(x => x.id !== sub.id);
  delete S.standings[id];
  if (S.seasonOpen === id) S.seasonOpen = null;
  render(); toast('Left the season');
}
// ----- bodyweight: private weigh-ins, a trend line, and the latest feeds the logger -----
function bodyweightCard() {
  const list = S.bw || [];
  const last = list[0], unit = last ? last.unit : prefs.unit;
  const same = list.filter(b => b.unit === unit);
  let delta = '';
  if (last) {
    const old = same.find(b => b.measured_on <= L.addDays(last.measured_on, -28));
    if (old) { const d = Number(last.weight) - Number(old.weight); delta = (d > 0 ? '+' : d < 0 ? '−' : '±') + L.fmtLoad(Math.abs(Math.round(d * 10) / 10)) + ' ' + unit + ' since ' + fmtDay(old.measured_on, { month: 'short', day: 'numeric' }); }
  }
  const pts = same.filter(b => b.measured_on >= L.addDays(today(), -180)).slice().reverse();
  const chart = pts.length > 1 ? C.lines({ labels: pts.map(b => fmtDay(b.measured_on, { month: 'short', day: 'numeric' })), series: [{ name: 'Bodyweight', values: pts.map(b => Number(b.weight)) }],
    height: 150, zero: false, every: Math.ceil(pts.length / 5), fmt: v => L.fmtLoad(Math.round(v * 10) / 10), label: 'Bodyweight over the last six months, in ' + unit }) : '';
  return '<section class="card bw c-half"><h3 class="card-title">Bodyweight</h3>' +
    (last ? '<div class="row"><div><div class="crew-vol num">' + esc(L.fmtLoad(Number(last.weight))) + ' ' + esc(last.unit) + '</div>' +
      '<small class="muted">' + esc(dayLabel(last.measured_on)) + (delta ? ' · ' + esc(delta) : '') + '</small></div></div>' + chart
      : '<p class="muted" style="margin:0 0 6px">Weigh in now and then to see the trend. Only you can see this.</p>') +
    '<div class="goal-add bw-add"><input class="plain-input" id="bwNew" inputmode="decimal" placeholder="' + esc(last ? L.fmtLoad(Number(last.weight)) : 'e.g. 180') + '" aria-label="Today’s bodyweight">' +
      '<span class="seg" role="group" aria-label="Unit">' + ['lb', 'kg'].map(u => '<button type="button" data-bw-unit="' + u + '" aria-pressed="' + (u === unit) + '">' + u + '</button>').join('') + '</span>' +
      '<button class="btn primary" data-weigh type="button">Weigh in</button></div>' +
    (list.length ? '<p class="hint-line">' + list.slice(0, 3).map(b => esc(L.fmtLoad(Number(b.weight)) + ' ' + b.unit + ' ' + fmtDay(b.measured_on, { month: 'short', day: 'numeric' })) +
      ' <button class="linkbtn" data-bw-del="' + esc(b.id) + '" aria-label="Delete this weigh-in">✕</button>').join(' · ') + '</p>' : '') +
  '</section>';
}
async function weighIn(btn) {
  const w = L.parseLoad($('bwNew').value);
  const unitBtn = view.querySelector('[data-bw-unit][aria-pressed="true"]');
  const unit = unitBtn ? unitBtn.dataset.bwUnit : prefs.unit;
  if (!(w >= 30 && w <= 1000)) { toast('Enter a bodyweight between 30 and 1000.'); return $('bwNew').focus(); }
  btn.disabled = true;
  try {
    const row = await store.addBodyweight({ measured_on: today(), weight: w, unit });
    S.bw.unshift(row);
    prefs.bodyweight = w; prefs.unit = prefs.unit || unit; savePrefs();
    render(); toast('Weighed in: ' + L.fmtLoad(w) + ' ' + unit);
  } catch (x) { fail(x); btn.disabled = false; }
}
async function removeWeighIn(id) {
  try { await store.removeBodyweight(id); S.bw = S.bw.filter(b => b.id !== id); render(); toast('Weigh-in deleted'); } catch (x) { fail(x); }
}
view.addEventListener('click', e => {
  const u = e.target.closest('[data-bw-unit]');
  if (u) view.querySelectorAll('[data-bw-unit]').forEach(b => b.setAttribute('aria-pressed', b === u));
});
view.addEventListener('keydown', e => { if (e.target.id === 'bwNew' && e.key === 'Enter') { e.preventDefault(); view.querySelector('[data-weigh]').click(); } });
const SG = { id: null, pending: [] };
const goalAddHtml = () =>
  '<div class="goal-add"><select class="plain-input" id="gMetric" aria-label="Goal type">' +
    [['visits', 'Show up N times'], ['volume:lb', 'Move N lb'], ['volume:kg', 'Move N kg'], ['lift:lb', 'Lift a weight (lb)'], ['lift:kg', 'Lift a weight (kg)'], ['workout', 'Do a workout N times']]
      .map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') + '</select>' +
    '<input class="plain-input" id="gTarget" inputmode="decimal" placeholder="How many" aria-label="Target"><button class="btn" id="gAdd" type="button">Add</button></div>' +
  '<div id="gExtra"></div>';
function drawGoalExtra() {
  const kind = $('gMetric').value.split(':')[0], box = $('gExtra');
  $('gTarget').placeholder = kind === 'lift' ? 'Weight' : kind === 'workout' ? 'Times' : 'How many';
  SG.goalEx = null;
  // A lift goal: search the catalogue and tap one (your recent lifts show before you type). The
  // browser's own suggestion list was unreliable on phones and needed the exact name.
  if (kind === 'lift') { box.innerHTML = '<input class="plain-input" id="gEx" type="search" enterkeyhint="search" placeholder="Which exercise? Search…" aria-label="Exercise" autocomplete="off">' +
    '<ul class="results gex-res" id="gExRes" aria-label="Exercises"></ul>'; drawGoalEx(''); }
  else if (kind === 'workout') box.innerHTML = S.templates.length ? '<select class="plain-input" id="gWk" aria-label="Workout">' +
    S.templates.filter(t => !isBlock(t)).map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') + '</select>' : '<p class="hint-line">Make a workout first.</p>';
  else box.innerHTML = '';
}
// The lift goal's exercise: up to six matches (or your recent lifts), or the one you picked.
function drawGoalEx(q) {
  const res = $('gExRes');
  if (!res) return;
  if (SG.goalEx) {
    res.innerHTML = '<li><button type="button" class="sel" data-gex-clear aria-pressed="true"><span>' + esc(exName(SG.goalEx)) + '</span><small>Change</small></button></li>';
    return;
  }
  const list = L.searchExercises(q, S.exercises, S.aliases, recentExerciseIds()).slice(0, 6);
  res.innerHTML = list.length
    ? list.map(e => '<li><button type="button" data-gex="' + esc(e.id) + '"><span class="lib-name">' + esc(e.name) + '<small class="lib-sub">' + esc(libTag(e)) + '</small></span></button></li>').join('')
    : '<li class="hint-line">' + (q.trim() ? 'No matches.' : 'Type to search the exercises.') + '</li>';
}
inner.addEventListener('change', e => { if (e.target.id === 'gMetric') drawGoalExtra(); });
inner.addEventListener('input', e => { if (e.target.id === 'gEx') { SG.goalEx = null; drawGoalEx(e.target.value); } });
// Someone else's season you joined: their goals apply to you; add your own on top.
function openMyGoals(id) {
  const sn = seasonById(id);
  LG.mode = 'season'; SG.id = id; SG.pending = []; SG.planPending = []; SG.personal = true;
  inner.innerHTML =
    '<div class="sheet-head"><div><small class="muted">' + esc(sn.name) + '</small><h2 id="sheetTitle">My goals</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<div class="field-label"><span>Season goals</span><small>set by ' + esc(ownerName(sn)) + ', for everyone</small></div>' +
      (seasonGoals(sn).length ? seasonGoals(sn).map(g => '<div class="row goal-row"><span>' + esc(g.name) + '</span></div>').join('') : '<p class="hint-line" style="margin:0 2px 8px">None yet.</p>') +
      '<div class="field-label"><span>Your goals</span><small>everyone in the season can see them</small></div><div id="snGoals"></div>' +
      goalAddHtml() +
      '<p class="warn" id="snErr" role="alert"></p>' +
      '<button class="btn primary block" data-close>Done</button>' +
    '</div>';
  openSheet();
  drawGoals();
}
// ===========================================================================
// Your goals and your week. These belong to the app, not to any season: everyone has them, and
// someone who never touches seasons or events still gets the whole thing. They're kept in a private
// holder for the calendar year (a season row named CORE_NAME, never shown as a season), so goals
// count from the 1st of January; each new year starts a fresh holder with your week and goals
// carried over.
// ===========================================================================
const CORE_NAME = 'Your goals and week';
const isCore = s => !!s && s.name === CORE_NAME && !s.is_shared && s.created_by === S.myId;
const coreFor = year => (S.seasons || []).find(s => isCore(s) && s.starts_on === year + '-01-01');
const coreNow = () => coreFor(today().slice(0, 4));
async function ensureCore() {
  const y = today().slice(0, 4);
  let c = coreFor(y);
  if (c) return c;
  c = await store.addSeason({ name: CORE_NAME, starts_on: y + '-01-01', ends_on: y + '-12-31', is_shared: false, points: null });
  S.seasons.unshift(c);
  const prev = coreFor(String(Number(y) - 1));
  if (prev) {
    const [plans, goals] = await Promise.all([
      store.addPlans(planFor(prev.id).map(p => ({ season_id: c.id, template_id: p.template_id, position: p.position, weekdays: p.weekdays }))),
      store.addGoals(S.goals.filter(x => x.season_id === prev.id).map(g => ({ season_id: c.id, name: g.name, metric: g.metric, target: g.target, unit: g.unit, exercise_id: g.exercise_id, template_id: g.template_id }))),
    ]);
    S.plan.push(...plans); S.goals.push(...goals);
  }
  return c;
}
// A new year: carry your week and goals into it, so the Log tab keeps suggesting today's workout.
async function rolloverCore() {
  if (coreNow() || !coreFor(String(Number(today().slice(0, 4)) - 1))) return;
  try { await ensureCore(); render(); } catch (x) { /* next open tries again */ }
}
async function openCore(btn) {
  if (btn) btn.disabled = true;
  try { openSeasonSheet((await ensureCore()).id); } catch (x) { fail(x); }
  if (btn) btn.disabled = false;
}
const hasYearGoals = () => { const c = coreNow(); return !!c && S.goals.some(g => g.season_id === c.id); };
function goalsCard() {
  const c = coreNow(), goals = c ? S.goals.filter(g => g.season_id === c.id) : [];
  const m = c ? seasonM(c) : null;
  return '<section class="card"><div class="card-head"><h3 class="card-title">' + esc(T.goals) + ' for ' + today().slice(0, 4) + '</h3>' +
      '<button class="btn sm" data-core-edit>' + (goals.length ? 'Edit' : '+ Add') + '</button></div>' +
    (goals.length ? goals.map(g => goalLine(g, m, { season: c })).join('')
      : '<p class="muted" style="margin:0">Set a goal for the year: show up 150 times, move 2 million lb, or hit a number on a lift.</p>') + '</section>';
}
// The one home for your week, at the top of Routines: today, the coming days, and what repeats.
// Each routine's More › Schedule changes it too, as does the calendar and the builder's week days.
function weekCard() {
  const c = coreNow(), plan = c ? planFor(c.id).filter(p => tplById(p.template_id)) : [];
  const days = p => (p.weekdays ? [1, 2, 3, 4, 5, 6, 0].filter(d => p.weekdays & (1 << d)).map(d => DAY_NAMES[d].slice(0, 3)).join(' · ') : 'takes turns');
  const now = todayList().map(todayRow).join(''), ahead = comingRows(), pn = planNow();
  return '<section class="card week-home"><div class="card-head"><h3 class="card-title">Your week</h3>' +
      '<button class="btn sm" data-core-edit>' + (plan.length ? 'Edit' : '+ Plan it') + '</button></div>' +
    (pn ? '<div class="row day-row plan-line"><span><b>' + esc(pn.p.name) + '</b> <small class="muted">· ' + esc(planWhere(pn)) + '</small></span>' +
      '<button class="btn sm ghost" data-plan-stop>Stop</button></div>' : '') +
    now + ahead +
    (plan.length ? (now || ahead ? '<div class="field-label" style="margin-top:12px"><span>Every week</span></div>' : '') +
        '<div class="week-list">' + plan.map(p => '<div class="row"><b>' + esc(tplById(p.template_id).name) + '</b><span class="muted">' + esc(days(p)) + '</span></div>').join('') + '</div>'
      : '<p class="muted" style="margin:' + (now || ahead ? '10px' : '0') + ' 0 0">Put routines on days (Push on Mondays) or let them take turns, and the Log tab suggests today’s. Or use <b>More › Schedule</b> on any routine.</p>') + '</section>';
}

function openSeasonSheet(id) {
  if (id && !isMine(seasonById(id))) return openMyGoals(id);
  LG.mode = 'season';
  SG.id = id; SG.pending = []; SG.planPending = []; SG.personal = false;
  const s = id ? seasonById(id) : { name: '', starts_on: today(), ends_on: L.addDays(today(), 55), is_shared: false };
  const core = SG.core = isCore(s);
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">' + (core ? 'Your goals and week' : id ? 'Edit season' : 'New season') + '</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' + (core ? '<p class="hint-line" style="margin-top:0">Goals count from January 1st. Changes save as you make them.</p>' :
      '<div class="field-label"><span>Name</span></div><input class="plain-input" id="snName" maxlength="60" value="' + esc(s.name) + '" placeholder="e.g. Winter bulk">' +
      '<div class="grid2"><div><div class="field-label"><span>Starts</span></div><input class="plain-input" id="snStart" type="date" value="' + esc(s.starts_on) + '"></div>' +
        '<div><div class="field-label"><span>Ends</span></div><input class="plain-input" id="snEnd" type="date" value="' + esc(s.ends_on) + '"></div></div>' +
      '<div class="toggles" style="margin-top:12px"><button type="button" class="toggle" id="snShare" aria-pressed="' + !!s.is_shared + '">' + shareLabel(s.is_shared) + '</button></div>' +
      pointsHtml(s.points)) +
      '<div class="field-label"><span>Goals</span><small>optional</small></div><div id="snGoals"></div>' +
      goalAddHtml() +
      '<div class="field-label"><span>Routines</span><small>optional</small></div><div id="snPlan"></div>' +
      (S.templates.length ? '<div class="goal-add plan-add"><select class="plain-input" id="pRoutine" aria-label="Routine to add">' +
          S.templates.slice().sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name))
            .map(t => '<option value="' + esc(t.id) + '">' + esc(t.name + (isBlock(t) ? ' (block)' : '') + (isMine(t) ? '' : ' (by ' + ownerName(t) + ')')) + '</option>').join('') +
        '</select><button class="btn" id="pAdd" type="button">Add</button></div>'
        : '<p class="hint-line">Make a routine first, then plan the season around it.</p>') +
      '<p class="warn" id="snErr" role="alert"></p>' +
      '<button class="btn primary block" id="snSave">' + (core ? 'Done' : id ? 'Save season' : 'Start season') + '</button>' +
      (id && !core ? '<button class="btn block" style="margin-top:10px;color:var(--accent)" id="snDelete">Delete season</button>' : '') +
    '</div>';
  openSheet();
  drawGoals();
  drawPlan();
  if (!id) setTimeout(() => $('snName').focus(), 60);
}
function drawGoals() {
  const goals = SG.id ? S.goals.filter(g => g.season_id === SG.id && (SG.personal ? g.created_by === S.myId : (!g.created_by || g.created_by === S.myId))) : SG.pending;
  $('snGoals').innerHTML = goals.length ? goals.map((g, i) => '<div class="row goal-row"><span>' + esc(g.name) + '</span>' +
      '<button class="iconbtn sm" data-goal-del="' + esc(g.id || 'p' + i) + '" aria-label="Remove goal">✕</button></div>').join('')
    : '<p class="hint-line" style="margin:0 2px 8px">e.g. 24 visits, or 400,000 lb moved.</p>';
}
const shareLabel = on => (on ? '✓ Shared with the crew' : 'Share with the crew');
function drawPlan() {
  const list = SG.id ? planFor(SG.id) : SG.planPending;
  const shared = SG.id ? !!(seasonById(SG.id) || {}).is_shared : !!$('snShare') && $('snShare').getAttribute('aria-pressed') === 'true';
  $('snPlan').innerHTML = list.length ? list.map((p, i) => {
    const key = p.id || 'p' + i, t = tplById(p.template_id);
    return '<div class="plan-row"><div class="row"><span><b>' + (i + 1) + '.</b> ' + esc(t ? t.name : 'A routine you can’t see') +
        (shared && t && isMine(t) && !t.is_shared ? ' <small class="muted">· not shared, so only you see it</small>' : '') + '</span>' +
      '<span>' + (i ? '<button class="iconbtn sm" data-plan-up="' + esc(key) + '" aria-label="Move up">↑</button>' : '') +
      '<button class="iconbtn sm" data-plan-del="' + esc(key) + '" aria-label="Remove from the plan">✕</button></span></div>' +
      '<div class="days" role="group" aria-label="Days for ' + esc(t ? t.name : 'this routine') + '">' + DAY_NAMES.map((d, b) =>
        '<button type="button" data-plan-day="' + esc(key) + '" data-bit="' + b + '" aria-pressed="' + !!(p.weekdays & (1 << b)) + '" aria-label="' + d + '">' + d.slice(0, 2) + '</button>').join('') + '</div></div>';
  }).join('') + '<p class="hint-line">Routines with no days ticked take turns, in this order. Tick days to pin one to them. The Log tab suggests today’s.</p>'
    : '<p class="hint-line" style="margin:0 2px 8px">e.g. Push, Pull, Legs taking turns, or Push on Mondays.</p>';
}
async function planClick(b) {
  const list = SG.id ? planFor(SG.id) : SG.planPending;
  const find = key => (SG.id ? list.find(p => p.id === key) : SG.planPending[Number(key.slice(1))]);
  try {
    if (b.id === 'pAdd') {
      if (list.length >= 30) return toast('That’s plenty of routines for one season.');
      const e = { template_id: $('pRoutine').value, position: (list.length ? Math.max(...list.map(p => p.position)) : 0) + 1, weekdays: 0 };
      if (SG.id) S.plan.push(await store.addPlan({ ...e, season_id: SG.id })); else SG.planPending.push(e);
    } else if (b.dataset.planDay) {
      const p = find(b.dataset.planDay), w = p.weekdays ^ (1 << Number(b.dataset.bit));
      if (SG.id) Object.assign(p, await store.updatePlan(p.id, { weekdays: w })); else p.weekdays = w;
    } else if (b.dataset.planDel) {
      const p = find(b.dataset.planDel);
      if (SG.id) { await store.removePlan(p.id); S.plan = S.plan.filter(x => x.id !== p.id); } else SG.planPending.splice(SG.planPending.indexOf(p), 1);
    } else if (b.dataset.planUp) {
      const p = find(b.dataset.planUp), i = list.indexOf(p), q = list[i - 1];
      if (SG.id) {
        const [a, c] = [p.position === q.position ? q.position - 1 : q.position, p.position];
        Object.assign(p, await store.updatePlan(p.id, { position: Math.max(1, a) })); Object.assign(q, await store.updatePlan(q.id, { position: c }));
      } else { SG.planPending[i] = q; SG.planPending[i - 1] = p; SG.planPending.forEach((x, k) => { x.position = k + 1; }); }
    }
  } catch (x) { return fail(x); }
  vibrate(5); drawPlan();
}
async function seasonClick(b) {
  if (b.id === 'pAdd' || b.dataset.planDay || b.dataset.planDel || b.dataset.planUp) return planClick(b);
  if (b.id === 'ptToggle') { const on = b.getAttribute('aria-pressed') !== 'true'; $('ptBox').outerHTML = pointsHtml(on ? { day: 1, pr: 3, workout: 5 } : null); return; }
  if (b.id === 'snShare') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.textContent = shareLabel(on); if (!SG.id) drawPlan(); return; }
  if (b.dataset.gex) { SG.goalEx = b.dataset.gex; $('gEx').value = exName(SG.goalEx); $('snErr').textContent = ''; drawGoalEx(''); if (!$('gTarget').value) $('gTarget').focus(); return; }
  if (b.hasAttribute('data-gex-clear')) { SG.goalEx = null; $('gEx').value = ''; drawGoalEx(''); $('gEx').focus(); return; }
  if (b.id === 'gAdd') {
    const [metric, unit] = $('gMetric').value.split(':');
    const target = L.parseLoad($('gTarget').value);
    const whole = metric === 'visits' || metric === 'workout';
    if (!(target > 0) || (whole && target % 1)) { $('snErr').textContent = whole ? 'Enter a whole number above zero.' : 'Enter a target above zero.'; return; }
    const g = { metric, unit: unit || null, target, exercise_id: null, template_id: null };
    if (metric === 'lift') {
      // The one tapped; or, typed in full, a name (or alias) that matches exactly.
      g.exercise_id = SG.goalEx || S.nameIndex.get(L.norm($('gEx') ? $('gEx').value : ''));
      if (!g.exercise_id) { $('snErr').textContent = 'Tap an exercise in the list under the box.'; return; }
      g.name = (exName(g.exercise_id) + ' ' + L.fmtLoad(target) + ' ' + unit).slice(0, 60);
    } else if (metric === 'workout') {
      g.template_id = $('gWk') ? $('gWk').value : null;
      if (!g.template_id) { $('snErr').textContent = 'Make a workout first.'; return; }
      g.name = (tplById(g.template_id).name + ' × ' + target).slice(0, 60);
    } else g.name = metric === 'visits' ? 'Show up ' + target + ' times' : 'Move ' + L.fmtBig(target) + ' ' + unit;
    $('snErr').textContent = '';
    if (SG.id) { try { S.goals.push(await store.addGoal({ ...g, season_id: SG.id })); } catch (x) { return fail(x); } }
    else SG.pending.push(g);
    $('gTarget').value = ''; drawGoals();
    if (metric === 'lift') { SG.goalEx = null; $('gEx').value = ''; drawGoalEx(''); }
    return;
  }
  if (b.dataset.goalDel) {
    const key = b.dataset.goalDel;
    if (SG.id) { try { await store.deleteGoal(key); } catch (x) { return fail(x); } S.goals = S.goals.filter(g => g.id !== key); }
    else SG.pending.splice(Number(key.slice(1)), 1);
    drawGoals();
    return;
  }
  if (b.id === 'snSave' && SG.core) { sheet.close(); render(); return; }
  if (b.id === 'snSave') {
    const name = $('snName').value.trim(), starts_on = $('snStart').value, ends_on = $('snEnd').value, is_shared = $('snShare').getAttribute('aria-pressed') === 'true';
    if (!name) { $('snErr').textContent = 'Give your season a name.'; return; }
    if (!starts_on || !ends_on || ends_on < starts_on) { $('snErr').textContent = 'The end date must be on or after the start date.'; return; }
    b.disabled = true;
    try {
      let s;
      if (SG.id) { s = await store.updateSeason(SG.id, { name, starts_on, ends_on, is_shared, points: readPoints() }); delete S.standings[s.id]; S.seasons = S.seasons.map(x => (x.id === s.id ? s : x)); }
      else {
        s = await store.addSeason({ name, starts_on, ends_on, is_shared, points: readPoints() });
        S.seasons.unshift(s);
        const [goals, plans] = await Promise.all([store.addGoals(SG.pending.map(g => ({ ...g, season_id: s.id }))), store.addPlans(SG.planPending.map(p => ({ ...p, season_id: s.id })))]);
        S.goals.push(...goals); S.plan.push(...plans);
      }
      sheet.close();
      openSeason(s.id);
      toast(SG.id ? 'Season saved' : 'Season started. Go get it.');
    } catch (x) { $('snErr').textContent = x.message; b.disabled = false; }
    return;
  }
  if (b.id === 'snDelete') {
    const s = seasonById(SG.id);
    if (!confirm('Delete the season “' + s.name + '”? Your sets aren’t touched.')) return;
    try { await store.deleteSeason(s.id); } catch (x) { return fail(x); }
    S.seasons = S.seasons.filter(x => x.id !== s.id);
    if (S.seasonOpen === s.id) S.seasonOpen = null;
    sheet.close(); render(); toast('Season deleted');
  }
}

// ===========================================================================
// History
// ===========================================================================
// Calendar: a month at a glance (days you lifted, workouts on the schedule, days a season's plan
// pins a workout to), the chosen day's detail underneath, then the list of past days.
function planOn(date) {
  const dow = L.parseDate(date).getDay(), out = [];
  for (const sn of (S.seasons || []).filter(x => inSeason(x) && x.starts_on <= date && date <= x.ends_on))
    for (const p of planFor(sn.id)) if (p.weekdays & (1 << dow) && tplById(p.template_id)) out.push({ season: sn, template_id: p.template_id });
  return out;
}
function calendarCard() {
  const [y, mo] = S.cal.month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), daysIn = new Date(y, mo, 0).getDate();
  const logged = new Set(S.days.filter(d => d.sets > 0).map(d => d.performed_on));
  const cardio = new Set((S.cardio || []).map(r => r.performed_on));
  const prs = new Set((S.bestRows || []).map(r => r.first_lifted_on));   // a day with a new best goes gold
  const cells = [];
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push('<span></span>');   // weeks start on Monday
  for (let d = 1; d <= daysIn; d++) {
    const iso = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const sched = (S.wdays || []).some(w => w.on_date === iso), plan = iso === today() ? todayList().length : iso > today() && planOn(iso).length;
    const lift = logged.has(iso), run = cardio.has(iso), pr = lift && prs.has(iso);
    const cls = [lift || run ? 'done' : '', pr ? 'pr' : '', sched || plan ? 'planned' : '', iso === today() ? 'today' : '', iso === S.cal.day ? 'sel' : ''].filter(Boolean).join(' ');
    cells.push('<button class="' + cls + '" data-cal-day="' + iso + '" aria-pressed="' + (iso === S.cal.day) + '" aria-label="' + esc(fmtDay(iso, { weekday: 'long', month: 'long', day: 'numeric' })) +
      (lift ? ', lifted' : '') + (run ? ', cardio' : '') + (pr ? ', new PR' : '') + (sched || plan ? ', workout planned' : '') + '"><b>' + d + '</b>' +
      (lift || run ? '<span class="cal-ico" aria-hidden="true">' + (lift ? '🏋️' : '') + (run ? '🏃' : '') + '</span>' : '') + '</button>');
  }
  return '<section class="card cal-card"><div class="row"><button class="iconbtn" data-cal-move="-1" aria-label="Previous month">‹</button>' +
    '<h2>' + esc(L.fmtDate(first, { month: 'long', year: 'numeric' })) + '</h2><button class="iconbtn" data-cal-move="1" aria-label="Next month">›</button></div>' +
    '<div class="cal-grid cal-head">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => '<span>' + x + '</span>').join('') + '</div>' +
    '<div class="cal-grid">' + cells.join('') + '</div>' +
    '<p class="cal-key"><span>🏋️ lifted</span><span>🏃 cardio</span><span><i class="k-pr"></i> PR</span><span><i class="k-plan"></i> planned</span></p></section>' + calDayDetail();
}
function calDayDetail() {
  const d = S.cal.day, row = S.days.find(x => x.performed_on === d && x.sets > 0);
  const sched = (S.wdays || []).filter(w => w.on_date === d && tplById(w.template_id));
  const plan = d >= today() ? planOn(d).filter(p => !sched.some(w => w.template_id === p.template_id)) : [];
  let html = '<section class="card cal-day"><h3>' + esc(d === today() ? 'Today' : fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' })) + '</h3>';
  if (row) html += '<p class="hint-line">' + row.sets + ' sets · ' + esc(volLabel(row)) + '</p>' + dayBody(d);
  if (d === today()) {   // today: the same list the Log tab and Routines show
    const now = todayList();
    html += now.map(todayRow).join('');
    if (!row && !now.length) html += '<p class="muted" style="margin:6px 0 0">Nothing planned yet.</p>';
    return html + '<button class="btn" style="margin-top:12px" data-cal-schedule="' + d + '">📅 Put a workout on this day</button></section>';
  }
  for (const w of sched) html += '<div class="row day-row"><span>📅 ' + esc(tplById(w.template_id).name) + '</span><span>' +
    (d === today() ? '<button class="btn primary sm" data-start="' + esc(w.template_id) + '">Start</button>' : '') +
    '<button class="iconbtn sm" data-unday="' + esc(w.id) + '" aria-label="Take it off this day">✕</button></span></div>';
  for (const p of plan) html += '<div class="row day-row"><span>🗓 ' + esc(tplById(p.template_id).name) + ' <small class="muted">· ' + esc(isCore(p.season) ? 'your week' : p.season.name + ' plan') + '</small></span>' +
    (d === today() ? '<span><button class="btn primary sm" data-start="' + esc(p.template_id) + '">Start</button></span>' : '') + '</div>';
  if (!row && !sched.length && !plan.length) html += '<p class="muted" style="margin:6px 0 0">' + (d < today() ? 'Rest day.' : 'Nothing planned yet.') + '</p>';
  if (d >= L.addDays(today(), -7)) html += '<button class="btn" style="margin-top:12px" data-cal-schedule="' + d + '">📅 Put a workout on this day</button>';
  return html + '</section>';
}
// A day's sets: anything in the last 120 days is already on the phone, so it opens at once.
// Older days ask the database.
function localDay(d) {
  if (S.dayCache.has(d) || d < L.addDays(today(), -RECENT_DAYS)) return S.dayCache.has(d);
  S.dayCache.set(d, recentOn(d).slice().sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
  return true;
}
async function selectCalDay(d) {
  S.cal.day = d;
  localDay(d);
  renderHistory();
  if (S.days.some(x => x.performed_on === d && x.sets > 0) && !S.dayCache.has(d)) {
    try { S.dayCache.set(d, await store.daySets(d)); } catch (x) { return fail(x); }
    if (S.cal.day === d) renderHistory();
  }
}
const PW = { date: null };
function openWorkoutPicker(date) {
  LG.mode = 'pickwk'; PW.date = date;
  const list = S.templates.filter(t => !isBlock(t) && routineItems(t.id).length);
  inner.innerHTML = '<div class="sheet-head"><div><small class="muted">' + esc(dayLabel(date)) + '</small><h2 id="sheetTitle">Put a workout on this day</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><ul class="results">' + (list.length ? list.map(t => '<li><button data-wk="' + esc(t.id) + '"><span>' + esc(t.name) + '</span><small>' +
      esc(routineItems(t.id).length + ' exercises' + (isMine(t) ? '' : ' · by ' + ownerName(t))) + '</small></button></li>').join('')
      : '<li class="muted">No workouts yet. Make one on the Routines tab, or start from the starter library.</li>') + '</ul></div>';
  openSheet();
}
async function pickWkClick(b) {
  if (!b.dataset.wk) return;
  if ((S.wdays || []).some(w => w.template_id === b.dataset.wk && w.on_date === PW.date)) { sheet.close(); return toast('Already on that day'); }
  b.disabled = true;
  try { S.wdays.push(await store.addWorkoutDay({ template_id: b.dataset.wk, on_date: PW.date })); S.wdays.sort((a, c) => a.on_date.localeCompare(c.on_date)); }
  catch (x) { b.disabled = false; return fail(x); }
  sheet.close(); render(); toast('On the calendar: ' + tplById(b.dataset.wk).name + ', ' + dayLabel(PW.date));
}
function renderHistory() {
  if (!S.cal) S.cal = { month: today().slice(0, 7), day: today() };
  const days = S.days.filter(d => d.sets > 0);
  let html = calendarCard() + '<h2 class="month" style="margin-top:26px">Recent days</h2>', month = '';
  // Which of your workouts each recent day was (the one its lifts cover best), so the list reads "Push day".
  const rot = S.templates.filter(t => !isBlock(t) && (isMine(t) || subFor(t.id)) && routineItems(t.id).length).map(t => ({ template_id: t.id }));
  const wk = {}, exs = rotExercises(rot);
  for (const d of days.slice(0, S.historyLimit)) {
    if (d.performed_on < L.addDays(today(), -RECENT_DAYS)) break;
    const i = matchRoutine(rot, d.performed_on, exs);
    if (i >= 0) wk[d.performed_on] = tplById(rot[i].template_id).name;
  }
  if (!days.length) html += '<section class="card empty"><p class="muted" style="margin:0">Your days show up here once you’ve logged a set.</p></section>';
  for (const d of days.slice(0, S.historyLimit)) {
    const m = fmtDay(d.performed_on, { month: 'long', year: 'numeric' });
    if (m !== month) { html += '<h3 class="section-title">' + esc(m) + '</h3>'; month = m; }
    const open = S.open.has(d.performed_on);
    html += '<section class="card day"><button data-day="' + d.performed_on + '" aria-expanded="' + open + '">' +
      '<span><span class="when">' + esc(d.performed_on === today() ? 'Today' : fmtDay(d.performed_on)) + '</span>' + (wk[d.performed_on] ? ' <span class="day-wk">· ' + esc(wk[d.performed_on]) + '</span>' : '') +
        '<br><span class="meta">' + d.sets + ' sets · ' + d.exercises + ' exercise' + (d.exercises == 1 ? '' : 's') + '</span></span>' +
      '<span class="vol">' + esc(volLabel(d)) + '</span></button>' +
      (open ? '<div class="body">' + dayBody(d.performed_on) + '</div>' : '') + '</section>';
  }
  if (days.length > S.historyLimit) html += '<button class="btn block" style="margin-top:14px" id="moreDays">Show older days</button>';
  view.innerHTML = html;
}
function dayBody(day) {
  localDay(day);
  const sets = S.dayCache.get(day);
  if (!sets) return '<p class="muted">Loading…</p>';
  return groupByExercise(sets).map(g => '<div class="ex"><b>' + esc(exName(g.exercise_id)) + '</b><div class="chips">' +
    g.sets.map(s => '<button class="chip' + (s.is_warmup ? ' warm' : '') + '" data-edit="' + esc(s.id) + '">' + esc(setText(s)) + (s.notes ? ' <small>✎</small>' : '') + '</button>').join('') +
    '</div></div>').join('') + (sets.length ? '<button class="btn" style="margin-top:14px" data-save-day="' + esc(day) + '">Save as a workout</button>' : '') || '<p class="muted">No sets.</p>';
}
async function toggleDay(day) {
  if (S.open.has(day)) S.open.delete(day); else S.open.add(day);
  if (S.open.has(day)) localDay(day);
  if (S.open.has(day) && !S.dayCache.has(day)) {
    renderHistory();
    try { S.dayCache.set(day, await store.daySets(day)); } catch (x) { fail(x); S.open.delete(day); }
  }
  renderHistory();
}

// ===========================================================================
// Progress
// ===========================================================================
// Progress: you, over time. Totals for a period, volume by week or month, a training calendar,
// a trend for any lift, your best lifts, the clubs, and bodyweight.
const lbOf = d => L.lbEquivalent({ lb: Number(d.volume_lb) || 0, kg: Number(d.volume_kg) || 0 });
const weekOf = iso => L.addDays(iso, -((L.parseDate(iso).getDay() + 6) % 7));   // Monday
function weekly(n) {
  const start = L.addDays(weekOf(today()), -7 * (n - 1)), out = [];
  for (let i = 0; i < n; i++) out.push({ start: L.addDays(start, 7 * i), lb: 0, visits: 0, sets: 0 });
  for (const d of S.days) {
    if (!(d.sets > 0) || d.performed_on < start) continue;
    const w = out[Math.floor(L.daysBetween(start, d.performed_on) / 7)];
    if (w) { w.lb += lbOf(d); w.visits++; w.sets += Number(d.sets); }
  }
  return out;
}
function streakWeeks() {
  const w = weekly(104).reverse();
  let i = w[0].visits ? 0 : 1, n = 0;
  while (i < w.length && w[i].visits) { n++; i++; }
  return n;
}
const kpi = (label, value, sub, sparkVals) =>
  '<div class="kpi card"><small>' + esc(label) + '</small><b>' + esc(value) + '</b>' + (sub ? '<span class="kpi-sub">' + sub + '</span>' : '') + (sparkVals ? C.spark(sparkVals) : '') + '</div>';
// The muscles a week's working sets hit, each counted 1 for a lift's main muscles and ½ for its
// secondary ones: what you're hitting, what's light, and what you've missed.
S.musWeek = 'this';
function weekCoverage(start) {
  const end = L.addDays(start, 6), sets = S.recent.filter(x => x.performed_on >= start && x.performed_on <= end);
  return { sets, groups: LIB.coverage(sets, S.byId) };
}
function musclesCard() {
  const start = S.musWeek === 'last' ? L.addDays(weekOf(today()), -7) : weekOf(today());
  const { sets, groups } = weekCoverage(start), top = Math.max(10, ...groups.map(g => g.sets));
  const names = v => groups.filter(g => g.verdict === v).map(g => g.name);
  const missing = names('missing'), light = names('light');
  const seg = '<span class="seg" role="group" aria-label="Which week">' + [['this', 'This week'], ['last', 'Last week']].map(([k, l]) =>
    '<button type="button" data-mus-week="' + k + '" aria-pressed="' + (S.musWeek === k) + '">' + l + '</button>').join('') + '</span>';
  return '<section class="card c-half muscles" id="musclesBox"><div class="card-head"><h3 class="card-title">Muscles</h3>' + seg + '</div>' +
    (!sets.length ? '<p class="muted">No sets ' + (S.musWeek === 'last' ? 'last week' : 'yet this week') + '. Everything’s still to hit.</p>' :
      '<p class="mus-sum">' + (missing.length ? '<b>Missing:</b> ' + esc(missing.join(', ')) : '<b>Every muscle hit.</b>') +
        (light.length ? '<br><b>Light:</b> ' + esc(light.join(', ')) : '') + '</p>' +
      '<div class="mus-list">' + groups.map(g => '<div class="mus-row ' + g.verdict + '"><span>' + esc(g.name) + '</span>' +
        '<div class="bar" style="--p:' + (g.sets / top * 100).toFixed(1) + '%"><i></i></div><small>' + (g.sets ? L.fmtNum(g.sets, 1) : '–') + '</small></div>').join('') + '</div>' +
      '<p class="hint-line">Hard sets: 1 for a lift’s main muscles, ½ for the ones it also works. Six or more a week counts as hit.</p>') +
  '</section>';
}
function renderProgress() {
  if (!['all', 'year', '30'].includes(S.period)) S.period = 'all';
  const from = S.period === 'year' ? L.addDays(today(), -364) : S.period === '30' ? L.addDays(today(), -29) : null;
  const t = totals(from), lbEq = L.lbEquivalent(t.volume);
  const prs = S.bestRows.filter(r => !from || r.first_lifted_on >= from).length;
  const w12 = weekly(12);
  const cmp = L.compareTo(lbEq);
  // Volume chart: daily for 30 days, weekly for a year, monthly for all time.
  let vol;
  if (S.period === '30') {
    const byDay = new Map(S.days.map(d => [d.performed_on, lbOf(d)]));
    const data = Array.from({ length: 30 }, (_, i) => { const d = L.addDays(today(), i - 29); return { label: fmtDay(d, { month: 'short', day: 'numeric' }), value: byDay.get(d) || 0 }; });
    vol = { title: 'Pounds moved per day', html: C.columns({ data, every: 6, label: 'Pounds moved per day, last 30 days' }) };
  } else if (S.period === 'year') {
    const data = weekly(52).map(w => ({ label: fmtDay(w.start, { month: 'short', day: 'numeric' }), value: w.lb, tip: 'Week of ' + esc(fmtDay(w.start, { month: 'short', day: 'numeric' })) + ': <b>' + C.compact(w.lb) + ' lb</b> · ' + w.visits + ' days' }));
    vol = { title: 'Pounds moved per week', html: C.columns({ data, every: 9, label: 'Pounds moved per week, past year' }) };
  } else {
    const first = S.days.length ? S.days[S.days.length - 1].performed_on : today();
    const months = [];
    for (let m = first.slice(0, 7); m <= today().slice(0, 7);) { months.push(m); const [y, mo] = m.split('-').map(Number); m = (mo === 12 ? y + 1 : y) + '-' + String(mo === 12 ? 1 : mo + 1).padStart(2, '0'); }
    const by = new Map(months.map(m => [m, { lb: 0, visits: 0 }]));
    for (const d of S.days) { const b = by.get(d.performed_on.slice(0, 7)); if (b && d.sets > 0) { b.lb += lbOf(d); b.visits++; } }
    const data = months.slice(-24).map(m => ({ label: L.fmtDate(L.parseDate(m + '-01'), { month: 'short' }), value: by.get(m).lb,
      tip: esc(L.fmtDate(L.parseDate(m + '-01'), { month: 'long', year: 'numeric' })) + ': <b>' + C.compact(by.get(m).lb) + ' lb</b> · ' + by.get(m).visits + ' days' }));
    vol = { title: 'Pounds moved per month', html: C.columns({ data, every: data.length > 12 ? 3 : 1, label: 'Pounds moved per month' }) };
  }
  const heatVals = new Map(S.days.filter(d => d.sets > 0).map(d => [d.performed_on, lbOf(d)]));
  const best = w12.reduce((m, w) => (w.lb > m.lb ? w : m), w12[0]);
  const ms = L.milestoneProgress(L.lbEquivalent(totals().volume));
  const ach = L.achievements({ volume: totals().volume, visits: totals().visits, prs: S.bests.size });
  const earned = ach.filter(a => a.earned), nextClub = ach.find(a => a.milestone && !a.earned);
  const mark = lb => { const m = (T.clubMarks || []).find(([upTo]) => lb <= upTo); return m ? '<svg class="medal-art" viewBox="0 0 24 24" aria-hidden="true">' + m[1] + '</svg>' : null; };
  const medal = a => a.milestone ? (mark(a.need) || (a.need === 10000 ? T.icons.elephant : T.icons.club)) : a.id === 'first_pr' ? T.icons.pr : '⭐';
  view.innerHTML =
    '<div class="row page-actions prog-head"><h2 style="font-size:28px">' + esc(T.titles.progress) + '</h2>' +
    '<div class="seg" role="group" aria-label="Period">' +
      [['all', 'All time'], ['year', 'Past year'], ['30', '30 days']].map(([k, l]) => '<button data-period="' + k + '" aria-pressed="' + (S.period === k) + '">' + l + '</button>').join('') + '</div></div>' +
    (hasYearGoals() ? goalsCard() : '') +   // your vows up top once you have some; the empty prompt waits at the bottom
    '<div class="kpis">' +
      kpi('Pounds moved', C.compact(lbEq) + ' lb', lbEq > 0 ? 'about ' + esc(L.fmtNum(cmp.times, cmp.times < 10 ? 1 : 0)) + ' × a ' + esc(cmp.thing) : 'nothing yet', w12.map(w => w.lb)) +
      kpi('Gym days', L.fmtNum(t.visits, 0), streakWeeks() ? T.icons.streak + ' ' + streakWeeks() + ' ' + T.streak : 'no streak going', w12.map(w => w.visits)) +
      kpi('Sets', L.fmtNum(t.sets, 0), t.visits ? Math.round(t.sets / t.visits) + ' a session' : '', w12.map(w => w.sets)) +
      kpi('Personal bests', L.fmtNum(prs, 0), 'set ' + (from ? 'in this period' : 'all time'), null) +
    '</div>' +
    '<section class="card c-wide"><div class="card-head"><h3 class="card-title">' + vol.title + '</h3><small class="muted">Warm-ups excluded</small></div>' + vol.html + '</section>' +
    '<section class="card c-side"><div class="card-head"><h3 class="card-title">Training calendar</h3><small class="muted">26 weeks</small></div>' + C.heatmap({ values: heatVals, end: today(), label: 'Days lifted in the last 26 weeks, shaded by pounds moved' }) +
      '<p class="hint-line">Best of the last 12 weeks: week of ' + esc(fmtDay(best.start, { month: 'short', day: 'numeric' })) + ', <b>' + C.compact(best.lb) + ' lb</b> over ' + best.visits + ' days.</p></section>' +
    musclesCard() +
    '<section class="card c-wide" id="trendBox"></section>' +
    '<section class="card c-full" id="recordsBox"></section>' +
    '<section class="card c-side"><div class="card-head"><h3 class="card-title">Top lifts</h3><small class="muted">by estimated 1-rep max</small></div>' +
      '<input class="search" id="bestSearch" type="search" placeholder="Find a lift" value="' + esc(S.bestQuery) + '" aria-label="Find a lift"><div id="bestsBox"></div></section>' +
    '<section class="card c-half clubs"><div class="card-head"><h3 class="card-title">' + esc(T.clubs) + '</h3><small class="muted">' + esc(T.clubsSub(ms.count)) + '</small></div>' +
      candlesSVG(ms.count, ms.ratio, T.clubsLabel(ms.count, ms.next ? ms.next.title : 'top')) +
      (ms.next ? '<div class="row" style="font-size:14px;font-weight:700"><span>' + (ms.earned ? esc(ms.earned.title) : 'Start') + '</span><span>' + esc(ms.next.title) + '</span></div>' +
        '<div class="bar" style="margin-top:6px;--p:' + (ms.ratio * 100).toFixed(1) + '%"><i></i></div><p class="hint-line">' + esc(L.fmtNum(Math.ceil(ms.remaining), 0)) + ' lb to go</p>' : '<p><b>Every club unlocked.</b> Legend.</p>') +
      badgesHtml(earned.filter(a => !a.milestone).concat(earned.filter(a => a.milestone).slice(-4)).concat(nextClub ? [nextClub] : []).map(a =>
        '<div class="badge' + (a.earned ? ' got' : '') + '" title="' + esc(T.ach[a.id] || a.desc) + '"><div class="medal">' + medal(a) + '</div>' + esc(T.achTitle[a.id] || a.title) + '</div>')) + '</section>' +
    bodyweightCard() +
    (hasYearGoals() ? '' : goalsCard());
  const input = $('bestSearch');
  input.addEventListener('input', () => { S.bestQuery = input.value; drawBests(); });
  drawBests();
  drawTrend();
  drawRecords();
}
// Long lists on Progress show their top few, with a button for the rest (remembered while the app is open).
const PROG_SHOW = { bests: 5, records: 5, badges: 4 };
const progAll = k => !!(S.progAll && S.progAll.has(k));
const moreBtn = (k, n) => '<button class="btn ghost block prog-more" data-prog-all="' + k + '">Show all ' + n + '</button>';
function badgesHtml(list) {
  const shown = progAll('badges') ? list : list.slice(-PROG_SHOW.badges);   // the latest ones and the next club
  return '<div class="badges">' + shown.join('') + '</div>' + (shown.length < list.length ? moreBtn('badges', list.length) : '');
}
// Lift trend: top set and estimated 1-rep max per day, for any lift you've done.
function trendChoices() {
  const count = new Map();
  for (const r of S.recent) if (r.is_warmup !== true) count.set(r.exercise_id, (count.get(r.exercise_id) || 0) + 1);
  for (const r of S.bestRows) if (!count.has(r.exercise_id)) count.set(r.exercise_id, 0.5);
  for (const k of (S.feats || new Map()).keys()) { const id = k.split('|')[0]; if (!count.has(id)) count.set(id, 0.5); }   // holds and carries too
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 40);
}
function drawTrend() {
  const box = $('trendBox'); if (!box) return;
  const ids = trendChoices();
  if (S.trendEx && !ids.includes(S.trendEx)) ids.unshift(S.trendEx);   // a lift linked from a season plan stays picked
  if (!ids.length) { box.innerHTML = '<h3 class="card-title">Lift trends</h3><p class="muted">Log a few sessions and your lifts chart here.</p>'; return; }
  if (!S.trendEx) S.trendEx = ids[0];
  const head = '<div class="card-head"><h3 class="card-title">Lift trend</h3><select class="plain-input trend-pick" id="trendEx" aria-label="Lift to chart">' +
    ids.map(id => '<option value="' + esc(id) + '"' + (id === S.trendEx ? ' selected' : '') + '>' + esc(exName(id)) + '</option>').join('') + '</select></div>';
  S.hist = S.hist || new Map();
  S.histLoading = S.histLoading || new Set();
  let src = S.hist.get(S.trendEx);
  if (!src) {
    // The last 120 days are on the phone: chart those now, then the full history when it arrives.
    const id = S.trendEx;
    src = recentOf(id).slice().reverse();
    if (!S.histLoading.has(id)) {
      S.histLoading.add(id);
      store.exerciseHistory(id).then(h => { S.hist.set(id, h); if (id === S.trendEx && $('trendBox')) drawTrend(); })
        .catch(x => { if (!src.length && id === S.trendEx && $('trendBox')) box.innerHTML = head + '<p class="warn">Couldn’t load it: ' + esc(x.message) + '</p>'; })
        .finally(() => S.histLoading.delete(id));
    }
    if (!src.length) { box.innerHTML = head + '<p class="muted">Loading…</p>'; return; }
  }
  // What this lift's sets measure decides the chart: a field with a chart (time, distance) plots its
  // day's best; rep sets plot their load (top set and estimated 1-rep max), as before.
  const counts = new Map();
  for (const r of src) if (r.is_warmup !== true) { const m = TR.mainOf(r); if (m) counts.set(m, (counts.get(m) || 0) + 1); }
  const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'reps';
  if (TR.FIELDS[main].chart) return drawMeasureTrend(box, head, src, main);
  const rows = src.filter(r => r.is_warmup !== true && Number(r.weight) > 0 && r.reps != null);
  const unit = rows.filter(r => r.unit === 'kg').length > rows.length / 2 ? 'kg' : 'lb';
  const byDay = new Map();
  for (const r of rows.filter(r => r.unit === unit)) {
    const d = byDay.get(r.performed_on) || { top: 0, reps: 0, e1: 0 };
    if (Number(r.weight) > d.top) { d.top = Number(r.weight); d.reps = r.reps; }
    d.e1 = Math.max(d.e1, L.e1rm(Number(r.weight), r.reps) || 0);
    byDay.set(r.performed_on, d);
  }
  const days = [...byDay.keys()].sort().slice(-40);
  if (days.length < 2) { box.innerHTML = head + '<p class="muted">Only one session of this so far. Do it again and the trend appears.</p>'; return; }
  const pts = days.map(d => byDay.get(d));
  const bestE = Math.max(...pts.map(p => p.e1)), bestTop = pts.reduce((m, p, i) => (p.top > m.p.top ? { p, i } : m), { p: pts[0], i: 0 });
  const firstE = pts.find(p => p.e1)?.e1 || 0, change = bestE && firstE ? Math.round((pts[pts.length - 1].e1 - firstE) / firstE * 100) : null;
  box.innerHTML = head +
    C.lines({ labels: days.map(d => fmtDay(d, { month: 'short', day: 'numeric' })), series: [{ name: 'Top set', values: pts.map(p => p.top) }, { name: 'Est. 1-rep max', values: pts.map(p => p.e1 || null) }],
      zero: false, every: Math.ceil(days.length / 6), fmt: v => L.fmtLoad(Math.round(v)), label: exName(S.trendEx) + ' over time, in ' + unit }) +
    '<p class="hint-line">Heaviest: <b>' + esc(L.fmtLoad(bestTop.p.top) + ' ' + unit + ' × ' + bestTop.p.reps) + '</b> on ' + esc(fmtDay(days[bestTop.i], { month: 'short', day: 'numeric', year: 'numeric' })) +
      (bestE ? ' · best est. 1-rep max <b>' + esc(L.fmtLoad(Math.round(bestE))) + ' ' + unit + '</b>' : '') +
      (change != null ? ' · ' + (change >= 0 ? '+' : '') + change + '% since ' + esc(fmtDay(days[0], { month: 'short', day: 'numeric' })) : '') + '</p>';
}
// A lift measured in time or distance: its day's best of that field, from the field's own chart
// description, plus the heaviest load it's been done with.
function drawMeasureTrend(box, head, src, main) {
  const F = TR.FIELDS[main], o = TRO();
  const rows = src.filter(r => r.is_warmup !== true && TR.mainOf(r) === main);
  const byDay = new Map();
  for (const r of rows) byDay.set(r.performed_on, Math.max(byDay.get(r.performed_on) || 0, Number(r[main])));
  const days = [...byDay.keys()].sort().slice(-40);
  if (days.length < 2) { box.innerHTML = head + '<p class="muted">Only one session of this so far. Do it again and the trend appears.</p>'; return; }
  const raw = days.map(d => byDay.get(d)), best = Math.max(...raw), bestAt = days[raw.indexOf(best)];
  const change = raw[0] ? Math.round((raw[raw.length - 1] - raw[0]) / raw[0] * 100) : null;
  const heavy = rows.filter(r => Number(r.weight) > 0).reduce((m, r) => (!m || Number(r.weight) > Number(m.weight) ? r : m), null);
  box.innerHTML = head +
    C.lines({ labels: days.map(d => fmtDay(d, { month: 'short', day: 'numeric' })), series: [{ name: F.chart.name, values: raw.map(v => F.chart.value(v, o)) }],
      zero: false, every: Math.ceil(days.length / 6), fmt: v => F.chart.fmt(v, o), label: exName(S.trendEx) + ', ' + F.chart.best + ' each day' }) +
    '<p class="hint-line">' + esc(F.chart.name) + ': <b>' + esc(F.text(best, o)) + '</b> on ' + esc(fmtDay(bestAt, { month: 'short', day: 'numeric', year: 'numeric' })) +
      (heavy ? ' · heaviest <b>' + esc(L.fmtLoad(Number(heavy.weight)) + ' ' + heavy.unit) + '</b>' : '') +
      (change != null ? ' · ' + (change >= 0 ? '+' : '') + change + '% since ' + esc(fmtDay(days[0], { month: 'short', day: 'numeric' })) : '') + '</p>';
}
view.addEventListener('change', e => { if (e.target.id === 'trendEx') { S.trendEx = e.target.value; drawTrend(); } });
function drawBests() {
  const q = L.norm(S.bestQuery);
  const byEx = new Map();
  for (const r of S.bestRows) {
    const e1 = r.reps <= 12 ? L.e1rm(Number(r.heaviest), r.reps) : 0;
    const score = (e1 || Number(r.heaviest)) * (r.unit === 'kg' ? L.LB_PER_KG : 1);
    const cur = byEx.get(r.exercise_id);
    if (!cur || score > cur.score) byEx.set(r.exercise_id, { r, e1, score });
  }
  const all = [...byEx.entries()].filter(([id]) => !q || L.norm(exName(id)).includes(q)).sort((a, b) => b[1].score - a[1].score).slice(0, q ? 30 : 12);
  const rows = q || progAll('bests') ? all : all.slice(0, PROG_SHOW.bests);
  $('bestsBox').innerHTML = rows.length ? '<table class="cmp lifts"><thead><tr><th>Lift</th><th>Best set</th><th>Est. 1RM</th></tr></thead><tbody>' +
    rows.map(([id, { r, e1 }], i) => '<tr><td><span class="rank">' + (i + 1) + '</span>' + esc(exName(id)) + '<br><small>' + esc(fmtDay(r.first_lifted_on, { month: 'short', day: 'numeric', year: 'numeric' })) + '</small></td>' +
      '<td class="num">' + esc(L.fmtLoad(r.heaviest)) + ' <small>' + r.unit + ' × ' + r.reps + '</small></td><td class="num"><b>' + (e1 ? esc(L.fmtLoad(Math.round(e1))) : '–') + '</b></td></tr>').join('') + '</tbody></table>' +
      (rows.length < all.length ? moreBtn('bests', all.length) : '')
    : '<p class="muted">' + (q ? 'No bests for that yet.' : 'Your bests show up here as you log.') + '</p>';
  // Holds and carries have no 1-rep max to rank by: their bests (longest, farthest, heaviest) go below.
  const featEx = [...new Set([...(S.feats || new Map()).keys()].map(k => k.split('|')[0]))].filter(id => !q || L.norm(exName(id)).includes(q));
  if (featEx.length) $('bestsBox').innerHTML += '<div class="section-title" style="margin-top:14px">Holds and carries</div>' +
    featEx.map(id => '<p class="hint-line" style="margin:6px 2px"><b>' + esc(exName(id)) + '</b> · ' + esc(TR.featLine(id, S.feats, TRO())) + '</p>').join('');
}

// ===========================================================================
// Settings sheet
// ===========================================================================
$('menuBtn').addEventListener('click', () => openSettings());
// note: shown at the top, e.g. after signing in from an email link, with the password box ready.
function openSettings(note) {
  LG.mode = 'menu';
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">' + esc(me ? me.display_name : 'You') + '</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      (note ? '<div class="pr-flag" style="background:var(--accent-soft);color:var(--ink);animation:none">' + esc(note) + '</div>' : '') +
      '<div class="field-label"><span>Default unit</span><span class="seg" role="group" aria-label="Default unit">' +
        ['lb', 'kg'].map(u => '<button type="button" data-pref-unit="' + u + '" aria-pressed="' + (prefs.unit === u) + '">' + u + '</button>').join('') + '</span></div>' +
      '<p class="hint-line">Each set keeps its own unit, and lb and kg totals are never mixed. This is just where new exercises start.</p>' +
      '<div class="field-label" style="margin-top:22px"><span>Theme</span><small>just for you, on this device</small></div>' +
      '<div class="skins" role="group" aria-label="Theme">' + ORDER.map(id => { const t = THEMES[id], c = swatch(id);
        return '<button type="button" class="skin" data-skin="' + id + '" aria-pressed="' + (T.id === id) + '"><span class="skin-sw" style="background:' + c[0] + '"><i style="background:' + c[1] + '"></i><i style="background:' + c[2] + '"></i></span>' +
          '<span><b>' + esc(t.name) + '</b><small>' + esc(t.blurb) + '</small></span></button>'; }).join('') + '</div>' +
      '<div class="field-label" style="margin-top:22px"><span>Widgets</span><small>opt-in extras, on this device</small></div>' +
      '<div class="skins widgets-list" role="group" aria-label="Widgets">' + WIDGETS.map(w =>
        '<button type="button" class="skin widget-opt" data-widget-toggle="' + w.id + '" aria-pressed="' + widgetOn(w.id) + '">' +
          '<span class="widget-switch" aria-hidden="true"><i></i></span><span><b>' + esc(w.name) + '</b><small>' + esc(w.blurb) + '</small></span></button>').join('') + '</div>' +
      (store.demo ? '<p class="hint-line"><b>This is the demo.</b> Nothing is saved; reload to start over.</p>'
        : '<div class="field-label" style="margin-top:22px"><span>Change password</span><small>12+ characters</small></div>' +
          '<form id="pwForm"><input class="plain-input" id="newPw" type="password" autocomplete="new-password" minlength="12" required aria-label="New password">' +
          '<button class="btn block" style="margin-top:8px" type="submit">Change password</button><p class="warn" id="pwMsg" role="alert"></p></form>') +
      '<button class="btn block" style="margin-top:18px" id="signOutBtn">' + (store.demo ? 'Leave the demo' : 'Sign out') + '</button>' +
    '</div>';
  openSheet();
  const form = $('pwForm');
  if (form) form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const pw = $('newPw').value, msg = $('pwMsg'), btn = form.querySelector('button');
    if (pw.length < 12) { msg.textContent = 'Use at least 12 characters.'; return; }
    btn.disabled = true; msg.textContent = '';
    try { await store.updatePassword(pw); $('newPw').value = ''; msg.style.color = 'var(--good)'; msg.textContent = 'Password saved. Use it to sign in from now on.'; }
    catch (x) { msg.style.color = ''; msg.textContent = x.message; }
    btn.disabled = false;
  });
  if (note && $('newPw')) setTimeout(() => $('newPw').focus(), 80);
}
inner.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.prefUnit) {
    prefs.unit = b.dataset.prefUnit; savePrefs();
    inner.querySelectorAll('[data-pref-unit]').forEach(x => x.setAttribute('aria-pressed', x.dataset.prefUnit === prefs.unit));
  }
  if (b.dataset.skin) {
    prefs.theme = b.dataset.skin; savePrefs(); T = applyTheme(prefs.theme);
    inner.querySelectorAll('[data-skin]').forEach(x => x.setAttribute('aria-pressed', x.dataset.skin === T.id));
    if (currentTab) $('pageTitle').textContent = T.titles[currentTab];
    render();
  }
  if (b.dataset.widgetToggle) {
    const w = widgetById(b.dataset.widgetToggle);
    prefs.widgets = { ...prefs.widgets, [w.id]: !widgetOn(w.id) };
    // First time on: it starts fresh today (a pet hatches from an egg). Switching off keeps its data.
    if (prefs.widgets[w.id] && !(prefs.widgetData && prefs.widgetData[w.id])) widgetCtx(w).save(w.start(widgetCtx(w)));
    savePrefs();
    b.setAttribute('aria-pressed', widgetOn(w.id));
    render();
  }
  if (b.id === 'signOutBtn') { sheet.close(); await store.signOut(); if (!store.demo) { S.recent = []; showSignIn(); } }
});

// ===========================================================================
// Start
// ===========================================================================
// Keep the app's files on the phone (see sw.js). Skipped on a local dev server unless ?sw is in the
// address, so changes show up while working on the app.
if ('serviceWorker' in navigator && (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // A newer version of the app arrived in the background: offer it once, never reload on its own
  // (you might be halfway through logging a set).
  let offered = false;
  navigator.serviceWorker.addEventListener('message', e => {
    if (offered || !e.data || e.data.type !== 'lift-updated') return;
    offered = true;
    setTimeout(() => toast('A new version of the app is ready.', { label: 'Reload', run: () => location.reload() }), 1500);
  });
}
(async function boot() {
  try {
    store = queueStore(await connect(DEMO));
    if (store.link && store.link.error) return showSignIn('That email link didn’t work (' + store.link.error + '). Links expire after a while; ask for a new one, or sign in with your password.');
    if (!(await store.session())) return showSignIn();
    await afterSignIn();
  } catch (e) {
    console.error(e);
    gate('<p class="warn" style="text-align:center">' + esc(e.message || 'Couldn’t start.') + '</p><p style="text-align:center"><a href="./" style="color:inherit">Try again</a> · <a href="?demo" style="color:inherit">Try the demo</a></p>');
  }
})();

// ===========================================================================
// Starter library and programs (from TheLift)
// ===========================================================================
const tipLine = exId => (S.tips && S.tips.get(exId) ? '<p class="tip">💡 ' + esc(S.tips.get(exId)) + '</p>' : '');
const stepsOf = sid => (SESSIONS[sid] ? SESSIONS[sid].steps : []).map(([name, sets, reps, rest, note]) => ({ exId: S.nameIndex.get(L.norm(name)), name, sets, reps, rest, note })).filter(x => x.exId);
function lastLoad(exId) {
  const x = recentOf(exId).find(r => r.is_warmup !== true);
  return x ? { weight: Number(x.weight), unit: x.unit } : { weight: 0, unit: prefs.unit };
}
// Starter steps carry no weights. Linear programs add weight when every rep was hit; 5/3/1's main
// lifts are a percent of your best (its "% of training max" is 90% of a 1-rep max).
function starterRule(sid, x, unit) {
  const pct = /(\d+)(?:–\d+)?% of training max/.exec(x.note || '');
  if (sid.startsWith('w531-') && pct) return { mode: 'percent_1rm', value: Math.round(Number(pct[1]) * 0.9 / 5) * 5 };
  if (/^(ss|sl|gs|gz|split-s5)/.test(sid) && x.reps <= 6) return { mode: 'progress', value: unit === 'kg' ? 2.5 : 5 };
  return { mode: 'last', value: 0 };
}
// Copy a starter session into a new workout or block of yours. Each person's weights come from their own history.
async function addSession(sid, kind, name) {
  const steps = stepsOf(sid);
  const t = await store.addRoutine({ name: (name || SESSIONS[sid].name).slice(0, 60), kind, notes: null });
  S.templates.push(t);
  await putItems(steps.map((x, i) => {
    const ld = lastLoad(x.exId), rule = starterRule(sid, x, ld.unit);
    return { template_id: t.id, exercise_id: x.exId, position: i + 1, sets: Math.min(20, x.sets), reps: Math.min(100, x.reps),
      load_mode: rule.mode, load_value: rule.value, unit: ld.unit, rest_s: x.rest == null ? null : Math.min(900, x.rest), note: x.note ? x.note.slice(0, 200) : null };
  }));
  return t;
}
function openStarters() {
  LG.mode = 'starters';
  const prog = p => {
    const per = p.days.length, names = [...new Set(p.days.map(d => SESSIONS[d[1]].name))];
    return '<section class="card starter"><div class="row"><h3>' + esc(p.name) + '</h3><span class="tag">' + per + ' days a week</span></div>' +
      '<p class="hint-line">' + esc([p.cat, p.level, p.weeks + ' weeks'].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="starter-about">' + esc(p.about) + '</p>' +
      '<p class="hint-line">' + esc(names.join(' · ')) + '</p>' +
      '<div class="actions"><button class="btn primary" data-prog="' + esc(p.id) + '">Set it up</button></div></section>';
  };
  const day = sid => '<section class="card starter"><h3>' + esc(SESSIONS[sid].name) + '</h3><div class="chips">' +
    stepsOf(sid).map(x => '<span class="chip">' + esc(exName(x.exId)) + ' <small>' + x.sets + ' × ' + x.reps + '</small></span>').join('') + '</div>' +
    '<div class="actions"><button class="btn" data-add-sess="' + esc(sid) + '" data-kind="workout">Add as workout</button><button class="btn ghost" data-add-sess="' + esc(sid) + '" data-kind="block">Add as block</button></div></section>';
  inner.innerHTML = '<div class="sheet-head"><h2 id="sheetTitle">Starter library</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><p class="hint-line" style="margin-top:0">Ready-made programs and days from TheLift. Anything you add becomes yours to change.</p>' +
    '<h3 class="section-title">Programs</h3><p class="hint-line" style="margin-top:-4px">Workouts on a schedule: adds them to your routines and puts each on its days in your week.</p>' +
    PROGRAMS.filter(p => !p.id.startsWith('split-')).map(prog).join('') +
    '<h3 class="section-title">Weekly splits</h3>' + PROGRAMS.filter(p => p.id.startsWith('split-')).map(prog).join('') +
    '<h3 class="section-title">Single days</h3>' + SPLIT_IDS.map(day).join('') + '</div>';
  openSheet();
}
async function starterClick(b) {
  if (b.dataset.prog) return openProgramSheet(b.dataset.prog);
  if (b.dataset.addSess) {
    b.disabled = true;
    try {
      const t = await addSession(b.dataset.addSess, b.dataset.kind);
      toast((b.dataset.kind === 'block' ? 'Block' : 'Workout') + ' added: ' + t.name);
      openDesigner(t.id);
    } catch (x) { fail(x); b.disabled = false; }
  }
}
const PG = { id: null };
function openProgramSheet(pid) {
  const p = PROGRAMS.find(x => x.id === pid);
  LG.mode = 'program'; PG.id = pid;
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  inner.innerHTML = '<div class="sheet-head"><div><button class="btn ghost" style="padding:2px 0;border:0;color:var(--muted);font-size:14px" data-back-starters>← Starter library</button>' +
      '<h2 id="sheetTitle">' + esc(p.name) + '</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><p>' + esc(p.about) + '</p>' + (p.based ? '<p class="hint-line">Based on ' + esc(p.based) + '. A simplified version, not an official copy.</p>' : '') +
      '<div class="field-label"><span>Each week</span></div><div class="week-list">' +
        p.days.slice().sort((a, c) => ((a[0] + 6) % 7) - ((c[0] + 6) % 7)).map(([d, sid]) => '<div class="row"><b>' + DN[d] + '</b><span>' + esc(SESSIONS[sid].name) + '</span></div>').join('') + '</div>' +
      '<p class="hint-line">Adds ' + new Set(p.days.map(d => d[1])).size + ' workouts to your routines and puts each on its days in your week, so the Log tab suggests the right one. Run it for about ' + p.weeks + ' weeks.</p>' +
      '<p class="warn" id="pgErr" role="alert"></p><button class="btn primary block" id="pgGo">Add to my week</button></div>';
  openSheet();
}
async function programClick(b) {
  if (b.hasAttribute('data-back-starters')) return openStarters();
  if (b.id !== 'pgGo') return;
  const p = PROGRAMS.find(x => x.id === PG.id);
  b.disabled = true; b.textContent = 'Setting up…';
  try {
    const bySession = new Map();
    for (const [d, sid] of p.days) bySession.set(sid, (bySession.get(sid) || 0) | (1 << d));
    const made = new Map(await Promise.all([...bySession.keys()].map(async sid => {
      const existing = S.templates.find(t => isMine(t) && !isBlock(t) && t.name === SESSIONS[sid].name && routineItems(t.id).length);
      return [sid, existing || await addSession(sid, 'workout')];
    })));
    // Into your week: each workout pinned to its days (days already pinned to something else are freed).
    await pinToWeek([...bySession].map(([sid, mask]) => [made.get(sid).id, mask]));
    sheet.close();
    location.hash = '#routines'; render();
    toast(p.name + ' is in your week. The Log tab suggests each day’s workout.');
  } catch (x) { $('pgErr').textContent = x.message; b.disabled = false; b.textContent = 'Add to my week'; }
}

// ===========================================================================
// Programs anyone designs. A program is one document (the lift_programs table): its weeks, a short
// note, its workouts (snapshots of routines: exercise, sets, reps, how the weight is set) and which
// day each goes on. Yours to edit; share it and the crew can add it to their own week, which
// copies its workouts into their routines and pins them to their days.
// ===========================================================================
const PDAYS = [1, 2, 3, 4, 5, 6, 0];   // Monday first
const LETTERS = 'ABCDEFG';
const PD = { id: null, name: '', weeks: 8, about: '', shared: false, workouts: [], days: {}, err: '' };
const progById = id => (S.programs || []).find(p => p.id === id);
const progWorkoutText = w => w.steps.map(s => exName(s.exercise_id) + ' ' + TR.stepText(s, S.byId.get(s.exercise_id), TRO())).join(' · ');
// Snapshot a routine as a program workout.
function snapRoutine(t) {
  return { key: 'w' + Math.random().toString(36).slice(2, 8), name: t.name.slice(0, 60),
    steps: routineItems(t.id).map(it => ({ exercise_id: it.exercise_id, sets: it.sets, ...stepMeasures(it), ...loadFor(it, true), unit: it.unit, rest_s: it.rest_s, note: it.note || null })) };
}
// About how long a session takes, and how many working sets: for the "is this sensible?" line.
function sessionSize(w) {
  const sets = w.steps.reduce((n, s) => n + s.sets, 0);
  const min = w.steps.reduce((m, s) => m + s.sets * ((s.rest_s || (s.reps <= 5 ? 150 : 90)) / 60 + 0.75), 0);
  return { sets, min: Math.round(min / 5) * 5 };
}
function openProgramDesigner(id) {
  const p = id ? progById(id) : null;
  Object.assign(PD, p ? { id: p.id, name: p.name, weeks: p.doc.weeks || 8, about: p.doc.about || '', shared: !!p.is_shared,
      workouts: JSON.parse(JSON.stringify(p.doc.workouts || [])), days: Object.fromEntries((p.doc.days || []).map(([d, k]) => [d, k])) }
    : { id: null, name: '', weeks: 8, about: '', shared: false, workouts: [], days: {} });
  PD.err = '';
  LG.mode = 'progdesign';
  drawProgramDesigner();
  openSheet();
  if (!id) setTimeout(() => { const n = $('pdName'); if (n) n.focus(); }, 60);
}
function drawProgramDesigner() {
  const letter = k => LETTERS[PD.workouts.findIndex(w => w.key === k)] || '?';
  const mine = S.templates.filter(t => !isBlock(t) && routineItems(t.id).length).sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name));
  const perWeek = PDAYS.filter(d => PD.days[d] && PD.workouts.some(w => w.key === PD.days[d])).length;
  const sizes = PD.workouts.map(sessionSize), most = sizes.reduce((m, s) => (s.sets > m.sets ? s : m), { sets: 0, min: 0 });
  const check = !PD.workouts.length ? '' : most.sets > 26 ? '⚠️ Your biggest day is ' + most.sets + ' working sets (about ' + most.min + ' min). That’s a lot for one session.'
    : most.sets < 6 ? 'Light: your biggest day is only ' + most.sets + ' working sets.' : 'About ' + most.min + ' min on the biggest day, ' + most.sets + ' working sets. Sensible.';
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">' + (PD.id ? 'Edit program' : 'New program') + '</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body pd">' +
      '<div class="field-label"><span>Name</span></div><input class="plain-input" id="pdName" maxlength="60" value="' + esc(PD.name) + '" placeholder="e.g. Big Three Builder">' +
      '<div class="pd-row"><div><div class="field-label"><span>Weeks</span></div><div class="pd-step"><button type="button" data-pd-weeks="-1" aria-label="Fewer weeks">−</button><b>' + PD.weeks + '</b><button type="button" data-pd-weeks="1" aria-label="More weeks">+</button></div></div>' +
        '<div style="flex:1"><div class="field-label"><span>About</span><small>optional</small></div><input class="plain-input" id="pdAbout" maxlength="200" value="' + esc(PD.about) + '" placeholder="Who it’s for, how it works"></div></div>' +
      '<div class="field-label" style="margin-top:18px"><span>Workouts</span><small>' + PD.workouts.length + '</small></div>' +
      (PD.workouts.length ? '<ol class="pd-workouts">' + PD.workouts.map((w, i) => { const sz = sessionSize(w);
        return '<li><span class="pd-letter">' + LETTERS[i] + '</span><div class="pd-w"><b>' + esc(w.name) + '</b><small>' + esc(progWorkoutText(w)) + '</small><small class="muted">' + sz.sets + ' working sets · about ' + sz.min + ' min</small></div>' +
          '<button type="button" class="iconbtn sm" data-pd-del="' + esc(w.key) + '" aria-label="Remove ' + esc(w.name) + '">✕</button></li>'; }).join('') + '</ol>'
        : '<p class="hint-line" style="margin:0 2px 8px">Add the workouts this program uses, from your routines (or the crew’s).</p>') +
      (PD.workouts.length < 7 ? (mine.length ? '<div class="goal-add"><select class="plain-input" id="pdRoutine" aria-label="Routine to add">' +
          mine.map(t => '<option value="' + esc(t.id) + '">' + esc(t.name + (isMine(t) ? '' : ' (by ' + ownerName(t) + ')')) + '</option>').join('') +
          '</select><button class="btn" type="button" id="pdAdd">Add</button></div>'
        : '<p class="hint-line">Make a routine first (Routines → + New → A workout), then add it here.</p>') : '') +
      '<div class="field-label" style="margin-top:18px"><span>The week</span><small>tap a day to choose its workout</small></div>' +
      '<div class="pd-week" role="group" aria-label="The week">' + PDAYS.map(d => { const k = PD.days[d], has = k && PD.workouts.some(w => w.key === k);
        return '<button type="button" data-pd-day="' + d + '" class="' + (has ? 'on' : '') + '" aria-label="' + DAY_NAMES[d] + ': ' + (has ? PD.workouts.find(w => w.key === k).name : 'rest') + '"><small>' + DAY_NAMES[d] + '</small><b>' + (has ? letter(k) : '·') + '</b></button>'; }).join('') + '</div>' +
      '<p class="hint-line">' + (perWeek ? perWeek + (perWeek === 1 ? ' day' : ' days') + ' a week. ' : '') + esc(check) + '</p>' +
      '<div class="toggles" style="margin-top:12px"><button type="button" class="toggle" id="pdShare" aria-pressed="' + PD.shared + '">' + (PD.shared ? '✓ Shared with the crew' : 'Share with the crew') + '</button></div>' +
      '<p class="warn" id="pdErr" role="alert">' + esc(PD.err) + '</p>' +
      '<button class="btn primary block" id="pdSave">' + (PD.id ? 'Save program' : 'Save program') + '</button>' +
      (PD.id ? '<button class="btn block" style="margin-top:10px" id="pdUse">Add to my week</button><button class="btn block ghost" style="margin-top:10px;color:var(--accent)" id="pdDelete">Delete program</button>' : '') +
    '</div>';
}
function pdReadFields() { const n = $('pdName'), a = $('pdAbout'); if (n) PD.name = n.value; if (a) PD.about = a.value; }
async function programDesignerClick(b) {
  pdReadFields();
  if (b.dataset.pdWeeks) { PD.weeks = Math.max(1, Math.min(52, PD.weeks + Number(b.dataset.pdWeeks))); return drawProgramDesigner(); }
  if (b.id === 'pdAdd') {
    const t = tplById($('pdRoutine').value); if (!t) return;
    const w = snapRoutine(t); PD.workouts.push(w);
    // The first time, put workouts on a sensible starting week: Mon/Wed/Fri for up to three.
    const free = [1, 3, 5, 2, 4, 6, 0].find(d => !PD.days[d]); if (free != null && PD.workouts.length <= 3) PD.days[free] = w.key;
    return drawProgramDesigner();
  }
  if (b.dataset.pdDel) { PD.workouts = PD.workouts.filter(w => w.key !== b.dataset.pdDel); for (const d in PD.days) if (PD.days[d] === b.dataset.pdDel) delete PD.days[d]; return drawProgramDesigner(); }
  if (b.dataset.pdDay != null) {   // rest → A → B → … → rest
    const d = b.dataset.pdDay, keys = PD.workouts.map(w => w.key), i = keys.indexOf(PD.days[d]);
    if (i + 1 < keys.length) PD.days[d] = keys[i + 1]; else delete PD.days[d];
    return drawProgramDesigner();
  }
  if (b.id === 'pdShare') { PD.shared = !PD.shared; return drawProgramDesigner(); }
  if (b.id === 'pdSave') return saveProgram(b);
  if (b.id === 'pdUse') { const p = progById(PD.id); if (p) return addProgramToWeek(p, b); }
  if (b.id === 'pdDelete') {
    if (!confirm('Delete “' + PD.name + '”? Anyone who already added it keeps their copy.')) return;
    try { await store.removeProgram(PD.id); S.programs = S.programs.filter(p => p.id !== PD.id); sheet.close(); render(); toast('Program deleted'); } catch (x) { fail(x); }
  }
}
async function saveProgram(b) {
  const name = PD.name.trim().replace(/\s+/g, ' ');
  PD.err = !name ? 'Give your program a name.' : !PD.workouts.length ? 'Add at least one workout.' : !Object.keys(PD.days).length ? 'Put at least one workout on a day.' : '';
  if (PD.err) return drawProgramDesigner();
  const doc = { v: 1, kind: 'program', weeks: PD.weeks, about: PD.about.trim().slice(0, 200), workouts: PD.workouts,
    days: Object.entries(PD.days).filter(([, k]) => PD.workouts.some(w => w.key === k)).map(([d, k]) => [Number(d), k]) };
  b.disabled = true;
  try {
    const row = PD.id ? await store.updateProgram(PD.id, { name, doc, is_shared: PD.shared }) : await store.addProgram({ name, doc, is_shared: PD.shared });
    S.programs = [row].concat((S.programs || []).filter(p => p.id !== row.id));
    PD.id = row.id;
    toast(PD.shared ? 'Saved and shared with the crew.' : 'Saved. Share it whenever you like.');
    drawProgramDesigner();
  } catch (x) { PD.err = x.message; b.disabled = false; drawProgramDesigner(); }
}
// Add a program to your week: its workouts become your routines (one you already made from it is
// reused), each pinned to its days; days already pinned to something else are freed.
async function addProgramToWeek(p, b) {
  if (b) b.disabled = true;
  try {
    // Each workout is one routine plus one request for all its steps; the workouts go at the same time.
    const made = new Map(await Promise.all((p.doc.workouts || []).map(async w => {
      const name = w.name.slice(0, 60);
      let t = S.templates.find(x => isMine(x) && !isBlock(x) && x.name === name && routineItems(x.id).length);
      if (!t) {
        t = await store.addRoutine({ name, kind: 'workout', notes: null });
        S.templates.push(t);
        let pos = 0;
        await putItems(w.steps.filter(s => S.byId.get(s.exercise_id)).map(s => ({ template_id: t.id, exercise_id: s.exercise_id, position: ++pos, sets: s.sets, ...stepMeasures(s),
          load_mode: s.load_mode || 'last', load_value: s.load_value ?? 0, unit: s.unit || lastLoad(s.exercise_id).unit, rest_s: s.rest_s ?? null, note: s.note || null })));
      }
      return [w.key, t];
    })));
    const masks = new Map();
    for (const [d, k] of p.doc.days || []) if (made.has(k)) masks.set(k, (masks.get(k) || 0) | (1 << d));
    await pinToWeek([...masks].map(([k, mask]) => [made.get(k).id, mask]));
    if (sheet.open) sheet.close();
    location.hash = '#routines'; render();
    toast(p.name + ' is in your week. The Log tab suggests each day’s workout.');
  } catch (x) { fail(x); if (b) b.disabled = false; }
}
async function pinToWeek(pairs) {   // [[template id, weekday mask]]
  const core = await ensureCore();
  const mine = planFor(core.id);
  let pos = mine.reduce((m, x) => Math.max(m, x.position || 0), 0);
  // Work out every change first, then send them together: changed days in parallel, new rows in one request.
  const days = new Map(mine.map(x => [x, x.weekdays])), adds = [];
  for (const [tid, mask] of pairs) {
    for (const other of mine) if (other.template_id !== tid && days.get(other) & mask) days.set(other, days.get(other) & ~mask);
    const have = mine.find(x => x.template_id === tid);
    if (have) days.set(have, days.get(have) | mask);
    else adds.push({ season_id: core.id, template_id: tid, position: ++pos, weekdays: mask });
  }
  const [, added] = await Promise.all([
    Promise.all(mine.filter(x => days.get(x) !== x.weekdays).map(x => store.updatePlan(x.id, { weekdays: days.get(x) }).then(r => Object.assign(x, r)))),
    store.addPlans(adds),
  ]);
  S.plan.push(...added);
}
// The Programs section on Routines: yours, then the crew's shared ones.
function programsSection() {
  const list = S.programs || [];
  const days = p => (p.doc.days || []).length;
  const card = p => '<section class="card prog-card"><div class="row"><div><h3 style="margin:0">' + esc(p.name) + '</h3>' +
      '<small class="muted">' + esc([p.doc.weeks + ' weeks', days(p) + ' days a week', (p.doc.workouts || []).length + ' workouts', isMine(p) ? (p.is_shared ? 'shared' : 'only you') : 'by ' + ownerName(p)].join(' · ')) + '</small></div></div>' +
    (p.doc.about ? '<p class="hint-line" style="margin:6px 0 0">' + esc(p.doc.about) + '</p>' : '') +
    '<div class="actions"><button class="btn primary" data-prog-use="' + esc(p.id) + '">Add to my week</button>' + (isMine(p) ? '<button class="btn" data-prog-edit="' + esc(p.id) + '">Edit</button>' : '') + '</div></section>';
  // A plan (week by week, pointing at routines): start or stop following it; edit it on a computer.
  const planCardRt = p => { const pn = planNow(), on = pn && pn.p.id === p.id, d = p.doc;
    return '<section class="card prog-card"><div class="row"><div><h3 style="margin:0">' + esc(p.name) + '</h3>' +
      '<small class="muted">' + esc([d.weeks + ' weeks', planPace(d), d.workouts.length + ' workout' + (d.workouts.length === 1 ? '' : 's'), isMine(p) ? (p.is_shared ? 'shared' : 'only you') : 'by ' + ownerName(p)].join(' · ')) + '</small></div></div>' +
      (d.phases && d.phases.length ? '<div class="pl-strip" aria-hidden="true">' + phaseStrip(d) + '</div>' : '') +
      (d.about ? '<p class="hint-line" style="margin:6px 0 0">' + esc(d.about) + '</p>' : '') +
      '<div class="actions">' + (on ? '<button class="btn" disabled>' + esc(planWhere(pn)) + '</button><button class="btn ghost" data-plan-stop>Stop</button>'
        : '<button class="btn primary" data-plan-start="' + esc(p.id) + '">Start this plan</button>') +
      (isMine(p) ? '<button class="btn" data-plan-edit="' + esc(p.id) + '">Edit</button>' : '') + '</div></section>'; };
  const any = p => (PL.isPlan(p) ? planCardRt(p) : card(p));
  const mine = list.filter(isMine), crew = list.filter(p => !isMine(p));
  return '<h3 class="section-title">Programs</h3>' +
    (mine.length ? mine.map(any).join('') + (wideScreen() ? '<button class="btn block" style="margin-top:10px" data-prog-new>+ New plan</button>' : '')
      : '<section class="card empty"><p class="muted" style="margin:0">Design a plan: your workouts laid out week by week, with phases and a deload, ready to share.</p><div class="actions"><button class="btn primary" data-prog-new>+ New plan</button></div></section>') +
    (crew.length ? '<h3 class="section-title">From the crew</h3>' + crew.map(any).join('') : '');
}

// ===========================================================================
// Plans: a program designed week by week (plans.js has the rules). Designed on a wide screen; on a
// phone you can start, follow and stop one.
// ===========================================================================
const wideScreen = () => window.matchMedia('(min-width: 1100px)').matches;
// The plan you're following and where you are in it, or null.
function planNow() {
  const run = (S.planRuns || []).find(r => !r.ended_on);
  const p = run && progById(run.program_id);
  if (!run || !PL.isPlan(p)) return null;
  const week = PL.weekOf(run, today());
  return { run, p, doc: p.doc, week, over: week > p.doc.weeks, phase: PL.phaseOf(p.doc, week) };
}
const planWhere = pn => pn.week < 1 ? 'starts ' + fmtDay(pn.run.starts_on) : pn.over ? 'finished' : 'week ' + pn.week + ' of ' + pn.doc.weeks + (pn.phase ? ' · ' + pn.phase.name : '');
const planPace = d => d.schedule === 'order' ? 'in order, ' + d.per_week + ' a week' : new Set((d.cells || []).filter(c => c[0] === 1).map(c => c[1])).size + ' days a week';
const phaseColor = ph => (PL.PHASE_KINDS[ph.kind] || {}).color || 'var(--muted)';
const phaseStrip = d => (d.phases || []).slice().sort((a, b) => a.from - b.from).map(ph => '<span style="flex:' + (ph.to - ph.from + 1) + ';background:' + phaseColor(ph) + '">' + esc(ph.name) + '</span>').join('');
// For an in-order plan: the last plan workout you did (before today) and how many this plan week.
function planDone(pn) {
  const tids = pn.doc.workouts.map(w => ({ template_id: w.template_id })), start = PL.weekStart(pn.run, pn.week);
  const days = [...new Set(S.recent.map(x => x.performed_on))].filter(d => d >= pn.run.starts_on && d < today()).sort().reverse();
  let lastKey = null, thisWeek = 0;
  for (const d of days) { const i = matchRoutine(tids, d); if (i < 0) continue; if (!lastKey) lastKey = pn.doc.workouts[i].key; if (d >= start) thisWeek++; }
  return { lastKey, thisWeek };
}
// Today in the plan you're following: { ...planNow(), tid } for a workout, or { rest: true }.
function planToday() {
  const pn = planNow();
  if (!pn) return null;
  if (pn.week < 1 || pn.over) return { ...pn, rest: true };
  const k = PL.todayKey(pn.doc, pn.run, today(), pn.doc.schedule === 'order' ? planDone(pn) : null), w = k && PL.workoutOf(pn.doc, k);
  return w && tplById(w.template_id) ? { ...pn, key: k, tid: w.template_id } : { ...pn, rest: true };
}
function planTodayCard(pt) {
  const head = '<div class="date">' + esc(pt.p.name) + ' · ' + esc(planWhere(pt)) + '</div>';
  if (pt.over) return '<section class="card plan-card">' + head + '<p style="margin:6px 0 0">You finished it. Start it again, or pick another plan on the Routines tab.</p>' +
    '<div class="actions"><button class="btn primary" data-plan-start="' + esc(pt.p.id) + '">Run it again</button><button class="btn ghost" data-plan-stop>Done</button></div></section>';
  if (!pt.tid) return '<section class="card plan-card">' + head + '<p style="margin:6px 0 0">' + (pt.week < 1 ? 'Your plan starts on ' + esc(fmtDay(pt.run.starts_on)) + '.' : 'Rest day by the plan.') + '</p></section>';
  const t = tplById(pt.tid);
  return '<section class="card plan-card">' + head +
    '<div class="row" style="margin-top:4px"><div><small class="muted">Today’s workout</small><h2>' + esc(t.name) + '</h2></div>' +
      '<button class="btn primary" data-start="' + esc(t.id) + '">Start</button></div>' +
    '<div class="chips">' + routineItems(t.id).map(it => '<span class="chip">' + esc(exName(it.exercise_id)) + ' <small>' + esc(myStepText(it)) + '</small></span>').join('') + '</div></section>';
}
async function startPlan(pid, b) {
  const p = progById(pid);
  if (!p) return;
  if (b) b.disabled = true;
  try {
    const cur = (S.planRuns || []).find(r => !r.ended_on);
    if (cur) Object.assign(cur, await store.updatePlanRun(cur.id, { ended_on: today() < cur.starts_on ? cur.starts_on : today() }));
    const run = await store.startPlan(pid, weekStartOf(today()));   // week 1 is this week, Monday to Sunday
    S.planRuns = [run].concat(S.planRuns || []);
    if (sheet.open) sheet.close();
    render();
    toast('Following ' + p.name + '. The Log tab shows each day’s workout.');
  } catch (x) { fail(x); if (b) b.disabled = false; }
}
async function stopPlan(b) {
  const cur = (S.planRuns || []).find(r => !r.ended_on);
  if (!cur) return;
  if (b) b.disabled = true;
  try { Object.assign(cur, await store.updatePlanRun(cur.id, { ended_on: today() < cur.starts_on ? cur.starts_on : today() })); render(); toast('Stopped following that plan.'); }
  catch (x) { fail(x); if (b) b.disabled = false; }
}

// ----- the plan designer: a wide page -----
const PLD = {};
const PLCOL = ['#c8323f', '#e4b649', '#7a9cc6', '#b07ad0', '#6fa57a', '#d0844f', '#5fb0b7', '#c9c2b8', '#9a7bd4', '#e07aa0'];
const plColor = key => PLCOL[Math.max(0, PLD.workouts.findIndex(w => w.key === key)) % PLCOL.length];
function openPlanDesigner(id) {
  const p = id ? progById(id) : null, d = PL.isPlan(p) ? p.doc : null;
  Object.assign(PLD, {
    id: d ? p.id : null, name: d ? p.name : '', weeks: d ? d.weeks : 8, about: d ? d.about || '' : '', shared: d ? !!p.is_shared : false,
    schedule: d ? d.schedule : 'days', workouts: d ? d.workouts.map(w => ({ ...w })) : [],
    cells: new Map(d && d.cells ? d.cells.map(([w, dw, k]) => [w + '|' + dw, k]) : []),
    order: d && d.order ? d.order.slice() : [], perWeek: d && d.per_week || 3,
    phases: d && d.phases ? d.phases.map(x => ({ ...x })) : [],
    progression: d && d.progression ? d.progression.map(x => ({ exercise_id: x.exercise_id, pct: x.pct.map(Number) })) : [],
    brush: null, week: 1, progEx: d && d.progression && d.progression[0] ? d.progression[0].exercise_id : null, err: '', dirty: false,
  });
  if (!PLD.brush && PLD.workouts[0]) PLD.brush = PLD.workouts[0].key;
  LG.mode = 'plandesign';
  drawPlanDesigner();
  openSheet();
  sheet.querySelector('.sheet').classList.add('wide');
  if (!id) setTimeout(() => { const n = $('plName'); if (n) n.focus(); }, 60);
}
const plDirty = () => { PLD.dirty = true; };
// Lifts in the plan's workouts that can carry a % progression (measured in reps).
function plLifts() {
  const ids = new Set();
  for (const w of PLD.workouts) for (const it of routineItems(w.template_id)) if (TR.mainField(exType(it.exercise_id)) === 'reps') ids.add(it.exercise_id);
  return [...ids];
}
// Hard sets per muscle in a week, from what's on it.
function plVolume(week) {
  const keys = PLD.schedule === 'days' ? [...PLD.cells].filter(([k]) => Number(k.split('|')[0]) === week).map(([, v]) => v)
    : Array.from({ length: PLD.perWeek }, (_, i) => PLD.order[i % Math.max(1, PLD.order.length)]).filter(Boolean);
  const by = new Map();
  for (const k of keys) { const w = PLD.workouts.find(x => x.key === k); if (!w) continue;
    for (const it of routineItems(w.template_id)) { const m = LIB.muscleKeyOf(S.byId.get(it.exercise_id) || { name: exName(it.exercise_id) }); by.set(m, (by.get(m) || 0) + Number(it.sets || 0)); } }
  return [...by].filter(([m]) => m !== 'mobility' && m !== 'other').sort((a, b) => b[1] - a[1]).slice(0, 6);
}
function drawPlanDesigner() {
  const o = PLD, DAYS = [1, 2, 3, 4, 5, 6, 0];
  const usable = S.templates.filter(t => !isBlock(t) && routineItems(t.id).length && !o.workouts.some(w => w.template_id === t.id))
    .sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name));
  const uses = k => o.schedule === 'days' ? [...o.cells.values()].filter(v => v === k).length : o.order.filter(v => v === k).length;
  const wName = k => { const w = o.workouts.find(x => x.key === k), t = w && tplById(w.template_id); return t ? t.name : 'A workout you can’t see'; };
  const palette = '<aside class="pl-pal" aria-label="Workouts in this plan"><h3 class="pl-h">Workouts</h3>' +
    '<p class="hint-line">' + (o.schedule === 'days' ? 'Pick one, then tap days to put it on them.' : 'Tap one to add it to the order.') + '</p>' +
    o.workouts.map(w => { const t = tplById(w.template_id), sz = t ? sessionSize({ steps: routineItems(t.id) }) : null;
      return '<div class="pl-wrow"><button type="button" class="pl-w" data-pl-brush="' + esc(w.key) + '" aria-pressed="' + (o.brush === w.key) + '"><i style="background:' + plColor(w.key) + '"></i>' +
        '<span><b>' + esc(wName(w.key)) + '</b><small>' + (sz ? sz.sets + ' sets · ~' + sz.min + ' min' : '') + '</small></span><em>×' + uses(w.key) + '</em></button>' +
        '<button type="button" class="iconbtn sm" data-pl-del="' + esc(w.key) + '" aria-label="Take ' + esc(wName(w.key)) + ' out of the plan">✕</button></div>'; }).join('') +
    (o.schedule === 'days' ? '<button type="button" class="pl-w rest" data-pl-brush="rest" aria-pressed="' + (o.brush === 'rest') + '"><i></i><span><b>Rest</b><small>clear a day</small></span></button>' : '') +
    (o.workouts.length < 10 ? (usable.length ? '<div class="pl-add"><select class="plain-input" id="plAddSel" aria-label="A routine to add">' +
        usable.map(t => '<option value="' + esc(t.id) + '">' + esc(t.name + (isMine(t) ? '' : ' (by ' + ownerName(t) + ')')) + '</option>').join('') + '</select><button type="button" class="btn" data-pl-add>Add</button></div>'
      : '<p class="hint-line">Make workouts on the Routines tab, then add them here.</p>') : '') + '</aside>';

  const head = '<div class="pl-grid pl-dows"><span></span>' + DAYS.map(d => '<span>' + DAY_NAMES[d] + '</span>').join('') + '<span></span></div>';
  const rows = Array.from({ length: o.weeks }, (_, i) => i + 1).map(w => {
    const ph = o.phases.find(x => w >= x.from && w <= x.to);
    return '<div class="pl-grid"><button type="button" class="pl-wk" data-pl-week="' + w + '" aria-pressed="' + (o.week === w) + '" style="border-left-color:' + (ph ? phaseColor(ph) : 'var(--line)') + '"><b>Week ' + w + '</b><small' + (ph ? ' style="color:' + phaseColor(ph) + '"' : '') + '>' + esc(ph ? ph.name : '') + '</small></button>' +
      DAYS.map(d => { const k = o.cells.get(w + '|' + d), pct = k && o.progEx ? planPct(w) : null;
        return '<button type="button" class="pl-cell' + (k ? ' on' : '') + '" data-pl-cell="' + w + '|' + d + '" style="' + (k ? 'box-shadow: inset 3px 0 0 ' + plColor(k) : '') + '" aria-label="Week ' + w + ', ' + DAY_NAMES[d] + ': ' + esc(k ? wName(k) : 'rest') + '">' +
          (k ? '<b>' + esc(wName(k)) + '</b>' + (pct != null && workoutHas(k, o.progEx) ? '<small>' + esc(shortName(o.progEx)) + ' ' + L.fmtNum(pct, 1) + '%</small>' : '') : '<small>Rest</small>') + '</button>'; }).join('') +
      (w < o.weeks ? '<button type="button" class="iconbtn sm" data-pl-copy="' + w + '" aria-label="Copy week ' + w + ' to week ' + (w + 1) + '" title="Copy to the next week">↓</button>' : '<span></span>') + '</div>';
  }).join('');
  const orderList = '<div class="pl-order"><div class="row"><b>In this order, again and again</b><span class="pd-step"><button type="button" data-pl-per="-1" aria-label="Fewer a week">−</button><b>' + o.perWeek + ' a week</b><button type="button" data-pl-per="1" aria-label="More a week">+</button></span></div>' +
    (o.order.length ? '<ol>' + o.order.map((k, i) => '<li><i style="background:' + plColor(k) + '"></i><span>' + esc(wName(k)) + '</span>' +
      '<button type="button" class="iconbtn sm" data-pl-up="' + i + '" aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="iconbtn sm" data-pl-rm="' + i + '" aria-label="Remove">✕</button></li>').join('') + '</ol>'
      : '<p class="hint-line">Tap workouts on the left to line them up.</p>') +
    '<p class="hint-line">On any days you like. Miss one and the next simply waits; the week ends after ' + o.perWeek + '.</p></div>';

  const phaseRows = o.phases.map((ph, i) => '<div class="pl-phase"><input class="plain-input" data-pl-ph-name="' + i + '" maxlength="20" value="' + esc(ph.name) + '" aria-label="Phase name">' +
    '<select class="plain-input" data-pl-ph-kind="' + i + '" aria-label="Kind">' + Object.entries(PL.PHASE_KINDS).map(([k, v]) => '<option value="' + k + '"' + (ph.kind === k ? ' selected' : '') + '>' + v.name + '</option>').join('') + '</select>' +
    '<button type="button" class="iconbtn sm" data-pl-ph-del="' + i + '" aria-label="Remove phase">✕</button>' +
    '<span class="pl-ph-weeks" style="border-left-color:' + phaseColor(ph) + '">Weeks <select class="plain-input" data-pl-ph-from="' + i + '" aria-label="From week">' + weekOpts(ph.from) + '</select> to <select class="plain-input" data-pl-ph-to="' + i + '" aria-label="To week">' + weekOpts(ph.to) + '</select></span></div>').join('');
  const lifts = plLifts(), prog = o.progression.find(x => x.exercise_id === o.progEx);
  const progBox = !lifts.length ? '<p class="hint-line">Add workouts first; their lifts can then climb week by week.</p>'
    : '<select class="plain-input" id="plProgEx" aria-label="Lift">' + lifts.map(id => '<option value="' + esc(id) + '"' + (id === o.progEx ? ' selected' : '') + '>' + esc(exName(id)) + (o.progression.some(x => x.exercise_id === id) ? ' ✓' : '') + '</option>').join('') + '</select>' +
      (prog ? planChart(prog.pct) + '<div class="pl-pcts">' + prog.pct.map((v, i) => '<label><small>W' + (i + 1) + '</small><input inputmode="decimal" data-pl-pct="' + i + '" value="' + esc(L.fmtNum(v, 1)) + '" aria-label="Week ' + (i + 1) + ' %"></label>').join('') + '</div>' +
          '<div class="actions"><button type="button" class="btn sm" data-pl-climb>Climb 2.5% a week from 75</button><button type="button" class="btn sm ghost" data-pl-prog-del>Remove</button></div>' +
          '<p class="hint-line">% of each person’s best (estimated 1-rep max). Deload weeks also lighten everything else to 60%.</p>'
        : '<button type="button" class="btn" style="margin-top:8px" data-pl-prog-add>Set % by week for ' + esc(exName(o.progEx || lifts[0])) + '</button>');
  const vol = plVolume(o.week), top = Math.max(1, ...vol.map(v => v[1]));

  inner.innerHTML =
    '<div class="sheet-head"><div class="design-title pl-title"><input class="title-input" id="plName" maxlength="60" value="' + esc(o.name) + '" placeholder="Name the plan" aria-label="Plan name">' +
      '<span class="pd-step"><button type="button" data-pl-weeks="-1" aria-label="Fewer weeks">−</button><b>' + o.weeks + ' weeks</b><button type="button" data-pl-weeks="1" aria-label="More weeks">+</button></span>' +
      '<span class="seg" role="group" aria-label="Schedule">' + [['days', 'Fixed days'], ['order', 'In order']].map(([k, l]) => '<button type="button" data-pl-sched="' + k + '" aria-pressed="' + (o.schedule === k) + '">' + l + '</button>').join('') + '</span>' +
      '<button type="button" class="toggle" data-pl-share aria-pressed="' + o.shared + '">' + (o.shared ? '✓ Shared with the crew' : 'Share with the crew') + '</button>' +
      '<button type="button" class="btn primary" data-pl-save>' + (o.dirty || !o.id ? 'Save' : 'Saved') + '</button>' +
      (o.id ? '<button type="button" class="btn" data-pl-start-me>Start this plan</button>' : '') + '</div>' +
      '<button class="iconbtn" data-close aria-label="Back">←</button></div>' +
    '<div class="pl-cols">' + palette +
      '<main class="pl-main"><input class="plain-input pl-about" id="plAbout" maxlength="200" value="' + esc(o.about) + '" placeholder="Who it’s for and how it works (optional)" aria-label="About this plan">' +
        (o.schedule === 'days' ? head + rows : orderList) + '<p class="warn" id="plErr" role="alert">' + esc(o.err) + '</p></main>' +
      '<aside class="pl-side"><h3 class="pl-h">Phases</h3>' + (o.phases.length ? '<div class="pl-strip">' + phaseStrip({ phases: o.phases }) + '</div>' : '') + phaseRows +
        '<button type="button" class="btn sm" data-pl-ph-add>+ Phase</button>' +
        '<h3 class="pl-h">Lift by week</h3>' + progBox +
        '<h3 class="pl-h">Hard sets in week ' + o.week + '</h3>' + (vol.length ? vol.map(([m, n]) => '<div class="pl-vol"><span>' + esc(LIB.muscleName(m)) + '</span><span class="pl-bar"><i style="width:' + Math.round(n / top * 100) + '%"></i></span><b>' + n + '</b></div>').join('') : '<p class="hint-line">Nothing on this week yet.</p>') +
      '</aside></div>';
}
const weekOpts = sel => Array.from({ length: PLD.weeks }, (_, i) => '<option value="' + (i + 1) + '"' + (i + 1 === sel ? ' selected' : '') + '>' + (i + 1) + '</option>').join('');
const planPct = w => { const p = PLD.progression.find(x => x.exercise_id === PLD.progEx); return p ? p.pct[w - 1] : null; };
const workoutHas = (k, exId) => { const w = PLD.workouts.find(x => x.key === k); return !!w && routineItems(w.template_id).some(it => it.exercise_id === exId); };
function planChart(pct) {
  const W = 300, H = 110, lo = Math.min(...pct, 50) - 5, hi = Math.max(...pct, 90) + 5, x = i => 10 + i * (W - 20) / Math.max(1, pct.length - 1), y = v => H - 10 - (v - lo) / (hi - lo) * (H - 20);
  return '<svg class="pl-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(pct.map((v, i) => 'week ' + (i + 1) + ' ' + v + '%').join(', ')) + '">' +
    '<polyline points="' + pct.map((v, i) => x(i) + ',' + y(v)).join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>' +
    pct.map((v, i) => '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3.5" fill="var(--gold)"/>').join('') + '</svg>';
}
function planDesignerClick(b) {
  const o = PLD, d = b.dataset;
  plReadFields();
  if (d.plBrush) { o.brush = d.plBrush; if (o.schedule === 'order' && d.plBrush !== 'rest') { o.order.push(d.plBrush); plDirty(); } return drawPlanDesigner(); }
  if (d.plCell) { if (o.brush === 'rest' || o.cells.get(d.plCell) === o.brush) o.cells.delete(d.plCell); else if (o.brush) o.cells.set(d.plCell, o.brush); plDirty(); vibrate(5); return drawPlanDesigner(); }
  if (d.plCopy) { const w = Number(d.plCopy); for (const day of [0, 1, 2, 3, 4, 5, 6]) { const k = o.cells.get(w + '|' + day); if (k) o.cells.set((w + 1) + '|' + day, k); else o.cells.delete((w + 1) + '|' + day); } plDirty(); return drawPlanDesigner(); }
  if (d.plWeek) { o.week = Number(d.plWeek); return drawPlanDesigner(); }
  if (d.plWeeks) {
    o.weeks = Math.max(1, Math.min(PL.MAX_WEEKS, o.weeks + Number(d.plWeeks)));
    for (const k of [...o.cells.keys()]) if (Number(k.split('|')[0]) > o.weeks) o.cells.delete(k);
    o.phases = o.phases.filter(ph => ph.from <= o.weeks).map(ph => ({ ...ph, to: Math.min(ph.to, o.weeks) }));
    for (const p of o.progression) { while (p.pct.length < o.weeks) p.pct.push(p.pct[p.pct.length - 1] || 75); p.pct.length = o.weeks; }
    o.week = Math.min(o.week, o.weeks); plDirty(); return drawPlanDesigner();
  }
  if (d.plSched) { o.schedule = d.plSched; if (o.schedule === 'order' && !o.order.length) o.order = o.workouts.map(w => w.key); plDirty(); return drawPlanDesigner(); }
  if (b.hasAttribute('data-pl-share')) { o.shared = !o.shared; plDirty(); return drawPlanDesigner(); }
  if (b.hasAttribute('data-pl-add')) {
    const t = tplById($('plAddSel').value); if (!t) return;
    const key = 'w' + Math.random().toString(36).slice(2, 8);
    o.workouts.push({ key, template_id: t.id }); o.brush = key;
    if (o.schedule === 'order') o.order.push(key);
    if (!o.progEx) o.progEx = plLifts()[0] || null;
    plDirty(); return drawPlanDesigner();
  }
  if (d.plDel) { o.workouts = o.workouts.filter(w => w.key !== d.plDel); for (const [k, v] of [...o.cells]) if (v === d.plDel) o.cells.delete(k); o.order = o.order.filter(k => k !== d.plDel); if (o.brush === d.plDel) o.brush = o.workouts[0] ? o.workouts[0].key : null; plDirty(); return drawPlanDesigner(); }
  if (d.plPer) { o.perWeek = Math.max(1, Math.min(7, o.perWeek + Number(d.plPer))); plDirty(); return drawPlanDesigner(); }
  if (d.plUp) { const i = Number(d.plUp); [o.order[i - 1], o.order[i]] = [o.order[i], o.order[i - 1]]; plDirty(); return drawPlanDesigner(); }
  if (d.plRm) { o.order.splice(Number(d.plRm), 1); plDirty(); return drawPlanDesigner(); }
  if (b.hasAttribute('data-pl-ph-add')) {
    const last = o.phases.reduce((m, ph) => Math.max(m, ph.to), 0), from = Math.min(o.weeks, last + 1);
    o.phases.push({ name: last ? (from === o.weeks ? 'Deload' : 'Push') : 'Build', kind: last ? (from === o.weeks ? 'deload' : 'push') : 'build', from, to: last ? from : Math.max(1, o.weeks - 1) });
    plDirty(); return drawPlanDesigner();
  }
  if (d.plPhDel) { o.phases.splice(Number(d.plPhDel), 1); plDirty(); return drawPlanDesigner(); }
  if (b.hasAttribute('data-pl-prog-add')) { const ex = o.progEx || plLifts()[0]; o.progEx = ex; o.progression.push({ exercise_id: ex, pct: PL.climb(o.weeks, 75, 2.5) }); plDirty(); return drawPlanDesigner(); }
  if (b.hasAttribute('data-pl-climb')) { const p = o.progression.find(x => x.exercise_id === o.progEx); if (p) { p.pct = PL.climb(o.weeks, 75, 2.5); o.phases.forEach(ph => { if (ph.kind === 'deload') for (let w = ph.from; w <= ph.to; w++) p.pct[w - 1] = 60; }); } plDirty(); return drawPlanDesigner(); }
  if (b.hasAttribute('data-pl-prog-del')) { o.progression = o.progression.filter(x => x.exercise_id !== o.progEx); plDirty(); return drawPlanDesigner(); }
  if (b.hasAttribute('data-pl-save')) return savePlan(b);
  if (b.hasAttribute('data-pl-start-me')) { if (o.dirty) return toast('Save the plan first.'); return startPlan(o.id, b); }
}
function plReadFields() { const n = $('plName'), a = $('plAbout'); if (n) PLD.name = n.value; if (a) PLD.about = a.value; }
// Typing and picking in the designer: names, phases, the % per week, which lift.
inner.addEventListener('change', e => {
  if (LG.mode !== 'plandesign') return;
  const t = e.target, d = t.dataset, o = PLD;
  if (t.id === 'plProgEx') { o.progEx = t.value; return drawPlanDesigner(); }
  if (d.plPhKind != null) { o.phases[Number(d.plPhKind)].kind = t.value; }
  else if (d.plPhFrom != null) { const ph = o.phases[Number(d.plPhFrom)]; ph.from = Number(t.value); ph.to = Math.max(ph.to, ph.from); }
  else if (d.plPhTo != null) { const ph = o.phases[Number(d.plPhTo)]; ph.to = Number(t.value); ph.from = Math.min(ph.from, ph.to); }
  else if (d.plPhName != null) { o.phases[Number(d.plPhName)].name = t.value.trim().slice(0, 20) || 'Phase'; }
  else if (d.plPct != null) { const p = o.progression.find(x => x.exercise_id === o.progEx), v = L.parseLoad(t.value); if (p && v != null) p.pct[Number(d.plPct)] = Math.max(30, Math.min(110, v)); }
  else return;
  plDirty(); drawPlanDesigner();
});
inner.addEventListener('input', e => { if (LG.mode === 'plandesign' && (e.target.id === 'plName' || e.target.id === 'plAbout')) { plDirty(); const s = inner.querySelector('[data-pl-save]'); if (s) s.textContent = 'Save'; } });
async function savePlan(b) {
  const o = PLD;
  plReadFields();
  const name = o.name.trim().replace(/\s+/g, ' ');
  const cells = [...o.cells].map(([k, v]) => { const [w, d] = k.split('|').map(Number); return [w, d, v]; }).filter(c => o.workouts.some(w => w.key === c[2]) && c[0] <= o.weeks);
  o.err = !name ? 'Give the plan a name.' : !o.workouts.length ? 'Add at least one workout.' : o.schedule === 'days' && !cells.length ? 'Put a workout on at least one day.'
    : o.schedule === 'order' && !o.order.length ? 'Line up at least one workout.' : '';
  if (o.err) return drawPlanDesigner();
  const doc = { v: 2, kind: 'plan', weeks: o.weeks, about: o.about.trim().slice(0, 200), workouts: o.workouts.map(w => ({ key: w.key, template_id: w.template_id })), schedule: o.schedule,
    ...(o.schedule === 'days' ? { cells } : { order: o.order.filter(k => o.workouts.some(w => w.key === k)), per_week: o.perWeek }),
    phases: o.phases.map(ph => ({ name: ph.name, from: ph.from, to: ph.to, kind: ph.kind })),
    progression: o.progression.filter(p => o.workouts.some(w => workoutHas(w.key, p.exercise_id))).map(p => ({ exercise_id: p.exercise_id, pct: p.pct.slice(0, o.weeks) })) };
  b.disabled = true;
  try {
    // Sharing the plan shares your workouts in it, so the crew can follow it.
    if (o.shared) for (const w of o.workouts) { const t = tplById(w.template_id); if (t && isMine(t) && !t.is_shared) { await store.updateRoutine(t.id, { is_shared: true }); t.is_shared = true; } }
    const row = o.id ? await store.updateProgram(o.id, { name, doc, is_shared: o.shared }) : await store.addProgram({ name, doc, is_shared: o.shared });
    S.programs = [row].concat((S.programs || []).filter(p => p.id !== row.id));
    o.id = row.id; o.dirty = false; o.err = '';
    toast(o.shared ? 'Saved and shared with the crew.' : 'Saved.');
  } catch (x) { o.err = x.message; }
  drawPlanDesigner();
}

// ===========================================================================
// Cardio: one entry per session (an activity, minutes, and a distance if you have one). The
// activities are the catalogue's cardio rows and never show up among lifts, bests or programs.
// ===========================================================================
const CD = {};
const actName = id => (S.actById.get(id) || {}).name || 'Cardio';
const distUnit = () => prefs.distUnit || (prefs.unit === 'kg' ? 'km' : 'mi');
const trimNum = (v, d) => String(Number(Number(v).toFixed(d)));
const fmtMin = m => trimNum(m, 1) + ' min';
// "28 min · 5.2 km · 5:23 /km": pace only when there's a distance.
function cardioText(r) {
  const min = Number(r.minutes), dist = r.distance != null ? Number(r.distance) : null, unit = r.distance_unit || r.unit;
  if (!dist) return fmtMin(min);
  const pace = min / dist, pm = Math.floor(pace), ps = Math.round((pace - pm) * 60);
  return fmtMin(min) + ' · ' + trimNum(dist, 2) + ' ' + unit + ' · ' + (ps === 60 ? pm + 1 + ':00' : pm + ':' + String(ps).padStart(2, '0')) + ' /' + unit;
}
function openCardio(exId, editing) {
  LG.mode = 'cardio';
  const last = editing || (S.cardio || []).find(r => r.exercise_id === exId);
  Object.assign(CD, { exId, editing: editing || null, minutes: last ? Number(last.minutes) : 30,
    distance: last && last.distance != null ? Number(last.distance) : '', unit: (last && last.distance_unit) || distUnit(), day: editing ? editing.performed_on : today() });
  drawCardio();
  openSheet();
}
function drawCardio() {
  const last = !CD.editing && (S.cardio || []).find(r => r.exercise_id === CD.exId);
  inner.innerHTML = '<div class="sheet-head"><div class="lg-title"><h2 id="sheetTitle">' + esc(actName(CD.exId)) + '</h2>' +
      (CD.editing ? '' : '<button class="linkbtn" data-change>Change</button>') + '</div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      (last ? '<p class="hint-line" style="margin-top:0">Last time: ' + esc(cardioText(last)) + ' · ' + esc(fmtDay(last.performed_on, { month: 'short', day: 'numeric' })) + '</p>' : '') +
      '<div class="cd-grid"><div><div class="field-label"><label for="cdMin">Minutes</label></div>' +
        '<input class="plain-input cd-big" id="cdMin" type="number" inputmode="decimal" min="1" max="600" step="any" value="' + esc(CD.minutes) + '"></div>' +
      '<div><div class="field-label"><label for="cdDist">Distance</label><small class="muted">optional</small></div><div class="cd-dist">' +
        '<input class="plain-input cd-big" id="cdDist" type="number" inputmode="decimal" min="0" max="500" step="any" value="' + esc(CD.distance) + '">' +
        '<span class="seg" role="group" aria-label="Distance in">' + ['km', 'mi'].map(u => '<button type="button" data-cd-unit="' + u + '" aria-pressed="' + (CD.unit === u) + '">' + u + '</button>').join('') + '</span></div></div></div>' +
      '<div class="chips" role="group" aria-label="Quick minutes">' + [10, 20, 30, 45, 60].map(m => '<button type="button" class="chip" data-cd-min="' + m + '">' + m + ' min</button>').join('') + '</div>' +
      (CD.editing ? '' : '<div class="field-label"><label for="cdDay">Day</label></div><input class="plain-input" id="cdDay" type="date" min="' + L.addDays(today(), -7) + '" max="' + today() + '" value="' + CD.day + '">') +
      '<p class="warn" id="cdErr" role="alert"></p></div>' +
    '<div class="design-foot wz-foot">' + (CD.editing ? '<button class="btn ghost" data-cd-del>Delete</button>' : '<span></span>') +
      '<button class="btn primary" data-cd-save>' + (CD.editing ? 'Save changes' : 'Save') + '</button></div>';
}
const refreshFeed = () => { const box = $('winsBox'); if (box && currentTab === 'log') box.outerHTML = winsCard(); };
// Each activity's day as one line in the feed: today's total time (and distance) for it.
function postCardioWin(exId, day) {
  const rows = (S.cardio || []).filter(r => r.exercise_id === exId && r.performed_on === day);
  if (!rows.length) return unpostWin('cardio', actName(exId), day);   // a promise: callers wait so the feed is current
  const units = new Set(rows.filter(r => r.distance != null).map(r => r.distance_unit));
  const minutes = rows.reduce((a, r) => a + Number(r.minutes), 0);
  const distance = units.size === 1 ? rows.reduce((a, r) => a + Number(r.distance || 0), 0) : null;
  return postWin('cardio', actName(exId), { minutes: Math.round(minutes * 10) / 10, distance: distance ? Math.round(distance * 100) / 100 : null, unit: distance ? [...units][0] : null }, day);
}
async function cardioClick(b) {
  if (b.dataset.cdMin) { $('cdMin').value = b.dataset.cdMin; return; }
  if (b.dataset.cdUnit) {
    CD.minutes = $('cdMin').value; CD.distance = $('cdDist').value; if ($('cdDay')) CD.day = $('cdDay').value || today();
    CD.unit = prefs.distUnit = b.dataset.cdUnit; savePrefs();
    return drawCardio();
  }
  const err = msg => { $('cdErr').textContent = msg; };
  if (b.hasAttribute('data-cd-del')) {
    b.disabled = true;
    try {
      const row = CD.editing;
      await store.updateCardio(row.id, { deleted_at: new Date().toISOString() });
      S.cardio = S.cardio.filter(r => r.id !== row.id);
      closeSheet(); toast(actName(row.exercise_id) + ' deleted');
      postCardioWin(row.exercise_id, row.performed_on).then(refreshFeed);
    } catch (x) { b.disabled = false; err(x.message); }
    return;
  }
  if (!b.hasAttribute('data-cd-save')) return;
  const minutes = Number($('cdMin').value), raw = $('cdDist').value.trim(), distance = raw === '' ? null : Number(raw);
  const day = CD.editing ? CD.editing.performed_on : ($('cdDay').value || today());
  if (!(minutes > 0 && minutes <= 600)) return err('Minutes: anything from 1 to 600.');
  if (distance != null && !(distance > 0 && distance <= 500)) return err('Distance: up to 500, or leave it empty.');
  if (day > today() || day < L.addDays(today(), -7)) return err('Pick a day in the last week.');
  const f = { exercise_id: CD.exId, minutes: Math.round(minutes * 10) / 10, distance: distance == null ? null : Math.round(distance * 100) / 100, distance_unit: distance == null ? null : CD.unit };
  b.disabled = true;
  try {
    if (CD.editing) { const row = await store.updateCardio(CD.editing.id, f); S.cardio = S.cardio.map(r => (r.id === row.id ? row : r)); }
    else S.cardio.unshift(await store.addCardio({ ...f, performed_on: day }));
    vibrate(12);
    closeSheet();
    toast((CD.editing ? 'Saved: ' : 'Logged: ') + actName(CD.exId) + ', ' + cardioText(f));
    postCardioWin(f.exercise_id, day).then(refreshFeed);   // the sheet closes at once; the feed line follows
  } catch (x) { b.disabled = false; err(x.message); }
}
// The Log tab: today's cardio, each entry tappable to change, with a duplicate button.
function cardioCard() {
  const rows = (S.cardio || []).filter(r => r.performed_on === today());
  if (!rows.length) return '';
  const total = rows.reduce((a, r) => a + Number(r.minutes), 0);
  const dup = r => '<button class="chip dup" data-cd-new="' + esc(r.exercise_id) + '" aria-label="Log more ' + esc(actName(r.exercise_id)) + ', filled in from this one">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2"/><path d="M14.5 12v6M11.5 15h6"/></svg></button>';
  return '<section class="card ex-card"><div class="row"><h3>Cardio</h3><span class="muted num">' + esc(fmtMin(total)) + '</span></div>' +
    '<div class="chips">' + rows.slice().reverse().map(r => '<button class="chip" data-cd-edit="' + esc(r.id) + '" aria-label="Change ' + esc(actName(r.exercise_id)) + ', ' + esc(cardioText(r)) + '"><b>' + esc(actName(r.exercise_id)) + '</b>&nbsp;' + esc(cardioText(r)) + '</button>' + dup(r)).join('') + '</div></section>';
}

// ===========================================================================
// Rest timer: starts after you log, counts down, buzzes when it's time.
// ===========================================================================
const REST = { end: 0, timer: null, el: null };
// Rest is never started for you: a row of times under the logger (and on a routine you're following)
// starts it when you tap one. The last one you picked is marked, as a reminder, nothing more.
const REST_TIMES = [60, 90, 120, 180];
const restLabel = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
const restRow = () => '<div class="rest-pick" role="group" aria-label="Start a rest timer"><span>⏱ Rest</span>' +
  REST_TIMES.map(t => '<button type="button" data-rest-pick="' + t + '" aria-pressed="' + (prefs.restSec === t) + '">' + restLabel(t) + '</button>').join('') + '</div>';
function pickRest(b) {
  const sec = Number(b.dataset.restPick);
  prefs.restSec = sec; savePrefs();
  document.querySelectorAll('[data-rest-pick]').forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.restPick) === sec)));
  startRest(sec);
}
function restEl() {
  if (!REST.el) {
    REST.el = document.createElement('div');
    REST.el.className = 'rest-bar'; REST.el.hidden = true; REST.el.setAttribute('role', 'timer'); REST.el.setAttribute('aria-live', 'off');
    REST.el.innerHTML = '<span class="rest-time" id="restTime"></span><button type="button" data-rest="30">+30 s</button><button type="button" data-rest="skip">Skip</button>';
    REST.el.addEventListener('click', e => {
      const b = e.target.closest('[data-rest]'); if (!b) return;
      if (b.dataset.rest === 'skip') stopRest(); else { REST.end += 30000; tickRest(); }
    });
  }
  const host = sheet.open ? sheet : document.body;
  if (REST.el.parentNode !== host) host.appendChild(REST.el);
  return REST.el;
}
function startRest(sec) {
  if (!(sec > 0)) return;
  REST.end = Date.now() + sec * 1000;
  restEl().hidden = false;
  clearInterval(REST.timer); REST.timer = setInterval(tickRest, 250); tickRest();
}
function tickRest() {
  const el = restEl(), left = Math.ceil((REST.end - Date.now()) / 1000);
  if (left <= 0) { stopRest(); vibrate([200, 100, 200]); toast(T.restUp); return; }
  el.querySelector('#restTime').textContent = 'Rest ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
}
function stopRest() { clearInterval(REST.timer); if (REST.el) REST.el.hidden = true; }
// After a set from a routine step: start the step's own rest, unless the routine is all done.
// Steps without a rest time leave it to you. Returns whether a timer started.
function restAfterStep(it) {
  const f = following();
  if (!it || !(Number(it.rest_s) > 0) || !f || !nextItemOf(f.items)) return false;
  // In a superset you go straight to the partner lift; the rest comes after the last one in the run.
  if (it.with_next) return false;
  startRest(Number(it.rest_s));
  return true;
}

// ===========================================================================
// Seasons: achievements and head-to-heads inside a stretch of dates
// ===========================================================================
const BANNERS = ['#2a5fd3', '#c8423b', '#1d7f50', '#5a49c9', '#38475a'];
const bannerOf = sn => BANNERS[[...String(sn.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % BANNERS.length];
const phaseOf = sn => (today() < sn.starts_on ? 'upcoming' : today() > sn.ends_on ? 'done' : 'live');
function elapsedOf(sn) {
  const total = L.daysBetween(sn.starts_on, sn.ends_on) + 1;
  return Math.min(1, Math.max(0, (L.daysBetween(sn.starts_on, today()) + 1) / total));
}
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
function goalsDone(sn) {
  const m = seasonM(sn);
  const list = goalsFor(sn, S.myId);
  return { done: list.filter(g => goalHave(g, m, { season: sn }) >= Number(g.target)).length, of: list.length };
}
function openSeason(id) {
  S.seasonOpen = id;
  if (location.hash !== '#seasons') location.hash = '#seasons'; else renderSeasons();
  window.scrollTo(0, 0);
}
function bannerHtml(sn, big) {
  const ph = phaseOf(sn), pct = Math.round(elapsedOf(sn) * 100);
  const who = isMine(sn) ? (sn.is_shared ? 'Shared · yours' : 'Private') : 'By ' + ownerName(sn);
  return '<div class="band" style="--band:' + bannerOf(sn) + '">' +
    '<div class="band-top"><span class="pill ' + ph + '">' + (ph === 'live' ? '● Live' : ph === 'upcoming' ? 'Coming up' : 'Finished') + ' · ' + esc(seasonStatus(sn)) + '</span><span class="band-who">' + esc(who) + '</span></div>' +
    (big ? '<h1>' : '<h2>') + esc(sn.name) + (big ? '</h1>' : '</h2>') +
    '<p>' + esc(fmtDay(sn.starts_on, { month: 'short', day: 'numeric' }) + ' – ' + fmtDay(sn.ends_on, { month: 'short', day: 'numeric', year: 'numeric' })) + '</p>' +
    '<div class="elapsed" style="--p:' + pct + '%" role="img" aria-label="' + pct + '% of the season gone"><i></i></div></div>';
}
// ===========================================================================
// Season packs and stamps. A pack (seasons.js) is a curated season: its own workouts, a little
// world (a road of stations, a calendar of daily acts, a coach's trials) and stamps for small
// achievements. Joining starts a run and adds its workouts to your routines; stamps are checked
// from your own sets and kept for good. Packs are extras: nothing else in the app needs them.
// ===========================================================================
const packIds = names => new Set(names.map(n => S.nameIndex.get(L.norm(n))).filter(Boolean));
const packHelp = { addDays: L.addDays, daysBetween: L.daysBetween, e1rm: L.e1rm, ids: packIds };
const myRuns = key => (S.runs || []).filter(r => r.created_by === S.myId && r.season_key === key);
// Your run of a pack that's on now or coming up (the latest one), else null.
function liveRun(pack) {
  const r = myRuns(pack.key).slice().sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0];
  return r && runWindow(pack, r, L.addDays).to >= today() ? r : null;
}
const savedSets = () => S.recent.filter(s => s._sync !== 'waiting' && s._sync !== 'gone');
function packProgress(pack, run) { return packProgressOf(pack, run, savedSets(), packHelp); }
const myStamp = (key, stamp) => (S.stampRows || []).find(s => s.created_by === S.myId && s.season_key === key && s.stamp_key === stamp);
const stampsEarned = key => (S.stampRows || []).filter(s => s.created_by === S.myId && s.season_key === key).length;
const routineNameFor = (pack, w) => ((pack.short || pack.name) + ' · ' + w.name).slice(0, 60);
const packRoutine = (pack, w) => S.templates.find(t => t.name === routineNameFor(pack, w) && isMine(t) && !t.deleted_at);
const stepName = names => { for (const n of names) { const id = S.nameIndex.get(L.norm(n)); if (id) return exName(id); } return names[0]; };

// Earn any stamps your sets have reached, once each. Runs after data loads and after sets save.
const STAMPING = new Set();
let stampTimer = null;
function checkStamps() { clearTimeout(stampTimer); stampTimer = setTimeout(earnStamps, 800); }
async function earnStamps() {
  if (!S.myId || !S.runs || !S.stampRows) return;
  for (const key of PACK_ORDER) {
    const pack = PACKS[key];
    for (const run of myRuns(key)) {
      const { earned } = packProgress(pack, run);
      for (const st of pack.stamps) {
        const id = key + '|' + st.key;
        if (!earned[st.key] || myStamp(key, st.key) || STAMPING.has(id)) continue;
        STAMPING.add(id);
        try {
          const row = await store.addStamp({ season_key: key, stamp_key: st.key, earned_on: earned[st.key] });
          S.stampRows.push(row);
          toast(T.icons.stamp + ' ' + T.stampToast + st.name);
          vibrate([20, 40, 20]);
          if (earned[st.key] >= L.addDays(today(), -6)) postWin('stamp', st.name + ' · ' + pack.name, { season: key }, earned[st.key]);
        } catch (x) { /* already earned on another phone, or no signal: the next check tries again */ }
        STAMPING.delete(id);
      }
    }
  }
  if (currentTab === 'seasons') renderSeasons();
}

async function joinPack(key, btn) {
  const pack = PACKS[key];
  if (liveRun(pack)) return;
  btn.disabled = true;
  try {
    const starts_on = pack.kind === 'event' ? eventDates(pack, today()).from : today();
    const run = await store.addRun({ season_key: key, starts_on });
    S.runs = (S.runs || []).concat(run);
    // Its workouts become your routines (weights follow your last time), so they work with Start and the logger.
    await Promise.all(pack.workouts.filter(w => !packRoutine(pack, w)).map(async w => {
      const t = await store.addRoutine({ name: routineNameFor(pack, w), kind: 'workout', notes: null });
      S.templates.push(t);
      let pos = 0;
      const rows = [];
      for (const [names, sets, reps, flavour] of w.steps) {
        const exId = [...packIds(names)][0] || names.map(n => S.nameIndex.get(L.norm(n))).find(Boolean);
        if (exId) rows.push({ template_id: t.id, exercise_id: exId, position: ++pos, sets: Math.min(20, sets), reps: Math.min(100, reps),
          load_mode: 'last', load_value: 0, unit: lastLoad(exId).unit, rest_s: null, note: flavour || null });
      }
      await putItems(rows);
    }));
    toast('Joined ' + pack.name + '. Its workouts are in your routines.', T.id !== pack.theme && THEMES[pack.theme] ? { label: 'Try its look', run: () => trySkin(pack.theme) } : null);
    renderSeasons(); checkStamps();
  } catch (x) { fail(x); btn.disabled = false; }
}
async function leavePack(key, btn) {
  const run = liveRun(PACKS[key]); if (!run) return;
  btn.disabled = true;
  try { await store.endRun(run.id); S.runs = S.runs.filter(r => r.id !== run.id); toast('Left ' + PACKS[key].name + '. Your stamps stay.'); renderSeasons(); }
  catch (x) { fail(x); btn.disabled = false; }
}
function trySkin(id) {
  prefs.theme = id; savePrefs(); T = applyTheme(id);
  if (currentTab) $('pageTitle').textContent = T.titles[currentTab];
  render();
}

function stampHtml(pack, st, small) {
  const got = myStamp(pack.key, st.key), size = small ? 44 : 58;
  return '<div class="stamp' + (got ? ' got' : '') + '" title="' + esc(st.name + ': ' + st.hint) + '">' +
    '<span class="stamp-face" style="width:' + size + 'px;height:' + size + 'px;border-radius:' + esc(T.stampFrame) + ';' + (got ? 'background:' + esc(st.color) + ';box-shadow:0 0 0 2px ' + esc(st.color) : '') + '">' +
      (st.art ? '<svg viewBox="0 0 24 24" width="' + Math.round(size * 0.55) + '" height="' + Math.round(size * 0.55) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + st.art + '</svg>' : got ? esc(st.mark) : '?') + '</span>' +
    (small ? '' : '<b>' + esc(st.name) + '</b><small>' + esc(got ? fmtDay(got.earned_on, { month: 'short', day: 'numeric' }) : st.hint) + '</small>') + '</div>';
}
function packCard(pack) {
  const run = liveRun(pack), n = stampsEarned(pack.key);
  const when = pack.kind === 'event' ? (() => { const d = eventDates(pack, today()); return fmtDay(d.from, { month: 'short', day: 'numeric' }) + ' – ' + fmtDay(d.to, { month: 'short', day: 'numeric' }) + ' · back every year'; })() : pack.weeks + ' weeks · start any time';
  let status = '';
  if (run) { const p = packProgress(pack, run); status = run.starts_on > today() ? 'Joined · starts ' + fmtDay(run.starts_on, { month: 'short', day: 'numeric' }) : 'Joined · ' + p.days + (p.days === 1 ? ' session' : ' sessions') + ' so far'; }
  return '<section class="card pack-card"><div class="date">' + esc(when) + '</div><h2>' + esc(pack.name) + '</h2>' +
    '<p class="muted" style="margin:6px 0 10px">' + esc(pack.blurb) + '</p>' +
    '<div class="pack-mini">' + pack.stamps.map(st => stampHtml(pack, st, true)).join('') + '</div>' +
    '<p class="hint-line">' + esc((status ? status + ' · ' : '') + n + ' of ' + pack.stamps.length + ' ' + T.stamps.toLowerCase()) + '</p>' +
    '<div class="actions"><button class="btn primary" data-pack="' + esc(pack.key) + '">' + (run ? 'Open' : 'Have a look') + '</button></div></section>';
}
function renderPackPage(pack) {
  const run = liveRun(pack), p = run ? packProgress(pack, run) : null, live = run && run.starts_on <= today();
  const holiday = pack.kind === 'event' ? eventDates(pack, today()) : null;
  const canJoin = !run && (!holiday || L.daysBetween(today(), holiday.from) <= 50);
  let html = '<div class="row page-actions"><button class="btn ghost" data-pack-back>‹ Seasons</button></div>' +
    '<section class="card pack-hero"><div class="date">' + esc(pack.kind === 'event' ? fmtDay(holiday.from, { month: 'long', day: 'numeric' }) + ' – ' + fmtDay(holiday.to, { month: 'long', day: 'numeric' }) + ' · back every year' : pack.weeks + ' weeks · start any time') + '</div>' +
    '<h1>' + esc(pack.name) + '</h1><p>' + esc(pack.blurb) + '</p>' +
    (THEMES[pack.theme] && T.id !== pack.theme ? '<p class="hint-line">Pairs with the ' + esc(THEMES[pack.theme].name) + ' look; works in any theme. <button class="linkish" data-try-skin="' + esc(pack.theme) + '">Try it</button></p>' : '') +
    '<div class="actions">' + (run ? '<button class="btn ghost" data-pack-leave="' + esc(pack.key) + '">Leave</button>' : canJoin ? '<button class="btn primary" data-pack-join="' + esc(pack.key) + '">Join</button>' : '<p class="muted" style="margin:0">Opens again ' + esc(fmtDay(holiday.from, { month: 'long', day: 'numeric' })) + '.</p>') + '</div></section>';

  // Its world.
  if (pack.stations) {
    const reached = p ? Math.min(pack.stations.length, Math.floor(p.days / 2)) : 0;
    html += '<section class="card"><h3 class="card-title">The road</h3><ol class="stations">' + pack.stations.map((name, i) =>
      '<li class="' + (i < reached ? 'got' : i === reached && run ? 'next' : '') + '"><span></span>' + esc(name) + (i === reached && run ? '<small>' + (2 * (i + 1) - p.days) + ' more</small>' : '') + '</li>').join('') + '</ol>' +
      '<p class="hint-line">Every two sessions reach the next station' + (p ? '. ' + p.days + (p.days === 1 ? ' session' : ' sessions') + ' so far.' : '.') + '</p></section>';
  }
  if (pack.doors) {
    const t = today(), from = (p ? p.from : holiday.from);
    const cal = pack.calendar, n = live ? Math.min(pack.doors.length, L.daysBetween(from, t) + 1) : 0;
    const todayDoor = n >= 1 ? pack.doors[n - 1] : null, last = fmtDay(L.addDays(from, pack.doors.length - 1), { month: 'long', day: 'numeric' });
    html += '<section class="card"><h3 class="card-title">' + esc(cal.title) + '</h3><div class="doors">' + pack.doors.map((d, i) => {
      const done = p && p.doorDone[i] != null, due = i < n;
      return '<span class="door' + (done ? ' got' : due ? ' due' : '') + (i === n - 1 ? ' today' : '') + '" title="' + esc(d.name) + '">' + (i + 1) + '</span>';
    }).join('') + '</div>' +
      (todayDoor ? '<p class="door-today"><b>' + esc(cal.one) + ' ' + n + ': ' + esc(todayDoor.name) + '.</b> ' + esc(todayDoor.workout ? 'Finish the ' + pack.workouts.find(w => w.key === todayDoor.workout).name + ' workout.' : todayDoor.sets + ' sets of ' + (todayDoor.reps > 1 ? todayDoor.reps + '+ ' : '') + stepName(todayDoor.lifts) + '.') + '</p>'
        : '<p class="hint-line">The first ' + esc(cal.one.toLowerCase()) + ' opens ' + esc(fmtDay(from, { month: 'long', day: 'numeric' })) + '. ' + esc(cal.many) + ' you miss stay open until ' + esc(last) + '.</p>') + '</section>';
  }
  if (pack.letters) {
    const wk = live ? Math.min(pack.weeks, Math.floor(L.daysBetween(run.starts_on, today()) / 7) + 1) : 1;
    html += '<section class="card"><h3 class="card-title">' + (live ? 'Week ' + wk + ' of ' + pack.weeks : 'Week 1') + '</h3><blockquote class="letter">' + esc(pack.letters[wk - 1]) + '</blockquote></section>';
  }

  // Its workouts.
  const wk = live ? Math.floor(L.daysBetween(run.starts_on, today()) / 7) + 1 : 0;
  html += '<section class="card"><h3 class="card-title">Workouts</h3><div class="pack-workouts">' + pack.workouts.map(w => {
    const t = run && packRoutine(pack, w), locked = w.unlock && (!live || wk < w.unlock), done = p && p.workoutDone[w.key];
    return '<div class="pack-workout' + (locked ? ' locked' : '') + '"><div class="row"><b>' + esc(w.name) + '</b>' +
      (done ? '<span class="good-tag">done ' + esc(fmtDay(done, { month: 'short', day: 'numeric' })) + '</span>' : locked ? '<small class="muted">week ' + w.unlock + '</small>' : t ? '<button class="btn primary sm" data-start="' + esc(t.id) + '">Start</button>' : '') + '</div>' +
      '<small>' + esc(w.steps.map(([names, sets, reps, fl]) => (fl ? fl + ': ' : '') + stepName(names) + ' ' + sets + '×' + reps).join(' · ')) + '</small></div>';
  }).join('') + '</div></section>';

  // Its stamps.
  html += '<section class="card"><h3 class="card-title">' + esc(T.stamps) + '</h3><div class="stamp-grid">' + pack.stamps.map(st => stampHtml(pack, st)).join('') + '</div></section>';
  view.innerHTML = html;
}

function renderSeasons() {
  if (S.packOpen && PACKS[S.packOpen]) return renderPackPage(PACKS[S.packOpen]);
  const sn = S.seasonOpen && seasonById(S.seasonOpen);
  if (sn && inSeason(sn)) return renderSeasonPage(sn);
  if (sn && !inSeason(sn)) S.seasonOpen = null;
  const all = (S.seasons || []).filter(x => !isCore(x));
  const mine = all.filter(inSeason), invites = all.filter(x => !inSeason(x) && phaseOf(x) !== 'done');
  const card = x => {
    const m = seasonM(x);
    return '<section class="card sbanner">' + bannerHtml(x) +
      '<div class="sb-body"><div class="sb-stats">' +
        '<div><b>' + m.visits + '</b><small>your gym days</small></div><div><b>' + C.compact(L.lbEquivalent(m.volume)) + '</b><small>lb moved</small></div>' +
        '</div>' +
        '<div class="actions"><button class="btn primary" data-season="' + esc(x.id) + '">Open season</button>' +
        (phaseOf(x) === 'done' ? '<button class="btn" data-wrapped="' + esc(x.id) + '">✨ Wrapped</button>' : '') +
        (phaseOf(x) === 'done' && isMine(x) ? '<button class="btn ghost" data-rerun="' + esc(x.id) + '">↻ Again</button>' : '') +
        (x.is_shared ? '<button class="btn ghost" data-link="s-' + esc(x.id) + '" aria-label="Copy a link to ' + esc(x.name) + '">🔗</button>' : '') + '</div></div></section>';
  };
  const group = (title, list) => list.length ? '<h3 class="section-title">' + title + '</h3><div class="season-grid">' + list.map(card).join('') + '</div>' : '';
  const got = PACK_ORDER.reduce((n, k) => n + stampsEarned(k), 0), allStamps = PACK_ORDER.reduce((n, k) => n + PACKS[k].stamps.length, 0);
  // Events first (they're on fixed dates), then seasons (start any time). Both are extras.
  const kinds = kind => PACK_ORDER.filter(k => PACKS[k].kind === kind).map(k => packCard(PACKS[k])).join('');
  // Your own seasons first; the feast days and pilgrimages (extras) fold away below them.
  const packsOpen = !!S.packsOpen;
  const packs = '<section class="card packs-fold"><button class="packs-head" data-packs-toggle aria-expanded="' + packsOpen + '">' +
      '<span><b>' + esc(T.eventsWord) + ' and ' + esc(T.seasonsWord.toLowerCase()) + '</b><small>' + esc(T.stampBook.replace(/^The /, '')) + ': ' + got + ' of ' + allStamps + ' ' + esc(T.stamps.toLowerCase()) + ' · extras, join one or skip them all</small></span>' +
      '<span class="sf-chev" aria-hidden="true">›</span></button></section>' +
    (packsOpen ? '<h3 class="section-title">' + esc(T.eventsWord) + '</h3><p class="hint-line" style="margin-top:-4px">Same dates every year, for everyone at once.</p><div class="season-grid">' + kinds('event') + '</div>' +
      '<h3 class="section-title">' + esc(T.seasonsWord) + '</h3><p class="hint-line" style="margin-top:-4px">Start any time, at your own pace.</p><div class="season-grid">' + kinds('season') + '</div>' : '');
  view.innerHTML =
    '<div class="row page-actions"><h2 style="font-size:28px">' + esc(T.titles.seasons) + '</h2><span class="head-actions"><button class="btn primary" data-new-any>+ New</button></span></div>' +
    '<p class="hint-line" style="margin-top:0">A season is a group lifting over the same dates. Everyone picks their own program, or none, and everything you log in between counts. Wrapped comes at the end.</p>' +
    group('Live now', mine.filter(x => phaseOf(x) === 'live')) +
    (invites.length ? '<h3 class="section-title">Join the crew</h3><div class="season-grid">' + invites.map(x => '<section class="card sbanner">' + bannerHtml(x) +
      '<div class="sb-body">' + (seasonGoals(x).length ? '<p class="hint-line" style="margin-top:0">Goals: ' + esc(seasonGoals(x).map(g => g.name).join(', ')) + '</p>' : '') + planLine(x) +
      '<div class="actions"><button class="btn primary" data-join-season="' + esc(x.id) + '">Join season</button></div></div></section>').join('') + '</div>' : '') +
    group('Coming up', mine.filter(x => phaseOf(x) === 'upcoming')) +
    group('Finished', mine.filter(x => phaseOf(x) === 'done')) +
    (mine.length || invites.length ? '' : '<section class="card empty"><h2>No seasons yet.</h2><p class="muted">Start one with the crew for a week, a month or a training block. Everyone lifts their own way; the season keeps the feed and the Wrapped.</p><div class="actions"><button class="btn primary" data-new-season>+ New season</button></div></section>') +
    '<div style="margin-top:22px">' + packs + '</div>';
}
// One season: a group lifting over the same dates. Who's in and what they're on (a program, or
// none), a side-by-side for anyone who happens to share a program, the season's own feed, and
// Wrapped once it's over. Everything anyone logs between the dates counts.
const personColor = i => C.SERIES.concat('var(--gold)')[i % 4];
const toLb = x => Number(x.best_weight) * (x.unit === 'kg' ? L.LB_PER_KG : 1);
const seasonWeeks = sn => Math.max(1, Math.round(L.daysBetween(sn.starts_on, sn.ends_on) / 7));
const seasonLoads = new Map();
function loadSeason(sn, then) {
  if (!seasonLoads.has(sn.id)) {
    const p = Promise.all([store.standings(sn.id), store.seasonBests(sn.id), store.seasonDaily(sn.id),
        Promise.resolve().then(() => store.seasonPrograms(sn.id)).catch(() => []), store.seasonWins(sn)])
      .then(([rows, b, d, progs, feed]) => { S.standings[sn.id] = { rows, b, d, progs, feed }; S.seasonAt[sn.id] = Date.now(); })
      .finally(() => seasonLoads.delete(sn.id));
    seasonLoads.set(sn.id, p);
  }
  seasonLoads.get(sn.id).then(() => then(), x => then(x));
}
// The people in a season, you first, each with one color everywhere and the program they're on.
function seasonPeople(sn, st) {
  const progs = new Map((st.progs || []).map(p => [p.user_id, p]));
  const mySub = seasonSub(sn.id);
  return st.rows.map(r => {
    let prog = progs.get(r.user_id) || null;
    if (r.user_id === S.myId && mySub) {   // yours from what you picked here, so a change shows at once
      const p = mySub.program_id && progById(mySub.program_id);
      prog = mySub.program_id ? { program_id: mySub.program_id, program_name: p ? p.name : 'a program', days_a_week: p ? (p.doc.days || []).length : 0 } : null;
    }
    return { ...r, prog: prog && prog.program_id ? prog : null, visits: Number(r.visits) || 0, sets: Number(r.sets) || 0, lb: lbOf(r) };
  }).sort((a, b) => (a.user_id === S.myId ? -1 : b.user_id === S.myId ? 1 : String(a.display_name).localeCompare(b.display_name)))
    .map((p, i) => ({ ...p, color: personColor(i), name: p.user_id === S.myId ? 'You' : p.display_name }));
}
function seasonHead(sn) {
  return '<button class="linkbtn back" data-season-back>← All seasons</button>' +
    '<section class="card sbanner big">' + bannerHtml(sn, true) + '<div class="sb-body"><div class="actions">' +
      (isMine(sn) ? '<button class="btn" data-edit-season="' + esc(sn.id) + '">Edit season</button>' : '<button class="btn ghost" data-leave-season="' + esc(sn.id) + '">Leave</button>') +
      (sn.is_shared ? '<button class="btn ghost" data-link="s-' + esc(sn.id) + '">🔗 Invite</button>' : '') + '</div></div></section>';
}
function seasonLoading(sn, draw) {
  view.innerHTML = seasonHead(sn) + '<section class="card"><p class="muted" style="margin:0">Loading the season…</p></section>';
  loadSeason(sn, err => {
    if (currentTab !== 'seasons' || S.seasonOpen !== sn.id) return;
    if (err) view.innerHTML = seasonHead(sn) + '<section class="card"><p class="warn">Couldn’t load the season: ' + esc(err.message) + '</p></section>';
    else draw(sn);
  });
}
function renderSeasonPage(sn) {
  if (S.wrappedOpen === sn.id && phaseOf(sn) === 'done') return renderWrapped(sn);
  const st = S.standings[sn.id];
  if (!st || !st.feed) return seasonLoading(sn, renderSeasonPage);
  // Shown from what you last saw; refreshed quietly when it's more than a couple of minutes old.
  if (Date.now() - (S.seasonAt[sn.id] || 0) > 120000 && !seasonLoads.has(sn.id))
    loadSeason(sn, err => { if (!err && currentTab === 'seasons' && S.seasonOpen === sn.id && !S.wrappedOpen) renderSeasonPage(sn); });
  const ph = phaseOf(sn), people = seasonPeople(sn, st), weeks = seasonWeeks(sn);
  const card = p => {
    const me = p.user_id === S.myId;
    return '<div class="sz-person"><div class="sz-who"><i style="background:' + p.color + '">' + esc(initials(p.display_name)) + '</i><b>' + esc(p.name) + '</b></div>' +
      '<p class="sz-prog">' + (p.prog ? 'on <b>' + esc(p.prog.program_name) + '</b>' : 'no program') + '</p>' +
      (me ? '<div class="sz-mine"><button class="linkbtn" data-season-prog="' + esc(sn.id) + '">' + (p.prog ? 'Change' : 'Pick a program') + '</button>' +
        (p.prog && progById(p.prog.program_id) ? '<button class="linkbtn" data-prog-use="' + esc(p.prog.program_id) + '">Put it in my week</button>' : '') + '</div>' : '') +
      '<div class="sz-nums"><div><b>' + p.visits + '</b><small>' + (p.visits === 1 ? 'session' : 'sessions') + '</small></div>' +
        '<div><b>' + C.compact(p.lb) + '</b><small>lb moved</small></div></div></div>';
  };
  // Anyone who happens to be on the same program gets a side-by-side for it.
  const groups = new Map();
  for (const p of people) if (p.prog) groups.set(p.prog.program_id, (groups.get(p.prog.program_id) || []).concat(p));
  const shared = [...groups.values()].filter(g => g.length > 1);
  const sideBySide = g => {
    const prog = progById(g[0].prog.program_id);
    const exIds = prog ? [...new Set((prog.doc.workouts || []).flatMap(w => w.steps.map(s => s.exercise_id)))] : [];
    const best = (p, id) => st.b.filter(x => x.user_id === p.user_id && x.exercise_id === id).sort((a, b) => toLb(b) - toLb(a))[0];
    const planned = (g[0].prog.days_a_week || 0) * weeks;
    const row = (label, cells) => '<tr><td>' + label + '</td>' + cells.join('') + '</tr>';
    return '<section class="card"><div class="card-head"><h3 class="card-title">' + esc(g[0].prog.program_name) + '</h3><small class="muted">side by side</small></div>' +
      '<table class="cmp"><thead><tr><th></th>' + g.map(p => '<th><span class="who"><i style="background:' + p.color + '"></i>' + esc(p.name) + '</span></th>').join('') + '</tr></thead><tbody>' +
      row('Sessions' + (planned ? ' <small class="muted">(' + planned + ' planned)</small>' : ''), g.map(p => '<td class="num">' + p.visits + '</td>')) +
      row('Pounds moved', g.map(p => '<td class="num">' + C.compact(p.lb) + '</td>')) +
      exIds.filter(id => g.some(p => best(p, id))).map(id => row(esc(exName(id)), g.map(p => {
        const x = best(p, id);
        return '<td class="num">' + (x ? '<b>' + esc(L.fmtLoad(Number(x.best_weight))) + '</b> <small>' + esc(x.unit) + ' × ' + x.reps + '</small>' : '<span class="muted">–</span>') + '</td>';
      }))).join('') + '</tbody></table></section>';
  };
  const after = fmtDay(L.addDays(sn.ends_on, 1), { weekday: 'short', month: 'short', day: 'numeric' });
  const wrap = ph === 'done'
    ? '<button class="sz-wrapped open" data-wrapped="' + esc(sn.id) + '"><span class="sz-wi" aria-hidden="true">✨</span><span><b>Wrapped is ready</b><small>The season in numbers, yours and everyone’s.</small></span></button>'
    : '<div class="sz-wrapped"><span class="sz-wi" aria-hidden="true">🔒</span><span><b>Wrapped opens ' + esc(after) + '</b><small>The season in numbers, yours and everyone’s.</small></span></div>';
  const hint = people.length < 2
    ? 'Just you so far. ' + (sn.is_shared ? 'Send the invite link: anyone in the crew can join and pick their own program.' : 'Share the season (Edit season) so the crew can join.')
    : shared.length ? '' : 'Nobody shares a program this time. When two of you do, a side-by-side for it shows up here.';
  view.innerHTML = seasonHead(sn) + (ph === 'done' ? wrap : '') +
    '<h3 class="section-title">Who’s in</h3><div class="sz-people">' + people.map(card).join('') + '</div>' +
    shared.map(sideBySide).join('') + (hint ? '<p class="sz-hint">' + esc(hint) + '</p>' : '') +
    seasonFeedCard(sn, st, people) + (ph !== 'done' ? wrap : '');
}
// The season's feed, a day at a time: this week's pulse, then today in full (with the moments the
// season posts itself), then earlier days folded to one line each, tap to open. Wins only: no
// reactions, no comments. Moments come from what's already logged and posted, nothing more.
const feedOpen = new Set();
const dayShort = d => fmtDay(d, { weekday: 'short' }) + ' ' + fmtDay(d, { day: 'numeric' });
function seasonDays(sn, st, by) {
  const days = new Map();
  const day = d => { if (!days.has(d)) days.set(d, { lifted: new Map(), wins: [], moments: [] }); return days.get(d); };
  // Your own days come from this phone (so a set you just logged counts at once); everyone else's
  // from the season's last refresh.
  for (const r of st.d) if (by.has(r.user_id) && r.user_id !== S.myId) { const x = day(String(r.performed_on).slice(0, 10)); x.lifted.set(r.user_id, (x.lifted.get(r.user_id) || 0) + lbOf(r)); }
  if (by.has(S.myId)) for (const r of S.days) if (r.sets > 0 && r.performed_on >= sn.starts_on && r.performed_on <= sn.ends_on) day(r.performed_on).lifted.set(S.myId, lbOf(r));
  for (const w of st.feed) if (by.has(w.created_by)) day(w.performed_on).wins.push(w);
  return { days, day };
}
function seasonMoments(sn, people, days, last) {
  const out = [], many = people.length > 1, t = today();
  const nameOf = new Map(people.map(p => [p.user_id, p.name]));
  const whose = id => (nameOf.get(id) === 'You' ? 'Your' : nameOf.get(id) + '’s');
  const dates = [...days.keys()].filter(d => d >= sn.starts_on && d <= last).sort();
  out.push([sn.starts_on, { icon: '🏁', text: 'The season started' + (many ? ': ' + people.map(p => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1') + '.' : '.') }]);
  const seen = new Set();
  for (const d of dates) {
    const lifted = days.get(d).lifted;
    for (const id of lifted.keys()) if (!seen.has(id)) { seen.add(id); if (many) out.push([d, { icon: '👟', text: whose(id) + ' first session of the season.' }]); }
    if (many && lifted.size >= 2) {
      const all = lifted.size === people.length;
      out.push([d, { icon: '🤝', text: all ? (people.length === 2 ? 'You both lifted' : 'All ' + people.length + ' of you lifted') + (d === t ? ' today.' : '.') : lifted.size + ' of you lifted' + (d === t ? ' today.' : '.') }]);
    }
  }
  const total = L.daysBetween(sn.starts_on, sn.ends_on) + 1, half = L.addDays(sn.starts_on, Math.floor(total / 2));
  if (total >= 4 && half <= last) {
    let lb = 0;
    for (const d of dates) if (d <= half) for (const v of days.get(d).lifted.values()) lb += v;
    out.push([half, { icon: '⏳', text: 'Halfway there. ' + C.compact(lb) + ' lb ' + (many ? 'between you' : 'moved') + ' so far.' }]);
  }
  if (sn.ends_on <= t) out.push([sn.ends_on, { icon: '🔔', text: sn.ends_on === t ? 'Last day. Wrapped opens tomorrow.' : 'The last day.' }]);
  return out;
}
function seasonFeedCard(sn, st, people, opts) {
  const o = opts || {};
  const by = new Map(people.map(p => [p.user_id, p]));
  const color = id => (by.get(id) || {}).color || 'var(--muted)';
  const name = id => (by.get(id) || {}).name || S.names.get(id) || 'Someone';
  const t = today(), ph = phaseOf(sn), last = t < sn.ends_on ? t : sn.ends_on;
  const head = '<div class="card-head"><div><h3 class="card-title">' + esc(o.title || 'In this season') + '</h3><small class="muted">' + esc(o.sub || 'everyone’s wins between the dates') + '</small></div>' +
    (o.open ? '<button class="linkbtn" data-season="' + esc(sn.id) + '">Open ›</button>' : '<button class="linkbtn" data-share-wins>' + (shareOn() ? 'Sharing mine ✓' : 'Mine are private') + '</button>') + '</div>';
  const shell = body => '<section class="card wins"' + (o.id ? ' id="' + o.id + '"' : '') + '>' + head + body + '</section>';
  if (ph === 'upcoming') return shell('<p class="muted" style="margin:0">Starts ' + esc(fmtDay(sn.starts_on, { weekday: 'long', month: 'short', day: 'numeric' })) + '. Bests, finished sessions and the season’s moments show up here, a day at a time.</p>');
  const { days, day } = seasonDays(sn, st, by);
  for (const [d, m] of seasonMoments(sn, people, days, last)) day(d).moments.push(m);

  // This week's pulse: each person's days done (against their program, if they're on one) and pounds.
  let pulse = '';
  if (ph === 'live') {
    const from = weekOf(t) > sn.starts_on ? weekOf(t) : sn.starts_on, to = L.addDays(weekOf(t), 6) < sn.ends_on ? L.addDays(weekOf(t), 6) : sn.ends_on;
    pulse = '<div class="sf-pulse"><div class="sf-pulse-head"><b>This week</b><small>' + esc(dayShort(from) + ' – ' + dayShort(to)) + '</small></div>' +
      people.map(p => {
        let done = 0, lb = 0;
        for (const [d, x] of days) if (d >= from && d <= to && x.lifted.has(p.user_id)) { done++; lb += x.lifted.get(p.user_id); }
        const planned = p.prog ? p.prog.days_a_week || 0 : 0, segs = Math.max(planned, done);
        const label = planned ? done + ' of ' + planned + ' ' + p.prog.program_name + ' days' : done + ' day' + (done === 1 ? '' : 's') + ' lifted';
        return '<div class="sf-row"><i class="sf-av" style="background:' + p.color + '">' + esc(initials(p.display_name)) + '</i><div class="sf-mid"><span><b>' + esc(p.name) + '</b> · ' + esc(label) + '</span>' +
          (segs ? '<span class="sf-segs" role="img" aria-label="' + esc(label) + '">' + Array.from({ length: segs }, (_, i) => '<i' + (i < done ? ' style="background:' + p.color + '"' : '') + '></i>').join('') + '</span>' : '') + '</div>' +
          '<span class="sf-lb"><b>' + C.compact(lb) + '</b><small>lb</small></span></div>';
      }).join('') + '</div>';
  }

  const summary = d => {
    const x = days.get(d) || { lifted: new Map(), wins: [] }, n = x.lifted.size;
    const who = !n ? '' : n === people.length && n > 1 ? (n === 2 ? 'Both lifted' : 'Everyone lifted') : [...x.lifted.keys()].map(name).join(' and ') + ' lifted';
    let lb = 0; for (const v of x.lifted.values()) lb += v;
    const bests = x.wins.filter(w => w.kind === 'pr').length;
    return [who, lb ? L.fmtNum(Math.round(lb), 0) + ' lb' : '', bests ? bests + (bests === 1 ? ' best' : ' bests') : ''].filter(Boolean).join(' · ');
  };
  const moments = x => x.moments.map(m => '<div class="sf-moment"><span aria-hidden="true">' + m.icon + '</span><span>' + esc(m.text) + '</span></div>').join('');
  const body = (d, x) => moments(x) + (x.wins.length ? winList(x.wins, color, name, 40) : d === t && !x.lifted.size ? '<p class="muted sf-none">Nothing logged yet today.</p>' : '');
  // Today in full; every earlier day as one line that opens.
  let html = '';
  if (ph === 'live') {
    const x = day(t), s = summary(t);
    html += '<div class="sf-day"><h4>Today <small>· ' + esc(dayShort(t)) + '</small></h4>' + (s ? '<small>' + esc(s) + '</small>' : '') + '</div>' + body(t, x);
  }
  if (!o.open) {
    const all = [...days.keys()].filter(d => d >= sn.starts_on && d <= last && !(ph === 'live' && d === t)).sort().reverse();
    const showAll = feedOpen.has(sn.id + '|all'), earlier = showAll ? all : all.slice(0, 5);   // the latest few days; older ones behind a button
    if (earlier.length) html += (ph === 'live' ? '<h4 class="sf-earlier">Earlier</h4>' : '');
    for (const d of earlier) {
      const x = days.get(d), key = sn.id + '|' + d, open = feedOpen.has(key), mo = x.moments.map(m => m.text).join(' ');
      html += '<button class="sf-fold" data-feed-day="' + esc(key) + '" aria-expanded="' + open + '">' +
        '<span class="sf-date"><small>' + esc(fmtDay(d, { weekday: 'short' })) + '</small><b>' + esc(fmtDay(d, { day: 'numeric' })) + '</b></span>' +
        '<span class="sf-fold-mid"><span class="sf-avs">' + [...x.lifted.keys()].map(id => '<i class="sf-av sm" style="background:' + color(id) + '">' + esc(initials((by.get(id) || {}).display_name)) + '</i>').join('') + '</span>' +
          '<span>' + esc(summary(d) || 'No lifting') + '</span>' + (mo && !open ? '<small>' + esc(mo) + '</small>' : '') + '</span>' +
        '<span class="sf-chev" aria-hidden="true">›</span></button>' + (open ? '<div class="sf-open">' + body(d, x) + '</div>' : '');
    }
    if (earlier.length < all.length) html += '<button class="btn block" style="margin-top:8px" data-feed-day="' + esc(sn.id) + '|all">Show ' + (all.length - earlier.length) + ' older days</button>';
  }
  return shell(pulse + (html || '<p class="muted" style="margin:0">Bests, finished sessions and the season’s moments show up here, a day at a time.</p>'));
}
// Pick (or change) your program for a season. Yours only: everyone picks their own.
function openSeasonProgram(sid) {
  LG.mode = 'seasonprog'; LG.seasonId = sid;
  const sub = seasonSub(sid), cur = (sub && sub.program_id) || '';
  const opt = (id, name, small) => '<li><button data-sp="' + esc(id) + '" class="' + (cur === id ? 'sel' : '') + '" aria-pressed="' + (cur === id) + '"><span><i class="tickbox" aria-hidden="true">' + (cur === id ? '✓' : '') + '</i>' + esc(name) + '</span><small>' + esc(small) + '</small></button></li>';
  const list = S.programs || [];
  inner.innerHTML = '<div class="sheet-head"><div><small class="muted">' + esc((seasonById(sid) || {}).name || 'Season') + '</small><h2 id="sheetTitle">Your program</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><p class="hint-line" style="margin-top:0">Just for you: everyone in the season picks their own. Whatever you log between the dates counts either way.</p>' +
    '<ul class="results">' + opt('', 'No program', 'log whatever you like') + list.map(p => opt(p.id, p.name, (p.doc.days || []).length + ' days a week · ' + (isMine(p) ? 'yours' : 'by ' + ownerName(p)))).join('') + '</ul>' +
    (list.length ? '' : '<p class="muted">No programs yet. Make one from + New → A program.</p>') + '</div>';
  openSheet();
}
async function seasonProgClick(b) {
  if (!('sp' in b.dataset)) return;
  const sid = LG.seasonId, pid = b.dataset.sp || null, sub = seasonSub(sid);
  b.disabled = true;
  try {
    if (sub) Object.assign(sub, await store.setSeasonProgram(sub.id, pid));
    else S.seasonSubs.push(await store.joinSeason(sid, pid));
    sheet.close(); render();
    const p = pid && progById(pid);
    toast(p ? 'You’re on ' + p.name + ' this season.' : 'No program this season. Everything you log still counts.');
  } catch (x) { b.disabled = false; fail(x); }
}

// ===========================================================================
// Start a season: a name, the dates, whether the crew can join, and your program (optional).
// "Run it again" opens it filled in from an earlier one, starting next Monday.
// ===========================================================================
const SZ = {};
const nextMonday = () => { const t = today(); return L.addDays(t, (8 - L.parseDate(t).getDay()) % 7); };
function openSeasonStart(from) {
  const start = nextMonday(), sub = from && seasonSub(from.id);
  Object.assign(SZ, { from: from || null, name: from ? from.name : '', start, end: L.addDays(start, (from ? seasonWeeks(from) : 1) * 7),
    shared: from ? !!from.is_shared : true, prog: (sub && sub.program_id) || null, err: '' });
  LG.mode = 'seasonstart';
  drawSeasonStart();
  openSheet();
}
function drawSeasonStart() {
  const wk = n => '<button type="button" class="choice" data-sz-weeks="' + n + '" aria-pressed="' + (L.addDays(SZ.start, n * 7) === SZ.end) + '">' + n + (n === 1 ? ' week' : ' weeks') + '</button>';
  const cur = SZ.prog || '';
  const popt = (id, name, small) => '<li><button data-sz-prog="' + esc(id) + '" class="' + (cur === id ? 'sel' : '') + '" aria-pressed="' + (cur === id) + '"><span><i class="tickbox" aria-hidden="true">' + (cur === id ? '✓' : '') + '</i>' + esc(name) + '</span><small>' + esc(small) + '</small></button></li>';
  inner.innerHTML = '<div class="sheet-head"><div><small class="muted">' + (SZ.from ? 'Run it again' : 'New season') + '</small><h2 id="sheetTitle">A season</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<div class="field-label" style="margin-top:0"><label for="szName">Name</label></div><input class="plain-input" id="szName" maxlength="60" placeholder="Who’s lifting, or what it’s for" value="' + esc(SZ.name) + '">' +
      '<div class="grid2"><div><div class="field-label"><label for="szStart">Starts</label></div><input class="plain-input" id="szStart" type="date" value="' + esc(SZ.start) + '"></div>' +
        '<div><div class="field-label"><label for="szEnd">Ends</label></div><input class="plain-input" id="szEnd" type="date" value="' + esc(SZ.end) + '"></div></div>' +
      '<div class="choices" style="margin-top:10px">' + wk(1) + wk(4) + wk(12) + '</div>' +
      '<div class="toggles"><button type="button" class="toggle" id="szShare" aria-pressed="' + SZ.shared + '">' + (SZ.shared ? '✓ The crew can see it and join' : 'Just me (share it later)') + '</button></div>' +
      '<div class="field-label"><span>Your program</span><small class="muted">optional</small></div>' +
      '<ul class="results">' + popt('', 'No program', 'log whatever you like') +
        (S.programs || []).map(p => popt(p.id, p.name, (p.doc.days || []).length + ' days a week · ' + (isMine(p) ? 'yours' : 'by ' + ownerName(p)))).join('') + '</ul>' +
      '<p class="hint-line">Everyone picks their own when they join. Whatever you log between the dates counts, on a program or not.</p>' +
      '<p class="warn" id="szErr" role="alert">' + esc(SZ.err) + '</p></div>' +
    '<div class="design-foot wz-foot"><span></span><button class="btn primary" data-sz-go>' + (SZ.from ? 'Start it again' : 'Start the season') + '</button></div>';
  $('szName').addEventListener('input', e => { SZ.name = e.target.value; });
  $('szStart').addEventListener('change', e => { if (!e.target.value) return; const len = L.daysBetween(SZ.start, SZ.end); SZ.start = e.target.value; SZ.end = L.addDays(SZ.start, len); drawSeasonStart(); });
  $('szEnd').addEventListener('change', e => { if (e.target.value) { SZ.end = e.target.value; drawSeasonStart(); } });
}
async function seasonStartClick(b) {
  if (b.dataset.szWeeks) { SZ.end = L.addDays(SZ.start, Number(b.dataset.szWeeks) * 7); return drawSeasonStart(); }
  if (b.id === 'szShare') { SZ.shared = !SZ.shared; return drawSeasonStart(); }
  if ('szProg' in b.dataset) { SZ.prog = b.dataset.szProg || null; return drawSeasonStart(); }
  if (!b.hasAttribute('data-sz-go')) return;
  const name = (SZ.name || '').trim();
  SZ.err = !name ? 'Give it a name.' : !(SZ.end > SZ.start) ? 'The end has to come after the start.' : '';
  if (SZ.err) return drawSeasonStart();
  b.disabled = true; b.textContent = 'Setting up…';
  let sn = null;
  try {
    sn = await store.addSeason({ name: name.slice(0, 60), starts_on: SZ.start, ends_on: SZ.end, is_shared: SZ.shared });
    S.seasons.unshift(sn);
    S.seasonSubs.push(await store.joinSeason(sn.id, SZ.prog));
    sheet.close();
    openSeason(sn.id);
    toast(sn.name + ' is set. Everything you log from ' + fmtDay(sn.starts_on, { weekday: 'short', month: 'short', day: 'numeric' }) + ' counts.');
  } catch (x) {
    if (sn) { sheet.close(); openSeason(sn.id); return fail(x); }   // the season exists; pick the program on its page
    SZ.err = x.message; drawSeasonStart();
  }
}

// ===========================================================================
// Wrapped: the season in numbers, once it's over. Yours and everyone's, side by side.
// ===========================================================================
const HEAVY = [[1000, 'a grand piano', 'grand pianos'], [4000, 'a car', 'cars'], [5500, 'a pickup truck', 'pickup trucks'], [13000, 'an elephant', 'elephants'],
  [25000, 'a school bus', 'school buses'], [80000, 'a loaded semi truck', 'loaded semi trucks'], [300000, 'a blue whale', 'blue whales']];
function heavyLine(lb) {
  let h = null;
  for (const x of HEAVY) if (lb >= x[0]) h = x;
  if (!h) return lb > 0 ? 'Every rep of it counted.' : '';
  const n = Math.round(lb / h[0]);
  return 'About the weight of ' + (n <= 1 ? h[1] : n + ' ' + h[2]) + '.';
}
function renderWrapped(sn) {
  const st = S.standings[sn.id];
  if (!st || !st.feed) return seasonLoading(sn, renderWrapped);
  const people = seasonPeople(sn, st), weeks = seasonWeeks(sn), ids = new Set(people.map(p => p.user_id));
  const total = people.reduce((a, p) => a + p.lb, 0);
  const prs = st.feed.filter(w => w.kind === 'pr' && ids.has(w.created_by)).sort((a, b) => a.performed_on.localeCompare(b.performed_on));
  const num = (v, label) => '<div><b>' + v + '</b><small>' + label + '</small></div>';
  const kept = p => {
    const planned = p.prog ? (p.prog.days_a_week || 0) * weeks : 0;
    if (!planned) return 'Lifted on ' + p.visits + ' day' + (p.visits === 1 ? '' : 's') + '.';
    return p.visits >= planned ? 'Kept all ' + planned + ' ' + p.prog.program_name + ' days.' : p.visits + ' of ' + planned + ' ' + p.prog.program_name + ' days.';
  };
  const pcard = p => '<div class="wr-card"><div class="sz-who"><i style="background:' + p.color + '">' + esc(initials(p.display_name)) + '</i><b>' + esc(p.name) + '</b></div>' +
    '<div class="wr-nums">' + num(p.visits, p.visits === 1 ? 'session' : 'sessions') + num(L.fmtNum(p.sets, 0), 'sets') + num(C.compact(p.lb), 'lb moved') + num(prs.filter(w => w.created_by === p.user_id).length, 'new bests') + '</div>' +
    '<p class="wr-foot">' + esc(kept(p)) + '</p></div>';
  // Each person's top lift: the heaviest for its reps (estimated one-rep max).
  const tops = people.map(p => {
    const x = st.b.filter(r => r.user_id === p.user_id).sort((a, b) => toLb(b) * (1 + b.reps / 30) - toLb(a) * (1 + a.reps / 30))[0];
    return x ? '<li><i style="background:' + p.color + '"></i><span><small>' + esc(p.name) + ' · ' + esc(exName(x.exercise_id)) + '</small><b>' + esc(L.fmtLoad(Number(x.best_weight))) + ' ' + esc(x.unit) + ' × ' + x.reps + '</b></span></li>' : '';
  }).join('');
  // The best day between everyone, and how many different lifts got trained.
  const byDay = new Map();
  for (const r of st.d) { const k = String(r.performed_on).slice(0, 10), d = byDay.get(k) || { lb: 0, who: new Set() }; d.lb += lbOf(r); d.who.add(r.user_id); byDay.set(k, d); }
  const bestDay = [...byDay].sort((a, b) => b[1].lb - a[1].lb)[0];
  const lifts = new Set(st.b.map(x => x.exercise_id)).size;
  const color = id => (people.find(p => p.user_id === id) || {}).color || 'var(--muted)';
  const stamps = (S.stampRows || []).filter(s => s.created_by === S.myId && s.earned_on >= sn.starts_on && s.earned_on <= sn.ends_on && PACKS[s.season_key])
    .map(s => { const pk = PACKS[s.season_key], def = pk.stamps.find(x => x.key === s.stamp_key); return def ? stampHtml(pk, def, true) : ''; }).join('');
  view.innerHTML = '<button class="linkbtn back" data-wrapped-back>← ' + esc(sn.name) + '</button>' +
    '<section class="wr">' +
      '<p class="wr-kicker">' + esc(sn.name) + ' · ' + esc(seasonDates(sn)) + '</p><h1 class="wr-title">That’s the season.</h1>' +
      '<div class="wr-hero"><small>' + (people.length > 1 ? 'Moved between you' : 'You moved') + '</small><b>' + esc(L.fmtNum(Math.round(total), 0)) + ' lb</b><p>' + esc(heavyLine(total)) + '</p></div>' +
      '<div class="wr-people">' + people.map(pcard).join('') + '</div>' +
      (tops ? '<div class="wr-box"><h3>Top lift</h3><ul class="wr-tops">' + tops + '</ul></div>' : '') +
      '<div class="wr-pair">' +
        (bestDay ? '<div class="wr-box"><h3>Best day</h3><b class="wr-big">' + esc(fmtDay(bestDay[0], { weekday: 'long' })) + '</b><p>' + esc((bestDay[1].who.size > 1 ? 'You all lifted. ' : '') + C.compact(bestDay[1].lb) + ' lb.') + '</p></div>' : '') +
        '<div class="wr-box"><h3>Lifts trained</h3><b class="wr-big">' + lifts + '</b><p>different exercises between you.</p></div></div>' +
      (prs.length ? '<div class="wr-box"><h3>Every best set</h3><ul class="wr-bests">' + prs.map(w => { const m = w.summary || {};
        return '<li><i style="background:' + color(w.created_by) + '"></i><span>' + esc(w.title.replace(/ PR$/, '')) + '</span><b>' + esc(prText(m)) + '</b></li>'; }).join('') + '</ul></div>' : '') +
      (stamps ? '<div class="wr-box"><h3>' + esc(T.stamps) + '</h3><div class="stamp-grid">' + stamps + '</div></div>' : '') +
      (isMine(sn) ? '<button class="btn primary block" data-sz-again="' + esc(sn.id) + '">Start the next season</button>' : '') +
    '</section>';
}

// ===========================================================================
// New season in three steps: how long, which workouts, which goals (suggested from your history).
// "Run it again" opens the same steps filled in from an earlier season.
// ===========================================================================
const WZ = {};
const MONTHS3 = d => fmtDay(d, { month: 'short' });
function wzEnd() {
  if (WZ.len === 'month') { const d = L.parseDate(WZ.start); return L.addDays(WZ.start, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate()); }
  if (WZ.len === 'year') return WZ.start.slice(0, 4) + '-12-31';
  return L.addDays(WZ.start, WZ.len * 7 - 1);
}
function wzName() {
  const a = MONTHS3(WZ.start), b = MONTHS3(wzEnd());
  return a === b ? fmtDay(WZ.start, { month: 'long' }) + ' block' : a + ' – ' + b + ' block';
}
const wzWeeks = () => Math.max(1, Math.round((L.daysBetween(WZ.start, wzEnd()) + 1) / 7));
const niceRound = v => { const m = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1)); return Math.round(v / m) * m; };
// Goals from what you actually do: your pace of gym days and pounds over the last 8 weeks, and a
// little above your best on the lifts in the chosen workouts.
function wzSuggestions() {
  const w8 = weekly(8), weeks = wzWeeks();
  const pace = Math.max(1, w8.reduce((a, w) => a + w.visits, 0) / 8);
  const perWeek = WZ.mode === 'days' && WZ.picked.length ? WZ.picked.reduce((a, id) => a + bitCount(WZ.days.get(id) || 0), 0) || pace : pace;
  const visits = Math.max(1, Math.round(perWeek * weeks));
  const lbWeek = w8.reduce((a, w) => a + w.lb, 0) / 8;
  const out = [{ key: 'visits', metric: 'visits', unit: null, target: visits, name: 'Show up ' + visits + ' times' }];
  if (lbWeek > 0) { const v = niceRound(lbWeek * weeks * 1.1); out.push({ key: 'volume', metric: 'volume', unit: 'lb', target: v, name: 'Move ' + L.fmtBig(v) + ' lb' }); }
  const exs = [...new Set(WZ.picked.flatMap(id => routineItems(id).map(i => i.exercise_id)))];
  const pool = exs.length ? exs : trendChoices().slice(0, 6);
  const lifts = pool.map(id => {
    const rows = S.bestRows.filter(r => r.exercise_id === id && r.unit === 'lb' && r.reps <= 8);
    const top = rows.reduce((m, r) => Math.max(m, Number(r.heaviest)), 0);
    return { id, top, freq: recentOf(id).length };
  }).filter(x => x.top >= 20).sort((a, b) => b.freq - a.freq).slice(0, 3);
  for (const x of lifts) { const t = Math.ceil((x.top * 1.05) / 5) * 5; out.push({ key: 'lift:' + x.id, metric: 'lift', unit: 'lb', exercise_id: x.id, target: t, name: (exName(x.id) + ' ' + t + ' lb').slice(0, 60) }); }
  return out;
}
const bitCount = m => { let n = 0; for (let i = 0; i < 7; i++) if (m & (1 << i)) n++; return n; };
function openWizard(from) {
  const plan = from ? planFor(from.id) : [];
  Object.assign(WZ, {
    step: 1, from: from || null, start: today(), shared: from ? !!from.is_shared : true, nameTouched: !!from,
    len: from ? Math.max(1, Math.round((L.daysBetween(from.starts_on, from.ends_on) + 1) / 7)) : 8,
    name: from ? from.name.replace(/\s*\(again( \d+)?\)$/, '') + ' (again)' : '',
    picked: plan.map(x => x.template_id).filter(id => tplById(id)),
    days: new Map(plan.map(x => [x.template_id, x.weekdays])),
    mode: plan.some(x => x.weekdays) ? 'days' : 'rotate',
    goals: null, carry: from ? seasonGoals(from).map(g => ({ ...g, key: 'carry:' + g.id })) : [], points: from ? from.points || null : null,
  });
  LG.mode = 'wizard';
  drawWizard();
  openSheet();
}
function drawWizard() {
  if (!WZ.nameTouched) WZ.name = wzName();
  const steps = ['How long', 'Workouts', 'Goals'];
  const head = '<div class="sheet-head"><div><small class="muted">' + (WZ.from ? 'Run it again' : 'New season') + ' · step ' + WZ.step + ' of 3</small><h2 id="sheetTitle">' + steps[WZ.step - 1] + '</h2></div>' +
    '<button class="iconbtn" data-close aria-label="Close">✕</button></div><div class="wz-dots">' + steps.map((x, i) => '<i class="' + (i < WZ.step ? 'on' : '') + '"></i>').join('') + '</div>';
  let body = '';
  if (WZ.step === 1) {
    const opt = (v, l) => '<button type="button" class="choice" data-wz-len="' + v + '" aria-pressed="' + (String(WZ.len) === String(v)) + '">' + l + '</button>';
    body = '<div class="choices">' + opt(4, '4 weeks') + opt(8, '8 weeks') + opt(12, '12 weeks') + opt('month', 'To month end') + opt('year', 'To year end') + '</div>' +
      '<div class="grid2"><div><div class="field-label"><span>Starts</span></div><input class="plain-input" id="wzStart" type="date" value="' + esc(WZ.start) + '"></div>' +
        '<div><div class="field-label"><span>Ends</span></div><p class="wz-end">' + esc(fmtDay(wzEnd(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) + '</p></div></div>' +
      '<div class="field-label"><span>Name</span></div><input class="plain-input" id="wzName" maxlength="60" value="' + esc(WZ.name) + '">' +
      '<div class="toggles"><button type="button" class="toggle" id="wzShare" aria-pressed="' + WZ.shared + '">' + shareLabel(WZ.shared) + '</button></div>';
  } else if (WZ.step === 2) {
    const list = S.templates.filter(t => !isBlock(t) && routineItems(t.id).length);
    body = (list.length ? '<p class="hint-line" style="margin-top:0">Tick the workouts for this season, in the order you’ll do them. Skip this if you just want goals.</p>' +
        '<ul class="results">' + list.map(t => { const i = WZ.picked.indexOf(t.id); return '<li><button data-wz-pick="' + esc(t.id) + '" class="' + (i >= 0 ? 'sel' : '') + '" aria-pressed="' + (i >= 0) + '"><span><i class="tickbox" aria-hidden="true">' + (i >= 0 ? i + 1 : '') + '</i>' + esc(t.name) + '</span><small>' + routineItems(t.id).length + ' exercises</small></button></li>'; }).join('') + '</ul>'
      : '<p class="muted">No workouts yet. You can add them to the season later, or start from a program in the starter library.</p>') +
      (WZ.picked.length ? '<div class="field-label"><span>Schedule</span></div><span class="seg" role="group" aria-label="Schedule">' +
        [['rotate', 'Take turns'], ['days', 'Set days']].map(([k, l]) => '<button type="button" data-wz-mode="' + k + '" aria-pressed="' + (WZ.mode === k) + '">' + l + '</button>').join('') + '</span>' +
        (WZ.mode === 'days' ? WZ.picked.map(id => '<div class="plan-row"><b>' + esc(tplById(id).name) + '</b><div class="days">' + DAY_NAMES.map((d, bit) =>
          '<button type="button" data-wz-day="' + esc(id) + '" data-bit="' + bit + '" aria-pressed="' + !!((WZ.days.get(id) || 0) & (1 << bit)) + '" aria-label="' + d + '">' + d.slice(0, 2) + '</button>').join('') + '</div></div>').join('')
          : '<p class="hint-line">They take turns in this order. The Log tab suggests the next one.</p>') : '');
  } else {
    if (!WZ.goals) {
      const sug = wzSuggestions();
      WZ.goals = WZ.carry.length ? WZ.carry.concat(sug.filter(x => !WZ.carry.some(c => c.metric === x.metric && (c.exercise_id || null) === (x.exercise_id || null)))) : sug;
      WZ.on = new Set(WZ.carry.length ? WZ.carry.map(g => g.key) : sug.slice(0, 2).map(g => g.key));
    }
    body = pointsHtml(WZ.points) + '<p class="hint-line">' + (WZ.carry.length ? 'Last time’s goals are ticked. ' : '') + 'Suggestions come from your last 8 weeks. Tick what you want; you can add more on the season page.</p>' +
      '<ul class="results">' + WZ.goals.map(g => '<li><button data-wz-goal="' + esc(g.key) + '" class="' + (WZ.on.has(g.key) ? 'sel' : '') + '" aria-pressed="' + WZ.on.has(g.key) + '"><span><i class="tickbox" aria-hidden="true">' + (WZ.on.has(g.key) ? '✓' : '') + '</i>' + esc(g.name) + '</span><small>' +
        ({ visits: 'gym days', volume: 'pounds moved', lift: 'a lift', workout: 'a workout' }[g.metric] || '') + '</small></button></li>').join('') + '</ul>';
  }
  inner.innerHTML = head + '<div class="sheet-body">' + body + '<p class="warn" id="wzErr" role="alert"></p></div>' +
    '<div class="design-foot wz-foot">' + (WZ.step > 1 ? '<button class="btn" data-wz-back>← Back</button>' : '<span></span>') +
      (WZ.step < 3 ? '<button class="btn primary" data-wz-next>Next →</button>' : '<button class="btn primary" data-wz-go>' + (WZ.from ? 'Start it again' : 'Start season') + '</button>') + '</div>';
  const nm = $('wzName'); if (nm) nm.addEventListener('input', () => { WZ.name = nm.value; WZ.nameTouched = true; });
  const sd = $('wzStart'); if (sd) sd.addEventListener('change', () => { if (sd.value) { WZ.start = sd.value; drawWizard(); } });
}
async function wizardClick(b) {
  if (WZ.step === 3 && $('ptToggle') && b.id !== 'ptToggle') WZ.points = readPoints();
  if (b.dataset.wzLen) { WZ.len = /^\d+$/.test(b.dataset.wzLen) ? Number(b.dataset.wzLen) : b.dataset.wzLen; WZ.goals = null; return drawWizard(); }
  if (b.id === 'wzShare') { WZ.shared = !WZ.shared; return drawWizard(); }
  if (b.dataset.wzPick) { const i = WZ.picked.indexOf(b.dataset.wzPick); if (i >= 0) WZ.picked.splice(i, 1); else WZ.picked.push(b.dataset.wzPick); WZ.goals = null; vibrate(5); return drawWizard(); }
  if (b.dataset.wzMode) { WZ.mode = b.dataset.wzMode; WZ.goals = null; return drawWizard(); }
  if (b.dataset.wzDay) { const id = b.dataset.wzDay; WZ.days.set(id, (WZ.days.get(id) || 0) ^ (1 << Number(b.dataset.bit))); WZ.goals = null; vibrate(5); return drawWizard(); }
  if (b.id === 'ptToggle') { WZ.points = readPoints(); WZ.points = WZ.points ? null : { day: 1, pr: 3, workout: 5 }; return drawWizard(); }
  if (b.dataset.wzGoal) { const k = b.dataset.wzGoal; if (WZ.on.has(k)) WZ.on.delete(k); else WZ.on.add(k); return drawWizard(); }
  if (b.hasAttribute('data-wz-back')) { WZ.step--; return drawWizard(); }
  if (b.hasAttribute('data-wz-next')) {
    if (WZ.step === 1 && !(WZ.name || '').trim()) { $('wzErr').textContent = 'Give it a name.'; return; }
    if (WZ.step === 2 && WZ.mode === 'days' && WZ.picked.some(id => !WZ.days.get(id))) { $('wzErr').textContent = 'Tick at least one day for each workout, or switch to Take turns.'; return; }
    WZ.step++; return drawWizard();
  }
  if (!b.hasAttribute('data-wz-go')) return;
  b.disabled = true; b.textContent = 'Setting up…';
  try {
    WZ.points = readPoints();
    const sn = await store.addSeason({ name: WZ.name.trim().slice(0, 60), starts_on: WZ.start, ends_on: wzEnd(), is_shared: WZ.shared, points: WZ.points });
    S.seasons.unshift(sn);
    let pos = 0;
    const [plans, goals] = await Promise.all([
      store.addPlans([...WZ.picked].map(id => ({ season_id: sn.id, template_id: id, position: ++pos, weekdays: WZ.mode === 'days' ? WZ.days.get(id) || 0 : 0 }))),
      store.addGoals(WZ.goals.filter(x => WZ.on.has(x.key)).map(g => ({ season_id: sn.id, name: g.name, metric: g.metric, target: g.target, unit: g.unit || null, exercise_id: g.exercise_id || null, template_id: g.template_id || null }))),
    ]);
    S.plan.push(...plans); S.goals.push(...goals);
    sheet.close();
    openSeason(sn.id);
    toast(sn.name + ' is on. Every set you log from ' + fmtDay(sn.starts_on, { month: 'short', day: 'numeric' }) + ' counts.');
  } catch (x) { $('wzErr').textContent = x.message; b.disabled = false; b.textContent = WZ.from ? 'Start it again' : 'Start season'; }
}

// ===========================================================================
// One "+ New": what are you making?
// ===========================================================================
function openNewChooser() {
  LG.mode = 'newpick';
  const opt = (key, icon, title, sub) => '<li><button data-new-kind="' + key + '" class="new-opt"><span class="new-icon">' + icon + '</span><span><b>' + title + '</b><small>' + sub + '</small></span></button></li>';
  inner.innerHTML = '<div class="sheet-head"><h2 id="sheetTitle">What are you making?</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><ul class="results new-list">' +
      opt('workout', '🏋️', 'A workout', 'What you do on a day. Pick exercises from the library, or drop in blocks.') +
      opt('generate', '🎲', 'Generate a workout', 'Pick push, pull, legs, upper, lower or full body; it builds one from your lifts.') +
      opt('season', '🏆', 'A season', 'Some dates and some people. Everyone picks their own program, or none.') +
      opt('program', '📚', 'A program', 'Workouts on a weekly schedule. Share it, and the crew can add it to their week.') +
      opt('block', '🧩', 'A block', 'A small chunk you reuse in workouts, like “Bench & triceps”.') +
    '</ul></div>';
  openSheet();
}
async function newPickClick(b) {
  const k = b.dataset.newKind;
  if (!k) return;
  if (k === 'season') return openSeasonStart();
  if (k === 'generate') return openGenerator();
  if (k === 'program') return wideScreen() ? openPlanDesigner(null) : openProgramDesigner(null);
  return newRoutine(b, k);
}

// ===========================================================================
// Generate a workout: pick a kind of day and it fills one from the catalogue (generate.js), favouring
// lifts you've done. Swap any step, shuffle the lot, then start it. It's kept as one routine per kind
// ("Generated: Push day"), rewritten each time, so generating doesn't pile up routines.
// ===========================================================================
const GN = { type: 'push', short: false, steps: [] };
function genUsage() {
  const n = new Map();
  for (const r of S.bestRows || []) n.set(r.exercise_id, (n.get(r.exercise_id) || 0) + 1);
  for (const x of S.recent || []) if (x.is_warmup !== true) n.set(x.exercise_id, (n.get(x.exercise_id) || 0) + 1);
  return n;
}
const genPool = () => S.exercises.filter(e => !e.deleted_at && TR.mainField(TR.typeOf(e)) === 'reps');   // the generator writes rep schemes
function openGenerator() {
  LG.mode = 'gen';
  GN.type = prefs.genType || 'push';
  GN.short = !!prefs.genShort;
  GN.steps = G.generate(GN.type, GN.short, genPool(), genUsage());
  drawGenerator();
  openSheet();
}
const genLast = exId => (lastSession(exId) || (S.bestRows || []).some(r => r.exercise_id === exId) ? 'done before' : 'new to you');
function drawGenerator() {
  const dt = G.dayType(GN.type);
  inner.innerHTML = '<div class="sheet-head"><h2 id="sheetTitle">Generate a workout</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<div class="chips" role="group" aria-label="Kind of day">' + G.DAY_TYPES.map(d => '<button type="button" class="chip" data-gen-type="' + d.id + '" aria-pressed="' + (d.id === GN.type) + '">' + esc(d.name) + '</button>').join('') + '</div>' +
      '<div class="row" style="margin-top:12px"><span class="muted">How long</span><span class="seg" role="group" aria-label="How long">' +
        [[true, 'Short · 4'], [false, 'Full · ' + dt.steps.length]].map(([v, l]) => '<button type="button" data-gen-short="' + v + '" aria-pressed="' + (GN.short === v) + '">' + l + '</button>').join('') + '</span></div>' +
      (GN.steps.length ? '<ol class="gen-list">' + GN.steps.map((x, i) => '<li><span class="what"><b>' + esc(exName(x.exercise_id)) + '</b><small>' + x.sets + ' × ' + x.reps + ' · ' + esc(genLast(x.exercise_id)) + '</small></span>' +
          '<button type="button" class="iconbtn" data-gen-swap="' + i + '" aria-label="Swap ' + esc(exName(x.exercise_id)) + ' for something else">↻</button></li>').join('') + '</ol>'
        : '<p class="muted">Nothing in the catalogue fits this kind of day yet.</p>') +
      '<p class="hint-line">Built from the exercise list, mostly lifts you’ve done. ↻ swaps one. Weights come from your last time.</p>' +
      '<p class="warn" id="genErr" role="alert"></p></div>' +
    '<div class="design-foot wz-foot"><button class="btn ghost" data-gen-shuffle>🎲 Shuffle</button>' +
      '<button class="btn primary" data-gen-go' + (GN.steps.length ? '' : ' disabled') + '>Start it</button></div>';
}
async function genClick(b) {
  if (b.dataset.genType || b.dataset.genShort) {
    if (b.dataset.genType) GN.type = prefs.genType = b.dataset.genType;
    if (b.dataset.genShort) GN.short = prefs.genShort = b.dataset.genShort === 'true';
    savePrefs();
    GN.steps = G.generate(GN.type, GN.short, genPool(), genUsage());
    return drawGenerator();
  }
  if (b.hasAttribute('data-gen-shuffle')) { GN.steps = G.generate(GN.type, GN.short, genPool(), genUsage()); return drawGenerator(); }
  if (b.dataset.genSwap) {
    const i = Number(b.dataset.genSwap), cur = GN.steps[i];
    const e = G.pickFor(cur.slots, genPool(), genUsage(), new Set(GN.steps.map(x => x.exercise_id)));
    if (!e) return toast('Nothing else fits that spot');
    const slot = G.slotOf(e.name);
    GN.steps[i] = { ...cur, exercise_id: e.id, slot, ...G.prescribe(slot, i) };
    return drawGenerator();
  }
  if (!b.hasAttribute('data-gen-go')) return;
  const name = 'Generated: ' + G.dayType(GN.type).title;
  b.disabled = true; b.textContent = 'Setting up…';
  try {
    let t = S.templates.find(x => isMine(x) && !isBlock(x) && x.name === name);
    if (t) {   // rewrite it: the old steps go in one request
      const old = rawItems(t.id).map(it => it.id);
      await store.removeItems(old);
      S.items = S.items.filter(x => !old.includes(x.id)); old.forEach(id => S.itemsById.delete(id));
    } else { t = await store.addRoutine({ name, kind: 'workout', notes: null }); S.templates.push(t); }
    await putItems(GN.steps.map((x, i) => ({ template_id: t.id, exercise_id: x.exercise_id, position: i + 1, sets: x.sets, reps: x.reps,
      load_mode: 'last', load_value: 0, unit: lastLoad(x.exercise_id).unit, rest_s: x.rest_s, note: null })));
    startFollowing(t.id);
  } catch (x) { $('genErr').textContent = x.message; b.disabled = false; b.textContent = 'Start it'; }
}

// ===========================================================================
// The stream of wins: PRs, clubs joined, season goals hit and finished sessions, for the whole
// crew. They post themselves as they happen (switch off in the stream's header). No reactions.
// ===========================================================================
const shareOn = () => prefs.shareWins !== false;
async function postWin(kind, title, summary, day) {
  if (!shareOn()) return;
  try {
    const w = await store.postWin({ kind, performed_on: day || today(), title: title.slice(0, 80), summary });
    if (S.wins) { S.wins = S.wins.filter(x => x.id !== w.id); S.wins.unshift(w); }
    for (const sn of S.seasons || []) { const st = S.standings[sn.id]; if (st && st.feed && w.performed_on >= sn.starts_on && w.performed_on <= sn.ends_on) { st.feed = st.feed.filter(x => x.id !== w.id); st.feed.unshift(w); } }
  } catch (x) { /* a win that can't post shouldn't get in the way of logging */ }
}
async function unpostWin(kind, title, day) {
  const w = (S.wins || []).find(x => x.created_by === S.myId && x.kind === kind && x.title === title && x.performed_on === day);
  if (w) {
    try {
      await store.removeWin(w.id); S.wins = S.wins.filter(x => x !== w);
      for (const k in S.standings) if (S.standings[k] && S.standings[k].feed) S.standings[k].feed = S.standings[k].feed.filter(x => x.id !== w.id);
    } catch (x) { /* fine */ }
  }
}
async function removeWin(id) {
  try {
    await store.removeWin(id); S.wins = (S.wins || []).filter(x => x.id !== id);
    for (const k in S.standings) if (S.standings[k] && S.standings[k].feed) S.standings[k].feed = S.standings[k].feed.filter(x => x.id !== id);
    render(); toast('Removed from the feed');
  } catch (x) { fail(x); }
}
// Season goals you just finished: compare against what was already done when the app loaded.
function goalKeyDone() {
  const out = new Set(), t = today();
  for (const sn of (S.seasons || []).filter(x => inSeason(x) && x.starts_on <= t && t <= x.ends_on)) {
    const m = seasonM(sn);
    for (const g of goalsFor(sn, S.myId)) if (goalHave(g, m, { season: sn }) >= Number(g.target)) out.add(sn.id + '|' + g.id);
  }
  return out;
}
function checkGoalWins() {
  if (!S.goalsDone) { S.goalsDone = goalKeyDone(); return; }
  const now = goalKeyDone();
  for (const k of now) if (!S.goalsDone.has(k)) {
    const [sid, gid] = k.split('|'), g = S.goals.find(x => x.id === gid), sn = seasonById(sid);
    if (g && sn) { postWin('goal', isCore(sn) ? g.name : g.name + ' · ' + sn.name, {}); toast(T.icons.goal + ' ' + T.goalToast + g.name); }
  }
  S.goalsDone = now;
}
async function loadWins() {
  if (!S.goalsDone) S.goalsDone = goalKeyDone();
  if (S.winsLoading || (S.wins && Date.now() - (S.winsAt || 0) < 600000)) return;   // ten minutes; coming back to the app refreshes sooner
  S.winsLoading = true;
  const before = S.myId ? unfinished() : null;
  try { S.wins = await store.wins(); S.winsAt = Date.now(); } catch (x) { S.wins = S.wins || []; }
  S.winsLoading = false;
  await autoFinish();
  if (currentTab === 'log' && before !== null && before !== unfinished()) return render();
  const box = $('winsBox'); if (box && currentTab === 'log') box.outerHTML = winsCard();
}
const WIN_ICON = new Proxy({}, { get: (_, k) => T.icons[k] });
function winText(w) {
  const m = w.summary || {};
  if (w.kind === 'pr') return T.winPr(w.title.replace(/ PR$/, '')) + prText(m);
  if (w.kind === 'club') return T.win.club + w.title;
  if (w.kind === 'record') return T.win.record + w.title.replace(/ record$/, '') + ' record, ' + L.fmtLoad(Number(m.weight)) + ' ' + (m.unit || 'lb') + ' × ' + m.reps + (m.from ? ' (was ' + m.from + '’s)' : '');
  if (w.kind === 'quest') return T.win.quest + w.title;
  if (w.kind === 'stamp') return T.win.stamp + w.title;
  if (w.kind === 'goal') return T.win.goal + w.title;
  if (w.kind === 'cardio') return w.title + ': ' + cardioText({ minutes: m.minutes, distance: m.distance, distance_unit: m.unit });
  return T.win.session + w.title + (m.lb ? ' · ' + C.compact(m.lb) + ' lb' : '') + (m.sets ? ' · ' + m.sets + ' set' + (m.sets === 1 ? '' : 's') : '') + (m.minutes ? ' · ' + m.minutes + ' min' : '');
}
// The daily card: the day's lifts with their top sets, the totals, and badges for what it earned.
const verb = s => s.replace(/[:\s]+(the\s*)?$/, '');
const ordinal = k => k + (k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] || 'th');
function sessionCardHtml(w, extra) {
  const m = w.summary || {}, items = Array.isArray(m.items) ? m.items : [];
  const names = new Set(items.map(it => String(it[0])));
  const n = x => Number(x).toLocaleString('en-US');
  const stat = (v, u, cls) => '<span class="ws-stat' + (cls ? ' ' + cls : '') + '">' + v + ' <small>' + u + '</small></span>';
  const stats = (m.lb ? stat(n(m.lb), 'lb') : '') + (m.sets ? stat(n(m.sets), m.sets === 1 ? 'set' : 'sets') : '') +
    (m.minutes ? stat(n(m.minutes), 'min') : '') + (m.prs ? stat(n(m.prs), m.prs === 1 ? T.pr : T.prs, 'gold') : '');
  const bw = it => it[5] || !(Number(it[3]) > 0);
  const load = it => (bw(it) ? 'bodyweight' : esc(L.fmtLoad(Number(it[3]))) + (it[4] && it[4] !== 'lb' ? ' ' + esc(it[4]) : ''));
  const rows = items.map(it => '<li' + (it[6] ? ' class="pr"' : '') + '><b>' + esc(it[0]) + '</b><span>' + (it[6] ? T.icons.pr + ' ' : '') +
    esc(itemLine(it, n)) + '</span></li>').join('');
  const badge = (icon, label, small, isNew) => '<span class="ws-badge' + (isNew ? ' new' : '') + '"><span class="m">' + icon + '</span>' + esc(label) + (small ? ' <small>' + esc(small) + '</small>' : '') + '</span>';
  const badges = extra.map(x =>
    x.kind === 'club' ? badge(T.icons.club, x.title, 'new', true)
    : x.kind === 'goal' ? badge(T.icons.goal, verb(T.win.goal), x.title.split(' · ')[0])
    : x.kind === 'quest' ? badge(T.icons.quest, verb(T.win.quest), x.title)
    : x.kind === 'stamp' ? badge(T.icons.stamp, x.title.split(' · ')[0], T.stamp, true)
    : x.kind === 'record' ? badge(T.icons.record, verb(T.win.record), x.title.replace(/ record$/, ''), true)
    : x.kind === 'pr' && !names.has(x.title.replace(/ PR$/, '')) ? badge(T.icons.pr, x.title.replace(/ PR$/, ''), T.pr)
    : '').join('') + (m.streak >= 2 ? badge(T.icons.streak, m.streak + ' ' + T.streak, '') : '');
  const foot = [m.where, m.nth ? ordinal(m.nth) + ' gym day this week' : '', m.auto ? 'finished automatically' : ''].filter(Boolean).join(' · ');
  return '<div class="ws-card"><div class="ws-top"><span class="ws-title">' + T.icons.session + ' ' + esc(w.title) + '</span><span class="ws-date">' +
      esc(fmtDay(w.performed_on, { weekday: 'short', month: 'short', day: 'numeric' })) + '</span></div>' +
    (stats ? '<div class="ws-stats">' + stats + '</div>' : '') +
    (rows ? '<ol class="ws-lifts">' + rows + '</ol>' : '') +
    (badges ? '<div class="ws-badges">' + badges + '</div>' : '') +
    (foot ? '<div class="ws-foot">' + esc(foot) + '</div>' : '') + '</div>';
}
// ===========================================================================
// The exercise library: every lift in the catalogue, browsable by muscle and equipment, each with
// your own numbers. Open one to log it, add it to a workout or see its trend.
// ===========================================================================
S.lib = { q: '', mus: null, eq: null, mine: false, sort: 'used' };
// "Chest · Barbell": from the exercise's muscles and equipment, or its name when it has none.
// Worked out once per exercise and kept.
const TAGS = new Map();
const libTag = e => {
  const key = e.id + '|' + e.name + '|' + (e.muscles || []).join() + '|' + (e.equipment || []).join();
  let t = TAGS.get(key);
  if (t == null) TAGS.set(key, t = [LIB.muscleName(LIB.muscleKeyOf(e)), LIB.equipmentName(LIB.equipmentKeyOf(e) || '')].filter(Boolean).join(' · '));
  return t;
};
// A search that found a lift by another name says so: "Barbell Bench Press" finds Bench Press,
// "also called Barbell Bench Press".
const akaTag = (q, e) => { const a = q && L.matchedAlias(q, e, S.aliases); return a ? 'also called ' + a + ' · ' : ''; };
let LIBSTATS = null, LIBKEY = '';
// Per exercise: days done in the last 120, the last day, and your best set by estimated 1-rep max.
function libStats() {
  const key = S.recent.length + '|' + (S.recent[0] || {}).id + '|' + (S.bestRows || []).length;
  if (LIBSTATS && LIBKEY === key) return LIBSTATS;
  const m = new Map(), get = id => m.get(id) || (m.set(id, { days: new Set(), last: null, ever: false, best: null }), m.get(id));
  for (const x of S.recent) {
    if (x.is_warmup === true) continue;
    const r = get(x.exercise_id); r.days.add(x.performed_on); r.ever = true;
    if (!r.last || x.performed_on > r.last) r.last = x.performed_on;
  }
  for (const b of S.bestRows || []) {
    const r = get(b.exercise_id), w = Number(b.heaviest);
    const e1 = (L.e1rm(w, b.reps) || w) * (b.unit === 'kg' ? L.LB_PER_KG : 1);
    r.ever = true;
    if (!r.best || e1 > r.best.e1) r.best = { e1, w, unit: b.unit, reps: b.reps };
  }
  LIBSTATS = m; LIBKEY = key;
  return m;
}
function libList(f) {
  const st = libStats();
  let list = f.q ? L.searchExercises(f.q, S.exercises, S.aliases, recentExerciseIds()) : S.exercises.filter(e => !e.deleted_at);
  if (f.mus) list = list.filter(e => LIB.muscleKeyOf(e) === f.mus);
  if (f.eq) list = list.filter(e => LIB.equipmentKeyOf(e) === f.eq);
  if (f.mine) list = list.filter(e => (st.get(e.id) || {}).ever);
  const used = e => { const r = st.get(e.id); return r ? r.days.size * 10 + (r.ever ? 1 : 0) : 0; };
  if (!f.q) list = list.slice().sort((a, b) => (f.sort === 'az' ? 0 : used(b) - used(a)) || a.name.localeCompare(b.name));
  return list;
}
// The filters, as one row of chips (it scrolls sideways on a phone, so the list stays in view):
// All, then whatever's switched on (so it's never scrolled out of sight), then muscles, then
// "Done before" and equipment after a thin divider.
function libChips(f, pre) {
  const chip = (attr, val, label, on) => '<button type="button" class="chip lib-chip" data-' + pre + '-' + attr + '="' + val + '" aria-pressed="' + !!on + '">' + label + '</button>';
  const mus = LIB.MUSCLES.map(([k, l]) => ({ on: f.mus === k, html: chip('mus', k, l, f.mus === k) }));
  const more = [{ on: !!f.mine, html: chip('mine', '', 'Done before', f.mine) }].concat(LIB.EQUIPMENT.map(([k, l]) => ({ on: f.eq === k, html: chip('eq', k, l, f.eq === k) })));
  const on = mus.concat(more).filter(c => c.on), offMus = mus.filter(c => !c.on), offMore = more.filter(c => !c.on);
  return '<div class="chips lib-row" role="group" aria-label="Filter by muscle, equipment or done before">' + chip('mus', '', 'All', !f.mus && !f.eq && !f.mine) +
    on.map(c => c.html).join('') + offMus.map(c => c.html).join('') + '<span class="lib-sep" aria-hidden="true"></span>' + offMore.map(c => c.html).join('') + '</div>';
}
function renderLibrary() {
  const n = S.exercises.filter(e => !e.deleted_at).length;
  view.innerHTML = '<div class="row page-actions"><h2 style="font-size:28px">' + esc(T.titles.library) + '</h2>' +
      (me && me.is_admin ? '<button class="btn" data-lib-new>+ New exercise</button>' : '') + '</div>' +
    '<section class="card lib-card"><input class="search" id="libSearch" type="search" placeholder="Search ' + n + ' exercises" autocomplete="off" aria-label="Search the library" value="' + esc(S.lib.q) + '">' +
      '<div id="libFilters">' + libChips(S.lib, 'lib') + '</div></section>' +
    '<div id="libList" class="lib-wrap">' + libListHtml() + '</div>';
}
function drawLib() { $('libFilters').innerHTML = libChips(S.lib, 'lib'); $('libList').innerHTML = libListHtml(); }
function libListHtml() {
  const f = S.lib, list = libList(f), st = libStats();
  if (!list.length) return '<section class="card"><p class="muted" style="margin:0">Nothing matches. ' +
    (me && me.is_admin && f.q ? '<button class="linkbtn" data-lib-new="' + esc(f.q) + '">Add “' + esc(f.q) + '” to the library</button>' : 'Try another muscle, or clear the search.') + '</p></section>';
  const shown = S.libAll || f.q ? list : list.slice(0, 60);
  const sort = f.q ? '' : '<span class="seg lib-sort" role="group" aria-label="Sort">' + [['used', 'Most done'], ['az', 'A–Z']].map(([k, l]) =>
    '<button type="button" data-lib-sort="' + k + '" aria-pressed="' + (f.sort === k) + '">' + l + '</button>').join('') + '</span>';
  return '<div class="row lib-count"><span class="muted">' + list.length + ' exercise' + (list.length === 1 ? '' : 's') + '</span>' + sort + '</div>' +
    '<ul class="results lib-list">' + shown.map(e => {
      const r = st.get(e.id);
      const mine = r && r.best ? 'best ' + (r.best.w > 0 ? L.fmtLoad(r.best.w) + ' ' + r.best.unit + ' × ' + r.best.reps : r.best.reps + ' reps') : TR.featLine(e.id, S.feats, TRO());
      const when = r && r.last ? (r.days.size > 1 ? r.days.size + ' days lately · ' : '') + 'last ' + fmtDay(r.last, { month: 'short', day: 'numeric' }) : '';
      return '<li><button data-lib-ex="' + esc(e.id) + '"><span class="lib-name">' + esc(e.name) + '<small class="lib-sub">' + esc(akaTag(f.q, e) + libTag(e)) + '</small>' +
        (mine || when ? '<small class="lib-me">' + esc([mine, when].filter(Boolean).join(' · ')) + '</small>' : '') + '</span><span class="chev" aria-hidden="true">›</span></button></li>';
    }).join('') + '</ul>' +
    (shown.length < list.length ? '<button class="btn ghost block" data-lib-all>Show all ' + list.length + '</button>' : '');
}
// One exercise: how to do it, your numbers, where it's used, and what to do with it.
function openExInfo(id) {
  const e = S.byId.get(id);
  if (!e) return;
  LG.mode = 'exinfo'; LG.exInfo = id;
  const r = libStats().get(id), tip = S.tips.get(id), last = localLast(id) || S.lastOld.get(id);
  const bests = (S.bestRows || []).filter(b => b.exercise_id === id).sort((a, b) => a.unit.localeCompare(b.unit) || a.reps - b.reps).slice(0, 10);
  const usedIn = S.templates.filter(t => routineItems(t.id).some(it => it.exercise_id === id));
  inner.innerHTML = '<div class="sheet-head"><div><small class="muted">' + esc(libTag(e)) + '</small><h2 id="sheetTitle">' + esc(e.name) + '</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      (tip ? '<p class="tip">💡 ' + esc(tip) + '</p>' : '') +
      '<p class="last-line">' + (last && last.length ? 'Last time, ' + esc(fmtDay(last[0].performed_on, { month: 'short', day: 'numeric' })) + ': <b>' + esc(summarizeSets(last)) + '</b>' +
        (r && r.days.size ? ' · ' + r.days.size + ' day' + (r.days.size === 1 ? '' : 's') + ' in the last 4 months' : '') : 'You haven’t logged this one yet.') + '</p>' +
      (bests.length ? '<div class="section-title" style="margin-top:14px">Your bests</div><div class="chips">' + bests.map(b =>
        '<span class="chip">' + b.reps + ' rep' + (b.reps === 1 ? '' : 's') + ': <b>&nbsp;' + esc(Number(b.heaviest) > 0 ? L.fmtLoad(Number(b.heaviest)) + ' ' + b.unit : 'bodyweight') + '</b></span>').join('') + '</div>' : '') +
      (TR.featLine(id, S.feats, TRO()) ? '<p class="hint-line">Your bests: <b>' + esc(TR.featLine(id, S.feats, TRO())) + '</b></p>' : '') +
      (me && me.is_admin ? typePicker('lib-type', TR.typeOf(e).id) : '') +
      (usedIn.length ? '<div class="section-title" style="margin-top:14px">In workouts</div><div class="chips">' + usedIn.slice(0, 12).map(t =>
        (isMine(t) ? '<button type="button" class="chip" data-lib-open-rt="' + esc(t.id) + '">' : '<span class="chip">') + esc(t.name) + (isMine(t) ? '</button>' : '</span>')).join('') + '</div>' : '') +
      '<div class="ex-actions"><button class="btn primary" data-lib-log="' + esc(id) + '">Log it</button>' +
        '<button class="btn" data-lib-addto="' + esc(id) + '">+ Add to a workout</button>' +
        (r && r.ever ? '<button class="btn ghost" data-lib-trend="' + esc(id) + '">See the trend</button>' : '') + '</div>' +
    '</div>';
  openSheet();
  if (!last) fetchLast(id);
}
function openAddTo(id) {
  LG.mode = 'libaddto'; LG.exInfo = id;
  const mine = S.templates.filter(isMine).sort((a, b) => Number(isBlock(a)) - Number(isBlock(b)) || a.name.localeCompare(b.name));
  const row = t => '<li><button data-lib-to="' + esc(t.id) + '"><span>' + esc(t.name) + '</span><small>' + (isBlock(t) ? 'block · ' : '') + routineItems(t.id).length + ' steps</small></button></li>';
  inner.innerHTML = '<div class="sheet-head"><div><button class="linkbtn" data-lib-back>← ' + esc(exName(id)) + '</button><h2 id="sheetTitle">Add to which?</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><ul class="results"><li><button data-lib-to="new"><span>＋ New workout with it</span><small>start one from this exercise</small></button></li>' + mine.map(row).join('') + '</ul></div>';
  openSheet();
}
// How an exercise is measured: one button per log type (admins set it; it decides the logger's boxes).
const typePicker = (attr, on) => '<div class="field-label" style="margin-top:14px"><span>Measured by</span><small>sets the logger’s boxes</small></div><div class="seg seg-wrap" role="group" aria-label="Measured by">' +
  TR.TYPE_ORDER.map(k => '<button type="button" data-' + attr + '="' + k + '" aria-pressed="' + (k === on) + '" title="' + esc(TR.TYPES[k].blurb) + '">' + esc(TR.TYPES[k].name) + '</button>').join('') + '</div>';
function openNewExercise(name) {
  LG.mode = 'newex'; LG.newType = 'reps';
  inner.innerHTML = '<div class="sheet-head"><h2 id="sheetTitle">Add to the library</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><p class="hint-line" style="margin-top:0">Everyone in the crew can use it straight away. Name it the way people say it at the gym; muscle and equipment come from the name.</p>' +
      '<input class="plain-input" id="newExName" maxlength="80" placeholder="e.g. Cable Y-raise" value="' + esc(name) + '" aria-label="Exercise name" autocomplete="off">' +
      '<div id="newExType">' + typePicker('new-ex-type', 'reps') + '</div>' +
      '<p class="hint-line" id="newExHint"></p><p class="warn" id="newExWarn"></p>' +
      '<button class="btn primary block big" data-new-ex-save>Add it</button></div>';
  openSheet();
  const box = $('newExName');
  const hint = () => {
    const v = box.value.trim(), near = v && L.suggestMatch(v, S.exercises.filter(e => !e.deleted_at).map(e => e.name));
    $('newExHint').textContent = v ? 'It’ll show under ' + (libTag({ name: v }) || 'Other') + '.' : '';
    $('newExWarn').innerHTML = near ? 'Did you mean <b>' + esc(near) + '</b>? It’s already there.' : '';
  };
  box.addEventListener('input', hint); hint();
  setTimeout(() => box.focus(), 60);
}
async function libSheetClick(b) {
  const id = LG.exInfo;
  if (b.dataset.libLog) return openEntry(b.dataset.libLog);
  if (b.dataset.libAddto) return openAddTo(b.dataset.libAddto);
  if (b.hasAttribute('data-lib-back')) return openExInfo(id);
  if (b.dataset.libOpenRt) return openDesigner(b.dataset.libOpenRt);
  if (b.dataset.libTrend) {
    sheet.close(); S.trendEx = b.dataset.libTrend; S.hist = S.hist || new Map(); location.hash = '#progress';
    return setTimeout(() => { const t = $('trendBox'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 200);
  }
  if (b.dataset.libTo) {
    b.disabled = true;
    try {
      let tid = b.dataset.libTo;
      if (tid === 'new') { const t = await store.addRoutine({ name: exName(id), kind: 'workout' }); S.templates.push(t); tid = t.id; }
      else if (routineItems(tid).length >= 100) { b.disabled = false; return toast('That one already has 100 steps.'); }
      return addItemsTo(tid, [id]);   // opens the workout with it on the end
    } catch (x) { b.disabled = false; return fail(x); }
  }
  if (b.dataset.newExType) { LG.newType = b.dataset.newExType; $('newExType').innerHTML = typePicker('new-ex-type', LG.newType); return; }
  if (b.dataset.libType) {
    b.disabled = true;
    try { const e = await store.updateExercise(id, { log_type: b.dataset.libType }); Object.assign(S.byId.get(id), e); toast(exName(id) + ' is measured by ' + TR.TYPES[e.log_type].name.toLowerCase() + ' now.'); }
    catch (x) { fail(x); }
    return openExInfo(id);
  }
  if (b.hasAttribute('data-new-ex-save')) {
    const name = $('newExName').value.trim().replace(/\s+/g, ' ');
    if (!name) return toast('Give it a name.');
    if (S.exercises.some(e => !e.deleted_at && L.norm(e.name) === L.norm(name))) return toast('“' + name + '” is already in the library.');
    b.disabled = true;
    try {
      const e = await store.addExercise(name, { log_type: LG.newType || 'reps' });
      S.exercises.push(e); S.byId.set(e.id, e); LIBSTATS = null;
      toast('Added “' + e.name + '” to the library.');
      if (currentTab === 'library') { S.lib.q = ''; render(); }
      return openExInfo(e.id);
    } catch (x) { b.disabled = false; return fail(x); }
  }
}

// Share card: your finished workout as a picture in the current theme, for people outside the app.
const SHARE_SRC = new Map();   // feed session id → { w, extras }, filled as the feed is drawn
function sessionActs(w, extras, del) {
  if (w.created_by !== S.myId) return '';
  SHARE_SRC.set(w.id, { w, extras });
  return '<span class="ws-acts"><button class="btn sm" data-win-share="' + esc(w.id) + '" aria-label="Share a picture of this workout">Share</button>' + del(w) + '</span>';
}
function shareCardFor(w, extras) {
  const m = w.summary || {}, items = Array.isArray(m.items) ? m.items : [];
  const n = x => Number(x).toLocaleString('en-US');
  const names = new Set(items.map(it => String(it[0])));
  const stats = [m.lb ? { v: C.compact(m.lb), u: 'lb moved' } : null, m.sets ? { v: n(m.sets), u: m.sets === 1 ? 'set' : 'sets' } : null,
    m.minutes ? { v: n(m.minutes), u: 'minutes' } : null, m.prs ? { v: n(m.prs), u: m.prs === 1 ? T.pr : T.prs, gold: true } : null].filter(Boolean);
  const bw = it => it[5] || !(Number(it[3]) > 0);
  const lifts = items.map(it => ({ name: String(it[0]), pr: !!it[6],
    rx: itemLine(it, n) }));
  const badges = extras.map(x =>
    x.kind === 'club' ? T.icons.club + ' ' + x.title
    : x.kind === 'goal' ? T.icons.goal + ' ' + x.title.split(' · ')[0]
    : x.kind === 'quest' ? T.icons.quest + ' ' + x.title
    : x.kind === 'stamp' ? T.icons.stamp + ' ' + x.title.split(' · ')[0]
    : x.kind === 'record' ? T.icons.record + ' ' + x.title
    : x.kind === 'pr' && !names.has(x.title.replace(/ PR$/, '')) ? T.icons.pr + ' ' + x.title
    : '').filter(Boolean).concat(m.streak >= 2 ? [T.icons.streak + ' ' + m.streak + ' ' + T.streak] : []);
  return { brand: T.brand, motto: T.motto, who: S.names.get(w.created_by) || '', title: w.title, icon: T.icons.session, prIcon: T.icons.pr,
    date: fmtDay(w.performed_on, { weekday: 'long', month: 'long', day: 'numeric' }),
    stats, lifts, more: Math.max(0, (m.lifts || 0) - items.length), badges,
    foot: [m.where, m.nth ? ordinal(m.nth) + ' gym day this week' : ''].filter(Boolean).join(' · ') };
}
async function shareWorkout(w, extras, b) {
  if (b) b.disabled = true;
  try {
    const how = await shareCard(shareCardFor(w, extras), 'workout-' + w.performed_on + '.png');
    if (how === 'saved') toast('Saved the picture. Send it from your photos or downloads.');
  } catch (x) { toast('Couldn’t make the picture.'); }
  if (b) b.disabled = false;
}
function winList(wins, color, who, max) {
  // A finished session gathers that person's other wins from the same day into its card.
  const sessions = new Set(wins.filter(w => w.kind === 'session').map(w => w.created_by + '|' + w.performed_on));
  const folded = new Map();
  for (const w of wins) {
    const k = w.created_by + '|' + w.performed_on;
    if (w.kind !== 'session' && w.kind !== 'cardio' && sessions.has(k)) { if (!folded.has(k)) folded.set(k, []); folded.get(k).push(w); }
  }
  const list = wins.filter(w => w.kind === 'session' || w.kind === 'cardio' || !sessions.has(w.created_by + '|' + w.performed_on)).slice(0, max || 25);
  const when = d => (dayLabel(d) === 'Today' ? 'Today' : d === L.addDays(today(), -1) ? 'Yesterday' : fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' }));
  const del = w => (w.created_by === S.myId ? '<button class="iconbtn sm" data-win-del="' + esc(w.id) + '" aria-label="Remove this from the feed">✕</button>' : '');
  const whoTag = w => '<b><i style="background:' + color(w.created_by) + '"></i>' + esc(who(w.created_by)) + '</b>';
  return '<ol class="win-list">' + list.map(w => (w.kind === 'session'
    ? '<li class="win-session"><div class="ws-head">' + whoTag(w) + '<small>' + esc(when(w.performed_on)) + '</small>' + sessionActs(w, folded.get(w.created_by + '|' + w.performed_on) || [], del) + '</div>' + sessionCardHtml(w, folded.get(w.created_by + '|' + w.performed_on) || []) + '</li>'
    : '<li><span class="win-icon">' + (w.kind === 'cardio' ? '🏃' : WIN_ICON[w.kind] || '⭐') + '</span><span class="win-body">' + whoTag(w) + ' ' + esc(winText(w)) +
      '<small>' + esc(when(w.performed_on)) + '</small></span>' + del(w) + '</li>')).join('') + '</ol>';
}
// On the Log tab: the feed of a season you're in that's running today (none, no card).
const liveSeason = () => { const t = today(); return (S.seasons || []).find(x => !isCore(x) && inSeason(x) && x.starts_on <= t && t <= x.ends_on); };
function winsCard() {
  const sn = liveSeason();
  if (!sn) return '';
  const st = S.standings[sn.id];
  const redraw = err => { const box = $('winsBox'); if (!err && box && currentTab === 'log') box.outerHTML = winsCard(); };
  // Shown from what you last saw; refreshed quietly when it's more than a couple of minutes old.
  if (st && st.feed && Date.now() - (S.seasonAt[sn.id] || 0) > 120000 && !seasonLoads.has(sn.id)) loadSeason(sn, redraw);
  if (!st || !st.feed) {
    loadSeason(sn, redraw);
    return '<section class="card wins" id="winsBox"><div class="card-head"><h3 class="card-title">' + esc(sn.name) + '</h3></div><p class="muted" style="margin:0">Loading…</p></section>';
  }
  return seasonFeedCard(sn, st, seasonPeople(sn, st), { id: 'winsBox', title: sn.name, sub: 'the season’s feed', open: true, max: 15 });
}

// ===========================================================================
// Session recap: what today added up to, then Finish to put it in the stream.
// ===========================================================================
const daySets = day => (day === today() ? todaySets() : recentOn(day).slice().sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
function sessionSummary(day = today()) {
  const sets = daySets(day).filter(x => x.is_warmup !== true && x._sync !== 'gone');
  if (!sets.length) return null;
  const lb = L.lbEquivalent(L.volumeByUnit(sets));
  const times = sets.map(x => Date.parse(x.logged_at)).filter(Number.isFinite);
  const minutes = times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 60000) : 0;
  const exIds = [...new Set(sets.map(x => x.exercise_id))];
  const prs = S.bestRows.filter(r => r.first_lifted_on === day);
  const byEx = new Map();
  for (const r of prs) if (!byEx.has(r.exercise_id) || Number(r.heaviest) > Number(byEx.get(r.exercise_id).heaviest)) byEx.set(r.exercise_id, r);
  const f = day === today() ? following() : null;
  const prev = S.days.find(x => x.performed_on < day && x.sets > 0);
  return { day, title: f ? f.template.name : nameFrom(exIds), lb, sets: sets.length, minutes: minutes >= 5 ? minutes : 0, exIds, prs: [...byEx.values()], prev };
}
// What a finished session puts in the feed: totals, every lift's top set, and a little context.
// Names travel with it so the crew sees them without a lookup. Kept well under the 4 KB a post allows.
function sessionPost(r) {
  const sets = daySets(r.day).filter(x => x.is_warmup !== true && x._sync !== 'gone');
  const prEx = new Set(r.prs.map(p => p.exercise_id)), by = new Map();
  for (const x of sets) {
    const g = by.get(x.exercise_id) || { n: 0, top: x };
    g.n++;
    if (Number(x.weight) > Number(g.top.weight) || (Number(x.weight) === Number(g.top.weight) && x.reps > g.top.reps)) g.top = x;
    by.set(x.exercise_id, g);
  }
  const items = [...by].slice(0, 10).map(([id, g]) => [exName(id).slice(0, 40), g.n, g.top.reps ?? mainText(g.top), Number(g.top.weight), g.top.unit,
    g.top.count_bodyweight && !(Number(g.top.weight) > 0) ? 1 : 0, prEx.has(id) ? 1 : 0]);
  const t = r.day, sn = (S.seasons || []).find(x => inSeason(x) && !isCore(x) && x.starts_on <= t && t <= x.ends_on);
  const where = sn ? sn.name + ' · week ' + (Math.floor((Date.parse(t) - Date.parse(sn.starts_on)) / 864e5 / 7) + 1) : '';
  const nth = S.days.filter(d => d.performed_on >= weekOf(t) && d.performed_on <= t && d.sets > 0).length;
  return { lb: Math.round(r.lb), sets: r.sets, minutes: r.minutes, lifts: r.exIds.length, prs: r.prs.length,
    items, streak: streakWeeks() || 0, nth, where: where.slice(0, 60) };
}
// Finished? Today's working sets are all covered by your last Finish: the session posted to the
// feed (any device) says how many sets it had, and this phone remembers the same for private finishes.
// Log more after finishing and Finish comes back to update it.
const workingToday = () => todaySets().filter(x => x.is_warmup !== true && x._sync !== 'gone').length;
function finishedSets() {
  const t = today();
  const w = (S.wins || []).find(x => x.created_by === S.myId && x.kind === 'session' && x.performed_on === t);
  let local = 0;
  try { const [d, n] = (localStorage.getItem('lift.finished') || '').split('|'); if (d === t && n) local = Number(n) || 0; } catch (e) {}
  return Math.max((w && w.summary && Number(w.summary.sets)) || 0, local);
}
const unfinished = () => workingToday() > finishedSets();
// A workout nobody tapped Finish on finishes itself 12 hours after its last set, so the crew sees the
// whole session instead of a scatter of PRs. Your last 3 days, once the feed has loaded (so it knows
// what's already posted); a day finished by hand, here or on another phone, is left alone. Posts only
// if your wins are shared, the same as Finish. The card says it finished itself.
const AUTO_FINISH_H = 12;
async function autoFinish() {
  if (!S.myId || !S.wins || !shareOn()) return;
  const posted = new Set(S.wins.filter(w => w.created_by === S.myId && w.kind === 'session').map(w => w.performed_on));
  let local = ''; try { local = (localStorage.getItem('lift.finished') || '').split('|')[0]; } catch (e) {}
  const days = L.daysToFinish({ today: today(), now: Date.now(), setsOn: daySets, posted, finishedHere: local, hours: AUTO_FINISH_H });
  for (const day of days) {
    const r = sessionSummary(day);
    if (r) await postWin('session', r.title, { ...sessionPost(r), auto: 1 }, day);
  }
  const any = days.length > 0;
  if (any && currentTab === 'log') render();
}
function openRecap() {
  const r = sessionSummary();
  if (!r) return toast('Log a set first.');
  LG.mode = 'recap';
  const diff = r.prev ? Math.round((r.lb - lbOf(r.prev)) / Math.max(1, lbOf(r.prev)) * 100) : null;
  const posted = (S.wins || []).some(w => w.created_by === S.myId && w.kind === 'session' && w.performed_on === today());
  inner.innerHTML = '<div class="sheet-head"><div><small class="muted">' + esc(fmtDay(today(), { weekday: 'long', month: 'long', day: 'numeric' })) + '</small><h2 id="sheetTitle">' + esc(r.title) + '</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<div class="recap-grid"><div><b>' + C.compact(r.lb) + '</b><small>lb moved</small></div><div><b>' + r.sets + '</b><small>set' + (r.sets === 1 ? '' : 's') + '</small></div>' +
        '<div><b>' + r.exIds.length + '</b><small>lift' + (r.exIds.length === 1 ? '' : 's') + '</small></div><div><b>' + (r.minutes || '–') + '</b><small>minutes</small></div></div>' +
      (diff != null ? '<p class="hint-line">' + (diff >= 0 ? '▲ ' + diff + '% more' : '▼ ' + Math.abs(diff) + '% less') + ' than your last session (' + esc(fmtDay(r.prev.performed_on, { month: 'short', day: 'numeric' })) + ').</p>' : '') +
      (r.prs.length ? '<div class="recap-prs">' + r.prs.map(p => '<div class="pr-flag" style="animation:none">' + T.icons.pr + ' ' + esc(exName(p.exercise_id)) + ' ' + esc(L.fmtLoad(Number(p.heaviest)) + ' ' + p.unit + ' × ' + p.reps) + '</div>').join('') + '</div>' : '') +
      '<div class="chips" style="margin-top:14px">' + r.exIds.map(id => '<span class="chip">' + esc(exName(id)) + '</span>').join('') + '</div>' +
      widgetRecaps() +
      '<button class="btn primary block big" id="recapFinish" style="margin-top:18px">' + esc(shareOn() ? (posted ? T.updateFeed : T.finishFeed) : T.finishPrivate) + '</button>' +
      (shareOn() ? '' : '<p class="hint-line">Your wins are private, so this stays with you.</p>') +
      '<button class="btn block" id="recapShare" style="margin-top:10px">Share a picture</button>' +
    '</div>';
  openSheet();
}
async function recapClick(b) {
  if (b.id === 'recapShare') {
    const r = sessionSummary();
    if (!r) return;
    const t = today(), extras = (S.wins || []).filter(x => x.created_by === S.myId && x.performed_on === t && x.kind !== 'session' && x.kind !== 'cardio');
    return shareWorkout({ title: r.title, performed_on: t, created_by: S.myId, summary: sessionPost(r) }, extras, b);
  }
  if (b.id !== 'recapFinish') return;
  const r = sessionSummary();
  b.disabled = true;
  if (r && shareOn()) await postWin('session', r.title, sessionPost(r));
  stopRest(); sheet.close(); render();
  try { localStorage.setItem('lift.finished', today() + '|' + (r ? r.sets : 0)); } catch (e) {}
  toast(shareOn() ? T.endedFeed : T.ended);
}

// ===========================================================================
// Weekly recap: the first visit of a new week opens with last week in one card.
// ===========================================================================
function weeklyCard() {
  const thisWeek = weekOf(today()), lastWeek = L.addDays(thisWeek, -7);
  let seen = null; try { seen = localStorage.getItem('lift.weekSeen'); } catch (e) {}
  if (seen === lastWeek) return '';
  const [w0, w1] = weekly(3);
  if (!w1.visits && !w0.visits) return '';
  const prs = S.bestRows.filter(r => r.first_lifted_on >= lastWeek && r.first_lifted_on < thisWeek).length;
  const diff = w0.lb ? Math.round((w1.lb - w0.lb) / w0.lb * 100) : null;
  const live = (S.seasons || []).filter(x => inSeason(x) && !isCore(x) && phaseOf(x) === 'live');
  const sabbath = streakWeeks() >= 6 && w1.visits >= 3;
  return '<section class="card weekly"><div class="card-head"><div><div class="date">' + esc(T.weekly) + ' · ' + esc(fmtDay(lastWeek, { month: 'short', day: 'numeric' }) + ' – ' + fmtDay(L.addDays(lastWeek, 6), { month: 'short', day: 'numeric' })) + '</div>' +
      '<h3 class="card-title">' + (w1.visits ? w1.visits + ' gym day' + (w1.visits === 1 ? '' : 's') + ', ' + C.compact(w1.lb) + ' lb' : esc(T.restWeek)) + '</h3></div>' +
      '<button class="iconbtn sm" data-week-seen="' + lastWeek + '" aria-label="Hide last week’s recap">✕</button></div>' +
    '<div class="sb-stats"><div><b>' + w1.sets + '</b><small>sets</small></div><div><b>' + prs + '</b><small>' + esc(T.prs) + '</small></div><div><b>' + (streakWeeks() || 0) + '</b><small>' + esc(T.streak) + '</small></div></div>' +
    (diff != null && w1.visits ? '<p class="hint-line">' + (diff >= 0 ? '▲ ' + diff + '% more' : '▼ ' + Math.abs(diff) + '% less') + ' pounds than the week before.</p>' : '') +
    (w1.visits ? (() => { const miss = weekCoverage(lastWeek).groups.filter(g => g.verdict === 'missing').map(g => g.name);
      return '<p class="hint-line">' + (miss.length ? 'Missed: ' + esc(miss.join(', ')) + '.' : 'Every muscle got some work.') + '</p>'; })() : '') +
    (sabbath ? '<p class="hint-line">' + T.icons.rest + ' ' + esc(T.rest(streakWeeks())) + '</p>' : '') +
    (live.length ? '<p class="hint-line">' + live.map(x => { const g = goalsDone(x); return '<button class="linkbtn" data-season="' + esc(x.id) + '">' + esc(x.name) + '</button>: ' + g.done + ' of ' + g.of + ' goals done, ' + esc(seasonStatus(x)); }).join(' · ') + '</p>' : '') +
  '</section>';
}

// ===========================================================================
// The Communion of Saints: crew records, one holder per lift, by estimated 1-rep max.
// ===========================================================================
async function loadRecords() {
  if (S.recordsLoading || (S.records && Date.now() - (S.recordsAt || 0) < 600000)) return;
  S.recordsLoading = true;
  try { S.records = await store.crewRecords(); S.recordsAt = Date.now(); } catch (x) { S.records = S.records || []; }
  S.recordsLoading = false;
  if (currentTab === 'progress') drawRecords();
}
const e1lb = (w, r, u) => Number(w) * (1 + r / 30) * (u === 'kg' ? L.LB_PER_KG : 1);
function myBestE1(exId) {
  let best = null;
  for (const r of S.bestRows) if (r.exercise_id === exId && r.reps <= 12) { const e = e1lb(r.heaviest, r.reps, r.unit); if (!best || e > best.e) best = { e, w: Number(r.heaviest), reps: r.reps, unit: r.unit }; }
  return best;
}
function drawRecords() {
  const box = $('recordsBox'); if (!box) return;
  const head = '<div class="card-head"><div><h3 class="card-title">' + esc(T.records) + '</h3><small class="muted">crew records, by estimated 1-rep max</small></div></div>';
  if (!S.records) { box.innerHTML = head + '<p class="muted">Loading…</p>'; loadRecords(); return; }
  const multi = S.records.some(r => Number(r.lifters) >= 2);
  const top = S.records.filter(r => !multi || Number(r.lifters) >= 2).sort((a, b) => Number(b.e1rm_lb) - Number(a.e1rm_lb)).slice(0, 15);
  const rows = progAll('records') ? top : top.slice(0, PROG_SHOW.records);
  const mine = top.filter(r => r.user_id === S.myId).length;
  box.innerHTML = head + (rows.length ? '<p class="hint-line" style="margin-top:2px">You hold ' + mine + ' of these ' + top.length + '. ' + esc(T.recordsBlurb) + '</p>' +
    '<div class="cmp-wrap"><table class="cmp saints"><thead><tr><th>Lift</th><th>' + esc(T.holderCol) + '</th><th>Best</th><th>You</th></tr></thead><tbody>' +
    rows.map(r => { const m = myBestE1(r.exercise_id), me = r.user_id === S.myId;
      return '<tr' + (me ? ' class="me"' : '') + '><td>' + esc(exName(r.exercise_id)) + '</td><td>' + T.icons.holder + ' ' + (me ? 'You' : esc(r.display_name)) + '</td>' +
        '<td class="num"><b>' + esc(L.fmtLoad(Number(r.weight))) + '</b> <small>' + r.unit + ' × ' + r.reps + '</small></td>' +
        '<td class="num">' + (me ? '<span class="muted">✓</span>' : m ? '<span title="Your best: ' + esc(L.fmtLoad(m.w) + ' × ' + m.reps) + '">' + Math.round(m.e / Number(r.e1rm_lb) * 100) + '%</span>' : '<span class="muted">–</span>') + '</td></tr>'; }).join('') +
    '</tbody></table></div>' + (rows.length < top.length ? moreBtn('records', top.length) : '') : '<p class="muted">Records show up once the crew has logged some sets.</p>');
}
// After a set: did it take a record from someone else?
function checkRecord(x) {
  if (!S.records || x.is_warmup === true || !(Number(x.weight) > 0) || x.reps == null || x.reps > 12) return;
  const e = e1lb(x.weight, x.reps, x.unit), rec = S.records.find(r => r.exercise_id === x.exercise_id);
  if (!rec || e <= Number(rec.e1rm_lb)) return;
  const from = rec.user_id !== S.myId ? rec.display_name : null;
  Object.assign(rec, { user_id: S.myId, display_name: 'You', weight: x.weight, reps: x.reps, unit: x.unit, e1rm_lb: Math.round(e * 10) / 10, performed_on: x.performed_on });
  if (from && Number(rec.lifters) >= 2) {
    postWin('record', exName(x.exercise_id) + ' record', { weight: Number(x.weight), reps: x.reps, unit: x.unit, from });
    setTimeout(() => toast(T.recordToast + exName(x.exercise_id) + ' is yours (it was ' + from + '’s)'), 1200);
  }
}

// ===========================================================================
// Dry spells and Sabbath weeks: when a lift has stalled for three sessions, say so in the logger.
// ===========================================================================
function stallOf(exId) {
  const byDay = new Map();
  for (const x of S.recent) if (x.exercise_id === exId && x.is_warmup !== true && x.reps <= 12 && Number(x.weight) > 0) {
    const e = e1lb(x.weight, x.reps, x.unit); byDay.set(x.performed_on, Math.max(byDay.get(x.performed_on) || 0, e));
  }
  const days = [...byDay.keys()].sort();
  if (days.length < 5) return null;
  const last3 = days.slice(-3).map(dd => byDay.get(dd)), before = Math.max(...days.slice(0, -3).map(dd => byDay.get(dd)));
  return Math.max(...last3) <= before ? { sessions: 3 } : null;
}
const dryHint = exId => (stallOf(exId) ? '<p class="dry">' + T.icons.dry + ' ' + esc(T.dry) + '</p>' : '');

// ===========================================================================
// In session: a clock from your first set today, until you finish.
// ===========================================================================
function sessionClock() {
  const sets = todaySets(); if (!sets.length) return '';
  const first = Math.min(...sets.map(x => Date.parse(x.logged_at)).filter(Number.isFinite)), last = Math.max(...sets.map(x => Date.parse(x.logged_at)).filter(Number.isFinite));
  if (!Number.isFinite(first)) return '';
  const finished = !unfinished(), live = !finished && Date.now() - last < 3 * 3600e3;
  const mins = Math.max(1, Math.round(((live ? Date.now() : last) - first) / 60000));
  return '<p class="sess-clock" id="sessClock" data-first="' + first + '" data-live="' + live + '">' + (live ? '⏱ In session · ' : finished ? T.endedClock : '⏱ ') + mins + ' min</p>';
}
let clockTimer = null;
function tickClock() {
  clearInterval(clockTimer);
  const el = $('sessClock'); if (!el || el.dataset.live !== 'true') return;
  clockTimer = setInterval(() => {
    const c = $('sessClock'); if (!c || c.dataset.live !== 'true') return clearInterval(clockTimer);
    c.textContent = '⏱ In session · ' + Math.max(1, Math.round((Date.now() - Number(c.dataset.first)) / 60000)) + ' min';
  }, 30000);
}

// ===========================================================================
// Pilgrimages: three small quests a week, the same for the whole crew (picked from the week's date).
// ===========================================================================
function weekSets() { const w = weekOf(today()); return S.recent.filter(x => x.performed_on >= w && x.is_warmup !== true); }
const QUESTS = [
  { id: 'days3', name: 'Show up three times', need: () => 3, have: ws => new Set(ws.map(x => x.performed_on)).size },
  { id: 'newlift', name: 'Try a lift you haven’t done in a month', need: () => 1, have: ws => { const w = weekOf(today()), old = new Set(S.recent.filter(x => x.performed_on < w && x.performed_on >= L.addDays(w, -30)).map(x => x.exercise_id)); return new Set(ws.map(x => x.exercise_id).filter(id => !old.has(id))).size ? 1 : 0; } },
  { id: 'pr', name: 'Set a PR', need: () => 1, have: () => S.bestRows.filter(r => r.first_lifted_on >= weekOf(today())).length ? 1 : 0 },
  { id: 'reps100', name: '100 reps of one lift', need: () => 100, have: ws => { const m = new Map(); for (const x of ws) m.set(x.exercise_id, (m.get(x.exercise_id) || 0) + (x.reps || 0)); return Math.max(0, ...m.values()); } },
  { id: 'volume', name: 'Move a mountain', need: () => Math.max(10000, niceRound(weekly(9).slice(0, 8).reduce((a, w) => a + w.lb, 0) / 8 * 1.1)), have: ws => Math.round(L.lbEquivalent(L.volumeByUnit(ws))), fmt: v => C.compact(v) + ' lb' },
  { id: 'plan', name: 'Finish a planned workout', need: () => 1, have: () => { const w = weekOf(today()), days = [...new Set(S.recent.filter(x => x.performed_on >= w).map(x => x.performed_on))];
      const plans = [...new Set((S.plan || []).map(p => p.template_id))].map(id => ({ template_id: id })); return plans.length && days.some(dd => matchRoutine(plans, dd) >= 0) ? 1 : 0; } },
  { id: 'days5', name: 'Five gym days', need: () => 5, have: ws => new Set(ws.map(x => x.performed_on)).size },
];
function weekQuests() {
  const seed = [...weekOf(today())].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pool = QUESTS.slice(), out = [];
  let r = seed;
  while (out.length < 3 && pool.length) { r = (r * 1103515245 + 12345) >>> 0; const q = pool.splice(r % pool.length, 1)[0]; if (!(q.id === 'days5' && out.some(o => o.id === 'days3')) && !(q.id === 'days3' && out.some(o => o.id === 'days5'))) out.push(q); }
  const ws = weekSets();
  return out.map(q => { const need = q.need(), have = Math.min(need, q.have(ws)); return { ...q, needV: need, haveV: have, done: have >= need }; });
}
function questsCard() {
  const qs = weekQuests(), done = qs.filter(q => q.done).length;
  return '<section class="card quests"><div class="card-head"><div><h3 class="card-title">' + esc(T.quests) + '</h3><small class="muted">' + esc(T.questsSub) + '</small></div><small class="muted">' + done + ' / ' + qs.length + '</small></div>' +
    qs.map(q => '<div class="goal"><div class="row"><span>' + (q.done ? T.icons.goal + ' ' : T.icons.questOpen + ' ') + esc(q.name) + (q.id === 'volume' ? ' (' + C.compact(q.needV) + ' lb)' : '') + '</span><span class="muted num">' +
      esc(q.fmt ? q.fmt(q.haveV) : L.fmtNum(q.haveV, 0) + ' / ' + L.fmtNum(q.needV, 0)) + '</span></div><div class="bar" style="--p:' + (q.haveV / q.needV * 100).toFixed(1) + '%"><i></i></div></div>').join('') +
  '</section>';
}
function checkQuestWins() {
  const now = new Set(weekQuests().filter(q => q.done).map(q => q.id));
  if (!S.questsDone) { S.questsDone = now; return; }
  for (const id of now) if (!S.questsDone.has(id)) {
    const q = QUESTS.find(x => x.id === id);
    postWin('quest', q.name + ' · week of ' + fmtDay(weekOf(today()), { month: 'short', day: 'numeric' }), {});
    setTimeout(() => toast(T.questDone + q.name), 1600);
  }
  S.questsDone = now;
}

// ===========================================================================
// Indulgences: optional season scoring in points.
// ===========================================================================
const pointsRule = pt => [pt.day ? pt.day + ' per gym day' : '', pt.pr ? pt.pr + ' per PR' : '', pt.workout ? pt.workout + ' per planned workout done' : ''].filter(Boolean).join(', ');
function seasonPoints(sn, st, p) {
  const pt = sn.points; if (!pt) return 0;
  const days = Number(p.m ? p.m.visits : p.visits) || 0;
  const prs = Number(((st.prs || []).find(x => x.user_id === p.user_id) || {}).prs || 0);
  const workouts = (st.w || []).filter(x => x.user_id === p.user_id).reduce((a, x) => a + Number(x.times || 0), 0);
  return days * (Number(pt.day) || 0) + prs * (Number(pt.pr) || 0) + workouts * (Number(pt.workout) || 0);
}
function pointsHtml(pt) {
  return '<div class="points-box" id="ptBox"><button type="button" class="toggle" id="ptToggle" aria-pressed="' + !!pt + '">' + (pt ? '✓ Scored in ' : 'Score it in ') + esc(T.points) + (T.points === 'points' ? '' : ' (points)') + '</button>' +
    (pt ? '<div class="pt-grid">' + [['day', 'per gym day'], ['pr', 'per PR'], ['workout', 'per planned workout']].map(([k, l]) =>
      '<label><input class="plain-input" data-pt="' + k + '" inputmode="numeric" value="' + esc(pt[k] ?? 0) + '"><small>' + l + '</small></label>').join('') + '</div>' : '') + '</div>';
}
function readPoints() {
  const t = $('ptToggle'); if (!t || t.getAttribute('aria-pressed') !== 'true') return null;
  const out = {};
  inner.querySelectorAll('[data-pt]').forEach(i => { out[i.dataset.pt] = Math.max(0, Math.min(100, parseInt(i.value, 10) || 0)); });
  return out;
}
