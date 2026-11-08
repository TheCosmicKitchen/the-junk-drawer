// The shared tracker: one writer keeps their November in Supabase, and the crew can follow it.
// Who may do what is decided by the database (supabase/sql/22_piroshki.sql), not by this page:
// the writer can save only their own progress, crew members can only read it, and nobody else
// can see anything. The sign-in is the same one the lift log uses, so being signed in there
// counts here too (same site, same browser).
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS } from '../lift/config.js';

const YEAR = new Date().getFullYear();
const SESSION_KEY = 'sb-' + new URL(SUPABASE_URL).hostname.split('.')[0] + '-auth-token';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const body = $('sharedBody');
const P = window.Piroshki;

let sb = null, access = null, viewing = 'theirs';
async function client() {
  if (!sb) {
    const { createClient } = await import(SUPABASE_JS);
    sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }
  return sb;
}
function friendly(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match.';
  if (/row-level security|permission denied|Not allowed/i.test(m)) return 'This account isn’t allowed to do that.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Can’t reach the server. Check your connection.';
  return m;
}
const must = ({ data, error }) => { if (error) throw new Error(friendly(error)); return data; };

// ---------------------------------------------------------------------------
// Signing in (password, then an authenticator code if the account has one)
// ---------------------------------------------------------------------------
function showSignIn(problem) {
  body.innerHTML =
    '<p class="hint" style="margin:0">For the crew and the one person whose progress is shared. Same account as the lift log; no sign-ups.</p>' +
    '<form id="sharedForm" autocomplete="on"><div><label for="shEmail">Email</label><input id="shEmail" type="email" autocomplete="username" required></div>' +
    '<div><label for="shPw">Password</label><input id="shPw" type="password" autocomplete="current-password" required></div>' +
    '<div class="btns"><button class="primary" type="submit">Sign in</button><button type="button" id="signInCancel">Cancel</button></div>' +
    '<p class="warnmsg" role="alert">' + esc(problem || '') + '</p></form>';
  const f = $('sharedForm');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = f.querySelector('button[type="submit"]'), msg = f.querySelector('.warnmsg');
    btn.disabled = true; msg.textContent = '';
    try {
      const c = await client();
      must(await c.auth.signInWithPassword({ email: $('shEmail').value.trim(), password: $('shPw').value }));
      await afterSignIn();
    } catch (x) { msg.textContent = friendly(x); btn.disabled = false; }
  });
  $('signInCancel').onclick = showSignedOut;
  $('shEmail').focus();
}
function showCode(factor) {
  body.innerHTML = '<form id="codeForm"><div><label for="shCode">6-digit code from your authenticator app</label>' +
    '<input id="shCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div>' +
    '<div class="btns"><button class="primary" type="submit">Continue</button><button type="button" id="codeCancel">Sign out</button></div><p class="warnmsg" role="alert"></p></form>';
  const f = $('codeForm');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = f.querySelector('.warnmsg');
    try { must(await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: $('shCode').value.trim() })); await afterSignIn(); }
    catch (x) { msg.textContent = friendly(x); }
  });
  $('codeCancel').onclick = signOut;
  $('shCode').focus();
}
function showSignedOut() {
  body.innerHTML = '<p class="hint" style="margin:0">Following a friend, or writing for the crew to follow? <button type="button" id="signInOpen">Sign in</button></p>';
  $('signInOpen').onclick = () => showSignIn();
}
async function signOut() {
  if (sb) await sb.auth.signOut();
  access = null; P.local(); setFoot(); showSignedOut();
}

async function afterSignIn() {
  body.innerHTML = '<p class="hint" style="margin:0">Checking your account…</p>';
  const aal = must(await sb.auth.mfa.getAuthenticatorAssuranceLevel());
  if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    const f = (must(await sb.auth.mfa.listFactors()).totp || [])[0];
    if (f) return showCode(f);
  }
  access = (must(await sb.rpc('piroshki_access')) || [])[0] || {};
  if (access.can_write) return startWriting();
  if (access.can_read) return startReading();
  body.innerHTML = '<p style="margin:0">You’re signed in, but this account can’t see the shared tracker. If you’re on the crew and use an authenticator code, open the <a href="../lift/">lift log</a> once to finish signing in.</p>' +
    '<div class="btns" style="margin-top:12px"><button type="button" id="shOut">Sign out</button></div>';
  $('shOut').onclick = signOut;
}

