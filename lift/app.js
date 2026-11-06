// Sisyfitness on the web: the interface. Storage lives in data.js, the maths in logic.js.
import * as L from './logic.js';
import { connect } from './data.js';

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
const fmtDay = (iso, opts) => L.parseDate(iso).toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
const unitTag = u => (u === prefs.unit ? '' : ' ' + u);
function setText(s) {
  const load = s.count_bodyweight ? (s.weight > 0 ? 'BW+' + L.fmtLoad(s.weight) : 'BW') : L.fmtLoad(s.weight);
  return load + unitTag(s.unit) + ' × ' + s.reps;
}
function volText(v) {
  const parts = [];
  if (v.lb || !v.kg) parts.push(L.fmtBig(v.lb) + (v.kg ? ' lb' : ''));
  if (v.kg) parts.push(L.fmtBig(v.kg) + ' kg');
  return parts.join(' + ');
}
const todaySets = () => S.recent.filter(s => s.performed_on === today()).sort((a, b) => a.logged_at.localeCompare(b.logged_at));
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

const BOULDER = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 35 L37 13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="15" r="8.5" fill="var(--accent)"/></svg>';
function hillSVG(ratio, label) {
  const t = Math.max(0.03, Math.min(0.97, ratio));
  const x = 20 + 280 * t, y = 112 - 84 * t;
  return '<svg class="hill" viewBox="0 0 320 130" role="img" aria-label="' + esc(label) + '">' +
    '<path d="M0 130 L20 112 L300 28 L320 22 L320 130 Z" fill="var(--chip)"/>' +
    '<path d="M20 112 L300 28" stroke="var(--line)" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M20 112 L' + x + ' ' + y + '" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/>' +
    '<g transform="translate(300 28)"><path d="M0 0 V-26" stroke="var(--ink)" stroke-width="2"/><path d="M0 -26 L16 -21 L0 -16 Z" fill="var(--gold)"/></g>' +
    '<circle cx="' + (x - 4) + '" cy="' + (y - 15) + '" r="14" fill="var(--accent)"/>' +
    '<circle cx="' + (x - 9) + '" cy="' + (y - 20) + '" r="3" fill="#fff" opacity=".35"/></svg>';
}

// ===========================================================================
// Sign-in gate
// ===========================================================================
function gate(html) {
  $('app').hidden = true; $('tabs').hidden = true; $('fab').hidden = true;
  const g = $('gate');
  g.hidden = false;
  g.innerHTML = '<div class="brand">' + BOULDER + 'Sisyfitness</div><p class="muted">Push the boulder. Log the set.</p>' + html;
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
function showSignIn() {
  const g = gate(
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

async function afterSignIn() {
  gate('<p class="muted" style="margin-top:30px">Loading your log…</p>');
  const aal = await store.aal();
  if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    const f = (await store.totpFactors())[0];
    if (f) return showCode(f);
  }
  me = await store.me();
  if (!me) return showNotMember();
  if (me.mfa_required && !me.mfa_ok) return showEnroll();
  await loadAll();
  showApp();
}

async function loadAll() {
  const [cat, recent, days, bests, routines, seasons, names, myId] = await Promise.all([
    store.catalog(), store.setsSince(L.addDays(today(), -RECENT_DAYS)), store.days(), store.bests(),
    store.routines(), store.seasons(), store.memberNames(), store.userId(),
  ]);
  setRoutines(routines);
  S.seasons = seasons.seasons;
  S.goals = seasons.goals;
  S.names = new Map(names.map(n => [n.user_id, n.display_name]));
  S.myId = myId;
  S.exercises = cat.exercises;
  S.byId = new Map(cat.exercises.map(e => [e.id, e]));
  S.aliases = new Map();
  for (const a of cat.aliases) {
    if (!S.aliases.has(a.exercise_id)) S.aliases.set(a.exercise_id, []);
    S.aliases.get(a.exercise_id).push(a.alias);
  }
  S.recent = recent;
  S.days = days;
  S.bestRows = bests;
  S.bests = L.bestsMap(bests);
}
async function refreshBests() {
  try { S.bestRows = await store.bests(); S.bests = L.bestsMap(S.bestRows); } catch (e) {}
}

function showApp() {
  $('gate').hidden = true;
  $('app').hidden = false; $('tabs').hidden = false; $('fab').hidden = false;
  $('demoFlag').hidden = !store.demo;
  route();
}

// ===========================================================================
// Routing
// ===========================================================================
let currentTab = null;
function route() {
  const tab = ['log', 'routines', 'history', 'progress'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'log';
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + tab ? 'page' : 'false'));
  if (tab !== currentTab) window.scrollTo(0, 0);
  currentTab = tab;
  render();
}
function render() {
  syncTabDot();
  if (currentTab === 'history') renderHistory();
  else if (currentTab === 'progress') renderProgress();
  else if (currentTab === 'routines') renderRoutines();
  else renderLog();
}
window.addEventListener('hashchange', route);

// ===========================================================================
// Log (today)
// ===========================================================================
function renderLog() {
  const sets = todaySets();
  const vol = L.volumeByUnit(sets);
  const weekVisits = S.days.filter(d => d.performed_on > L.addDays(today(), -7) && d.sets > 0).length;
  const groups = groupByExercise(sets);
  const hello = sets.length ? (sets.length >= 15 ? 'Big day.' : 'Rolling.') : 'Today';
  view.innerHTML =
    '<section class="card hero"><div class="date">' + esc(fmtDay(today(), { weekday: 'long', month: 'long', day: 'numeric' })) + '</div>' +
    '<h1>' + hello + '</h1><div class="stats">' +
      '<div class="stat"><b>' + esc(volText(vol)) + '</b><small>moved today</small></div>' +
      '<div class="stat"><b>' + sets.length + '</b><small>set' + (sets.length === 1 ? '' : 's') + '</small></div>' +
      '<div class="stat"><b>' + weekVisits + '</b><small>visit' + (weekVisits === 1 ? '' : 's') + ' this week</small></div>' +
    '</div></section>' +
    followCard() +
    (groups.length ? groups.map(exCard).join('') : (following() ? '' : emptyToday())) +
    (groups.length && !following() ? '<button class="btn block" style="margin-top:14px" data-save-day="' + today() + '">Save today as a routine</button>' : '');
}
// Turn a day's lifting into a routine: one step per exercise, in the order you did them,
// with the number of working sets and your heaviest set's reps and weight.
async function saveDayAsRoutine(day, btn) {
  const sets = (day === today() ? todaySets() : S.dayCache.get(day) || []).filter(s => s.is_warmup !== true);
  const groups = groupByExercise(sets);
  if (!groups.length) return toast('Nothing to save from that day.');
  btn.disabled = true;
  try {
    const t = await store.addRoutine({ name: fmtDay(day, { weekday: 'long', month: 'short', day: 'numeric' }) + ' workout' });
    S.templates.push(t);
    let position = 0;
    for (const g of groups.slice(0, 100)) {
      const top = g.sets.reduce((a, s) => (Number(s.weight) > Number(a.weight) ? s : a));
      const it = await store.addItem({ template_id: t.id, exercise_id: g.exercise_id, position: ++position,
        sets: Math.min(20, g.sets.length), reps: Math.min(100, top.reps), load_mode: 'fixed', load_value: Math.min(2000, Number(top.weight)), unit: top.unit });
      S.items.push(it); S.itemsById.set(it.id, it);
    }
    toast('Saved. Give it a name and tweak away.');
    openDesigner(t.id, true);
  } catch (x) { fail(x); btn.disabled = false; }
}
function exCard(g) {
  const v = L.volumeByUnit(g.sets);
  return '<section class="card ex-card"><div class="row"><h3>' + esc(exName(g.exercise_id)) + '</h3><span class="muted num">' + esc(volText(v)) + '</span></div>' +
    '<div class="chips">' + g.sets.map(s => '<button class="chip' + (s._pr ? ' pr' : '') + (s.is_warmup ? ' warm' : '') + '" data-edit="' + esc(s.id) + '" aria-label="Edit ' + esc(setText(s)) + '">' + (s._pr ? '🏆 ' : '') + esc(setText(s)) + '</button>').join('') + '</div>' +
    '<div class="actions"><button class="btn primary" data-again="' + esc(g.exercise_id) + '">+ Same again</button><button class="btn" data-more="' + esc(g.exercise_id) + '">Change it up</button></div></section>';
}
function emptyToday() {
  const recents = recentExerciseIds().slice(0, 6);
  return '<section class="card empty"><svg viewBox="0 0 320 130" aria-hidden="true">' + hillSVG(0.08, '').replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</svg>' +
    '<h2>Roll the boulder.</h2><p class="muted">Log a set and today starts counting.</p>' +
    (recents.length ? '<div class="section-title" style="margin-top:14px">Pick up where you left off</div><div class="chips" style="justify-content:center">' +
      recents.map(id => '<button class="chip" data-more="' + esc(id) + '">' + esc(exName(id)) + '</button>').join('') + '</div>' : '') +
    '</section>';
}
view.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.edit) openEditor(findSet(b.dataset.edit));
  else if (b.dataset.more) openLogger(b.dataset.more);
  else if (b.dataset.again) sameAgain(b.dataset.again, b);
  else if (b.dataset.day) toggleDay(b.dataset.day);
  else if (b.dataset.period) { S.period = b.dataset.period; renderProgress(); }
  else if (b.id === 'moreDays') { S.historyLimit += 40; renderHistory(); }
  // routines
  else if (b.dataset.followItem) { const it = S.itemsById.get(b.dataset.followItem); if (it) openEntry(it.exercise_id, null, it); }
  else if (b.dataset.start) startFollowing(b.dataset.start);
  else if (b.dataset.saveDay) saveDayAsRoutine(b.dataset.saveDay, b);
  else if (b.dataset.seen) { const t = S.templates.find(x => x.id === b.dataset.seen); if (t) { markSeen(t); render(); } }
  else if (b.hasAttribute('data-stop-follow')) stopFollowing();
  else if (b.dataset.design) openDesigner(b.dataset.design);
  else if (b.hasAttribute('data-new-routine')) newRoutine(b);
  else if (b.dataset.sub) subscribeTo(b.dataset.sub, b);
  else if (b.dataset.unsub) unsubscribeFrom(b.dataset.unsub, b);
  else if (b.dataset.copy) copyRoutine(b.dataset.copy, b);
  // seasons
  else if (b.dataset.season) { S.period = 'season:' + b.dataset.season; renderProgress(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (b.dataset.editSeason) openSeasonSheet(b.dataset.editSeason);
  else if (b.hasAttribute('data-new-season')) openSeasonSheet(null);
});
$('fab').addEventListener('click', () => openLogger());
const findSet = id => S.recent.find(s => s.id === id) || [...S.dayCache.values()].flat().find(s => s.id === id);

