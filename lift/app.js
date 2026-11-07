// Sisyfitness on the web: the interface. Storage lives in data.js, the maths in logic.js.
import * as L from './logic.js';
import { connect } from './data.js';
import { SESSIONS, SPLIT_IDS, PROGRAMS, TIPS } from './starters.js';
import * as C from './charts.js';
import { THEMES, ORDER, swatch, applyTheme } from './themes.js';

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

// A rack of tokens, one lit for each club you've joined (the latest six), and the next one catching as
// you get closer to it. What a token is depends on the theme: a candle, a signal lamp, a jar, a plate.
function token(kind, cx, glow, next) {
  const op = next ? (0.25 + glow * 0.75).toFixed(2) : 1, on = glow > 0.02;
  if (kind === 'lamp') return '<rect x="' + (cx - 2) + '" y="70" width="4" height="42" fill="var(--muted)"/>' +
    '<rect x="' + (cx - 14) + '" y="36" width="28" height="36" rx="7" fill="var(--ink)"/>' +
    '<circle cx="' + cx + '" cy="54" r="9" fill="var(--chip)"/>' +
    (on ? '<g opacity="' + op + '"><circle cx="' + cx + '" cy="54" r="16" fill="var(--gold)" opacity=".22"/><circle cx="' + cx + '" cy="54" r="9" fill="var(--gold)"/><circle cx="' + (cx - 3) + '" cy="51" r="2.6" fill="#fff" opacity=".7"/></g>' : '');
  if (kind === 'jar') { const h = Math.round(40 * (next ? glow : 1));
    return '<rect x="' + (cx - 15) + '" y="64" width="30" height="48" rx="8" fill="var(--card)" stroke="var(--line)" stroke-width="1.5"/>' +
      (on ? '<rect x="' + (cx - 11) + '" y="' + (108 - h) + '" width="22" height="' + h + '" rx="5" fill="var(--gold)" opacity="' + (next ? 0.75 : 0.9) + '"/>' : '') +
      '<rect x="' + (cx - 13) + '" y="56" width="26" height="9" rx="3" fill="var(--accent)"/>'; }
  if (kind === 'plate') return '<circle cx="' + cx + '" cy="88" r="21" fill="var(--chip)" stroke="var(--line)" stroke-width="1.5"/>' +
    (on ? '<circle cx="' + cx + '" cy="88" r="21" fill="var(--accent)" opacity="' + (next ? (0.15 + glow * 0.6).toFixed(2) : 1) + '"/>' : '') +
    '<circle cx="' + cx + '" cy="88" r="5" fill="var(--card)"/>';
  return '<rect x="' + (cx - 15) + '" y="70" width="30" height="42" rx="7" fill="var(--accent-soft)" stroke="var(--line)" stroke-width="1.5"/>' +
    '<rect x="' + (cx - 10) + '" y="76" width="20" height="34" rx="4" fill="var(--card)"/>' +
    '<path d="M' + cx + ' 76 V69" stroke="var(--muted)" stroke-width="1.6" stroke-linecap="round"/>' +
    (on ? '<g opacity="' + op + '" transform="translate(' + cx + ' 68) scale(' + (next ? (0.5 + glow * 0.5).toFixed(2) : 1) + ')">' +
      '<path d="M0 -24 C 8 -14, 9 -6, 0 0 C -9 -6, -8 -14, 0 -24 Z" fill="var(--gold)"/><path d="M0 -13 C 4 -8, 4 -4, 0 -1 C -4 -4, -4 -8, 0 -13 Z" fill="#fff" opacity=".7"/></g>' : '');
}
function candlesSVG(lit, ratio, label) {
  const shown = Math.min(lit, 6), n = shown + 1, W = 320, H = 130, gap = W / 7, x0 = (W - gap * n) / 2;
  let s = '<svg class="candles" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">' +
    '<rect x="8" y="112" width="' + (W - 16) + '" height="8" rx="3" fill="var(--chip)"/><rect x="20" y="120" width="6" height="10" fill="var(--chip)"/><rect x="' + (W - 26) + '" y="120" width="6" height="10" fill="var(--chip)"/>';
  for (let i = 0; i < n; i++) {
    const cx = x0 + gap * i + gap / 2, next = i === n - 1, glow = next ? Math.max(0, Math.min(1, ratio)) : 1;
    s += token(T.token, cx, glow, next);
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
  const [cat, recent, days, bests, routines, seasons, names, myId, wdays, bw] = await Promise.all([
    store.catalog(), store.setsSince(L.addDays(today(), -RECENT_DAYS)), store.days(), store.bests(),
    store.routines(), store.seasons(), store.memberNames(), store.userId(),
    store.workoutDays(today()), store.bodyweights(),
  ]);
  S.wdays = wdays;
  S.bw = bw;
  if (bw.length && prefs.bodyweight == null && bw[0].unit === prefs.unit) prefs.bodyweight = Number(bw[0].weight);
  setRoutines(routines);
  S.seasons = seasons.seasons;
  S.goals = seasons.goals;
  S.seasonSubs = seasons.subs || [];
  S.plan = seasons.plan || [];
  S.standings = {};
  S.names = new Map(names.map(n => [n.user_id, n.display_name]));
  S.myId = myId;
  S.exercises = cat.exercises;
  S.byId = new Map(cat.exercises.map(e => [e.id, e]));
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
  const tab = ['log', 'routines', 'history', 'seasons', 'progress'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'log';
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + tab ? 'page' : 'false'));
  if (tab !== currentTab) window.scrollTo(0, 0);
  $('fab').hidden = tab !== 'log';   // only on Log, so it never covers buttons elsewhere
  currentTab = tab;
  $('pageTitle').textContent = T.titles[tab];
  render();
}
function render() {
  syncTabDot();
  if (currentTab === 'history') renderHistory();
  else if (currentTab === 'progress') renderProgress();
  else if (currentTab === 'seasons') renderSeasons();
  else if (currentTab === 'routines') renderRoutines();
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
  const sets = todaySets();
  const vol = L.volumeByUnit(sets);
  const weekVisits = S.days.filter(d => d.performed_on > L.addDays(today(), -7) && d.sets > 0).length;
  const groups = groupByExercise(sets);
  const hello = sets.length ? (sets.length >= 15 ? T.helloBig : T.helloSome) : 'Today';
  view.innerHTML =
    '<section class="card hero"><div class="date">' + esc(fmtDay(today(), { weekday: 'long', month: 'long', day: 'numeric' })) + '</div>' +
    '<h1>' + hello + '</h1><div class="stats">' +
      '<div class="stat"><b>' + esc(volText(vol)) + '</b><small>moved today</small></div>' +
      '<div class="stat"><b>' + sets.length + '</b><small>set' + (sets.length === 1 ? '' : 's') + '</small></div>' +
      '<div class="stat"><b>' + weekVisits + '</b><small>visit' + (weekVisits === 1 ? '' : 's') + ' this week</small></div>' +
    '</div>' + countsLine() + (groups.length ? sessionClock() + '<button class="btn primary finish-btn" data-recap>' + esc(T.finish) + '</button>' : '') + '</section>' +
    weeklyCard() +
    (todaysDays().length ? dayCard() : planCard()) +
    followCard() +
    (groups.length ? groups.map(exCard).join('') : (following() ? '' : emptyToday())) +
    (groups.length && !following() ? '<button class="btn block" style="margin-top:14px" data-save-day="' + today() + '">Make a workout from today</button>' : '') +
    questsCard() +
    winsCard();
  loadWins();
  loadRecords();
  tickClock();
}
// Turn a day's lifting into a routine: one step per exercise, in the order you did them,
// with the number of working sets and your heaviest set's reps and weight.
async function saveDayAsRoutine(day, btn) {
  const sets = (day === today() ? todaySets() : S.dayCache.get(day) || []).filter(s => s.is_warmup !== true);
  const groups = groupByExercise(sets);
  if (!groups.length) return toast('Nothing to save from that day.');
  btn.disabled = true;
  try {
    const t = await store.addRoutine({ name: nameFrom(groups.map(g => g.exercise_id)), kind: 'workout' });
    S.templates.push(t);
    let position = 0;
    for (const g of groups.slice(0, 100)) {
      const top = g.sets.reduce((a, s) => (Number(s.weight) > Number(a.weight) ? s : a));
      const it = await store.addItem({ template_id: t.id, exercise_id: g.exercise_id, position: ++position,
        sets: Math.min(20, g.sets.length), reps: Math.min(100, top.reps), load_mode: 'last', load_value: 0, unit: top.unit });
      S.items.push(it); S.itemsById.set(it.id, it);
    }
    toast('Saved as “' + t.name + '”. Rename it or tweak away.');
    openDesigner(t.id);
  } catch (x) { fail(x); btn.disabled = false; }
}
function exCard(g) {
  const v = L.volumeByUnit(g.sets);
  return '<section class="card ex-card"><div class="row"><h3>' + esc(exName(g.exercise_id)) + '</h3><span class="muted num">' + esc(volText(v)) + '</span></div>' +
    '<div class="chips">' + g.sets.map(s => '<button class="chip' + (s._pr ? ' pr' : '') + (s.is_warmup ? ' warm' : '') + '" data-edit="' + esc(s.id) + '" aria-label="Edit ' + esc(setText(s)) + '">' + (s._pr ? '🏆 ' : '') + esc(setText(s)) + '</button>').join('') + '</div>' +
    '<div class="actions"><button class="btn primary" data-again="' + esc(g.exercise_id) + '">+ Same again</button><button class="btn" data-more="' + esc(g.exercise_id) + '">Change it up</button></div></section>';
}
// Sets aren't logged "to" a season: a season is a date range, so today's sets count toward every
// season you're in that's running today. Say so where people log.
function countsLine() {
  const t = today();
  const live = (S.seasons || []).filter(x => inSeason(x) && x.starts_on <= t && t <= x.ends_on);
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
  else if (b.dataset.quickItem) quickStep(b.dataset.quickItem, b);
  else if (b.dataset.followItem) { const it = S.itemsById.get(b.dataset.followItem); if (it) openEntry(it.exercise_id, null, it); }
  else if (b.dataset.start) startFollowing(b.dataset.start);
  else if (b.dataset.saveDay) saveDayAsRoutine(b.dataset.saveDay, b);
  else if (b.dataset.seen) { const t = S.templates.find(x => x.id === b.dataset.seen); if (t) { markSeen(t); render(); } }
  else if (b.hasAttribute('data-stop-follow')) stopFollowing();
  else if (b.dataset.design) openDesigner(b.dataset.design);
  else if (b.hasAttribute('data-new-routine')) newRoutine(b, 'workout');
  else if (b.hasAttribute('data-new-block')) newRoutine(b, 'block');
  else if (b.dataset.fromBlock) workoutFromBlock(b.dataset.fromBlock, b);
  else if (b.dataset.schedule) openScheduleSheet(b.dataset.schedule);
  else if (b.dataset.unday) removeDay(b.dataset.unday, b);
  else if (b.hasAttribute('data-weigh')) weighIn(b);
  else if (b.dataset.bwDel) removeWeighIn(b.dataset.bwDel);
  else if (b.dataset.sub) subscribeTo(b.dataset.sub, b);
  else if (b.dataset.unsub) unsubscribeFrom(b.dataset.unsub, b);
  else if (b.dataset.copy) copyRoutine(b.dataset.copy, b);
  // seasons
  else if (b.dataset.season) openSeason(b.dataset.season);
  else if (b.hasAttribute('data-season-back')) { S.seasonOpen = null; renderSeasons(); window.scrollTo(0, 0); }
  else if (b.hasAttribute('data-programs')) openStarters();
  else if (b.dataset.editSeason) openSeasonSheet(b.dataset.editSeason);
  else if (b.hasAttribute('data-new-season')) openWizard();
  else if (b.hasAttribute('data-new-any')) openNewChooser();
  else if (b.dataset.rerun) openWizard(seasonById(b.dataset.rerun));
  else if (b.dataset.joinSeason) joinSeason(b.dataset.joinSeason, b);
  else if (b.dataset.link) copyLink(b.dataset.link);
  else if (b.hasAttribute('data-recap')) openRecap();
  else if (b.hasAttribute('data-week-seen')) { try { localStorage.setItem('lift.weekSeen', b.dataset.weekSeen); } catch (e) {} render(); }
  else if (b.hasAttribute('data-share-wins')) { prefs.shareWins = prefs.shareWins === false; savePrefs(); render(); toast(prefs.shareWins ? 'Your wins go to the crew again.' : 'Your wins stay private from now on.'); }
  else if (b.dataset.winDel) removeWin(b.dataset.winDel);
  else if (b.dataset.trend) { S.trendEx = b.dataset.trend; S.hist = S.hist || new Map(); location.hash = '#progress'; setTimeout(() => { const t = $('trendBox'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 200); }
  else if (b.dataset.myGoals) openSeasonSheet(b.dataset.myGoals);
  else if (b.hasAttribute('data-starters')) openStarters();
  else if (b.dataset.calMove) { const [y, mo] = S.cal.month.split('-').map(Number); const d = new Date(y, mo - 1 + Number(b.dataset.calMove), 1); S.cal.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); renderHistory(); }
  else if (b.dataset.calDay) selectCalDay(b.dataset.calDay);
  else if (b.dataset.calSchedule) openWorkoutPicker(b.dataset.calSchedule);
  else if (b.dataset.leaveSeason) leaveSeason(b.dataset.leaveSeason, b);
});
$('fab').addEventListener('click', () => openLogger());
$('navLog').addEventListener('click', () => { if (location.hash !== '#log' && location.hash !== '') location.hash = '#log'; openLogger(); });
const findSet = id => S.recent.find(s => s.id === id) || [...S.dayCache.values()].flat().find(s => s.id === id);

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
  const sets = S.recent.filter(x => x.exercise_id === exId && x.is_warmup !== true);
  if (!sets.length) return null;
  const before = sets.filter(x => x.performed_on < today());
  const pool = before.length ? before : sets;
  const day = pool.reduce((m, x) => (x.performed_on > m ? x.performed_on : m), '');
  return { day, sets: pool.filter(x => x.performed_on === day) };
}
function suggestFor(it) {
  const reps = it.reps, mode = it.load_mode || 'last';
  if (mode === 'percent_1rm') {
    const ls = lastSession(it.exercise_id), unit = ls ? ls.sets[0].unit : it.unit || prefs.unit;
    const basis = L.bestE1rm(it.exercise_id, unit, S.bestRows);
    return basis ? { weight: roundNear(basis * Number(it.load_value) / 100, unit), unit, reps, why: Number(it.load_value) + '% of your best' }
      : { weight: null, unit, reps, why: Number(it.load_value) + '% of your best, once you’ve logged it' };
  }
  const ls = lastSession(it.exercise_id);
  let ref = null;
  if (ls) ref = ls.sets.reduce((m, x) => (Number(x.weight) > Number(m.weight) ? x : m), ls.sets[0]);
  else {   // older than what's loaded: your best set by estimated 1-rep max
    const rows = S.bestRows.filter(r => r.exercise_id === it.exercise_id);
    if (rows.length) { const r = rows.reduce((m, x) => ((L.e1rm(Number(x.heaviest), x.reps) || Number(x.heaviest)) > (L.e1rm(Number(m.heaviest), m.reps) || Number(m.heaviest)) ? x : m)); ref = { weight: r.heaviest, reps: r.reps, unit: r.unit }; }
  }
  if (!ref) return { weight: null, unit: it.unit || prefs.unit, reps, why: 'first time: enter a weight' };
  const unit = ref.unit, w0 = Number(ref.weight);
  let weight = w0, why = 'your last';
  if (w0 > 0 && ref.reps !== reps) {
    const e = L.e1rm(w0, ref.reps) || w0 * (1 + ref.reps / 30);
    weight = roundDown(e / (1 + reps / 30), unit);
    why = 'from your last ' + ref.reps + ' × ' + L.fmtLoad(w0);
  }
  if (mode === 'progress' && ls && w0 > 0) {
    const hit = ls.sets.filter(x => Number(x.weight) >= w0 && x.reps >= reps).length >= it.sets;
    if (hit) { weight = w0 + Number(it.load_value); why = '+' + L.fmtLoad(Number(it.load_value)) + ': you hit every rep last time'; }
    else if (ref.reps >= reps) { weight = w0; why = 'same again until you hit every rep'; }
  }
  return { weight, unit, reps, why };
}
// "3 × 8", plus the rule when it isn't plain "your last".
const ruleTag = it => (it.load_mode === 'progress' ? ' · +' + L.fmtLoad(Number(it.load_value)) : it.load_mode === 'percent_1rm' ? ' · ' + L.fmtNum(Number(it.load_value), 0) + '%' : '');
const stepText = it => it.sets + ' × ' + it.reps + ruleTag(it);
// For the person following: the step with their own weight.
const loadText = g => (g.weight == null ? '' : g.weight > 0 ? L.fmtLoad(g.weight) + ' ' + g.unit : 'bodyweight');
const myStepText = it => { const g = suggestFor(it); return it.sets + ' × ' + it.reps + (g.weight != null ? (g.weight > 0 ? ' @ ' : ' · ') + loadText(g) : ''); };

