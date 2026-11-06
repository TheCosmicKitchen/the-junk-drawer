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
  const [cat, recent, days, bests] = await Promise.all([
    store.catalog(), store.setsSince(L.addDays(today(), -RECENT_DAYS)), store.days(), store.bests(),
  ]);
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
  const tab = ['log', 'history', 'progress'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'log';
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + tab ? 'page' : 'false'));
  if (tab !== currentTab) window.scrollTo(0, 0);
  currentTab = tab;
  render();
}
function render() {
  if (currentTab === 'history') renderHistory();
  else if (currentTab === 'progress') renderProgress();
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
    (groups.length ? groups.map(exCard).join('') : emptyToday());
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
function closeSheet() { if (sheet.open) sheet.close(); render(); }
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });

function openLogger(exId) {
  LG.editing = null;
  if (exId) return openEntry(exId);
  LG.mode = 'pick';
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">What are you lifting?</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><input class="search" id="exSearch" type="search" placeholder="Search ' + S.exercises.filter(e => !e.deleted_at).length + ' exercises" autocomplete="off" enterkeyhint="go" aria-label="Search exercises">' +
    '<div class="section-title" id="resTitle"></div><ul class="results" id="exResults"></ul></div>';
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
  let html = list.map(e => '<li><button data-pick="' + esc(e.id) + '"><span>' + esc(e.name) + '</span><small>' + esc(lastSummary(e.id)) + '</small></button></li>').join('');
  const typed = q.trim();
  const exact = e => [e.name, ...(S.aliases.get(e.id) || [])].some(n => L.norm(n) === L.norm(typed));
  if (typed && me && me.is_admin && !S.exercises.some(e => !e.deleted_at && exact(e))) {
    const near = L.suggestMatch(typed, S.exercises.filter(e => !e.deleted_at).map(e => e.name));
    html += '<li><button data-add="' + esc(typed) + '"><span>+ Add “' + esc(typed) + '” to the catalogue</span><small>admin</small></button>' +
      (near ? '<p class="warn" style="margin:-2px 4px 10px">Did you mean <b>' + esc(near) + '</b>? It’s already there.</p>' : '') + '</li>';
  }
  $('exResults').innerHTML = html;
}