async function sameAgain(exId, btn) {
  const last = todaySets().filter(s => s.exercise_id === exId).pop();
  if (!last) return openLogger(exId);
  btn.disabled = true;
  try {
    const { saved } = await logSet({
      exercise_id: exId, weight: last.weight, reps: last.reps, unit: last.unit, count_bodyweight: last.count_bodyweight,
      bodyweight: last.bodyweight, is_warmup: last.is_warmup,
    });
    afterLogToast(saved);
    render();
  } catch (x) { fail(x); btn.disabled = false; }
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
  const pool = S.dayCache.get(s.performed_on) || S.recent.filter(x => x.performed_on === s.performed_on);
  d.exercises = new Set(pool.filter(x => !x.deleted_at && x.is_warmup !== true).map(x => x.exercise_id)).size;
  if (d.sets <= 0) S.days = S.days.filter(x => x !== d);
}
function syncCaches(saved, gone) {
  S.recent = S.recent.filter(s => s.id !== saved.id);
  if (!gone && saved.performed_on >= L.addDays(today(), -RECENT_DAYS)) { S.recent.push(saved); S.recent.sort((a, b) => (b.performed_on + b.logged_at).localeCompare(a.performed_on + a.logged_at)); }
  for (const [day, list] of S.dayCache) {
    const rest = list.filter(s => s.id !== saved.id);
    if (!gone && saved.performed_on === day) rest.push(saved);
    S.dayCache.set(day, rest.sort((a, b) => a.logged_at.localeCompare(b.logged_at)));
  }
}
async function logSet(fields) {
  const row = { performed_on: today(), logged_at: new Date().toISOString(), notes: null, is_warmup: false, ...fields };
  const beatsBest = L.isPr(row, S.bests);
  const before = lbEqAll();
  const saved = await store.addSet(row);
  saved._pr = beatsBest;
  syncCaches(saved, false);
  bumpDay(saved, +1);
  const k = L.bestKey(saved);
  if (saved.is_warmup !== true && !(S.bests.get(k) >= Number(saved.weight))) S.bests.set(k, Number(saved.weight));
  const after = lbEqAll();
  const crossed = L.MILESTONES.filter(m => before < m.lb && after >= m.lb).pop();
  saved._crossed = crossed;
  vibrate(beatsBest || crossed ? [20, 40, 20] : 12);
  prefs.unit = saved.unit;
  if (saved.count_bodyweight) prefs.bodyweight = Number(saved.bodyweight);
  savePrefs();
  return { saved };
}
function afterLogToast(saved) {
  const undo = { label: 'Undo', run: () => removeSet(saved, true) };
  if (saved._crossed) toast('🎉 Welcome to the ' + saved._crossed.title + '!', undo);
  else if (saved._pr) toast('🏆 New PR: ' + setText(saved) + ' on ' + exName(saved.exercise_id), undo);
  else toast('Logged ' + setText(saved), undo);
}
async function removeSet(s, quiet) {
  try {
    const gone = await store.deleteSet(s.id);
    syncCaches(gone, true);
    bumpDay(s, -1);
    refreshBests();
    render(); refreshLoggerList();
    toast(quiet ? 'Undone' : 'Set deleted', quiet ? null : { label: 'Undo', run: () => restoreSet(s) });
  } catch (x) { fail(x); }
}
async function restoreSet(s) {
  try {
    const back = await store.restoreSet(s.id);
    syncCaches(back, false);
    bumpDay(back, +1);
    refreshBests();
    render(); refreshLoggerList();
    toast('Restored');
  } catch (x) { fail(x); }
}

// ===========================================================================
// The logger sheet
// ===========================================================================
const sheet = $('sheet'), inner = $('sheetInner');
const LG = { mode: 'pick', exId: null, editing: null };
function openSheet() { if (!sheet.open) sheet.showModal(); }
function closeSheet() { flushSaves(); if (sheet.open) sheet.close(); render(); }
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
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">' + esc(title) + '</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><input class="search" id="exSearch" type="search" placeholder="Search ' + S.exercises.filter(e => !e.deleted_at).length + ' exercises" autocomplete="off" enterkeyhint="go" aria-label="Search exercises">' +
    (multi ? '<p class="hint-line">Tap to tick as many as you like, in the order you’ll do them.</p>' : '') +
    '<div class="section-title" id="resTitle"></div><ul class="results" id="exResults"></ul>' +
    (multi ? '<div class="pick-foot"><button class="btn primary block" data-add-selected disabled>Tick exercises to add</button></div>' : '') + '</div>';
  openSheet();
  const input = $('exSearch');
  input.addEventListener('input', () => drawResults(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const first = $('exResults').querySelector('button'); if (first) { e.preventDefault(); first.click(); } }
  });
  drawResults('');
  setTimeout(() => input.focus(), 60);
}
function lastSummary(exId) {
  const s = S.recent.find(x => x.exercise_id === exId);
  return s ? setText(s) + ' · ' + fmtDay(s.performed_on, { month: 'short', day: 'numeric' }) : '';
}
function drawResults(q) {
  const recents = recentExerciseIds();
  const list = L.searchExercises(q, S.exercises, S.aliases, recents);
  $('resTitle').textContent = q.trim() ? (list.length ? 'Matches' : 'No matches') : (list.length ? 'Recent' : 'Start typing to find an exercise');
  const picked = id => LG.multi && LG.multi.includes(id);
  // While ticking, keep what's already ticked at the top so it's easy to see and untick.
  const shown = LG.multi && !q.trim() ? LG.multi.map(id => S.byId.get(id)).filter(Boolean).concat(list.filter(e => !picked(e.id))) : list;
  let html = shown.map(e => '<li><button data-pick="' + esc(e.id) + '"' + (LG.multi ? ' class="' + (picked(e.id) ? 'sel' : '') + '" aria-pressed="' + picked(e.id) + '"' : '') + '><span>' +
    (LG.multi ? '<i class="tickbox" aria-hidden="true">' + (picked(e.id) ? LG.multi.indexOf(e.id) + 1 : '') + '</i>' : '') + esc(e.name) + '</span><small>' + esc(lastSummary(e.id)) + '</small></button></li>').join('');
  const typed = q.trim();
  const exact = e => [e.name, ...(S.aliases.get(e.id) || [])].some(n => L.norm(n) === L.norm(typed));
  if (typed && me && me.is_admin && !S.exercises.some(e => !e.deleted_at && exact(e))) {
    const near = L.suggestMatch(typed, S.exercises.filter(e => !e.deleted_at).map(e => e.name));
    html += '<li><button data-add="' + esc(typed) + '"><span>+ Add “' + esc(typed) + '” to the catalogue</span><small>admin</small></button>' +
      (near ? '<p class="warn" style="margin:-2px 4px 10px">Did you mean <b>' + esc(near) + '</b>? It’s already there.</p>' : '') + '</li>';
  }
  $('exResults').innerHTML = html;
  syncPickFoot();
}
function syncPickFoot() {
  const b = inner.querySelector('[data-add-selected]');
  if (!b) return;
  const n = LG.multi.length;
  b.disabled = !n;
  b.textContent = n ? 'Add ' + n + ' exercise' + (n === 1 ? '' : 's') : 'Tick exercises to add';
}