// Log what's left of a routine step at its planned reps and weight, in one tap.
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
    const saved = await logSets({ exercise_id: it.exercise_id, weight: tg.weight, reps: tg.reps, unit: tg.unit,
      count_bodyweight: bw, bodyweight: bw ? last.bodyweight : null, is_warmup: false }, left);
    afterLogToast(saved);
    render();
  } catch (x) { fail(x); btn.disabled = false; render(); }
}
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
    startRest(restFor(last.reps));
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
  if (beatsBest) postWin('pr', exName(saved.exercise_id) + ' PR', { weight: Number(saved.weight), reps: saved.reps, unit: saved.unit });
  if (crossed) postWin('club', crossed.title, {});
  checkGoalWins();
  checkRecord(saved);
  checkQuestWins();
  prefs.unit = saved.unit;
  if (saved.count_bodyweight) prefs.bodyweight = Number(saved.bodyweight);
  savePrefs();
  return { saved };
}
// Log `count` identical sets in one go (3 × 8 @ 150 is one tap). Returns what was saved.
async function logSets(fields, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push((await logSet(fields)).saved);
  return out;
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
async function removeSets(list) {
  for (const s of list) if (s._pr) unpostWin('pr', exName(s.exercise_id) + ' PR', s.performed_on);
  try {
    for (const s of list) { const gone = await store.deleteSet(s.id); syncCaches(gone, true); bumpDay(s, -1); }
  } catch (x) { fail(x); }
  refreshBests(); render(); refreshLoggerList();
  toast('Undone');
}
async function removeSet(s, quiet) {
  if (s._pr) unpostWin('pr', exName(s.exercise_id) + ' PR', s.performed_on);   // undoing a PR takes its line back
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
// Sheets with something to type in (search, routine editor, seasons) open full height,
// so the text box sits at the top instead of down where the phone keyboard pops up.
function openSheet() {
  sheet.querySelector('.sheet').classList.toggle('tall', ['pick', 'design', 'season', 'chunk', 'starters', 'program', 'pickwk', 'wizard'].includes(LG.mode));
  if (!sheet.open) sheet.showModal();
}
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

// "3 × 5 @ 235, 1 × 4 @ 235": runs of identical working sets collapsed.
function summarizeSets(sets) {
  const runs = [];
  for (const x of sets.filter(y => y.is_warmup !== true)) {
    const last = runs[runs.length - 1], key = x.reps + '|' + Number(x.weight) + '|' + x.unit;
    if (last && last.key === key) last.n++; else runs.push({ key, n: 1, x });
  }
  return runs.map(r => r.n + ' × ' + r.x.reps + (Number(r.x.weight) > 0 ? ' @ ' + L.fmtLoad(Number(r.x.weight)) + ' ' + r.x.unit : '')).join(', ') || sets.map(setText).join(', ');
}
async function openEntry(exId, editing, item) {
  LG.mode = editing ? 'edit' : 'entry';
  LG.exId = exId;
  LG.editing = editing || null;
  LG.item = editing ? null : item || null;
  const base = editing || todaySets().filter(s => s.exercise_id === exId).pop();
  const unit = base ? base.unit : prefs.unit;
  const st = LG.st = {
    weight: base ? Number(base.weight) : null,   // filled from your last time below; a lift you've never done starts empty
    reps: base ? base.reps : 8, unit,
    bw: base ? !!base.count_bodyweight : !!(S.byId.get(exId) || {}).supports_bodyweight,
    bodyweight: base && base.bodyweight != null ? Number(base.bodyweight) : prefs.bodyweight,
    warm: base ? base.is_warmup === true : false,
    note: editing ? editing.notes || '' : '', date: editing ? editing.performed_on : today(),
    showNote: !!(editing && editing.notes),
    // How many sets one tap logs: what's left of the routine step, 1 if you're already going today, else 3 until last time is known.
    sets: item ? Math.max(1, item.sets - stepDone(item)) : base ? 1 : 3,
  };
  // Following a routine: the step's sets and reps, with your own weight for it (unless you're mid-way today).
  const target = LG.item ? suggestFor(LG.item) : null;
  if (target) {
    st.reps = target.reps;
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
      '<p class="last-line" id="lastLine">' + (editing ? 'Editing a set from ' + esc(fmtDay(editing.performed_on)) : 'Looking up last time…') + '</p>' +
      '<div class="trio' + (editing ? ' two' : '') + '">' +
        '<label class="box"><span>Weight <i id="wUnit">' + esc(st.unit) + '</i></span><input id="wIn" inputmode="decimal" enterkeyhint="done" placeholder="–" value="' + esc(st.weight == null ? '' : L.fmtLoad(st.weight)) + '"></label>' +
        '<label class="box"><span>Reps</span><input id="rIn" inputmode="numeric" enterkeyhint="done" value="' + esc(st.reps) + '"></label>' +
        (editing ? '' : '<label class="box"><span>Sets</span><input id="nIn" inputmode="numeric" enterkeyhint="done" value="' + esc(st.sets) + '"></label>') +
      '</div>' +
      (editing ? '<div class="field-label"><span>Day</span></div><input class="plain-input" id="dateIn" type="date" value="' + esc(st.date) + '" max="' + today() + '">' : '') +
      '<div id="prFlag"></div><p class="warn" id="formErr" role="alert"></p>' +
      '<button class="btn primary block big" id="saveBtn">' + (editing ? 'Save changes' : 'Log set') + '</button>' +
      '<details class="more" id="moreBox"' + (st.bw || st.warm || st.showNote ? ' open' : '') + '><summary>More: units, warm-up, bodyweight, note</summary>' +
        '<div class="more-body">' +
          '<div class="row"><span class="seg" role="group" aria-label="Unit">' + ['lb', 'kg'].map(u => '<button type="button" data-unit="' + u + '" aria-pressed="' + (u === st.unit) + '">' + u + '</button>').join('') + '</span>' +
            '<span class="muted" style="font-size:13px">Fine-tune</span></div>' +
          '<div class="nudges" id="nudges" role="group" aria-label="Fine-tune the weight"></div>' +
          '<div class="hint-line" id="plates"></div>' +
          '<div class="toggles">' +
            '<button type="button" class="toggle" data-t="warm" aria-pressed="' + st.warm + '">Warm-up</button>' +
            '<button type="button" class="toggle" data-t="bw" aria-pressed="' + st.bw + '">Count bodyweight</button>' +
            '<button type="button" class="toggle" data-t="note" aria-pressed="' + st.showNote + '">Note</button></div>' +
          '<div id="bwRow"' + (st.bw ? '' : ' hidden') + '><div class="field-label"><span>Bodyweight</span><small>added to the load for volume</small></div>' +
            '<input class="plain-input" id="bwIn" inputmode="decimal" aria-label="Bodyweight" value="' + esc(st.bodyweight != null ? L.fmtLoad(st.bodyweight) : '') + '" placeholder="e.g. 180"></div>' +
          '<div id="noteRow"' + (st.showNote ? '' : ' hidden') + '><div class="field-label"><span>Note</span></div><input class="plain-input" id="noteIn" maxlength="300" value="' + esc(st.note) + '" placeholder="How did it feel?"></div>' +
          '<div id="bestLine"></div>' + tipLine(exId) +
        '</div></details>' +
      (editing ? '<button class="btn block ghost" style="margin-top:10px;color:var(--accent)" id="delBtn">Delete this set</button>' : '<div id="doneToday"></div>') +
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
    if (working && !base && (!LG.item || st.weight == null)) {
      const top = prev.filter(s => s.is_warmup !== true).reduce((a, s) => (Number(s.weight) > Number(a.weight) ? s : a), working);
      const same = prev.filter(s => s.is_warmup !== true && Number(s.weight) === Number(top.weight) && s.unit === top.unit).length;
      Object.assign(st, { weight: Number(top.weight), reps: top.reps, unit: top.unit, bw: !!top.count_bodyweight,
        bodyweight: top.bodyweight != null ? Number(top.bodyweight) : st.bodyweight, sets: Math.min(10, Math.max(1, same)) });
      syncInputs();
    }
    $('lastLine').innerHTML = prev.length
      ? 'Last time, ' + esc(fmtDay(prev[0].performed_on, { month: 'short', day: 'numeric' })) + ': <b>' + esc(summarizeSets(prev)) + '</b>'
      : 'First time logging this one. Type a weight to start.';
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
  $('wIn').value = st().weight == null ? '' : L.fmtLoad(st().weight);
  $('rIn').value = st().reps;
  if ($('nIn')) $('nIn').value = st().sets;
  inner.querySelectorAll('[data-unit]').forEach(b => b.setAttribute('aria-pressed', b.dataset.unit === st().unit));
  if ($('wUnit')) $('wUnit').textContent = st().unit;
  inner.querySelector('[data-t="bw"]').setAttribute('aria-pressed', st().bw);
  $('bwRow').hidden = !st().bw;
  if (st().bodyweight != null) $('bwIn').value = L.fmtLoad(st().bodyweight);
}
const st = () => LG.st;
function wireEntry() {
  $('wIn').addEventListener('input', () => { const v = L.parseLoad($('wIn').value); if (v != null) st().weight = v; updateLive(); });
  $('rIn').addEventListener('input', () => { const v = parseInt($('rIn').value, 10); if (v > 0) st().reps = v; updateLive(); });
  if ($('nIn')) { $('nIn').addEventListener('input', () => { const v = parseInt($('nIn').value, 10); if (v > 0) st().sets = Math.min(20, v); updateLive(); }); $('nIn').addEventListener('focus', () => $('nIn').select()); }
  $('bwIn').addEventListener('input', () => { st().bodyweight = L.parseLoad($('bwIn').value); });
  [$('wIn'), $('rIn')].forEach(i => i.addEventListener('focus', () => i.select()));
  inner.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('saveBtn').click(); } }));
}
function updateLive() {
  const s = st();
  const btn = $('saveBtn');
  if (btn && LG.mode === 'entry' && !btn.disabled) {
    const load = s.weight > 0 ? ' @ ' + L.fmtLoad(s.weight) + ' ' + s.unit : s.weight == null ? ' (enter a weight)' : '';
    btn.textContent = s.sets > 1 ? 'Log ' + s.sets + ' × ' + s.reps + load : 'Log ' + s.reps + ' rep' + (s.reps === 1 ? '' : 's') + load;
  }
  // plates, for barbell-ish loads
  const pl = s.weight != null && s.weight >= L.BAR[s.unit] ? L.plateLoadout(s.weight, L.BAR[s.unit], L.PLATES[s.unit]) : null;
  $('plates').textContent = pl && pl.perSide.length
    ? 'Plates per side on a ' + L.BAR[s.unit] + ' ' + s.unit + ' bar: ' + pl.perSide.map(L.fmtLoad).join(' · ') + (Math.abs(pl.total - s.weight) > 1e-6 ? ' (= ' + L.fmtLoad(pl.total) + ')' : '')
    : '';
  // PR flag
  const probe = { exercise_id: LG.exId, unit: s.unit, reps: s.reps, weight: s.weight, is_warmup: s.warm };
  const prev = S.bests.get(L.bestKey(probe));
  const flag = $('prFlag');
  flag.innerHTML = LG.mode === 'entry' && !s.warm && prev != null && s.weight > prev
    ? '<div class="pr-flag">🏆 That’s a PR: your best at ' + s.reps + ' reps was ' + esc(L.fmtLoad(prev) + ' ' + s.unit) + '</div>' : '';
  const est = prev != null ? L.e1rm(prev, s.reps) : null;
  if ($('bestLine')) $('bestLine').innerHTML = prev != null ? '<p class="hint-line">Best at ' + s.reps + ' reps: <b>' + esc(L.fmtLoad(prev) + ' ' + s.unit) + '</b>' +
    (est ? ' · estimated 1-rep max ' + esc(L.fmtLoad(Math.round(est))) + ' ' + s.unit : '') + '</p>' : '';
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
  if (LG.mode === 'chunk') return chunkClick(b);
  if (LG.mode === 'recap') return recapClick(b);
  if (LG.mode === 'wizard') return wizardClick(b);
  if (LG.mode === 'newpick') return newPickClick(b);
  if (LG.mode === 'starters') return starterClick(b);
  if (LG.mode === 'program') return programClick(b);
  if (LG.mode === 'pickwk') return pickWkClick(b);
  if (LG.mode === 'sched') return schedClick(b);
  if (LG.mode === 'design') return designerClick(b);
  if (LG.mode === 'season') return seasonClick(b);
  if (LG.mode !== 'entry' && LG.mode !== 'edit') return;
  const s = st();
  if (b.dataset.unit && b.dataset.unit !== s.unit) {
    const factor = b.dataset.unit === 'kg' ? 1 / L.LB_PER_KG : L.LB_PER_KG;
    if (s.weight != null) s.weight = Math.round(s.weight * factor * 2) / 2;
    if (s.bodyweight != null) s.bodyweight = Math.round(s.bodyweight * factor * 2) / 2;
    s.unit = b.dataset.unit;
    syncInputs(); updateLive(); return;
  }
  if (b.dataset.w) { s.weight = Math.max(0, Math.round(((s.weight || 0) + Number(b.dataset.w) * (s.unit === 'kg' ? 2.5 : 5)) * 4) / 4); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.nudge) { s.weight = Math.min(2000, Math.max(0, Math.round(((s.weight || 0) + Number(b.dataset.nudge)) * 4) / 4)); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.r) { s.reps = Math.max(1, Math.min(1000, s.reps + Number(b.dataset.r))); syncInputs(); updateLive(); vibrate(5); return; }
  if (b.dataset.n) { s.sets = Math.max(1, Math.min(20, s.sets + Number(b.dataset.n))); syncInputs(); updateLive(); vibrate(5); return; }
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
  if (weight == null) throw new Error('Enter a weight. Use 0 for bodyweight moves.');
  if (weight < 0 || weight > 2000) throw new Error('Enter a weight between 0 and 2000.');
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
      const n = Math.max(1, Math.min(20, parseInt(($('nIn') || {}).value, 10) || st().sets || 1));
      const saved = await logSets({ exercise_id: LG.exId, ...fields }, n);
      afterLogToast(saved);
      startRest(restFor(fields.reps, LG.item));
      if (fields.notes) { $('noteIn').value = ''; st().showNote = false; $('noteRow').hidden = true; inner.querySelector('[data-t="note"]').setAttribute('aria-pressed', 'false'); }
      st().sets = 1; syncInputs();   // the block is in; the next tap adds one more
      btn.disabled = false;
      refreshLoggerList(); updateLive(); render();
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
const isBlock = t => t.kind === 'block';
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
      const tg = full ? null : suggestFor(it);
      const quick = tg && tg.weight != null ? '<button class="quick" data-quick-item="' + esc(it.id) + '" aria-label="Log ' + (it.sets - d) + ' × ' + tg.reps + ' at ' + esc(L.fmtLoad(tg.weight)) + ' ' + tg.unit + ', as planned">✓</button>' : '';
      return '<li class="step-row"><button class="step' + (full ? ' done' : i === nextIdx ? ' next' : '') + '" data-follow-item="' + esc(it.id) + '">' +
        '<span class="tick" aria-hidden="true">' + (full ? '✓' : i + 1) + '</span>' +
        '<span class="what"><b>' + esc(exName(it.exercise_id)) + '</b><small>' + esc(myStepText(it)) + '</small></span>' +
        '<span class="count num">' + Math.min(d, it.sets) + '/' + it.sets + '</span></button>' + quick + '</li>';
    }).join('') + '</ol>' +
    (nextIdx < 0 && f.items.length ? '<div class="pr-flag" style="animation:none">' + esc(T.routineDone) + '</div><button class="btn primary block" style="margin-top:10px" data-recap>' + esc(T.finish) + '</button>'
      : '<p class="hint-line">Tap ✓ to log a step exactly as planned, or tap the step to adjust first.</p>') +
    '<div class="actions"><button class="btn ghost" data-stop-follow>Stop following</button></div></section>';
}