// ---------------------------------------------------------------------------
// The writer: the page works as usual, and every change is also saved to Supabase
// ---------------------------------------------------------------------------
let timer = null, pending = null, hasRow = false;
function status(t, bad) { const el = $('shStatus'); if (el) { el.textContent = t; el.className = bad ? 'warnmsg' : 'saved'; } }
function push(snapshot) {
  pending = snapshot;
  status('Saving…');
  clearTimeout(timer);
  timer = setTimeout(flush, 1200);   // one save per burst of typing; the database allows 30 a minute
}
async function flush() {
  if (!pending) return;
  const data = pending; pending = null;
  try {
    if (hasRow) must(await sb.from('piroshki_progress').update({ data }).eq('year', YEAR).select('id'));
    else { must(await sb.from('piroshki_progress').insert({ year: YEAR, data }).select('id')); hasRow = true; }
    status('Saved for the crew ✓');
  } catch (x) { status('Not saved: ' + friendly(x) + ' It’s still in this browser; it will try again on your next change.', true); }
}
async function startWriting() {
  const row = must(await sb.from('piroshki_progress').select('data,updated_at').eq('year', YEAR).maybeSingle());
  hasRow = !!row;
  // Bring in whatever this browser already has (the cookie from before sharing, or another device's
  // words), then save the result, so moving over takes nothing but signing in.
  const m = P.mergeLocal(row ? row.data : null);
  P.write(m.data, push);
  const fresh = !row && P.snapshot().setup;
  if (m.added || fresh) push(P.snapshot());
  body.innerHTML = '<p style="margin:0">Signed in as <b>' + esc(access.writer_name || 'the writer') + '</b>. Everything you log here is saved for the crew to follow; only you can change it.</p>' +
    '<p class="saved" id="shStatus">' + (m.added ? 'Bringing in ' + m.added.toLocaleString('en-US') + ' words from this browser…' : fresh ? 'Copying your tracker from this browser…' : row ? 'Loaded your saved progress ✓' : 'Ready') + '</p>' +
    '<details><summary>Change password</summary><form id="pwForm"><div><label for="shNewPw">New password (12+ characters)</label>' +
    '<input id="shNewPw" type="password" autocomplete="new-password" minlength="12" required></div>' +
    '<div class="btns"><button type="submit">Change password</button></div><p class="warnmsg" role="alert"></p></form></details>' +
    '<div class="btns" style="margin-top:12px"><button type="button" id="shOut">Sign out</button></div>';
  $('shOut').onclick = signOut;
  const f = $('pwForm');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = f.querySelector('.warnmsg'), pw = $('shNewPw').value;
    if (pw.length < 12) { msg.textContent = 'Use at least 12 characters.'; return; }
    try { must(await sb.auth.updateUser({ password: pw })); $('shNewPw').value = ''; msg.className = 'saved'; msg.textContent = 'Password changed.'; }
    catch (x) { msg.className = 'warnmsg'; msg.textContent = friendly(x); }
  });
  setFoot();
}
window.addEventListener('pagehide', () => { if (pending) flush(); });

// ---------------------------------------------------------------------------
// A crew member: follow the writer's progress, or flip back to your own (this browser's)
// ---------------------------------------------------------------------------
async function loadTheirs() {
  const row = must(await sb.from('piroshki_progress').select('data,updated_at').eq('year', YEAR).maybeSingle());
  P.read(row ? row.data : null, access.writer_name);
  return row;
}
async function startReading() {
  const name = access.writer_name;
  if (!name) {
    body.innerHTML = '<p style="margin:0">Nobody is sharing their progress yet.</p><div class="btns" style="margin-top:12px"><button type="button" id="shOut">Sign out</button></div>';
    $('shOut').onclick = signOut;
    return;
  }
  let row = null;
  if (viewing === 'theirs') row = await loadTheirs(); else P.local();
  body.innerHTML = '<p style="margin:0">' + (viewing === 'theirs'
      ? 'Following <b>' + esc(name) + '</b>' + (row ? ', last saved ' + esc(new Date(row.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : '') + '.'
      : 'Showing your own tracker, from this browser.') + '</p>' +
    '<div class="btns" style="margin-top:12px"><button type="button" class="primary" id="shFlip">' + (viewing === 'theirs' ? 'Show mine' : 'Show ' + esc(name) + '’s') + '</button>' +
    '<button type="button" id="shOut">Sign out</button></div>' +
    '<p class="hint">Signing out here also signs you out of the lift log on this device.</p>';
  $('shFlip').onclick = () => { viewing = viewing === 'theirs' ? 'mine' : 'theirs'; startReading().catch(x => status(friendly(x), true)); };
  $('shOut').onclick = signOut;
  setFoot();
}
// Coming back to the tab: pick up any words written since.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && access && access.can_read && !access.can_write && viewing === 'theirs' && access.writer_name) loadTheirs().catch(() => {});
});

function setFoot() {
  $('footNote').textContent = P.mode === 'write' ? 'Saved to the shared tracker, with a copy in this browser.'
    : P.mode === 'read' ? 'Read-only: only the writer can change these numbers.'
    : 'Saved in a cookie in this browser only, so use the same phone or laptop each time.';
}

// Start: only load supabase-js if this browser is already signed in (here or in the lift log).
$('signInOpen').onclick = () => showSignIn();
let signedIn = false;
try { signedIn = !!localStorage.getItem(SESSION_KEY); } catch (e) {}
if (signedIn) {
  client().then(c => c.auth.getSession()).then(({ data }) => data.session ? afterSignIn() : showSignedOut())
    .catch(x => showSignIn(friendly(x)));
}