async function openEntry(exId, editing, item) {
  LG.mode = editing ? 'edit' : 'entry';
  LG.exId = exId;
  LG.editing = editing || null;
  LG.item = editing ? null : item || null;
  const base = editing || todaySets().filter(s => s.exercise_id === exId).pop();
  const unit = base ? base.unit : prefs.unit;
  const st = LG.st = {
    weight: base ? Number(base.weight) : (L.BAR[unit] && /press|squat|deadlift|row|bench|barbell|rdl|thrust/i.test(exName(exId)) ? L.BAR[unit] : 0),
    reps: base ? base.reps : 8, unit,
    bw: base ? !!base.count_bodyweight : !!(S.byId.get(exId) || {}).supports_bodyweight,
    bodyweight: base && base.bodyweight != null ? Number(base.bodyweight) : prefs.bodyweight,
    warm: base ? base.is_warmup === true : false,
    note: editing ? editing.notes || '' : '', date: editing ? editing.performed_on : today(),
    showNote: !!(editing && editing.notes),
  };
  // Following a routine: the step's target wins over last time.
  const target = LG.item ? L.itemTarget(LG.item, S.bestRows) : null;
  if (target) {
    st.reps = target.reps; st.unit = target.unit;
    if (target.weight != null && (target.weight > 0 || LG.item.load_mode === 'fixed')) st.weight = target.weight;
  }
  const planLine = LG.item
    ? '<div class="pr-flag" style="background:var(--accent-soft);color:var(--ink);animation:none">📋 Plan: <b>' + esc(L.targetText(LG.item, S.bestRows)) + '</b>' +
      (target.pct && !target.basis ? '<span class="muted" style="font-weight:500"> (log a set first to work out the %)</span>' : '') + '</div>'
    : '';
  inner.innerHTML =
    '<div class="sheet-head"><div>' + (editing ? '' : '<button class="btn ghost" style="padding:2px 0;border:0;color:var(--muted);font-size:14px" data-change>← Change exercise</button>') +
      '<h2 id="sheetTitle">' + esc(exName(exId)) + '</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      planLine +
      '<div class="hint-line" id="lastLine">' + (editing ? 'Editing a set from ' + esc(fmtDay(editing.performed_on)) : 'Looking up last time…') + '</div>' +
      '<div class="field-label"><span>Weight' + '</span><span class="seg" role="group" aria-label="Unit">' +
        ['lb', 'kg'].map(u => '<button type="button" data-unit="' + u + '" aria-pressed="' + (u === st.unit) + '">' + u + '</button>').join('') + '</span></div>' +
      '<div class="stepper"><button type="button" data-w="-1" aria-label="Less weight">−</button>' +
        '<input id="wIn" inputmode="decimal" aria-label="Weight" value="' + esc(L.fmtLoad(st.weight)) + '"><button type="button" data-w="1" aria-label="More weight">+</button></div>' +
      '<div class="nudges" id="nudges" role="group" aria-label="Fine-tune the weight"></div>' +
      '<div class="hint-line" id="plates"></div>' +
      '<div class="field-label"><span>Reps</span></div>' +
      '<div class="stepper"><button type="button" data-r="-1" aria-label="Fewer reps">−</button>' +
        '<input id="rIn" inputmode="numeric" aria-label="Reps" value="' + esc(st.reps) + '"><button type="button" data-r="1" aria-label="More reps">+</button></div>' +
      '<div class="toggles">' +
        '<button type="button" class="toggle" data-t="bw" aria-pressed="' + st.bw + '">Count bodyweight</button>' +
        '<button type="button" class="toggle" data-t="warm" aria-pressed="' + st.warm + '">Warm-up</button>' +
        '<button type="button" class="toggle" data-t="note" aria-pressed="' + st.showNote + '">Note</button></div>' +
      '<div id="bwRow"' + (st.bw ? '' : ' hidden') + '><div class="field-label"><span>Bodyweight</span><small>added to the load for volume</small></div>' +
        '<input class="plain-input" id="bwIn" inputmode="decimal" aria-label="Bodyweight" value="' + esc(st.bodyweight != null ? L.fmtLoad(st.bodyweight) : '') + '" placeholder="e.g. 180"></div>' +
      '<div id="noteRow"' + (st.showNote ? '' : ' hidden') + '><div class="field-label"><span>Note</span></div><input class="plain-input" id="noteIn" maxlength="300" value="' + esc(st.note) + '" placeholder="How did it feel?"></div>' +
      (editing ? '<div class="field-label"><span>Day</span></div><input class="plain-input" id="dateIn" type="date" value="' + esc(st.date) + '" max="' + today() + '">' : '') +
      '<div id="prFlag"></div><p class="warn" id="formErr" role="alert"></p>' +
      '<button class="btn primary block" id="saveBtn">' + (editing ? 'Save changes' : 'Log set') + '</button>' +
      (editing ? '<button class="btn block" style="margin-top:10px;color:var(--accent)" id="delBtn">Delete this set</button>' : '<div id="doneToday"></div>') +
    '</div>';
  openSheet();
  wireEntry();
  drawNudges();
  updateLive();
  refreshLoggerList();
  if (!editing) {
    // Prefill from last time, unless already lifting this today.
    const prev = await store.lastFor(exId, today()).catch(() => []);
    if (LG.exId !== exId || LG.mode !== 'entry') return;
    LG.last = prev;
    const working = prev.find(s => s.is_warmup !== true) || prev[0];
    if (working && !base && !LG.item) {
      Object.assign(st, { weight: Number(working.weight), reps: working.reps, unit: working.unit, bw: !!working.count_bodyweight,
        bodyweight: working.bodyweight != null ? Number(working.bodyweight) : st.bodyweight });
      syncInputs();
    }
    $('lastLine').innerHTML = prev.length
      ? 'Last time, ' + esc(fmtDay(prev[0].performed_on, { month: 'short', day: 'numeric' })) + ': <b>' + esc(prev.map(setText).join(', ')) + '</b>'
      : 'First time logging this one. Welcome.';
    updateLive();
  }
}
// Small jumps for fine-tuning: micro plates in lb, and half that in kg.
const NUDGES = { lb: [-10, -5, -2.5, 2.5, 5, 10], kg: [-5, -2.5, -1.25, 1.25, 2.5, 5] };
function drawNudges() {
  const box = $('nudges');
  if (box) box.innerHTML = NUDGES[st().unit].map(n => '<button type="button" data-nudge="' + n + '" aria-label="' + (n > 0 ? 'Add ' : 'Take off ') + Math.abs(n) + ' ' + st().unit + '">' + (n > 0 ? '+' : '−') + L.fmtLoad(Math.abs(n)) + '</button>').join('');
}
function syncInputs() {
  drawNudges();
  $('wIn').value = L.fmtLoad(st().weight);
  $('rIn').value = st().reps;
  inner.querySelectorAll('[data-unit]').forEach(b => b.setAttribute('aria-pressed', b.dataset.unit === st().unit));
  inner.querySelector('[data-t="bw"]').setAttribute('aria-pressed', st().bw);
  $('bwRow').hidden = !st().bw;
  if (st().bodyweight != null) $('bwIn').value = L.fmtLoad(st().bodyweight);
}
const st = () => LG.st;
function wireEntry() {
  $('wIn').addEventListener('input', () => { const v = L.parseLoad($('wIn').value); if (v != null) st().weight = v; updateLive(); });
  $('rIn').addEventListener('input', () => { const v = parseInt($('rIn').value, 10); if (v > 0) st().reps = v; updateLive(); });
  $('bwIn').addEventListener('input', () => { st().bodyweight = L.parseLoad($('bwIn').value); });
  [$('wIn'), $('rIn')].forEach(i => i.addEventListener('focus', () => i.select()));
  inner.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('saveBtn').click(); } }));
}
function updateLive() {
  const s = st();
  // plates, for barbell-ish loads
  const pl = s.weight >= L.BAR[s.unit] ? L.plateLoadout(s.weight, L.BAR[s.unit], L.PLATES[s.unit]) : null;
  $('plates').textContent = pl && pl.perSide.length
    ? 'Plates per side on a ' + L.BAR[s.unit] + ' ' + s.unit + ' bar: ' + pl.perSide.map(L.fmtLoad).join(' · ') + (Math.abs(pl.total - s.weight) > 1e-6 ? ' (= ' + L.fmtLoad(pl.total) + ')' : '')
    : '';
  // PR flag
  const probe = { exercise_id: LG.exId, unit: s.unit, reps: s.reps, weight: s.weight, is_warmup: s.warm };
  const prev = S.bests.get(L.bestKey(probe));
  const flag = $('prFlag');
  if (LG.mode === 'entry' && !s.warm && prev != null && s.weight > prev) {
    flag.innerHTML = '<div class="pr-flag">🏆 That’s a PR: your best at ' + s.reps + ' reps was ' + esc(L.fmtLoad(prev) + ' ' + s.unit) + '</div>';
  } else if (prev != null) {
    const est = L.e1rm(prev, s.reps);
    flag.innerHTML = '<div class="hint-line">Best at ' + s.reps + ' reps: <b>' + esc(L.fmtLoad(prev) + ' ' + s.unit) + '</b>' +
      (est ? ' · estimated 1-rep max ' + esc(L.fmtLoad(Math.round(est))) + ' ' + s.unit + ' (Epley)' : '') + '</div>';
  } else flag.innerHTML = '';
}
function refreshLoggerList() {
  const box = $('doneToday');
  if (!box || LG.mode !== 'entry') return;
  const sets = todaySets().filter(s => s.exercise_id === LG.exId);
  // Following a routine: once this step's sets are in, offer the next step.
  let next = '';
  const f = following();
  if (f && LG.item) {
    const working = sets.filter(s => s.is_warmup !== true).length;
    const nextItem = f.items.find(it => it.id !== LG.item.id && stepDone(it) < it.sets);
    if (working >= LG.item.sets) next = nextItem
      ? '<button class="btn primary block" style="margin-top:14px" data-next-item="' + esc(nextItem.id) + '">Next up: ' + esc(exName(nextItem.exercise_id)) + ' →</button>'
      : '<button class="btn primary block" style="margin-top:14px" data-close>Routine done 🎉</button>';
    else next = '<p class="hint-line">' + working + ' of ' + LG.item.sets + ' sets done for this step.</p>';
  }
  box.innerHTML = (sets.length
    ? '<div class="section-title">Today</div><div class="chips">' + sets.map(s => '<span class="chip' + (s._pr ? ' pr' : '') + (s.is_warmup ? ' warm' : '') + '">' + (s._pr ? '🏆 ' : '') + esc(setText(s)) + '</span>').join('') + '</div>' +
      (next ? '' : '<button class="btn block" style="margin-top:14px" data-close>Done with ' + esc(exName(LG.exId)) + '</button>')
    : '') + next;
}
inner.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.hasAttribute('data-close')) return closeSheet();
  if (b.hasAttribute('data-change')) return openLogger();
  if (b.dataset.pick && LG.multi) {
    const id = b.dataset.pick, i = LG.multi.indexOf(id);
    if (i >= 0) LG.multi.splice(i, 1); else LG.multi.push(id);
    vibrate(5);
    return drawResults($('exSearch').value);
  }
  if (b.hasAttribute('data-add-selected')) { b.disabled = true; return LG.pickFor(LG.multi.slice()); }
  if (b.dataset.pick) return LG.pickFor ? LG.pickFor(b.dataset.pick) : openEntry(b.dataset.pick);
  if (b.dataset.nextItem) { const it = S.itemsById.get(b.dataset.nextItem); return it && openEntry(it.exercise_id, null, it); }
  if (b.dataset.add) return addExercise(b.dataset.add, b);
  if (b.dataset.start) return startFollowing(b.dataset.start);
  if (LG.mode === 'design') return designerClick(b);
  if (LG.mode === 'season') return seasonClick(b);
  if (LG.mode !== 'entry' && LG.mode !== 'edit') return;
  const s = st();
  if (b.dataset.unit && b.dataset.unit !== s.unit) {
    const factor = b.dataset.unit === 'kg' ? 1 / L.LB_PER_KG : L.LB_PER_KG;
    s.weight = Math.round(s.weight * factor * 2) / 2;
    if (s.bodyweight != null) s.bodyweight = Math.round(s.bodyweight * factor * 2) / 2;
    s.unit = b.dataset.unit;
    syncInputs(); updateLive(); return;
  }
  if (b.dataset.w) { s.weight = Math.max(0, Math.round((s.weight + Number(b.dataset.w) * (s.unit === 'kg' ? 2.5 : 5)) * 4) / 4); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.nudge) { s.weight = Math.min(2000, Math.max(0, Math.round((s.weight + Number(b.dataset.nudge)) * 4) / 4)); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.r) { s.reps = Math.max(1, Math.min(1000, s.reps + Number(b.dataset.r))); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.t) {
    const t = b.dataset.t;
    if (t === 'bw') { s.bw = !s.bw; $('bwRow').hidden = !s.bw; if (s.bw && $('bwIn').value === '') $('bwIn').focus(); }
    if (t === 'warm') { s.warm = !s.warm; updateLive(); }
    if (t === 'note') { s.showNote = !s.showNote; $('noteRow').hidden = !s.showNote; if (s.showNote) $('noteIn').focus(); }
    b.setAttribute('aria-pressed', t === 'bw' ? s.bw : t === 'warm' ? s.warm : s.showNote);
    return;
  }
  if (b.id === 'saveBtn') return saveEntry(b);
  if (b.id === 'delBtn') { const s0 = LG.editing; sheet.close(); return removeSet(s0, false); }
});