function renderRoutines() {
  const workouts = S.templates.filter(t => !isBlock(t)), blocks = S.templates.filter(isBlock);
  const mine = workouts.filter(isMine);
  const subscribed = workouts.filter(t => !isMine(t) && subFor(t.id));
  const shared = workouts.filter(t => !isMine(t) && !subFor(t.id));
  const f = following();
  const start = t => routineItems(t.id).length
    ? '<button class="btn primary" data-start="' + esc(t.id) + '">' + (f && f.template.id === t.id ? 'Following ✓' : 'Start') + '</button>' : '';
  const sched = t => routineItems(t.id).length ? '<button class="btn" data-schedule="' + esc(t.id) + '">📅 Schedule</button>' : '';
  const card = (t, actions) => {
    const changes = routineChanges(t);
    return '<section class="card routine' + (isBlock(t) ? ' block' : '') + (changes ? ' updated' : '') + '" id="rt-' + esc(t.id) + '"><div class="row"><h3>' + esc(t.name) + '</h3>' +
      (changes ? '<span class="tag new">Updated</span>' : isMine(t) ? (t.is_shared ? '<span class="tag">Shared</span>' : '') : '<span class="tag">by ' + esc(ownerName(t)) + '</span>') + '</div>' +
    (changes ? '<p class="changes"><b>' + esc(ownerName(t)) + ' changed it:</b> ' + esc(changes.slice(0, 4).join(' · ')) + (changes.length > 4 ? ' · and ' + (changes.length - 4) + ' more' : '') + '</p>' : '') +
    (t.notes ? '<p class="muted" style="margin:6px 0 0">' + esc(t.notes) + '</p>' : '') +
    '<div class="chips">' + (routineItems(t.id).map(it => '<span class="chip">' + esc(exName(it.exercise_id)) + ' <small>' + esc(stepText(it)) + '</small></span>').join('') || '<span class="muted">No exercises yet</span>') + '</div>' +
    '<div class="actions">' + actions + (changes ? '<button class="btn ghost" data-seen="' + esc(t.id) + '">Got it</button>' : '') +
      (t.is_shared || !isMine(t) ? '<button class="btn ghost" data-link="r-' + esc(t.id) + '" aria-label="Copy a link to ' + esc(t.name) + '">🔗</button>' : '') + '</div></section>';
  };
  view.innerHTML =
    '<div class="row page-actions"><h2 style="font-size:28px">' + esc(T.titles.routines) + '</h2><span class="head-actions"><button class="btn" data-starters>📚 Starters</button><button class="btn primary" data-new-any>+ New</button></span></div>' +
    comingUp() +
    '<h3 class="section-title">Workouts</h3>' +
    (mine.length ? mine.map(t => card(t, start(t) + sched(t) + '<button class="btn" data-design="' + esc(t.id) + '">Edit</button>')).join('')
      : '<section class="card empty"><h2>No workouts yet.</h2><p class="muted">Tap <b>+ Workout</b> and build one from blocks, or subscribe to one the crew shares.</p></section>') +
    (subscribed.length ? '<h3 class="section-title">Subscribed</h3>' + subscribed.map(t => card(t, start(t) + sched(t) +
      '<button class="btn" data-copy="' + esc(t.id) + '">Make it mine</button><button class="btn ghost" data-unsub="' + esc(subFor(t.id).id) + '">Unsubscribe</button>')).join('') : '') +
    (shared.length ? '<h3 class="section-title">Shared by the crew</h3>' + shared.map(t => card(t,
      '<button class="btn primary" data-sub="' + esc(t.id) + '">Subscribe</button>' + sched(t) + '<button class="btn" data-copy="' + esc(t.id) + '">Copy</button>')).join('') : '') +
    '<h3 class="section-title">Blocks</h3><p class="hint-line" style="margin-top:-4px">Small chunks you reuse, like “Bench & triceps”. Stack them into a workout with <b>+ Blocks</b> in the workout editor.</p>' +
    (blocks.length ? blocks.sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name)).map(t => card(t,
      '<button class="btn" data-from-block="' + esc(t.id) + '">New workout from it</button>' +
      (isMine(t) ? '<button class="btn" data-design="' + esc(t.id) + '">Edit</button>' : '<button class="btn" data-copy="' + esc(t.id) + '">Copy</button>'))).join('')
      : '<section class="card"><p class="muted" style="margin:0">No blocks yet. Tap <b>+ Block</b> to make one.</p></section>');
}
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
  const sets = S.recent.filter(x => x.exercise_id === exId && x.is_warmup !== true);
  if (!sets.length) return { sets: 3, reps: 8, unit: prefs.unit };
  const perDay = new Map(), reps = new Map();
  for (const x of sets) { perDay.set(x.performed_on, (perDay.get(x.performed_on) || 0) + 1); reps.set(x.reps, (reps.get(x.reps) || 0) + 1); }
  const counts = [...perDay.values()].sort((a, b) => a - b);
  return { sets: Math.min(10, Math.max(1, counts[Math.floor(counts.length / 2)])), reps: [...reps.entries()].sort((a, b) => b[1] - a[1])[0][0], unit: sets[0].unit };
}
async function newRoutine(btn, kind) {
  if (btn) btn.disabled = true;
  try {
    const t = await store.addRoutine({ name: kind === 'block' ? 'New block' : 'New workout', kind: kind || 'workout' });
    S.templates.push(t);
    openDesigner(t.id);
    setTimeout(() => { const q = $('qaIn'); if (q) q.focus(); }, 80);   // the name fills itself in from what you add
  } catch (x) { fail(x); } finally { if (btn) btn.disabled = false; }
}
async function copySteps(fromIds, tid) {
  let pos = Math.max(0, ...routineItems(tid).map(i => i.position));
  for (const id of fromIds) {
    const src = S.itemsById.get(id);
    if (!src) continue;
    const it = await store.addItem({ template_id: tid, exercise_id: src.exercise_id, position: ++pos, sets: src.sets, reps: src.reps,
      load_mode: src.load_mode, load_value: src.load_value, unit: src.unit, rest_s: src.rest_s ?? null, note: src.note ?? null });
    S.items.push(it); S.itemsById.set(it.id, it);
  }
}
async function workoutFromBlock(blockId, btn) {
  const b = S.templates.find(t => t.id === blockId);
  btn.disabled = true;
  try {
    const t = await store.addRoutine({ name: (b.name + ' day').slice(0, 60), kind: 'workout' });
    S.templates.push(t);
    await copySteps(routineItems(blockId).map(i => i.id), t.id);
    toast('Started a workout from “' + b.name + '”. Add more blocks with + Blocks.');
    openDesigner(t.id, true);
  } catch (x) { fail(x); btn.disabled = false; }
}