async function openEntry(exId, editing) {
  LG.mode = editing ? 'edit' : 'entry';
  LG.exId = exId;
  LG.editing = editing || null;
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
  inner.innerHTML =
    '<div class="sheet-head"><div>' + (editing ? '' : '<button class="btn ghost" style="padding:2px 0;border:0;color:var(--muted);font-size:14px" data-change>← Change exercise</button>') +
      '<h2 id="sheetTitle">' + esc(exName(exId)) + '</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<div class="hint-line" id="lastLine">' + (editing ? 'Editing a set from ' + esc(fmtDay(editing.performed_on)) : 'Looking up last time…') + '</div>' +
      '<div class="field-label"><span>Weight' + '</span><span class="seg" role="group" aria-label="Unit">' +
        ['lb', 'kg'].map(u => '<button type="button" data-unit="' + u + '" aria-pressed="' + (u === st.unit) + '">' + u + '</button>').join('') + '</span></div>' +
      '<div class="stepper"><button type="button" data-w="-1" aria-label="Less weight">−</button>' +
        '<input id="wIn" inputmode="decimal" aria-label="Weight" value="' + esc(L.fmtLoad(st.weight)) + '"><button type="button" data-w="1" aria-label="More weight">+</button></div>' +
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
  updateLive();
  refreshLoggerList();
  if (!editing) {
    // Prefill from last time, unless already lifting this today.
    const prev = await store.lastFor(exId, today()).catch(() => []);
    if (LG.exId !== exId || LG.mode !== 'entry') return;
    LG.last = prev;
    const working = prev.find(s => s.is_warmup !== true) || prev[0];
    if (working && !base) {
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
function syncInputs() {
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
  box.innerHTML = sets.length
    ? '<div class="section-title">Today</div><div class="chips">' + sets.map(s => '<span class="chip' + (s._pr ? ' pr' : '') + (s.is_warmup ? ' warm' : '') + '">' + (s._pr ? '🏆 ' : '') + esc(setText(s)) + '</span>').join('') + '</div>' +
      '<button class="btn block" style="margin-top:14px" data-close>Done with ' + esc(exName(LG.exId)) + '</button>'
    : '';
}
inner.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.hasAttribute('data-close')) return closeSheet();
  if (b.hasAttribute('data-change')) return openLogger();
  if (b.dataset.pick) return openEntry(b.dataset.pick);
  if (b.dataset.add) return addExercise(b.dataset.add, b);
  const s = st();
  if (b.dataset.unit && b.dataset.unit !== s.unit) {
    const factor = b.dataset.unit === 'kg' ? 1 / L.LB_PER_KG : L.LB_PER_KG;
    s.weight = Math.round(s.weight * factor * 2) / 2;
    if (s.bodyweight != null) s.bodyweight = Math.round(s.bodyweight * factor * 2) / 2;
    s.unit = b.dataset.unit;
    syncInputs(); updateLive(); return;
  }
  if (b.dataset.w) { s.weight = Math.max(0, Math.round((s.weight + Number(b.dataset.w) * (s.unit === 'kg' ? 2.5 : 5)) * 4) / 4); syncInputs(); updateLive(); vibrate(5); return; }
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
    openEntry(e.id);
  } catch (x) { fail(x); btn.disabled = false; }
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
    '</div></div>').join('') || '<p class="muted">No sets.</p>';
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
  const from = S.period === 'year' ? L.addDays(today(), -364) : S.period === '30' ? L.addDays(today(), -29) : null;
  const t = totals(from);
  const lbEq = L.lbEquivalent(t.volume);
  const ms = L.milestoneProgress(lbEq);
  const cmp = L.compareTo(lbEq);
  const ach = L.achievements({ volume: t.volume, visits: t.visits, prs: S.bests.size });
  const earnedClubs = ach.filter(a => a.milestone && a.earned);
  const shown = ach.filter(a => !a.milestone).concat(earnedClubs.slice(-5)).concat(ach.filter(a => a.milestone && !a.earned).slice(0, 1));
  const medal = a => a.milestone ? (a.need === 10000 ? '🐘' : '🪨') : a.id === 'first_pr' ? '🏆' : '⭐';
  view.innerHTML =
    '<div class="seg" role="group" aria-label="Period" style="margin-top:6px">' +
      [['all', 'All time'], ['year', 'Past year'], ['30', '30 days']].map(([k, l]) => '<button data-period="' + k + '" aria-pressed="' + (S.period === k) + '">' + l + '</button>').join('') + '</div>' +
    '<section class="card hero">' + hillSVG(ms.ratio, 'Progress to the ' + (ms.next ? ms.next.title : 'top')) +
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
    '</section>' +
    '<h3 class="section-title">Badges</h3><div class="badges">' +
      shown.map(a => '<div class="badge' + (a.earned ? ' got' : '') + '" title="' + esc(a.desc) + '"><div class="medal">' + medal(a) + '</div>' + esc(a.title) +
        (a.earned ? '' : '<br><span class="muted" style="font-weight:500">' + esc(L.fmtNum(Math.min(a.have, a.need), 0)) + ' / ' + esc(L.fmtNum(a.need, 0)) + '</span>') + '</div>').join('') + '</div>' +
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
      (store.demo ? '<p class="hint-line"><b>This is the demo.</b> Nothing is saved; reload to start over.</p>' : '') +
      '<button class="btn block" style="margin-top:18px" id="signOutBtn">' + (store.demo ? 'Leave the demo' : 'Sign out') + '</button>' +
    '</div>';
  openSheet();
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