function readForm() {
  const s = st();
  const weight = L.parseLoad($('wIn').value), reps = parseInt($('rIn').value, 10);
  const bodyweight = s.bw ? L.parseLoad($('bwIn').value) : null;
  if (weight == null || weight < 0 || weight > 2000) throw new Error('Enter a weight between 0 and 2000.');
  if (!(reps >= 1 && reps <= 1000)) throw new Error('Reps must be at least 1.');
  if (s.bw && !(bodyweight >= 1 && bodyweight <= 1000)) throw new Error('Enter your bodyweight to count it.');
  const note = $('noteIn') ? $('noteIn').value.trim() : '';
  return { weight, reps, unit: s.unit, count_bodyweight: s.bw, bodyweight: s.bw ? bodyweight : null, is_warmup: s.warm, notes: s.showNote && note ? note : null };
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
      const saved = await store.updateSet(old.id, patch);
      bumpDay(old, -1);
      syncCaches(saved, false);
      bumpDay(saved, +1);
      refreshBests();
      sheet.close(); render();
      toast('Saved');
    } else {
      const { saved } = await logSet({ exercise_id: LG.exId, ...fields });
      afterLogToast(saved);
      if (fields.notes) { $('noteIn').value = ''; st().showNote = false; $('noteRow').hidden = true; inner.querySelector('[data-t="note"]').setAttribute('aria-pressed', 'false'); }
      refreshLoggerList(); updateLive(); render();
      btn.disabled = false;
      btn.textContent = 'Log another';
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
  S.itemsById = new Map(r.items.map(i => [i.id, i]));
}
const routineItems = id => S.items.filter(i => i.template_id === id).sort((a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id)));
const isMine = t => t.created_by === S.myId;
const ownerName = t => (isMine(t) ? 'you' : S.names.get(t.created_by) || 'a friend');
const subFor = id => S.subs.find(s => s.template_id === id);

// "What's new" on the other person's routines. This browser remembers what each one looked like
// when you last saw it, and summarises the difference. Nothing about this goes to the server.
const routineSig = t => JSON.stringify({ n: t.name, i: routineItems(t.id).map(i => [i.exercise_id, i.sets, i.reps, i.load_mode, Number(i.load_value), i.unit]) });
function seenMap() { try { return JSON.parse(localStorage.getItem('lift.seen') || '{}'); } catch (e) { return {}; } }
function markSeen(t) {
  if (!t || isMine(t)) return;
  const m = seenMap(); m[t.id] = routineSig(t);
  try { localStorage.setItem('lift.seen', JSON.stringify(m)); } catch (e) {}
}
function routineChanges(t) {
  if (isMine(t)) return null;
  const prev = seenMap()[t.id];
  if (!prev) { markSeen(t); return null; }   // first time you see it: nothing to report yet
  const now = routineSig(t);
  if (prev === now) return null;
  const a = JSON.parse(prev), b = JSON.parse(now), out = [];
  if (a.n !== b.n) out.push('renamed from “' + a.n + '”');
  const step = i => i[1] + '×' + i[2] + (i[3] === 'percent_1rm' ? ' @ ' + L.fmtLoad(i[4]) + '%' : i[4] ? ' @ ' + L.fmtLoad(i[4]) + ' ' + i[5] : '');
  const before = new Map(a.i.map(i => [i[0], i])), after = new Map(b.i.map(i => [i[0], i]));
  for (const [ex, i] of after) {
    const p = before.get(ex);
    if (!p) out.push('added ' + exName(ex));
    else if (step(p) !== step(i)) out.push(exName(ex) + ' ' + step(p) + ' → ' + step(i));
  }
  for (const ex of before.keys()) if (!after.has(ex)) out.push('removed ' + exName(ex));
  if (!out.length) out.push('steps reordered');
  return out;
}
function syncTabDot() {
  const news = (S.templates || []).some(t => !isMine(t) && seenMap()[t.id] && seenMap()[t.id] !== routineSig(t));
  const tab = document.querySelector('.tabs a[href="#routines"]');
  if (tab) tab.classList.toggle('has-news', news);
}