// ----- workout days: put a workout on a date, and it's waiting on the Log tab that day -----
const dayLabel = d => (d === today() ? 'Today' : d === L.addDays(today(), 1) ? 'Tomorrow' : fmtDay(d));
const todaysDays = () => (S.wdays || []).filter(d => d.on_date === today() && tplById(d.template_id));
function comingUp() {
  const list = (S.wdays || []).filter(d => d.on_date >= today() && tplById(d.template_id)).slice(0, 10);
  if (!list.length) return '';
  return '<h3 class="section-title">Coming up</h3><section class="card coming">' + list.map(d => {
    const t = tplById(d.template_id);
    return '<div class="row day-row"><span><b>' + esc(dayLabel(d.on_date)) + '</b> · ' + esc(t.name) + '</span><span>' +
      (d.on_date === today() ? '<button class="btn primary sm" data-start="' + esc(t.id) + '">Start</button>' : '') +
      '<button class="iconbtn sm" data-unday="' + esc(d.id) + '" aria-label="Take ' + esc(t.name) + ' off ' + esc(dayLabel(d.on_date)) + '">✕</button></span></div>';
  }).join('') + '</section>';
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
    '<div class="sheet-body"><p class="hint-line" style="margin-top:0">Tap the days you’ll do it. On the day it’s waiting at the top of Log, ready to follow.</p>' +
      '<div class="cal">' + days.map(d => {
        const dt = L.parseDate(d);
        return '<button type="button" data-sched-day="' + d + '" aria-pressed="' + !!on(d) + '"><small>' + (d === today() ? 'Today' : dt.toLocaleDateString('en-US', { weekday: 'short' })) + '</small><b>' + dt.getDate() + '</b></button>';
      }).join('') + '</div>' +
      '<div class="goal-add plan-add" style="margin-top:12px"><input class="plain-input" id="schedDate" type="date" min="' + today() + '" max="' + L.addDays(today(), 365) + '" aria-label="Another day"><button class="btn" id="schedAdd" type="button">Add day</button></div>' +
      (later.length ? '<p class="hint-line">Also on: ' + later.map(x => esc(fmtDay(x.on_date))).join(', ') + '</p>' : '') +
      '<button class="btn primary block" style="margin-top:16px" data-close>Done</button>' +
    '</div>';
}
async function schedClick(b) {
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
    const t = await store.addRoutine({ name: (src.name + (isMine(src) ? ' (copy)' : '')).slice(0, 60), notes: src.notes || null, kind: src.kind || 'workout' });
    S.templates.push(t);
    for (const it of routineItems(id)) {
      const n = await store.addItem({ template_id: t.id, exercise_id: it.exercise_id, position: it.position, sets: it.sets, reps: it.reps,
        load_mode: it.load_mode, load_value: it.load_value, unit: it.unit, rest_s: it.rest_s ?? null, note: it.note ?? null });
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
  if (D.id !== id) D.open = null;
  D.id = id; LG.mode = 'design'; LG.pickFor = null; LG.multi = null;
  inner.innerHTML =
    '<div class="sheet-head"><input class="title-input" id="rtName" maxlength="60" value="' + esc(t.name) + '" aria-label="Routine name" enterkeyhint="done"><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body design-body">' +
      '<div class="design-meta">' +
        '<span class="seg" role="group" aria-label="This is a">' + [['workout', 'Workout'], ['block', 'Block']].map(([k, l]) =>
          '<button type="button" data-kind="' + k + '" aria-pressed="' + ((t.kind || 'workout') === k) + '">' + l + '</button>').join('') + '</span>' +
        '<button type="button" class="toggle" id="rtShare" aria-pressed="' + !!t.is_shared + '">' + (t.is_shared ? '✓ Shared with the crew' : 'Share with the crew') + '</button>' +
        (t.notes ? '' : '<button type="button" class="toggle" id="rtNoteBtn">+ Add a note</button>') +
      '</div>' +
      '<textarea class="plain-input" id="rtNotes" rows="2" maxlength="500" placeholder="Notes: warm-up, rest times, anything" aria-label="Notes"' + (t.notes ? '' : ' hidden') + '>' + esc(t.notes || '') + '</textarea>' +
      '<div class="quick-add"><input class="plain-input" id="qaIn" placeholder="Type to add: bench 3x5, ohp 3x8, rows" aria-label="Type exercises to add" enterkeyhint="go" autocomplete="off">' +
        '<button type="button" class="btn" id="qaGo">Add</button></div>' +
      '<ol class="items" id="rtItems"></ol>' +
      '<p class="hint-line" id="rtHint"></p>' +
      '<button type="button" class="linkbtn danger" id="rtDelete">Delete this routine</button>' +
    '</div>' +
    '<div class="design-foot"><button class="btn" id="rtAdd">+ Exercises</button><button class="btn" id="rtFrom">+ Blocks</button><button class="btn primary" data-start="' + esc(id) + '" id="rtStart">Start ▸</button></div>';
  openSheet();
  drawItems();
  const name = $('rtName'), notes = $('rtNotes');
  name.addEventListener('input', () => debounceSave('name', () => saveRoutine({ name: name.value.trim() || 'Untitled routine' })));
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
  $('qaIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('qaGo').click(); } });
  notes.addEventListener('input', () => debounceSave('notes', () => saveRoutine({ notes: notes.value.trim() || null })));
  if (fresh) setTimeout(() => { name.focus(); name.select(); }, 60);
}
function drawItems() {
  const list = routineItems(D.id), t = S.templates.find(x => x.id === D.id);
  $('rtItems').innerHTML = list.length ? list.map(itemRow).join('')
    : '<li class="empty-steps"><b>No exercises yet.</b><br>Tap <b>+ Exercises</b> below and tick the ones you do, in order, or stack up blocks with <b>+ Blocks</b>.</li>';
  $('rtStart').disabled = !list.length;
  $('rtHint').textContent = (list.length > 1 ? 'Tap a step to change it. Drag ⠿ to reorder. ' : list.length ? 'Tap the step to change it. ' : '') +
    'Saves as you go.' + (t && t.is_shared ? ' Anyone subscribed sees changes straight away.' : '');
}
// One line per step; tap it to open big controls for that step (one open at a time).
function itemSummary(it) {
  const g = suggestFor(it);
  return stepText(it) + (g.weight != null ? ' · you: ' + loadText(g) : '');
}
function itemRow(it) {
  const open = D.open === it.id;
  return '<li class="item' + (open ? ' open' : '') + '" data-item="' + esc(it.id) + '">' +
    '<div class="item-head"><button type="button" class="handle" data-handle aria-label="Move ' + esc(exName(it.exercise_id)) + ' (drag, or use the arrow keys)">⠿</button>' +
      '<button type="button" class="item-sum" data-toggle-item aria-expanded="' + open + '"><b>' + esc(exName(it.exercise_id)) + '</b>' +
        '<span class="sum">' + esc(itemSummary(it)) + '</span></button>' +
      '<span class="chev" aria-hidden="true">' + (open ? '▴' : '▾') + '</span></div>' +
    (open ?
      '<div class="item-edit">' +
        '<div class="two">' + bigStep('Sets', 'sets', it.sets) + bigStep('Reps', 'reps', it.reps) + '</div>' +
        '<div class="field-label"><span>Weight</span><span class="seg" role="group" aria-label="Weight rule">' + [['last', 'Your last'], ['progress', '+ when hit'], ['pct', '% of best']].map(([k, l]) =>
          '<button type="button" data-loadmode="' + k + '" aria-pressed="' + ((it.load_mode === 'percent_1rm' ? 'pct' : it.load_mode) === k) + '">' + l + '</button>').join('') + '</span></div>' +
        (it.load_mode === 'percent_1rm' ? bigStep('% of each person’s best 1-rep max', 'load_value', L.fmtLoad(it.load_value), true)
          : it.load_mode === 'progress' ? bigStep('Add (' + it.unit + ') after a session with every rep hit', 'load_value', L.fmtLoad(it.load_value), true) : '') +
        '<p class="hint-line" data-pct-hint>' + esc(ruleHint(it)) + '</p>' +
        '<input class="plain-input step-note" data-note-for="' + esc(it.id) + '" maxlength="200" placeholder="Note for this step (optional)" value="' + esc(it.note || '') + '" aria-label="Note for this step">' +
        bigStep('Rest between sets (seconds)', 'rest_s', it.rest_s == null ? '' : it.rest_s, true) +
        '<div class="item-actions"><button type="button" data-swap>⇄ Swap</button><button type="button" data-dup>⧉ Duplicate</button><button type="button" class="danger" data-remove-item="' + esc(it.id) + '">✕ Remove</button></div>' +
      '</div>' : '') +
  '</li>';
}
function ruleHint(it) {
  const g = suggestFor(it);
  const base = it.load_mode === 'percent_1rm' ? 'Each person gets this percent of their own best.'
    : it.load_mode === 'progress' ? 'Each person starts from their own last weight and adds this after a session where they hit every rep.'
    : 'Each person uses their own last weight for this lift.';
  return base + ' You: ' + (g.weight != null ? loadText(g) + ' (' + g.why + ').' : g.why + '.');
}
function bigStep(label, field, value, wide) {
  return '<label class="bs' + (wide ? ' wide' : '') + '"><small>' + esc(label) + '</small><span>' +
    '<button type="button" data-step-field="' + field + '" data-d="-1" aria-label="Less ' + esc(label) + '">−</button>' +
    '<input data-field="' + field + '" inputmode="decimal" value="' + esc(value) + '" aria-label="' + esc(label) + '">' +
    '<button type="button" data-step-field="' + field + '" data-d="1" aria-label="More ' + esc(label) + '">+</button></span></label>';
}
const ITEM_BOUNDS = { sets: [1, 20], reps: [1, 100], rest_s: [0, 900] };
function clampItem(it, field, v) {
  if (field === 'load_value') return it.load_mode === 'percent_1rm' ? Math.min(150, Math.max(1, v)) : it.load_mode === 'progress' ? Math.min(50, Math.max(0.5, v)) : 0;
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
  li.querySelectorAll('input[data-field]').forEach(inp => { if (document.activeElement !== inp) inp.value = inp.dataset.field === 'load_value' ? L.fmtLoad(it.load_value) : it[inp.dataset.field]; });
  li.querySelector('.sum').textContent = itemSummary(it);
  const hint = li.querySelector('[data-pct-hint]');
  if (hint) hint.textContent = ruleHint(it);
}
// Add exercises to the end of a routine, each starting from your last numbers for it.
async function addItemsTo(tid, exIds) {
  try {
    for (const exId of exIds) {
      const list = routineItems(tid);
      const u = usualFor(exId);
      const it = await store.addItem({
        template_id: tid, exercise_id: exId, position: Math.min(100, (list.length ? Math.max(...list.map(i => i.position)) : 0) + 1),
        sets: u.sets, reps: Math.min(100, u.reps), load_mode: 'last', load_value: 0, unit: u.unit,
      });
      S.items.push(it); S.itemsById.set(it.id, it);
      if (exIds.length === 1) D.open = it.id;   // one added: open it, ready to set
    }
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
  const id = inp.closest('.item').dataset.item, it = S.itemsById.get(id), v = L.parseLoad(inp.value);
  if (v == null) return;
  queueItem(id, { [inp.dataset.field]: clampItem(it, inp.dataset.field, v) });
});
// Reuse part of another routine: tick steps from any routine you can see (yours or the crew's),
// and they're copied onto the end of this one with their sets, reps and load.
const CH = { picked: [] };
function openChunkPicker() {
  LG.mode = 'chunk'; CH.picked = [];
  const here = S.templates.find(x => x.id === D.id);
  const others = S.templates.filter(t => t.id !== D.id && routineItems(t.id).length)
    .sort((a, b) => Number(isBlock(b)) - Number(isBlock(a)) || Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name));
  inner.innerHTML =
    '<div class="sheet-head"><div><button class="btn ghost" style="padding:2px 0;border:0;color:var(--muted);font-size:14px" data-chunk-back>← Back to ' + esc(here ? here.name : 'the routine') + '</button>' +
      '<h2 id="sheetTitle">Add blocks</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      (others.length ? '<p class="hint-line" style="margin-top:0">Tick whole blocks, or just the steps you want, in the order you’ll do them. Sets, reps and load come too. You can also borrow from other workouts.</p>' +
        others.map((t, i) => (isBlock(t) !== isBlock(others[i - 1] || {}) || i === 0 ? '<div class="section-title">' + (isBlock(t) ? 'Blocks' : 'Workouts') + '</div>' : '') +
          '<section class="chunk"><div class="row"><h3>' + esc(t.name) + (isMine(t) ? '' : ' <small class="muted">by ' + esc(ownerName(t)) + '</small>') + '</h3>' +
          '<button type="button" class="linkbtn" data-chunk-all="' + esc(t.id) + '">' + (isBlock(t) ? 'Whole block' : 'Tick all') + '</button></div><ul class="results">' +
          routineItems(t.id).map(it => '<li><button data-chunk="' + esc(it.id) + '" aria-pressed="false"><span><i class="tickbox" aria-hidden="true"></i>' + esc(exName(it.exercise_id)) + '</span>' +
            '<small>' + esc(stepText(it)) + '</small></button></li>').join('') + '</ul></section>').join('')
        : '<p class="muted">No other routines with steps yet. Make one, or subscribe to one the crew shares.</p>') +
      '<div class="pick-foot"><button class="btn primary block" data-chunk-add disabled>Tick steps to add</button></div>' +
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
  add.disabled = !n;
  add.textContent = n ? 'Add ' + n + ' step' + (n === 1 ? '' : 's') : 'Tick steps to add';
}
async function chunkClick(b) {
  if (b.hasAttribute('data-chunk-back')) return openDesigner(D.id);
  if (b.dataset.chunk) {
    const id = b.dataset.chunk, i = CH.picked.indexOf(id);
    if (i >= 0) CH.picked.splice(i, 1); else CH.picked.push(id);
    vibrate(5); return drawChunk();
  }
  if (b.dataset.chunkAll) {
    const ids = routineItems(b.dataset.chunkAll).map(it => it.id);
    if (ids.every(id => CH.picked.includes(id))) CH.picked = CH.picked.filter(id => !ids.includes(id));
    else for (const id of ids) if (!CH.picked.includes(id)) CH.picked.push(id);
    return drawChunk();
  }
  if (b.hasAttribute('data-chunk-add')) {
    b.disabled = true;
    const tid = D.id, list = routineItems(tid);
    if (list.length + CH.picked.length > 100) { b.disabled = false; return toast('That would be more than 100 steps.'); }
    try {
      await copySteps(CH.picked, tid);
      await autoName(tid);
      toast('Added ' + CH.picked.length + ' step' + (CH.picked.length === 1 ? '' : 's') + '.');
    } catch (x) { fail(x); }
    openDesigner(tid);
  }
}
// "bench 3x5, ohp 3x8, rows" -> steps. Names match the catalogue and its search words; a step
// without NxM gets your usual sets and reps for that lift.
function parseQuick(text) {
  const out = [], missing = [];
  for (const raw of text.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean)) {
    const m = /^(.*?)\s*(?:(\d{1,2})\s*[x×*]\s*(\d{1,3}))?\s*$/i.exec(raw);
    const name = (m && m[1] ? m[1] : raw).trim();
    let id = S.nameIndex.get(L.norm(name));
    for (const q of [name, name.replace(/e?s$/i, '')]) {   // "rows" finds "Row", "presses" finds "Press"
      if (id || !q) break;
      id = S.nameIndex.get(L.norm(q));
      if (!id) { const hit = L.searchExercises(q, S.exercises, S.aliases, recentExerciseIds())[0]; id = hit && hit.id; }
    }
    if (!id) { missing.push(name); continue; }
    out.push({ exId: id, sets: m && m[2] ? Math.min(20, Math.max(1, +m[2])) : null, reps: m && m[3] ? Math.min(100, Math.max(1, +m[3])) : null });
  }
  return { out, missing };
}
async function quickAdd(b) {
  const tid = D.id, text = $('qaIn').value;
  const { out, missing } = parseQuick(text);
  if (!out.length) return toast(missing.length ? 'Couldn’t find: ' + missing.join(', ') : 'Type exercises, like: bench 3x5, rows');
  if (routineItems(tid).length + out.length > 100) return toast('That would be more than 100 steps.');
  b.disabled = true;
  let pos = Math.max(0, ...routineItems(tid).map(i => i.position));
  try {
    for (const x of out) {
      const u = usualFor(x.exId);
      const it = await store.addItem({ template_id: tid, exercise_id: x.exId, position: ++pos, sets: x.sets || u.sets, reps: x.reps || Math.min(100, u.reps), load_mode: 'last', load_value: 0, unit: u.unit });
      S.items.push(it); S.itemsById.set(it.id, it);
    }
    await autoName(tid);
  } catch (x) { b.disabled = false; return fail(x); }
  openDesigner(tid);
  toast('Added ' + out.map(x => shortName(x.exId)).join(', ') + (missing.length ? '. Couldn’t find: ' + missing.join(', ') : ''));
}
async function designerClick(b) {
  if (b.id === 'rtAdd') { flushSaves(); return openPicker('Add to ' + (S.templates.find(x => x.id === D.id) || {}).name, ids => addItemsTo(D.id, ids), true); }
  if (b.id === 'rtFrom') { flushSaves(); return openChunkPicker(); }
  if (b.id === 'qaGo') return quickAdd(b);
  if (b.dataset.kind) {
    const t = S.templates.find(x => x.id === D.id);
    if ((t.kind || 'workout') === b.dataset.kind) return;
    try { await saveRoutine({ kind: b.dataset.kind }); } catch (x) { return fail(x); }
    inner.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', x.dataset.kind === t.kind));
    toast(t.kind === 'block' ? 'Now a block: a chunk to build workouts from.' : 'Now a workout.');
    return;
  }
  if (b.id === 'rtNoteBtn') { b.remove(); const n = $('rtNotes'); n.hidden = false; n.focus(); return; }
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
    const list = routineItems(D.id);
    if (list.length >= 100) return toast('That’s the most steps a routine can have.');
    try {
      for (const later of list.filter(x => x.position > it.position).reverse()) await store.updateItem(later.id, { position: later.position + 1 }).then(s => Object.assign(later, s));
      const copy = await store.addItem({ template_id: D.id, exercise_id: it.exercise_id, position: it.position + 1, sets: it.sets, reps: it.reps,
        load_mode: it.load_mode, load_value: it.load_value, unit: it.unit, rest_s: it.rest_s ?? null, note: it.note ?? null });
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
    toast('Removed ' + exName(it.exercise_id), { label: 'Undo', run: async () => {
      try { const back = await store.updateItem(id, { deleted_at: null }); S.items.push(back); S.itemsById.set(id, back); drawItems(); } catch (x) { fail(x); }
    } });
    return;
  }
  if (b.dataset.stepField) {
    const f = b.dataset.stepField, d = Number(b.dataset.d);
    const step = f === 'load_value' ? (it.load_mode === 'percent_1rm' ? 5 : 2.5) : f === 'rest_s' ? 15 : 1;
    queueItem(id, { [f]: clampItem(it, f, Number(it[f]) + d * step) });
    refreshItemView(id); vibrate(5);
    return;
  }
  if (b.dataset.loadmode) {
    const k = b.dataset.loadmode;
    if (k === 'pct') queueItem(id, { load_mode: 'percent_1rm', load_value: it.load_mode === 'percent_1rm' ? it.load_value : 75 });
    else if (k === 'progress') queueItem(id, { load_mode: 'progress', load_value: it.load_mode === 'progress' ? it.load_value : (it.unit === 'kg' ? 2.5 : 5) });
    else queueItem(id, { load_mode: 'last', load_value: 0 });
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
  return '<div class="goal"><div class="row"><span>' + (done ? '✅ ' : '') + esc(g.name) + (own ? ' <small class="muted">· own goal</small>' : '') + '</span><span class="muted num">' + esc(label) + '</span></div>' +
    '<div class="bar"><i style="width:' + (ratio * 100).toFixed(1) + '%"></i></div></div>';
}
const myGoalsHtml = (sn, m) => goalsFor(sn, S.myId).map(g => goalLine(g, m, { season: sn })).join('');
const seasonSub = id => (S.seasonSubs || []).find(x => x.season_id === id);
// A season's plan: routines in order. Ticked weekdays pin a routine to those days; the rest take turns.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const byPos = (a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id));
const planFor = sid => (S.plan || []).filter(p => p.season_id === sid).sort(byPos);
const tplById = id => S.templates.find(t => t.id === id);
const dayList = mask => DAY_NAMES.filter((_, i) => mask & (1 << i)).join(', ');
function planLine(s) {
  const plan = planFor(s.id);
  if (!plan.length) return '';
  return '<p class="hint-line">Plan: ' + esc(plan.map(p => { const t = tplById(p.template_id); return (t ? t.name : 'a private routine') + (p.weekdays ? ' (' + dayList(p.weekdays) + ')' : ''); }).join(' → ')) + '</p>';
}
// Which routine of a rotation was done on a day: the one whose exercises that day covers best (at least half).
function matchRoutine(rot, day) {
  const done = new Set(S.recent.filter(x => x.performed_on === day && x.is_warmup !== true).map(x => x.exercise_id));
  if (!done.size) return -1;
  let best = -1, score = 0.5 - 1e-9;
  rot.forEach((p, i) => {
    const ex = [...new Set(routineItems(p.template_id).map(it => it.exercise_id))];
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
  const tp = todaysPlan();
  if (!tp) return '';
  const head = '<div class="date">' + esc(tp.season.name) + '</div>';
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
  if (kind === 'lift') box.innerHTML = '<input class="plain-input" id="gEx" list="gExList" placeholder="Which exercise?" aria-label="Exercise" autocomplete="off"><datalist id="gExList">' +
    S.exercises.filter(e => !e.deleted_at).map(e => '<option value="' + esc(e.name) + '">').join('') + '</datalist>';
  else if (kind === 'workout') box.innerHTML = S.templates.length ? '<select class="plain-input" id="gWk" aria-label="Workout">' +
    S.templates.filter(t => !isBlock(t)).map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') + '</select>' : '<p class="hint-line">Make a workout first.</p>';
  else box.innerHTML = '';
}
inner.addEventListener('change', e => { if (e.target.id === 'gMetric') drawGoalExtra(); });
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
function openSeasonSheet(id) {
  if (id && !isMine(seasonById(id))) return openMyGoals(id);
  LG.mode = 'season';
  SG.id = id; SG.pending = []; SG.planPending = []; SG.personal = false;
  const s = id ? seasonById(id) : { name: '', starts_on: today(), ends_on: L.addDays(today(), 55), is_shared: false };
  inner.innerHTML =
    '<div class="sheet-head"><h2 id="sheetTitle">' + (id ? 'Edit season' : 'New season') + '</h2><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body">' +
      '<div class="field-label"><span>Name</span></div><input class="plain-input" id="snName" maxlength="60" value="' + esc(s.name) + '" placeholder="e.g. Winter bulk">' +
      '<div class="grid2"><div><div class="field-label"><span>Starts</span></div><input class="plain-input" id="snStart" type="date" value="' + esc(s.starts_on) + '"></div>' +
        '<div><div class="field-label"><span>Ends</span></div><input class="plain-input" id="snEnd" type="date" value="' + esc(s.ends_on) + '"></div></div>' +
      '<div class="toggles" style="margin-top:12px"><button type="button" class="toggle" id="snShare" aria-pressed="' + !!s.is_shared + '">' + shareLabel(s.is_shared) + '</button></div>' +
      pointsHtml(s.points) +
      '<div class="field-label"><span>Goals</span><small>optional</small></div><div id="snGoals"></div>' +
      goalAddHtml() +
      '<div class="field-label"><span>Routines</span><small>optional</small></div><div id="snPlan"></div>' +
      (S.templates.length ? '<div class="goal-add plan-add"><select class="plain-input" id="pRoutine" aria-label="Routine to add">' +
          S.templates.slice().sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name))
            .map(t => '<option value="' + esc(t.id) + '">' + esc(t.name + (isBlock(t) ? ' (block)' : '') + (isMine(t) ? '' : ' (by ' + ownerName(t) + ')')) + '</option>').join('') +
        '</select><button class="btn" id="pAdd" type="button">Add</button></div>'
        : '<p class="hint-line">Make a routine first, then plan the season around it.</p>') +
      '<p class="warn" id="snErr" role="alert"></p>' +
      '<button class="btn primary block" id="snSave">' + (id ? 'Save season' : 'Start season') + '</button>' +
      (id ? '<button class="btn block" style="margin-top:10px;color:var(--accent)" id="snDelete">Delete season</button>' : '') +
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
  const shared = SG.id ? !!(seasonById(SG.id) || {}).is_shared : $('snShare') && $('snShare').getAttribute('aria-pressed') === 'true';
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
  if (b.id === 'gAdd') {
    const [metric, unit] = $('gMetric').value.split(':');
    const target = L.parseLoad($('gTarget').value);
    const whole = metric === 'visits' || metric === 'workout';
    if (!(target > 0) || (whole && target % 1)) { $('snErr').textContent = whole ? 'Enter a whole number above zero.' : 'Enter a target above zero.'; return; }
    const g = { metric, unit: unit || null, target, exercise_id: null, template_id: null };
    if (metric === 'lift') {
      g.exercise_id = S.nameIndex.get(L.norm($('gEx') ? $('gEx').value : ''));
      if (!g.exercise_id) { $('snErr').textContent = 'Pick an exercise from the list.'; return; }
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
        for (const g of SG.pending) S.goals.push(await store.addGoal({ ...g, season_id: s.id }));
        for (const p of SG.planPending) S.plan.push(await store.addPlan({ ...p, season_id: s.id }));
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
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push('<span></span>');
  for (let d = 1; d <= daysIn; d++) {
    const iso = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const sched = (S.wdays || []).some(w => w.on_date === iso), plan = iso >= today() && planOn(iso).length;
    const cls = [logged.has(iso) ? 'done' : '', sched || plan ? 'planned' : '', iso === today() ? 'today' : '', iso === S.cal.day ? 'sel' : ''].filter(Boolean).join(' ');
    cells.push('<button class="' + cls + '" data-cal-day="' + iso + '" aria-pressed="' + (iso === S.cal.day) + '" aria-label="' + esc(fmtDay(iso, { weekday: 'long', month: 'long', day: 'numeric' })) +
      (logged.has(iso) ? ', lifted' : '') + (sched || plan ? ', workout planned' : '') + '">' + d + '</button>');
  }
  return '<section class="card cal-card"><div class="row"><button class="iconbtn" data-cal-move="-1" aria-label="Previous month">‹</button>' +
    '<h2>' + esc(first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })) + '</h2><button class="iconbtn" data-cal-move="1" aria-label="Next month">›</button></div>' +
    '<div class="cal-grid cal-head">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => '<span>' + x + '</span>').join('') + '</div>' +
    '<div class="cal-grid">' + cells.join('') + '</div>' +
    '<p class="cal-key"><i class="k-done"></i> lifted <i class="k-plan"></i> planned</p></section>' + calDayDetail();
}
function calDayDetail() {
  const d = S.cal.day, row = S.days.find(x => x.performed_on === d && x.sets > 0);
  const sched = (S.wdays || []).filter(w => w.on_date === d && tplById(w.template_id));
  const plan = d >= today() ? planOn(d).filter(p => !sched.some(w => w.template_id === p.template_id)) : [];
  let html = '<section class="card cal-day"><h3>' + esc(d === today() ? 'Today' : fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' })) + '</h3>';
  if (row) html += '<p class="hint-line">' + row.sets + ' sets · ' + esc(volText({ lb: Number(row.volume_lb), kg: Number(row.volume_kg) })) + '</p>' + dayBody(d);
  for (const w of sched) html += '<div class="row day-row"><span>📅 ' + esc(tplById(w.template_id).name) + '</span><span>' +
    (d === today() ? '<button class="btn primary sm" data-start="' + esc(w.template_id) + '">Start</button>' : '') +
    '<button class="iconbtn sm" data-unday="' + esc(w.id) + '" aria-label="Take it off this day">✕</button></span></div>';
  for (const p of plan) html += '<div class="row day-row"><span>🗓 ' + esc(tplById(p.template_id).name) + ' <small class="muted">· ' + esc(p.season.name) + ' plan</small></span>' +
    (d === today() ? '<span><button class="btn primary sm" data-start="' + esc(p.template_id) + '">Start</button></span>' : '') + '</div>';
  if (!row && !sched.length && !plan.length) html += '<p class="muted" style="margin:6px 0 0">' + (d < today() ? 'Rest day.' : 'Nothing planned yet.') + '</p>';
  if (d >= L.addDays(today(), -7)) html += '<button class="btn" style="margin-top:12px" data-cal-schedule="' + d + '">📅 Put a workout on this day</button>';
  return html + '</section>';
}
async function selectCalDay(d) {
  S.cal.day = d;
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
  if (!days.length) html += '<section class="card empty"><p class="muted" style="margin:0">Your days show up here once you’ve logged a set.</p></section>';
  for (const d of days.slice(0, S.historyLimit)) {
    const m = fmtDay(d.performed_on, { month: 'long', year: 'numeric' });
    if (m !== month) { html += '<h3 class="section-title">' + esc(m) + '</h3>'; month = m; }
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
    '</div></div>').join('') + (sets.length ? '<button class="btn" style="margin-top:14px" data-save-day="' + esc(day) + '">Save as a workout</button>' : '') || '<p class="muted">No sets.</p>';
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
    const data = months.slice(-24).map(m => ({ label: L.parseDate(m + '-01').toLocaleDateString('en-US', { month: 'short' }), value: by.get(m).lb,
      tip: esc(L.parseDate(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })) + ': <b>' + C.compact(by.get(m).lb) + ' lb</b> · ' + by.get(m).visits + ' days' }));
    vol = { title: 'Pounds moved per month', html: C.columns({ data, every: data.length > 12 ? 3 : 1, label: 'Pounds moved per month' }) };
  }
  const heatVals = new Map(S.days.filter(d => d.sets > 0).map(d => [d.performed_on, lbOf(d)]));
  const best = w12.reduce((m, w) => (w.lb > m.lb ? w : m), w12[0]);
  const ms = L.milestoneProgress(L.lbEquivalent(totals().volume));
  const ach = L.achievements({ volume: totals().volume, visits: totals().visits, prs: S.bests.size });
  const earned = ach.filter(a => a.earned), nextClub = ach.find(a => a.milestone && !a.earned);
  const medal = a => a.milestone ? (a.need === 10000 ? '🐘' : T.icons.club) : a.id === 'first_pr' ? '🏆' : '⭐';
  view.innerHTML =
    '<div class="seg" role="group" aria-label="Period">' +
      [['all', 'All time'], ['year', 'Past year'], ['30', '30 days']].map(([k, l]) => '<button data-period="' + k + '" aria-pressed="' + (S.period === k) + '">' + l + '</button>').join('') + '</div>' +
    '<div class="kpis">' +
      kpi('Pounds moved', C.compact(lbEq) + ' lb', lbEq > 0 ? 'about ' + esc(L.fmtNum(cmp.times, cmp.times < 10 ? 1 : 0)) + ' × a ' + esc(cmp.thing) : 'nothing yet', w12.map(w => w.lb)) +
      kpi('Gym days', L.fmtNum(t.visits, 0), streakWeeks() ? '🔥 ' + streakWeeks() + '-week streak' : 'no streak going', w12.map(w => w.visits)) +
      kpi('Sets', L.fmtNum(t.sets, 0), t.visits ? Math.round(t.sets / t.visits) + ' a session' : '', w12.map(w => w.sets)) +
      kpi('Personal bests', L.fmtNum(prs, 0), 'set ' + (from ? 'in this period' : 'all time'), null) +
    '</div>' +
    '<section class="card c-wide"><div class="card-head"><h3 class="card-title">' + vol.title + '</h3><small class="muted">Warm-ups excluded</small></div>' + vol.html + '</section>' +
    '<section class="card c-side"><div class="card-head"><h3 class="card-title">Training calendar</h3><small class="muted">26 weeks</small></div>' + C.heatmap({ values: heatVals, end: today(), label: 'Days lifted in the last 26 weeks, shaded by pounds moved' }) +
      '<p class="hint-line">Best of the last 12 weeks: week of ' + esc(fmtDay(best.start, { month: 'short', day: 'numeric' })) + ', <b>' + C.compact(best.lb) + ' lb</b> over ' + best.visits + ' days.</p></section>' +
    '<section class="card c-wide" id="trendBox"></section>' +
    '<section class="card c-full" id="recordsBox"></section>' +
    '<section class="card c-side"><div class="card-head"><h3 class="card-title">Top lifts</h3><small class="muted">by estimated 1-rep max</small></div>' +
      '<input class="search" id="bestSearch" type="search" placeholder="Find a lift" value="' + esc(S.bestQuery) + '" aria-label="Find a lift"><div id="bestsBox"></div></section>' +
    '<section class="card c-half clubs"><div class="card-head"><h3 class="card-title">' + esc(T.clubs) + '</h3><small class="muted">' + esc(T.clubsSub(ms.count)) + '</small></div>' +
      candlesSVG(ms.count, ms.ratio, T.clubsLabel(ms.count, ms.next ? ms.next.title : 'top')) +
      (ms.next ? '<div class="row" style="font-size:14px;font-weight:700"><span>' + (ms.earned ? esc(ms.earned.title) : 'Start') + '</span><span>' + esc(ms.next.title) + '</span></div>' +
        '<div class="bar" style="margin-top:6px"><i style="width:' + (ms.ratio * 100).toFixed(1) + '%"></i></div><p class="hint-line">' + esc(L.fmtNum(Math.ceil(ms.remaining), 0)) + ' lb to go</p>' : '<p><b>Every club unlocked.</b> Legend.</p>') +
      '<div class="badges">' + earned.filter(a => !a.milestone).concat(earned.filter(a => a.milestone).slice(-4)).concat(nextClub ? [nextClub] : []).map(a =>
        '<div class="badge' + (a.earned ? ' got' : '') + '" title="' + esc(T.ach[a.id] || a.desc) + '"><div class="medal">' + medal(a) + '</div>' + esc(a.title) + '</div>').join('') + '</div></section>' +
    bodyweightCard();
  const input = $('bestSearch');
  input.addEventListener('input', () => { S.bestQuery = input.value; drawBests(); });
  drawBests();
  drawTrend();
  drawRecords();
}
// Lift trend: top set and estimated 1-rep max per day, for any lift you've done.
function trendChoices() {
  const count = new Map();
  for (const r of S.recent) if (r.is_warmup !== true) count.set(r.exercise_id, (count.get(r.exercise_id) || 0) + 1);
  for (const r of S.bestRows) if (!count.has(r.exercise_id)) count.set(r.exercise_id, 0.5);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 40);
}
async function drawTrend() {
  const box = $('trendBox'); if (!box) return;
  const ids = trendChoices();
  if (S.trendEx && !ids.includes(S.trendEx)) ids.unshift(S.trendEx);   // a lift linked from a season plan stays picked
  if (!ids.length) { box.innerHTML = '<h3 class="card-title">Lift trends</h3><p class="muted">Log a few sessions and your lifts chart here.</p>'; return; }
  if (!S.trendEx) S.trendEx = ids[0];
  const head = '<div class="card-head"><h3 class="card-title">Lift trend</h3><select class="plain-input trend-pick" id="trendEx" aria-label="Lift to chart">' +
    ids.map(id => '<option value="' + esc(id) + '"' + (id === S.trendEx ? ' selected' : '') + '>' + esc(exName(id)) + '</option>').join('') + '</select></div>';
  S.hist = S.hist || new Map();
  if (!S.hist.has(S.trendEx)) {
    box.innerHTML = head + '<p class="muted">Loading…</p>';
    const id = S.trendEx;
    try { S.hist.set(id, await store.exerciseHistory(id)); } catch (x) { box.innerHTML = head + '<p class="warn">Couldn’t load it: ' + esc(x.message) + '</p>'; return; }
    if (id !== S.trendEx || !$('trendBox')) return;
  }
  const rows = S.hist.get(S.trendEx).filter(r => r.is_warmup !== true && Number(r.weight) > 0);
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
  const rows = [...byEx.entries()].filter(([id]) => !q || L.norm(exName(id)).includes(q)).sort((a, b) => b[1].score - a[1].score).slice(0, q ? 30 : 12);
  $('bestsBox').innerHTML = rows.length ? '<table class="cmp lifts"><thead><tr><th>Lift</th><th>Best set</th><th>Est. 1RM</th></tr></thead><tbody>' +
    rows.map(([id, { r, e1 }], i) => '<tr><td><span class="rank">' + (i + 1) + '</span>' + esc(exName(id)) + '<br><small>' + esc(fmtDay(r.first_lifted_on, { month: 'short', day: 'numeric', year: 'numeric' })) + '</small></td>' +
      '<td class="num">' + esc(L.fmtLoad(r.heaviest)) + ' <small>' + r.unit + ' × ' + r.reps + '</small></td><td class="num"><b>' + (e1 ? esc(L.fmtLoad(Math.round(e1))) : '–') + '</b></td></tr>').join('') + '</tbody></table>'
    : '<p class="muted">' + (q ? 'No bests for that yet.' : 'Your bests show up here as you log.') + '</p>';
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
  if (b.id === 'signOutBtn') { sheet.close(); await store.signOut(); if (!store.demo) { S.recent = []; showSignIn(); } }
});

// ===========================================================================
// Start
// ===========================================================================
(async function boot() {
  try {
    store = await connect(DEMO);
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
  const x = S.recent.find(r => r.exercise_id === exId && r.is_warmup !== true);
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
  let pos = 0;
  for (const x of steps) {
    const ld = lastLoad(x.exId), rule = starterRule(sid, x, ld.unit);
    const it = await store.addItem({ template_id: t.id, exercise_id: x.exId, position: ++pos, sets: Math.min(20, x.sets), reps: Math.min(100, x.reps),
      load_mode: rule.mode, load_value: rule.value, unit: ld.unit, rest_s: x.rest == null ? null : Math.min(900, x.rest), note: x.note ? x.note.slice(0, 200) : null });
    S.items.push(it); S.itemsById.set(it.id, it);
  }
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
    '<h3 class="section-title">Programs</h3><p class="hint-line" style="margin-top:-4px">Sets up the workouts and a season with each one on its days. Others can join it.</p>' +
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
function nextMonday() { const t = today(), dow = L.parseDate(t).getDay(); return dow === 1 ? t : L.addDays(t, (8 - dow) % 7 || 7); }
function openProgramSheet(pid) {
  const p = PROGRAMS.find(x => x.id === pid);
  LG.mode = 'program'; PG.id = pid;
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  inner.innerHTML = '<div class="sheet-head"><div><button class="btn ghost" style="padding:2px 0;border:0;color:var(--muted);font-size:14px" data-back-starters>← Starter library</button>' +
      '<h2 id="sheetTitle">' + esc(p.name) + '</h2></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>' +
    '<div class="sheet-body"><p>' + esc(p.about) + '</p>' + (p.based ? '<p class="hint-line">Based on ' + esc(p.based) + '. A simplified version, not an official copy.</p>' : '') +
      '<div class="field-label"><span>Each week</span></div><div class="week-list">' +
        p.days.slice().sort((a, c) => ((a[0] + 6) % 7) - ((c[0] + 6) % 7)).map(([d, sid]) => '<div class="row"><b>' + DN[d] + '</b><span>' + esc(SESSIONS[sid].name) + '</span></div>').join('') + '</div>' +
      '<div class="field-label"><span>Season name</span></div><input class="plain-input" id="pgName" maxlength="60" value="' + esc(p.name) + '">' +
      '<div class="grid2"><div><div class="field-label"><span>Starts</span></div><input class="plain-input" id="pgStart" type="date" value="' + nextMonday() + '"></div>' +
        '<div><div class="field-label"><span>Weeks</span></div><input class="plain-input" id="pgWeeks" inputmode="numeric" value="' + p.weeks + '"></div></div>' +
      '<div class="toggles" style="margin-top:12px"><button type="button" class="toggle" id="pgShare" aria-pressed="true">' + shareLabel(true) + '</button></div>' +
      '<p class="hint-line">Creates ' + new Set(p.days.map(d => d[1])).size + ' workouts and a season with each on its days, plus a goal to show up every session.</p>' +
      '<p class="warn" id="pgErr" role="alert"></p><button class="btn primary block" id="pgGo">Start program</button></div>';
  openSheet();
}
async function programClick(b) {
  if (b.hasAttribute('data-back-starters')) return openStarters();
  if (b.id === 'pgShare') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.textContent = shareLabel(on); return; }
  if (b.id !== 'pgGo') return;
  const p = PROGRAMS.find(x => x.id === PG.id);
  const name = $('pgName').value.trim() || p.name, start = $('pgStart').value, weeks = parseInt($('pgWeeks').value, 10);
  if (!start) return void ($('pgErr').textContent = 'Pick a start date.');
  if (!(weeks >= 1 && weeks <= 52)) return void ($('pgErr').textContent = 'Weeks must be between 1 and 52.');
  b.disabled = true; b.textContent = 'Setting up…';
  try {
    const bySession = new Map();
    for (const [d, sid] of p.days) bySession.set(sid, (bySession.get(sid) || 0) | (1 << d));
    const made = new Map();
    for (const sid of bySession.keys()) {
      const existing = S.templates.find(t => isMine(t) && !isBlock(t) && t.name === SESSIONS[sid].name && routineItems(t.id).length);
      made.set(sid, existing || await addSession(sid, 'workout'));
    }
    const sn = await store.addSeason({ name, starts_on: start, ends_on: L.addDays(start, weeks * 7 - 1), is_shared: $('pgShare').getAttribute('aria-pressed') === 'true' });
    S.seasons.unshift(sn);
    let pos = 0;
    for (const [sid, mask] of bySession) S.plan.push(await store.addPlan({ season_id: sn.id, template_id: made.get(sid).id, position: ++pos, weekdays: mask }));
    S.goals.push(await store.addGoal({ season_id: sn.id, metric: 'visits', unit: null, target: p.days.length * weeks, name: 'Show up ' + p.days.length * weeks + ' times', exercise_id: null, template_id: null }));
    sheet.close();
    openSeason(sn.id);
    toast(name + ' is set up. The Log tab shows each day’s workout.');
  } catch (x) { $('pgErr').textContent = x.message; b.disabled = false; b.textContent = 'Start program'; }
}

// ===========================================================================
// Rest timer: starts after you log, counts down, buzzes when it's time.
// ===========================================================================
const REST = { end: 0, timer: null, el: null };
const restFor = (reps, item) => (item && item.rest_s != null ? item.rest_s : reps <= 5 ? 180 : reps <= 8 ? 120 : reps <= 12 ? 90 : 60);
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
  if (left <= 0) { stopRest(); vibrate([200, 100, 200]); toast('Rest’s up. Next set!'); return; }
  el.querySelector('#restTime').textContent = 'Rest ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
}
function stopRest() { clearInterval(REST.timer); if (REST.el) REST.el.hidden = true; }

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
    '<div class="elapsed" role="img" aria-label="' + pct + '% of the season gone"><i style="width:' + pct + '%"></i></div></div>';
}
function renderSeasons() {
  const sn = S.seasonOpen && seasonById(S.seasonOpen);
  if (sn && inSeason(sn)) return renderSeasonPage(sn);
  if (sn && !inSeason(sn)) S.seasonOpen = null;
  const all = S.seasons || [];
  const mine = all.filter(inSeason), invites = all.filter(x => !inSeason(x) && phaseOf(x) !== 'done');
  const card = x => {
    const m = seasonM(x), g = goalsDone(x);
    return '<section class="card sbanner">' + bannerHtml(x) +
      '<div class="sb-body"><div class="sb-stats">' +
        '<div><b>' + m.visits + '</b><small>your gym days</small></div><div><b>' + C.compact(L.lbEquivalent(m.volume)) + '</b><small>lb moved</small></div>' +
        '<div><b>' + g.done + '/' + g.of + '</b><small>goals done</small></div></div>' +
        '<div class="actions"><button class="btn primary" data-season="' + esc(x.id) + '">Open season</button>' +
        (phaseOf(x) === 'done' && isMine(x) ? '<button class="btn" data-rerun="' + esc(x.id) + '">↻ Run it again</button>' : '') +
        (x.is_shared ? '<button class="btn ghost" data-link="s-' + esc(x.id) + '" aria-label="Copy a link to ' + esc(x.name) + '">🔗</button>' : '') + '</div></div></section>';
  };
  const group = (title, list) => list.length ? '<h3 class="section-title">' + title + '</h3><div class="season-grid">' + list.map(card).join('') + '</div>' : '';
  view.innerHTML =
    '<div class="row page-actions"><p class="muted" style="margin:0">A season is a stretch of dates with goals. Every set you log counts toward every season running that day.</p>' +
      '<span class="head-actions"><button class="btn primary" data-new-any>+ New</button></span></div>' +
    (invites.length ? '<h3 class="section-title">Join the crew</h3><div class="season-grid">' + invites.map(x => '<section class="card sbanner">' + bannerHtml(x) +
      '<div class="sb-body">' + (seasonGoals(x).length ? '<p class="hint-line" style="margin-top:0">Goals: ' + esc(seasonGoals(x).map(g => g.name).join(', ')) + '</p>' : '') + planLine(x) +
      '<div class="actions"><button class="btn primary" data-join-season="' + esc(x.id) + '">Join season</button></div></div></section>').join('') + '</div>' : '') +
    group('Live now', mine.filter(x => phaseOf(x) === 'live')) +
    group('Coming up', mine.filter(x => phaseOf(x) === 'upcoming')) +
    group('Finished', mine.filter(x => phaseOf(x) === 'done')) +
    (mine.length || invites.length ? '' : '<section class="card empty"><h2>No seasons yet.</h2><p class="muted">Start one for a training block, a month or a challenge with the crew, or start a program and it makes the season for you.</p></section>');
}
// One season: header, your numbers, achievements, standings, race and weekly charts, head-to-head.
function renderSeasonPage(sn) {
  const st = S.standings[sn.id];
  const head = '<button class="linkbtn back" data-season-back>← All seasons</button>' +
    '<section class="card sbanner big">' + bannerHtml(sn, true) + '<div class="sb-body"><div class="actions">' +
      (isMine(sn) ? '<button class="btn" data-edit-season="' + esc(sn.id) + '">Edit season</button>' : '<button class="btn" data-my-goals="' + esc(sn.id) + '">My goals</button><button class="btn ghost" data-leave-season="' + esc(sn.id) + '">Leave</button>') +
      (isMine(sn) ? '<button class="btn ghost" data-rerun="' + esc(sn.id) + '">↻ Run it again</button>' : '') +
      (sn.is_shared ? '<button class="btn ghost" data-link="s-' + esc(sn.id) + '">🔗 Copy link</button>' : '') + '</div></div></section>';
  if (!st || !st.d) {
    view.innerHTML = head + '<section class="card"><p class="muted" style="margin:0">Loading the season…</p></section>';
    Promise.all([store.standings(sn.id), store.seasonWorkouts(sn.id), store.seasonBests(sn.id), store.seasonDaily(sn.id), sn.points ? store.seasonPrs(sn.id) : []]).then(([rows, w, b, d, prs]) => {
      S.standings[sn.id] = { rows, w, b, d, prs };
      if (currentTab === 'seasons' && S.seasonOpen === sn.id) renderSeasonPage(sn);
    }).catch(x => { if (S.seasonOpen === sn.id) view.innerHTML = head + '<section class="card"><p class="warn">Couldn’t load the season: ' + esc(x.message) + '</p></section>'; });
    return;
  }
  // People, in a fixed order (you first) so each keeps one color everywhere.
  const people = st.rows.map(r => ({ ...r, m: { visits: Number(r.visits), volume: { lb: Number(r.volume_lb), kg: Number(r.volume_kg) } } }))
    .sort((a, b) => (a.user_id === S.myId ? -1 : b.user_id === S.myId ? 1 : String(a.display_name).localeCompare(b.display_name))).slice(0, 3);
  people.forEach((p, i) => { p.color = C.SERIES[i]; p.name = p.user_id === S.myId ? 'You' : p.display_name; });
  const solo = people.length < 2;
  const me = people.find(p => p.user_id === S.myId) || { m: seasonM(sn), sets: 0 };
  const myM = seasonM(sn), g = goalsDone(sn);
  // Day-by-day totals -> cumulative race and weekly columns, up to today.
  const endDay = today() < sn.ends_on ? today() : sn.ends_on;
  const days = [];
  for (let d = sn.starts_on; d <= endDay; d = L.addDays(d, 1)) days.push(d);
  const daily = new Map(people.map(p => [p.user_id, new Map()]));
  for (const r of st.d) { const m = daily.get(r.user_id); if (m) m.set(String(r.performed_on).slice(0, 10), lbOf(r)); }
  let race = '', weeks = '';
  if (days.length > 1) {
    race = C.lines({ labels: days.map(d => fmtDay(d, { month: 'short', day: 'numeric' })), every: Math.ceil(days.length / 6),
      series: people.map(p => { let c = 0; return { name: p.name, color: p.color, values: days.map(d => (c += daily.get(p.user_id).get(d) || 0)) }; }),
      label: 'Pounds moved since the season started, by person' });
    const wk = [];
    for (let w = weekOf(sn.starts_on); w <= endDay; w = L.addDays(w, 7)) wk.push(w);
    weeks = C.columns({ data: wk.map(w => ({ label: fmtDay(w, { month: 'short', day: 'numeric' }) })), every: Math.max(1, Math.ceil(wk.length / 8)),
      series: people.map(p => ({ name: p.name, values: wk.map(w => { let t = 0; for (let i = 0; i < 7; i++) t += daily.get(p.user_id).get(L.addDays(w, i)) || 0; return t; }) })),
      label: 'Pounds moved each week of the season, by person' });
  }
  // Achievements: every goal, everyone's progress on it.
  const goals = S.goals.filter(x => x.season_id === sn.id && (!x.created_by || x.created_by === sn.created_by || people.some(p => p.user_id === x.created_by)));
  const icon = { visits: '📅', volume: '🏋️', lift: '🏆', workout: '🔁' };
  const goalTile = x => {
    const own = x.created_by && x.created_by !== sn.created_by;
    const who = own ? people.filter(p => p.user_id === x.created_by) : people;
    const rows = who.map(p => {
      const have = goalHave(x, p.m, { season: sn, person: p.user_id, st }), need = Number(x.target), ratio = Math.min(1, need ? have / need : 0);
      const txt = x.metric === 'lift' ? (have ? L.fmtLoad(have) : '–') + ' / ' + L.fmtLoad(need) + ' ' + x.unit : x.metric === 'volume' ? C.compact(have) + ' / ' + C.compact(need) + ' ' + x.unit : L.fmtNum(have, 0) + ' / ' + L.fmtNum(need, 0);
      return '<div class="gt-row"><span class="who"><i style="background:' + p.color + '"></i>' + esc(p.name) + '</span><span class="num">' + (have >= need ? '✅ ' : '') + esc(txt) + '</span>' +
        '<div class="gt-bar"><i style="width:' + (ratio * 100).toFixed(1) + '%;background:' + p.color + '"></i></div></div>';
    }).join('');
    const doneAll = who.length && who.every(p => goalHave(x, p.m, { season: sn, person: p.user_id, st }) >= Number(x.target));
    return '<div class="goal-tile' + (doneAll ? ' done' : '') + '"><div class="gt-head"><span class="gt-icon">' + (icon[x.metric] || '🎯') + '</span><b>' + esc(x.name) + '</b>' +
      (own ? '<small class="muted">' + esc(who[0] ? who[0].name : '') + '’s own goal</small>' : '') + '</div>' + rows + '</div>';
  };
  // Standings table.
  const goalCount = p => goals.filter(x => (!x.created_by || x.created_by === sn.created_by || x.created_by === p.user_id) && goalHave(x, p.m, { season: sn, person: p.user_id, st }) >= Number(x.target)).length;
  const pts = p => seasonPoints(sn, st, p);
  const ranked = people.slice().sort((a, b) => (sn.points ? pts(b) - pts(a) : 0) || L.lbEquivalent(b.m.volume) - L.lbEquivalent(a.m.volume));
  const standings = '<table class="cmp standings"><thead><tr><th>#</th><th>Lifter</th><th>Days</th><th>Sets</th><th>Pounds</th><th>' + esc(T.goals) + '</th>' + (sn.points ? '<th>Points</th>' : '') + '</tr></thead><tbody>' +
    ranked.map((p, i) => '<tr' + (p.user_id === S.myId ? ' class="me"' : '') + '><td>' + (i === 0 && !solo ? '👑' : i + 1) + '</td><td><span class="who"><i style="background:' + p.color + '"></i>' + esc(p.name) + '</span></td>' +
      '<td class="num">' + p.m.visits + '</td><td class="num">' + L.fmtNum(Number(p.sets), 0) + '</td><td class="num"><b>' + C.compact(L.lbEquivalent(p.m.volume)) + '</b></td><td class="num">' + goalCount(p) + '</td>' + (sn.points ? '<td class="num"><b>' + pts(p) + '</b></td>' : '') + '</tr>').join('') + '</tbody></table>' +
    (sn.points ? '<p class="hint-line">' + esc(cap(T.points)) + ': ' + esc(pointsRule(sn.points)) + '.</p>' : '');
  // Head-to-head: planned workouts done, best lifts.
  const wt = [...new Set(st.w.map(x => x.template_id))].map(id => { const t = tplById(id); return { label: t ? t.name : 'A private workout', vals: people.map(p => Number((st.w.find(x => x.template_id === id && x.user_id === p.user_id) || {}).times || 0)) }; });
  const bt = [...new Set(st.b.map(x => x.exercise_id))].map(id => ({ label: exName(id), raw: people.map(p => st.b.find(x => x.exercise_id === id && x.user_id === p.user_id)) }))
    .map(r => ({ ...r, vals: r.raw.map(x => (x ? Number(x.best_weight) * (x.unit === 'kg' ? L.LB_PER_KG : 1) : 0)) })).sort((a, b) => Math.max(...b.vals) - Math.max(...a.vals));
  const h2h = (wt.length || bt.length) ? '<table class="cmp"><thead><tr><th></th>' + people.map(p => '<th><span class="who"><i style="background:' + p.color + '"></i>' + esc(p.name) + '</span></th>').join('') + '</tr></thead><tbody>' +
    (wt.length ? '<tr class="grp"><th colspan="' + (people.length + 1) + '">Workouts done</th></tr>' + wt.map(r => { const top = Math.max(...r.vals); return '<tr><td>' + esc(r.label) + '</td>' + r.vals.map(v => '<td class="num' + (!solo && v === top && top > 0 ? ' lead' : '') + '">' + v + '</td>').join('') + '</tr>'; }).join('') : '') +
    (bt.length ? '<tr class="grp"><th colspan="' + (people.length + 1) + '">Best lifts</th></tr>' + bt.map(r => { const top = Math.max(...r.vals); return '<tr><td>' + esc(r.label) + '</td>' + r.raw.map((x, i) => '<td class="num' + (!solo && r.vals[i] === top && top > 0 ? ' lead' : '') + '">' + (x ? '<b>' + esc(L.fmtLoad(Number(x.best_weight))) + '</b> <small>' + x.unit + ' × ' + x.reps + '</small>' : '<span class="muted">–</span>') + '</td>').join('') + '</tr>'; }).join('') : '') +
    '</tbody></table>' : '<p class="muted">Add workouts to the season’s plan, or a lift goal, and the head-to-head fills in.</p>';
  const plan = planFor(sn.id);
  view.innerHTML = head +
    '<div class="kpis">' +
      kpi('Your gym days', L.fmtNum(myM.visits, 0), phaseOf(sn) === 'live' ? esc(seasonStatus(sn)) : '', null) +
      kpi('Your pounds', C.compact(L.lbEquivalent(myM.volume)) + ' lb', '', null) +
      kpi('Your sets', L.fmtNum(Number(me.sets) || myM.sets, 0), '', null) +
      (sn.points ? kpi('Your points', String(seasonPoints(sn, st, me)), T.pointsEarned, null) : kpi(T.goalsKept, g.done + ' / ' + g.of, myM.bests ? myM.bests + ' bests set' : '', null)) +
    '</div>' +
    '<section class="card c-full"><div class="card-head"><div><h3 class="card-title">' + esc(T.goals) + '</h3><small class="muted">the season’s goals</small></div>' +
      (isMine(sn) ? '<button class="btn sm" data-edit-season="' + esc(sn.id) + '">+ Goal</button>' : '<button class="btn sm" data-my-goals="' + esc(sn.id) + '">+ My goal</button>') + '</div>' +
      (goals.length ? '<div class="goal-grid">' + goals.map(goalTile).join('') + '</div>' : '<p class="muted">No goals yet. Add one: show up N times, move N pounds, lift a weight, or do a workout N times.</p>') + '</section>' +
    (solo ? '' : '<section class="card c-side"><h3 class="card-title">Standings</h3>' + standings + '</section>') +
    (race ? '<section class="card ' + (solo ? 'c-half' : 'c-wide') + '"><div class="card-head"><h3 class="card-title">' + (solo ? 'Pounds moved this season' : 'The race') + '</h3><small class="muted">running total</small></div>' + race + '</section>' +
      '<section class="card c-half"><div class="card-head"><h3 class="card-title">Week by week</h3><small class="muted">pounds moved</small></div>' + weeks + '</section>'
      : '<section class="card c-full"><p class="muted" style="margin:0">' + (phaseOf(sn) === 'upcoming' ? 'Starts ' + esc(fmtDay(sn.starts_on, { weekday: 'long', month: 'long', day: 'numeric' })) + '. The charts fill in once it’s running.' : 'The charts fill in after the first couple of days.') + '</p></section>') +
    '<section class="card c-half"><h3 class="card-title">' + (solo ? 'Workouts and best lifts' : 'Head to head') + '</h3>' + h2h + '</section>' +
    '<section class="card c-full"><div class="card-head"><h3 class="card-title">' + esc(T.plan) + '</h3><small class="muted">the season’s plan</small></div>' + (plan.length ? '<ol class="plan-list">' + plan.map(x => {
      const t = tplById(x.template_id);
      if (!t) return '<li><b>A private workout</b><small>' + esc(x.weekdays ? dayList(x.weekdays) : 'takes turns') + '</small></li>';
      return '<li><div class="plan-head"><a href="#r-' + esc(t.id) + '">' + esc(t.name) + ' ›</a><small>' + esc(x.weekdays ? dayList(x.weekdays) : 'takes turns') + '</small></div>' +
        '<div class="chips">' + routineItems(t.id).map(it => '<button class="chip" data-trend="' + esc(it.exercise_id) + '" title="See your ' + esc(exName(it.exercise_id)) + ' trend">' + esc(exName(it.exercise_id)) + ' <small>' + esc(myStepText(it)) + '</small></button>').join('') + '</div>' +
        (phaseOf(sn) === 'live' ? '<div class="actions"><button class="btn sm primary" data-start="' + esc(t.id) + '">Start</button></div>' : '') + '</li>';
    }).join('') + '</ol>'
      : '<p class="muted">No workouts planned.' + (isMine(sn) ? ' Add some in Edit season.' : '') + '</p>') + '</section>';
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
    return { id, top, freq: S.recent.filter(x => x.exercise_id === id).length };
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
    for (const id of WZ.picked) S.plan.push(await store.addPlan({ season_id: sn.id, template_id: id, position: ++pos, weekdays: WZ.mode === 'days' ? WZ.days.get(id) || 0 : 0 }));
    for (const g of WZ.goals.filter(x => WZ.on.has(x.key)))
      S.goals.push(await store.addGoal({ season_id: sn.id, name: g.name, metric: g.metric, target: g.target, unit: g.unit || null, exercise_id: g.exercise_id || null, template_id: g.template_id || null }));
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
      opt('workout', '🏋️', 'A workout', 'What you do on a day. Type it, tick exercises, or stack blocks.') +
      opt('season', '🏆', 'A season', 'A stretch of dates with goals, alone or with the crew.') +
      opt('program', '📚', 'A program', 'A ready-made plan: workouts plus a season, set up for you.') +
      opt('block', '🧩', 'A block', 'A small chunk you reuse in workouts, like “Bench & triceps”.') +
    '</ul></div>';
  openSheet();
}
async function newPickClick(b) {
  const k = b.dataset.newKind;
  if (!k) return;
  if (k === 'season') return openWizard();
  if (k === 'program') return openStarters();
  return newRoutine(b, k);
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
  } catch (x) { /* a win that can't post shouldn't get in the way of logging */ }
}
async function unpostWin(kind, title, day) {
  const w = (S.wins || []).find(x => x.created_by === S.myId && x.kind === kind && x.title === title && x.performed_on === day);
  if (w) { try { await store.removeWin(w.id); S.wins = S.wins.filter(x => x !== w); } catch (x) { /* fine */ } }
}
async function removeWin(id) {
  try { await store.removeWin(id); S.wins = (S.wins || []).filter(x => x.id !== id); render(); toast('Removed from the stream'); } catch (x) { fail(x); }
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
    if (g && sn) { postWin('goal', g.name + ' · ' + sn.name, {}); toast('✅ Goal done: ' + g.name); }
  }
  S.goalsDone = now;
}
async function loadWins() {
  if (!S.goalsDone) S.goalsDone = goalKeyDone();
  if (S.winsLoading || (S.wins && Date.now() - S.winsAt < 60000)) return;
  S.winsLoading = true;
  try { S.wins = await store.wins(); S.winsAt = Date.now(); } catch (x) { S.wins = S.wins || []; }
  S.winsLoading = false;
  const box = $('winsBox'); if (box && currentTab === 'log') box.outerHTML = winsCard();
}
const WIN_ICON = new Proxy({}, { get: (_, k) => T.icons[k] });
function winText(w) {
  const m = w.summary || {};
  if (w.kind === 'pr') return w.title.replace(/ PR$/, '') + ' PR: ' + L.fmtLoad(Number(m.weight)) + ' ' + (m.unit || 'lb') + ' × ' + m.reps;
  if (w.kind === 'club') return T.win.club + w.title;
  if (w.kind === 'record') return T.win.record + w.title.replace(/ record$/, '') + ' record, ' + L.fmtLoad(Number(m.weight)) + ' ' + (m.unit || 'lb') + ' × ' + m.reps + (m.from ? ' (was ' + m.from + '’s)' : '');
  if (w.kind === 'quest') return T.win.quest + w.title;
  if (w.kind === 'goal') return T.win.goal + w.title;
  return T.win.session + w.title + (m.lb ? ' · ' + C.compact(m.lb) + ' lb' : '') + (m.sets ? ' · ' + m.sets + ' set' + (m.sets === 1 ? '' : 's') : '') + (m.minutes ? ' · ' + m.minutes + ' min' : '');
}
function winsCard() {
  const head = '<div class="card-head"><div><h3 class="card-title">' + esc(T.feed) + '</h3><small class="muted">the crew’s wins</small></div><button class="linkbtn" data-share-wins>' + (shareOn() ? 'Sharing mine ✓' : 'Mine are private') + '</button></div>';
  if (!S.wins) return '<section class="card wins" id="winsBox">' + head + '<p class="muted" style="margin:0">Loading…</p></section>';
  const people = [S.myId, ...[...S.names.keys()].filter(id => id !== S.myId)];
  const color = id => C.SERIES[Math.max(0, people.indexOf(id)) % 3];
  const who = id => (id === S.myId ? 'You' : S.names.get(id) || 'Someone');
  const list = S.wins.slice(0, 25);
  return '<section class="card wins" id="winsBox">' + head +
    (list.length ? '<ol class="win-list">' + list.map(w =>
      '<li><span class="win-icon">' + (WIN_ICON[w.kind] || '⭐') + '</span><span class="win-body"><b><i style="background:' + color(w.created_by) + '"></i>' + esc(who(w.created_by)) + '</b> ' + esc(winText(w)) +
        '<small>' + esc(dayLabel(w.performed_on) === 'Today' ? 'Today' : w.performed_on === L.addDays(today(), -1) ? 'Yesterday' : fmtDay(w.performed_on, { weekday: 'short', month: 'short', day: 'numeric' })) + '</small></span>' +
        (w.created_by === S.myId ? '<button class="iconbtn sm" data-win-del="' + esc(w.id) + '" aria-label="Remove this from the stream">✕</button>' : '') + '</li>').join('') + '</ol>'
      : '<p class="muted" style="margin:0">' + esc(T.feedEmpty) + '</p>') + '</section>';
}