// Which routine you're following today. Kept in this browser and forgotten tomorrow.
function following() {
  let f = null;
  try { f = JSON.parse(localStorage.getItem('lift.follow') || 'null'); } catch (e) {}
  if (!f || f.day !== today()) return null;
  const t = S.templates.find(x => x.id === f.id);
  return t ? { template: t, items: routineItems(t.id) } : null;
}
const stepDone = item => todaySets().filter(s => s.exercise_id === item.exercise_id && s.is_warmup !== true).length;
function startFollowing(id) {
  const t = S.templates.find(x => x.id === id);
  if (!t) return;
  markSeen(t);
  try { localStorage.setItem('lift.follow', JSON.stringify({ id, day: today() })); } catch (e) {}
  if (sheet.open) { flushSaves(); sheet.close(); }
  if (location.hash !== '#log') location.hash = '#log'; else render();
  toast('Following ' + t.name + '. Tap a step to start.');
}
function stopFollowing() { try { localStorage.removeItem('lift.follow'); } catch (e) {} render(); }
function followCard() {
  const f = following();
  if (!f) return '';
  const nextIdx = f.items.findIndex(it => stepDone(it) < it.sets);
  const done = f.items.filter(it => stepDone(it) >= it.sets).length;
  return '<section class="card follow"><div class="row"><div><div class="date">Following</div><h2>' + esc(f.template.name) + '</h2></div>' +
      '<span class="muted num">' + done + ' / ' + f.items.length + '</span></div>' +
    '<div class="bar" style="margin-top:10px"><i style="width:' + (f.items.length ? (done / f.items.length) * 100 : 0) + '%"></i></div>' +
    '<ol class="steps">' + f.items.map((it, i) => {
      const d = stepDone(it), full = d >= it.sets;
      return '<li><button class="step' + (full ? ' done' : i === nextIdx ? ' next' : '') + '" data-follow-item="' + esc(it.id) + '">' +
        '<span class="tick" aria-hidden="true">' + (full ? '✓' : i + 1) + '</span>' +
        '<span class="what"><b>' + esc(exName(it.exercise_id)) + '</b><small>' + esc(L.targetText(it, S.bestRows)) + '</small></span>' +
        '<span class="count num">' + Math.min(d, it.sets) + '/' + it.sets + '</span></button></li>';
    }).join('') + '</ol>' +
    (nextIdx < 0 && f.items.length ? '<div class="pr-flag" style="animation:none">🎉 Routine complete. The boulder rolls on.</div>' : '') +
    '<div class="actions"><button class="btn ghost" data-stop-follow>Stop following</button></div></section>';
}