// ===========================================================================
// Session recap: what today added up to, then Finish to put it in the stream.
// ===========================================================================
function sessionSummary() {
  const sets = todaySets().filter(x => x.is_warmup !== true);
  if (!sets.length) return null;
  const lb = L.lbEquivalent(L.volumeByUnit(sets));
  const times = sets.map(x => Date.parse(x.logged_at)).filter(Number.isFinite);
  const minutes = times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 60000) : 0;
  const exIds = [...new Set(sets.map(x => x.exercise_id))];
  const prs = S.bestRows.filter(r => r.first_lifted_on === today());
  const byEx = new Map();
  for (const r of prs) if (!byEx.has(r.exercise_id) || Number(r.heaviest) > Number(byEx.get(r.exercise_id).heaviest)) byEx.set(r.exercise_id, r);
  const f = following();
  const prev = S.days.find(x => x.performed_on < today() && x.sets > 0);
  return { title: f ? f.template.name : nameFrom(exIds), lb, sets: sets.length, minutes: minutes >= 5 ? minutes : 0, exIds, prs: [...byEx.values()], prev };
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
      (r.prs.length ? '<div class="recap-prs">' + r.prs.map(p => '<div class="pr-flag" style="animation:none">🏆 ' + esc(exName(p.exercise_id)) + ' ' + esc(L.fmtLoad(Number(p.heaviest)) + ' ' + p.unit + ' × ' + p.reps) + '</div>').join('') + '</div>' : '') +
      '<div class="chips" style="margin-top:14px">' + r.exIds.map(id => '<span class="chip">' + esc(exName(id)) + '</span>').join('') + '</div>' +
      '<button class="btn primary block big" id="recapFinish" style="margin-top:18px">' + esc(shareOn() ? (posted ? T.updateFeed : T.finishFeed) : T.finishPrivate) + '</button>' +
      (shareOn() ? '' : '<p class="hint-line">Your wins are private, so this stays with you.</p>') +
    '</div>';
  openSheet();
}
async function recapClick(b) {
  if (b.id !== 'recapFinish') return;
  const r = sessionSummary();
  b.disabled = true;
  if (r && shareOn()) await postWin('session', r.title, { lb: Math.round(r.lb), sets: r.sets, minutes: r.minutes, lifts: r.exIds.length, prs: r.prs.length });
  stopRest(); sheet.close(); render();
  try { localStorage.setItem('lift.finished', today()); } catch (e) {}
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
  const live = (S.seasons || []).filter(x => inSeason(x) && phaseOf(x) === 'live');
  const sabbath = streakWeeks() >= 6 && w1.visits >= 3;
  return '<section class="card weekly"><div class="card-head"><div><div class="date">' + esc(T.weekly) + ' · ' + esc(fmtDay(lastWeek, { month: 'short', day: 'numeric' }) + ' – ' + fmtDay(L.addDays(lastWeek, 6), { month: 'short', day: 'numeric' })) + '</div>' +
      '<h3 class="card-title">' + (w1.visits ? w1.visits + ' gym day' + (w1.visits === 1 ? '' : 's') + ', ' + C.compact(w1.lb) + ' lb' : 'A rest week') + '</h3></div>' +
      '<button class="iconbtn sm" data-week-seen="' + lastWeek + '" aria-label="Hide last week’s recap">✕</button></div>' +
    '<div class="sb-stats"><div><b>' + w1.sets + '</b><small>sets</small></div><div><b>' + prs + '</b><small>PRs</small></div><div><b>' + (streakWeeks() || 0) + '</b><small>' + esc(T.streak) + '</small></div></div>' +
    (diff != null && w1.visits ? '<p class="hint-line">' + (diff >= 0 ? '▲ ' + diff + '% more' : '▼ ' + Math.abs(diff) + '% less') + ' pounds than the week before.</p>' : '') +
    (sabbath ? '<p class="hint-line">' + T.icons.rest + ' ' + esc(T.rest(streakWeeks())) + '</p>' : '') +
    (live.length ? '<p class="hint-line">' + live.map(x => { const g = goalsDone(x); return '<button class="linkbtn" data-season="' + esc(x.id) + '">' + esc(x.name) + '</button>: ' + g.done + ' of ' + g.of + ' goals done, ' + esc(seasonStatus(x)); }).join(' · ') + '</p>' : '') +
  '</section>';
}

// ===========================================================================
// The Communion of Saints: crew records, one holder per lift, by estimated 1-rep max.
// ===========================================================================
async function loadRecords() {
  if (S.recordsLoading || (S.records && Date.now() - S.recordsAt < 120000)) return;
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
  const rows = S.records.filter(r => !multi || Number(r.lifters) >= 2).sort((a, b) => Number(b.e1rm_lb) - Number(a.e1rm_lb)).slice(0, 15);
  const mine = rows.filter(r => r.user_id === S.myId).length;
  box.innerHTML = head + (rows.length ? '<p class="hint-line" style="margin-top:2px">You hold ' + mine + ' of these ' + rows.length + '. ' + esc(T.recordsBlurb) + '</p>' +
    '<div class="cmp-wrap"><table class="cmp saints"><thead><tr><th>Lift</th><th>' + esc(T.holderCol) + '</th><th>Best</th><th>You</th></tr></thead><tbody>' +
    rows.map(r => { const m = myBestE1(r.exercise_id), me = r.user_id === S.myId;
      return '<tr' + (me ? ' class="me"' : '') + '><td>' + esc(exName(r.exercise_id)) + '</td><td>' + T.icons.holder + ' ' + (me ? 'You' : esc(r.display_name)) + '</td>' +
        '<td class="num"><b>' + esc(L.fmtLoad(Number(r.weight))) + '</b> <small>' + r.unit + ' × ' + r.reps + '</small></td>' +
        '<td class="num">' + (me ? '<span class="muted">✓</span>' : m ? '<span title="Your best: ' + esc(L.fmtLoad(m.w) + ' × ' + m.reps) + '">' + Math.round(m.e / Number(r.e1rm_lb) * 100) + '%</span>' : '<span class="muted">–</span>') + '</td></tr>'; }).join('') +
    '</tbody></table></div>' : '<p class="muted">Records show up once the crew has logged some sets.</p>');
}
// After a set: did it take a record from someone else?
function checkRecord(x) {
  if (!S.records || x.is_warmup === true || !(Number(x.weight) > 0) || x.reps > 12) return;
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
  let done = null; try { done = localStorage.getItem('lift.finished'); } catch (e) {}
  const first = Math.min(...sets.map(x => Date.parse(x.logged_at)).filter(Number.isFinite)), last = Math.max(...sets.map(x => Date.parse(x.logged_at)).filter(Number.isFinite));
  if (!Number.isFinite(first)) return '';
  const finished = done === today(), live = !finished && Date.now() - last < 3 * 3600e3;
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
  { id: 'reps100', name: '100 reps of one lift', need: () => 100, have: ws => { const m = new Map(); for (const x of ws) m.set(x.exercise_id, (m.get(x.exercise_id) || 0) + x.reps); return Math.max(0, ...m.values()); } },
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
    qs.map(q => '<div class="goal"><div class="row"><span>' + (q.done ? '✅ ' : T.icons.questOpen + ' ') + esc(q.name) + (q.id === 'volume' ? ' (' + C.compact(q.needV) + ' lb)' : '') + '</span><span class="muted num">' +
      esc(q.fmt ? q.fmt(q.haveV) : L.fmtNum(q.haveV, 0) + ' / ' + L.fmtNum(q.needV, 0)) + '</span></div><div class="bar"><i style="width:' + (q.haveV / q.needV * 100).toFixed(1) + '%"></i></div></div>').join('') +
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