function renderRoutines() {
  const mine = S.templates.filter(isMine);
  const subscribed = S.templates.filter(t => !isMine(t) && subFor(t.id));
  const shared = S.templates.filter(t => !isMine(t) && !subFor(t.id));
  const f = following();
  const start = t => routineItems(t.id).length
    ? '<button class="btn primary" data-start="' + esc(t.id) + '">' + (f && f.template.id === t.id ? 'Following ✓' : 'Start') + '</button>' : '';
  const card = (t, actions) => {
    const changes = routineChanges(t);
    return '<section class="card routine' + (changes ? ' updated' : '') + '"><div class="row"><h3>' + esc(t.name) + '</h3>' +
      (changes ? '<span class="tag new">Updated</span>' : isMine(t) ? (t.is_shared ? '<span class="tag">Shared</span>' : '') : '<span class="tag">by ' + esc(ownerName(t)) + '</span>') + '</div>' +
    (changes ? '<p class="changes"><b>' + esc(ownerName(t)) + ' changed it:</b> ' + esc(changes.slice(0, 4).join(' · ')) + (changes.length > 4 ? ' · and ' + (changes.length - 4) + ' more' : '') + '</p>' : '') +
    (t.notes ? '<p class="muted" style="margin:6px 0 0">' + esc(t.notes) + '</p>' : '') +
    '<div class="chips">' + (routineItems(t.id).map(it => '<span class="chip">' + esc(exName(it.exercise_id)) + ' <small>' + esc(L.targetText(it, S.bestRows, false)) + '</small></span>').join('') || '<span class="muted">No exercises yet</span>') + '</div>' +
    '<div class="actions">' + actions + (changes ? '<button class="btn ghost" data-seen="' + esc(t.id) + '">Got it</button>' : '') + '</div></section>';
  };
  view.innerHTML =
    '<div class="row" style="margin-top:8px"><h2 style="font-size:28px">Routines</h2><button class="btn primary" data-new-routine>+ New routine</button></div>' +
    (mine.length ? '<h3 class="section-title">Yours</h3>' + mine.map(t => card(t, start(t) + '<button class="btn" data-design="' + esc(t.id) + '">Edit</button>')).join('')
      : '<section class="card empty"><h2>No routines yet.</h2><p class="muted">Make one, or subscribe to one the crew shares.</p></section>') +
    (subscribed.length ? '<h3 class="section-title">Subscribed</h3>' + subscribed.map(t => card(t, start(t) +
      '<button class="btn" data-copy="' + esc(t.id) + '">Make it mine</button><button class="btn ghost" data-unsub="' + esc(subFor(t.id).id) + '">Unsubscribe</button>')).join('') : '') +
    (shared.length ? '<h3 class="section-title">Shared by the crew</h3>' + shared.map(t => card(t,
      '<button class="btn primary" data-sub="' + esc(t.id) + '">Subscribe</button><button class="btn" data-copy="' + esc(t.id) + '">Copy</button>')).join('') : '');
}
async function newRoutine(btn) {
  if (btn) btn.disabled = true;
  try {
    const t = await store.addRoutine({ name: 'New routine' });
    S.templates.push(t);
    openDesigner(t.id, true);
  } catch (x) { fail(x); } finally { if (btn) btn.disabled = false; }
}
async function subscribeTo(id, btn) {
  btn.disabled = true;
  try { S.subs.push(await store.subscribe(id)); markSeen(S.templates.find(t => t.id === id)); toast('Subscribed. It follows their edits.'); render(); }
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
    markSeen(src);
    const t = await store.addRoutine({ name: (src.name + (isMine(src) ? ' (copy)' : '')).slice(0, 60), notes: src.notes || null });
    S.templates.push(t);
    for (const it of routineItems(id)) {
      const n = await store.addItem({ template_id: t.id, exercise_id: it.exercise_id, position: it.position, sets: it.sets, reps: it.reps,
        load_mode: it.load_mode, load_value: it.load_value, unit: it.unit });
      S.items.push(n); S.itemsById.set(n.id, n);
    }
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
  D.id = id; LG.mode = 'design'; LG.pickFor = null;
  inner.innerHTML =
    '<div class="sheet-head"><input class="title-input" id="rtName" maxlength="60" value="' + esc(t.name) + '" aria-label="Routine name"><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<input class="plain-input" id="rtNotes" maxlength="500" placeholder="Notes (optional)" value="' + esc(t.notes || '') + '" aria-label="Notes">' +
      '<div class="toggles"><button type="button" class="toggle" id="rtShare" aria-pressed="' + !!t.is_shared + '">' + (t.is_shared ? '✓ Shared with the crew' : 'Share with the crew') + '</button></div>' +
      '<ol class="items" id="rtItems"></ol>' +
      '<button class="btn block" id="rtAdd">+ Add exercise</button>' +
      '<div class="actions" style="margin-top:16px"><button class="btn primary" data-start="' + esc(id) + '" id="rtStart">Start this routine</button><button class="btn ghost" id="rtDelete" style="color:var(--accent)">Delete routine</button></div>' +
      '<p class="hint-line" id="rtHint"></p>' +
    '</div>';
  openSheet();
  drawItems();
  const name = $('rtName'), notes = $('rtNotes');
  name.addEventListener('input', () => debounceSave('name', () => saveRoutine({ name: name.value.trim() || 'Untitled routine' })));
  notes.addEventListener('input', () => debounceSave('notes', () => saveRoutine({ notes: notes.value.trim() || null })));
  if (fresh) setTimeout(() => { name.focus(); name.select(); }, 60);
}
function drawItems() {
  const list = routineItems(D.id), t = S.templates.find(x => x.id === D.id);
  $('rtItems').innerHTML = list.length ? list.map(itemRow).join('') : '<li class="muted" style="padding:14px 4px">Add the exercises you do, in order. Drag ⠿ to reorder.</li>';
  $('rtStart').disabled = !list.length;
  $('rtHint').textContent = 'Changes save as you go.' + (t && t.is_shared ? ' Anyone subscribed sees them straight away.' : '');
}
function itemRow(it) {
  const pct = it.load_mode === 'percent_1rm';
  const tgt = L.itemTarget(it, S.bestRows);
  return '<li class="item" data-item="' + esc(it.id) + '">' +
    '<div class="row"><button type="button" class="handle" data-handle aria-label="Move ' + esc(exName(it.exercise_id)) + ' (drag, or use the arrow keys)">⠿</button>' +
      '<b class="grow">' + esc(exName(it.exercise_id)) + '</b><button type="button" class="iconbtn sm" data-remove-item="' + esc(it.id) + '" aria-label="Remove ' + esc(exName(it.exercise_id)) + '">✕</button></div>' +
    '<div class="mini">' + miniStep('Sets', 'sets', it.sets) + miniStep('Reps', 'reps', it.reps) +
      miniStep(pct ? '% of 1RM' : 'Load (' + it.unit + ')', 'load_value', L.fmtLoad(it.load_value)) +
      '<span class="seg mini-seg" role="group" aria-label="Load as">' + [['lb', 'lb'], ['kg', 'kg'], ['pct', '%1RM']].map(([k, l]) =>
        '<button type="button" data-loadmode="' + k + '" aria-pressed="' + (k === 'pct' ? pct : !pct && it.unit === k) + '">' + l + '</button>').join('') + '</span>' +
    '</div>' +
    (pct ? '<p class="hint-line">' + (tgt.weight ? '≈ ' + esc(L.fmtLoad(tgt.weight)) + ' ' + it.unit + ' today, from your best' : 'Works out once you’ve logged this exercise in ' + it.unit) + '</p>' : '') +
    '<div class="item-actions"><button type="button" data-swap>⇄ Swap exercise</button><button type="button" data-dup>⧉ Duplicate</button></div>' +
  '</li>';
}
function miniStep(label, field, value) {
  return '<label class="ms"><small>' + esc(label) + '</small><span>' +
    '<button type="button" data-step-field="' + field + '" data-d="-1" aria-label="Less">−</button>' +
    '<input data-field="' + field + '" inputmode="decimal" value="' + esc(value) + '" aria-label="' + esc(label) + '">' +
    '<button type="button" data-step-field="' + field + '" data-d="1" aria-label="More">+</button></span></label>';
}
const ITEM_BOUNDS = { sets: [1, 20], reps: [1, 100] };
function clampItem(it, field, v) {
  if (field === 'load_value') return it.load_mode === 'percent_1rm' ? Math.min(150, Math.max(1, v)) : Math.min(2000, Math.max(0, v));
  const [lo, hi] = ITEM_BOUNDS[field];
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
function redrawItem(id) {
  const li = inner.querySelector('.item[data-item="' + id + '"]');
  if (li) li.outerHTML = itemRow(S.itemsById.get(id));
}
// Add exercises to the end of a routine, each starting from your last numbers for it.
async function addItemsTo(tid, exIds) {
  try {
    for (const exId of exIds) {
      const list = routineItems(tid);
      const recent = S.recent.find(s => s.exercise_id === exId && s.is_warmup !== true);
      const it = await store.addItem({
        template_id: tid, exercise_id: exId, position: Math.min(100, (list.length ? Math.max(...list.map(i => i.position)) : 0) + 1),
        sets: 3, reps: recent ? Math.min(100, recent.reps) : 8, load_mode: 'fixed',
        load_value: recent ? Number(recent.weight) : 0, unit: recent ? recent.unit : prefs.unit,
      });
      S.items.push(it); S.itemsById.set(it.id, it);
    }
    if (exIds.length > 1) toast('Added ' + exIds.length + ' exercises');
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
  const b = e.target.closest('[data-w], [data-r], [data-nudge]');
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
  const inp = e.target.closest('[data-field]');
  if (!inp || LG.mode !== 'design') return;
  const id = inp.closest('.item').dataset.item, it = S.itemsById.get(id), v = L.parseLoad(inp.value);
  if (v == null) return;
  queueItem(id, { [inp.dataset.field]: clampItem(it, inp.dataset.field, v) });
});
async function designerClick(b) {
  if (b.id === 'rtAdd') { flushSaves(); return openPicker('Add to ' + (S.templates.find(x => x.id === D.id) || {}).name, ids => addItemsTo(D.id, ids), true); }
  if (b.id === 'rtShare') {
    const t = S.templates.find(x => x.id === D.id);
    try { await saveRoutine({ is_shared: !t.is_shared }); } catch (x) { return fail(x); }
    b.setAttribute('aria-pressed', t.is_shared); b.textContent = t.is_shared ? '✓ Shared with the crew' : 'Share with the crew';
    drawItems(); toast(t.is_shared ? 'Shared. The crew can follow or subscribe to it.' : 'Not shared any more.');
    return;
  }
  if (b.id === 'rtDelete') {
    const t = S.templates.find(x => x.id === D.id);
    if (!confirm('Delete “' + t.name + '”?' + (t.is_shared ? ' Anyone subscribed loses it too.' : ''))) return;
    try { await store.deleteRoutine(t.id); } catch (x) { return fail(x); }
    S.templates = S.templates.filter(x => x.id !== t.id);
    const f = following(); if (f && f.template.id === t.id) stopFollowing();
    sheet.close(); render(); toast('Routine deleted');
    return;
  }
  const li = b.closest('.item');
  if (!li) return;
  const id = li.dataset.item, it = S.itemsById.get(id);
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
    const list = routineItems(D.id);
    if (list.length >= 100) return toast('That’s the most steps a routine can have.');
    try {
      for (const later of list.filter(x => x.position > it.position).reverse()) await store.updateItem(later.id, { position: later.position + 1 }).then(s => Object.assign(later, s));
      const copy = await store.addItem({ template_id: D.id, exercise_id: it.exercise_id, position: it.position + 1, sets: it.sets, reps: it.reps,
        load_mode: it.load_mode, load_value: it.load_value, unit: it.unit });
      S.items.push(copy); S.itemsById.set(copy.id, copy);
      drawItems(); vibrate(8);
    } catch (x) { fail(x); }
    return;
  }
  if (b.dataset.removeItem) {
    try { await store.removeItem(id); } catch (x) { return fail(x); }
    S.items = S.items.filter(x => x.id !== id);
    drawItems();
    toast('Removed ' + exName(it.exercise_id), { label: 'Undo', run: async () => {
      try { const back = await store.updateItem(id, { deleted_at: null }); S.items.push(back); S.itemsById.set(id, back); drawItems(); } catch (x) { fail(x); }
    } });
    return;
  }
  if (b.dataset.stepField) {
    const f = b.dataset.stepField, d = Number(b.dataset.d);
    const step = f === 'load_value' ? (it.load_mode === 'percent_1rm' ? 5 : it.unit === 'kg' ? 2.5 : 5) : 1;
    queueItem(id, { [f]: clampItem(it, f, Number(it[f]) + d * step) });
    redrawItem(id); vibrate(5);
    return;
  }
  if (b.dataset.loadmode) {
    const k = b.dataset.loadmode, wasPct = it.load_mode === 'percent_1rm';
    if (k === 'pct' && !wasPct) {
      const basis = L.bestE1rm(it.exercise_id, it.unit, S.bestRows);
      queueItem(id, { load_mode: 'percent_1rm', load_value: basis && it.load_value > 0 ? clampItem({ load_mode: 'percent_1rm' }, 'load_value', Math.round(it.load_value / basis * 20) * 5) : 75 });
    } else if (k !== 'pct') {
      const weight = wasPct ? (L.itemTarget(it, S.bestRows).weight || 0) : Number(it.load_value);
      const conv = !wasPct && it.unit !== k ? Math.round(weight * (k === 'kg' ? 1 / L.LB_PER_KG : L.LB_PER_KG) * 2) / 2 : weight;
      queueItem(id, { load_mode: 'fixed', unit: k, load_value: Math.min(2000, conv) });
    }
    redrawItem(id);
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
function goalLine(g, m) {
  const p = L.goalProgress(g, m);
  const label = g.metric === 'visits' ? L.fmtNum(p.have, 0) + ' / ' + L.fmtNum(p.need, 0) + ' visits' : L.fmtBig(p.have) + ' / ' + L.fmtBig(p.need) + ' ' + g.unit;
  return '<div class="goal"><div class="row"><span>' + (p.done ? '✅ ' : '') + esc(g.name) + '</span><span class="muted num">' + esc(label) + '</span></div>' +
    '<div class="bar"><i style="width:' + (p.ratio * 100).toFixed(1) + '%"></i></div></div>';
}
function seasonsSection() {
  const list = S.seasons || [];
  return '<div class="row" style="margin-top:22px"><h3 class="section-title" style="margin:0">Seasons</h3><button class="btn" data-new-season>+ New season</button></div>' +
    (list.length ? list.map(s => {
      const m = seasonM(s), goals = S.goals.filter(g => g.season_id === s.id);
      return '<section class="card season' + (S.period === 'season:' + s.id ? ' on' : '') + '"><div class="row"><div><h3>' + esc(s.name) + '</h3>' +
        '<span class="muted" style="font-size:14px">' + esc(fmtDay(s.starts_on, { month: 'short', day: 'numeric' }) + ' – ' + fmtDay(s.ends_on, { month: 'short', day: 'numeric', year: 'numeric' })) + ' · ' + esc(seasonStatus(s)) + '</span></div></div>' +
        '<p class="hint-line">' + m.visits + ' visits · ' + esc(volText(m.volume)) + (m.volume.kg ? '' : ' lb') + ' moved · ' + m.bests + ' bests set</p>' +
        goals.map(g => goalLine(g, m)).join('') +
        '<div class="actions"><button class="btn primary" data-season="' + esc(s.id) + '">View season</button><button class="btn" data-edit-season="' + esc(s.id) + '">Edit</button></div></section>';
    }).join('') : '<section class="card"><p class="muted" style="margin:0">A season is any stretch you choose: a training block, a month, a year. Give it goals and watch them fill.</p></section>');
}
const SG = { id: null, pending: [] };
function openSeasonSheet(id) {
  LG.mode = 'season';
  SG.id = id; SG.pending = [];
  const s = id ? seasonById(id) : { name: '', starts_on: today(), ends_on: L.addDays(today(), 55) };
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">' + (id ? 'Edit season' : 'New season') + '</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<div class="field-label"><span>Name</span></div><input class="plain-input" id="snName" maxlength="60" value="' + esc(s.name) + '" placeholder="e.g. Winter bulk">' +
      '<div class="grid2"><div><div class="field-label"><span>Starts</span></div><input class="plain-input" id="snStart" type="date" value="' + esc(s.starts_on) + '"></div>' +
        '<div><div class="field-label"><span>Ends</span></div><input class="plain-input" id="snEnd" type="date" value="' + esc(s.ends_on) + '"></div></div>' +
      '<div class="field-label"><span>Goals</span><small>optional</small></div><div id="snGoals"></div>' +
      '<div class="goal-add"><select class="plain-input" id="gMetric" aria-label="Goal type"><option value="visits">Visits</option><option value="volume:lb">Volume (lb)</option><option value="volume:kg">Volume (kg)</option></select>' +
        '<input class="plain-input" id="gTarget" inputmode="numeric" placeholder="Target" aria-label="Target"><button class="btn" id="gAdd" type="button">Add</button></div>' +
      '<p class="warn" id="snErr" role="alert"></p>' +
      '<button class="btn primary block" id="snSave">' + (id ? 'Save season' : 'Start season') + '</button>' +
      (id ? '<button class="btn block" style="margin-top:10px;color:var(--accent)" id="snDelete">Delete season</button>' : '') +
    '</div>';
  openSheet();
  drawGoals();
  if (!id) setTimeout(() => $('snName').focus(), 60);
}
function drawGoals() {
  const goals = SG.id ? S.goals.filter(g => g.season_id === SG.id) : SG.pending;
  $('snGoals').innerHTML = goals.length ? goals.map((g, i) => '<div class="row goal-row"><span>' + esc(g.name) + '</span>' +
      '<button class="iconbtn sm" data-goal-del="' + esc(g.id || 'p' + i) + '" aria-label="Remove goal">✕</button></div>').join('')
    : '<p class="hint-line" style="margin:0 2px 8px">e.g. 24 visits, or 400,000 lb moved.</p>';
}
async function seasonClick(b) {
  if (b.id === 'gAdd') {
    const [metric, unit] = $('gMetric').value.split(':');
    const target = L.parseLoad($('gTarget').value);
    if (!(target > 0) || (metric === 'visits' && target % 1)) { $('snErr').textContent = metric === 'visits' ? 'Visits must be a whole number above zero.' : 'Enter a target above zero.'; return; }
    const g = { metric, unit: unit || null, target, name: metric === 'visits' ? 'Show up ' + target + ' times' : 'Move ' + L.fmtBig(target) + ' ' + unit };
    $('snErr').textContent = '';
    if (SG.id) { try { S.goals.push(await store.addGoal({ ...g, season_id: SG.id })); } catch (x) { return fail(x); } }
    else SG.pending.push(g);
    $('gTarget').value = ''; drawGoals();
    return;
  }
  if (b.dataset.goalDel) {
    const key = b.dataset.goalDel;
    if (SG.id) { try { await store.deleteGoal(key); } catch (x) { return fail(x); } S.goals = S.goals.filter(g => g.id !== key); }
    else SG.pending.splice(Number(key.slice(1)), 1);
    drawGoals();
    return;
  }
  if (b.id === 'snSave') {
    const name = $('snName').value.trim(), starts_on = $('snStart').value, ends_on = $('snEnd').value;
    if (!name) { $('snErr').textContent = 'Give your season a name.'; return; }
    if (!starts_on || !ends_on || ends_on < starts_on) { $('snErr').textContent = 'The end date must be on or after the start date.'; return; }
    b.disabled = true;
    try {
      let s;
      if (SG.id) { s = await store.updateSeason(SG.id, { name, starts_on, ends_on }); S.seasons = S.seasons.map(x => (x.id === s.id ? s : x)); }
      else {
        s = await store.addSeason({ name, starts_on, ends_on });
        S.seasons.unshift(s);
        for (const g of SG.pending) S.goals.push(await store.addGoal({ ...g, season_id: s.id }));
      }
      S.period = 'season:' + s.id;
      sheet.close();
      if (location.hash !== '#progress') location.hash = '#progress'; else render();
      toast(SG.id ? 'Season saved' : 'Season started. Go get it.');
    } catch (x) { $('snErr').textContent = x.message; b.disabled = false; }
    return;
  }
  if (b.id === 'snDelete') {
    const s = seasonById(SG.id);
    if (!confirm('Delete the season “' + s.name + '”? Your sets aren’t touched.')) return;
    try { await store.deleteSeason(s.id); } catch (x) { return fail(x); }
    S.seasons = S.seasons.filter(x => x.id !== s.id);
    if (S.period === 'season:' + s.id) S.period = 'all';
    sheet.close(); render(); toast('Season deleted');
  }
}

// ===========================================================================
// History
// ===========================================================================
function renderHistory() {
  const days = S.days.filter(d => d.sets > 0);
  if (!days.length) {
    view.innerHTML = '<section class="card empty"><h2>Nothing yet.</h2><p class="muted">Your days show up here once you’ve logged a set.</p></section>';
    return;
  }
  let html = '', month = '';
  for (const d of days.slice(0, S.historyLimit)) {
    const m = fmtDay(d.performed_on, { month: 'long', year: 'numeric' });
    if (m !== month) { html += '<h2 class="month">' + esc(m) + '</h2>'; month = m; }
    const open = S.open.has(d.performed_on);
    html += '<section class="card day"><button data-day="' + d.performed_on + '" aria-expanded="' + open + '">' +
      '<span><span class="when">' + esc(d.performed_on === today() ? 'Today' : fmtDay(d.performed_on)) + '</span><br><span class="meta">' + d.sets + ' sets · ' + d.exercises + ' exercise' + (d.exercises == 1 ? '' : 's') + '</span></span>' +
      '<span class="vol">' + esc(volText({ lb: Number(d.volume_lb), kg: Number(d.volume_kg) })) + '</span></button>' +
      (open ? '<div class="body">' + dayBody(d.performed_on) + '</div>' : '') + '</section>';
  }
  if (days.length > S.historyLimit) html += '<button class="btn block" style="margin-top:14px" id="moreDays">Show older days</button>';
  view.innerHTML = html;
}
function dayBody(day) {
  const sets = S.dayCache.get(day);
  if (!sets) return '<p class="muted">Loading…</p>';
  return groupByExercise(sets).map(g => '<div class="ex"><b>' + esc(exName(g.exercise_id)) + '</b><div class="chips">' +
    g.sets.map(s => '<button class="chip' + (s.is_warmup ? ' warm' : '') + '" data-edit="' + esc(s.id) + '">' + esc(setText(s)) + (s.notes ? ' <small>✎</small>' : '') + '</button>').join('') +
    '</div></div>').join('') + (sets.length ? '<button class="btn" style="margin-top:14px" data-save-day="' + esc(day) + '">Save as a routine</button>' : '') || '<p class="muted">No sets.</p>';
}
async function toggleDay(day) {
  if (S.open.has(day)) S.open.delete(day); else S.open.add(day);
  renderHistory();
  if (S.open.has(day) && !S.dayCache.has(day)) {
    try { S.dayCache.set(day, await store.daySets(day)); } catch (x) { fail(x); S.open.delete(day); }
    renderHistory();
  }
}

// ===========================================================================
// Progress
// ===========================================================================
function renderProgress() {
  const season = S.period.startsWith('season:') ? seasonById(S.period.slice(7)) : null;
  if (S.period.startsWith('season:') && !season) S.period = 'all';
  const from = S.period === 'year' ? L.addDays(today(), -364) : S.period === '30' ? L.addDays(today(), -29) : null;
  const t = season ? seasonM(season) : totals(from);
  const lbEq = L.lbEquivalent(t.volume);
  const ms = L.milestoneProgress(lbEq);
  const cmp = L.compareTo(lbEq);
  const ach = L.achievements({ volume: t.volume, visits: t.visits, prs: season ? t.bests : S.bests.size });
  const earnedClubs = ach.filter(a => a.milestone && a.earned);
  const shown = ach.filter(a => !a.milestone).concat(earnedClubs.slice(-5)).concat(ach.filter(a => a.milestone && !a.earned).slice(0, 1));
  const medal = a => a.milestone ? (a.need === 10000 ? '🐘' : '🪨') : a.id === 'first_pr' ? '🏆' : '⭐';
  view.innerHTML =
    '<div class="seg" role="group" aria-label="Period" style="margin-top:6px">' +
      [['all', 'All time'], ['year', 'Past year'], ['30', '30 days']].map(([k, l]) => '<button data-period="' + k + '" aria-pressed="' + (S.period === k) + '">' + l + '</button>').join('') +
      (season ? '<button data-period="' + esc(S.period) + '" aria-pressed="true">' + esc(season.name) + '</button>' : '') + '</div>' +
    '<section class="card hero">' +
      (season ? '<div class="date">' + esc(season.name) + ' · ' + esc(seasonStatus(season)) + '</div>' : '') +
      hillSVG(ms.ratio, 'Progress to the ' + (ms.next ? ms.next.title : 'top')) +
      '<h1 class="num">' + esc(L.fmtBig(Math.round(lbEq))) + ' lb</h1>' +
      '<p class="muted" style="margin:4px 0 12px">' + (lbEq > 0 ? 'moved' + (t.volume.kg ? ' (kg counted as lb)' : '') + ', about ' + esc(L.fmtNum(cmp.times, cmp.times < 10 ? 1 : 0)) + ' × a ' + esc(cmp.thing) : 'Nothing moved yet. The hill awaits.') + '</p>' +
      (ms.next ? '<div class="row" style="font-size:14px;font-weight:600"><span>' + (ms.earned ? esc(ms.earned.title) : 'Start') + '</span><span>' + esc(ms.next.title) + '</span></div>' +
        '<div class="bar" style="margin-top:6px"><i style="width:' + (ms.ratio * 100).toFixed(1) + '%"></i></div>' +
        '<p class="hint-line">' + esc(L.fmtNum(Math.ceil(ms.remaining), 0)) + ' lb to go</p>' : '<p><b>Every club unlocked.</b> Legend.</p>') +
      '<div class="stats">' +
        '<div class="stat"><b>' + t.visits + '</b><small>visits</small></div>' +
        '<div class="stat"><b>' + esc(L.fmtNum(t.sets, 0)) + '</b><small>sets</small></div>' +
        '<div class="stat"><b>' + ms.count + '</b><small>club' + (ms.count === 1 ? '' : 's') + ' joined</small></div>' +
      '</div>' +
      (t.volume.lb && t.volume.kg ? '<p class="hint-line">' + esc(L.fmtBig(t.volume.lb)) + ' lb + ' + esc(L.fmtBig(t.volume.kg)) + ' kg, kept separate.</p>' : '') +
      (season ? S.goals.filter(g => g.season_id === season.id).map(g => goalLine(g, t)).join('') : '') +
    '</section>' +
    '<h3 class="section-title">Badges</h3><div class="badges">' +
      shown.map(a => '<div class="badge' + (a.earned ? ' got' : '') + '" title="' + esc(a.desc) + '"><div class="medal">' + medal(a) + '</div>' + esc(a.title) +
        (a.earned ? '' : '<br><span class="muted" style="font-weight:500">' + esc(L.fmtNum(Math.min(a.have, a.need), 0)) + ' / ' + esc(L.fmtNum(a.need, 0)) + '</span>') + '</div>').join('') + '</div>' +
    seasonsSection() +
    '<h3 class="section-title">Personal bests</h3>' +
    '<input class="search" id="bestSearch" type="search" placeholder="Find an exercise" style="margin-top:10px" value="' + esc(S.bestQuery) + '" aria-label="Find an exercise">' +
    '<section class="card" id="bestsBox"></section>';
  const input = $('bestSearch');
  input.addEventListener('input', () => { S.bestQuery = input.value; drawBests(); });
  drawBests();
}
function drawBests() {
  const byEx = new Map();
  for (const r of S.bestRows) {
    if (!byEx.has(r.exercise_id)) byEx.set(r.exercise_id, []);
    byEx.get(r.exercise_id).push(r);
  }
  const q = L.norm(S.bestQuery);
  const rows = [...byEx.entries()]
    .filter(([id]) => !q || L.norm(exName(id)).includes(q))
    .map(([id, list]) => ({ id, list, latest: list.reduce((m, r) => (r.first_lifted_on > m ? r.first_lifted_on : m), '') }))
    .sort((a, b) => b.latest.localeCompare(a.latest))
    .slice(0, 30);
  $('bestsBox').innerHTML = rows.length ? rows.map(({ id, list }) => {
    const units = [...new Set(list.map(r => r.unit))];
    return '<div class="best"><b>' + esc(exName(id)) + '</b>' + units.map(u => {
      const mine = list.filter(r => r.unit === u).sort((a, b) => a.reps - b.reps);
      const top = Math.max(...mine.map(r => L.e1rm(Number(r.heaviest), r.reps) || 0));
      return '<div class="chips">' + mine.slice(0, 10).map(r => '<span class="chip"><small>' + r.reps + '×</small> ' + esc(L.fmtLoad(r.heaviest)) + (units.length > 1 || u !== prefs.unit ? ' ' + u : '') + '</span>').join('') + '</div>' +
        (top ? '<p class="hint-line">Estimated 1-rep max ' + esc(L.fmtLoad(Math.round(top))) + ' ' + u + ' (Epley, from sets of 12 or fewer)</p>' : '');
    }).join('') + '</div>';
  }).join('') : '<p class="muted">' + (q ? 'No bests for that yet.' : 'Your bests show up here as you log.') + '</p>';
}

// ===========================================================================
// Settings sheet
// ===========================================================================
$('menuBtn').addEventListener('click', () => {
  LG.mode = 'menu';
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">' + esc(me ? me.display_name : 'You') + '</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<div class="field-label"><span>Default unit</span><span class="seg" role="group" aria-label="Default unit">' +
        ['lb', 'kg'].map(u => '<button type="button" data-pref-unit="' + u + '" aria-pressed="' + (prefs.unit === u) + '">' + u + '</button>').join('') + '</span></div>' +
      '<p class="hint-line">Each set keeps its own unit, and lb and kg totals are never mixed. This is just where new exercises start.</p>' +
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
    try { await store.updatePassword(pw); $('newPw').value = ''; msg.style.color = 'var(--good)'; msg.textContent = 'Password changed.'; }
    catch (x) { msg.style.color = ''; msg.textContent = x.message; }
    btn.disabled = false;
  });
});
inner.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.prefUnit) {
    prefs.unit = b.dataset.prefUnit; savePrefs();
    inner.querySelectorAll('[data-pref-unit]').forEach(x => x.setAttribute('aria-pressed', x.dataset.prefUnit === prefs.unit));
  }
  if (b.id === 'signOutBtn') { sheet.close(); await store.signOut(); if (!store.demo) { S.recent = []; showSignIn(); } }
});

// ===========================================================================
// Start
// ===========================================================================
(async function boot() {
  try {
    store = await connect(DEMO);
    if (!(await store.session())) return showSignIn();
    await afterSignIn();
  } catch (e) {
    console.error(e);
    gate('<p class="warn" style="text-align:center">' + esc(e.message || 'Couldn’t start.') + '</p><p style="text-align:center"><a href="./" style="color:inherit">Try again</a> · <a href="?demo" style="color:inherit">Try the demo</a></p>');
  }
})();
