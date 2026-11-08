// The crew's side of the recipe box: signing in, and the recipes, reviews and "I made this"
// notes kept in Supabase (supabase/sql/04_recipes.sql and 23_recipe_box.sql).
//
// The family files in data/ stay the public recipe box. Signed in, a member also sees what
// the crew has added or changed in the database (submitted and approved recipes, plus their
// own drafts), laid over the files. The admin approves recipes and downloads updated family
// files to commit. Who may do what is decided by the database, not by this file.
//
// supabase-js is only loaded once someone is signed in (here or in the lift log: same site,
// same sign-in) or asks to sign in, so the public page stays light.
window.RecipeCloud = (function () {
  'use strict';
  const BASE = document.currentScript ? document.currentScript.src : location.href;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let sb = null, me = null, names = new Map(), factor = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  async function client() {
    if (!sb) {
      const cfg = await import(new URL('../lift/config.js', BASE).href);
      const { createClient } = await import(cfg.SUPABASE_JS);
      sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    }
    return sb;
  }
  function hasSession() {
    try { for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i))) return true; } catch (e) {}
    return false;
  }
  function friendly(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match.';
    if (/recipes_unique_slug|duplicate key/i.test(m)) return 'Another recipe in that family already uses this link name. Change the link name under the title.';
    if (/valid_recipe_body|check constraint/i.test(m)) return 'The database turned that down: something is too long or not allowed (tags are up to 30 characters, at most 12; links must be YouTube).';
    if (/Only the admin/i.test(m)) return 'Only the admin can approve recipes.';
    if (/row-level security|permission denied|Not allowed/i.test(m)) return 'This account isn’t allowed to do that.';
    if (/rate|too many/i.test(m)) return m;
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Can’t reach the server. Check your connection.';
    return m;
  }
  const must = ({ data, error }) => { if (error) throw new Error(friendly(error)); return data; };

  // ---------------------------------------------------------------------------
  // Who's here.  state: 'out' | 'code' (needs the authenticator code) | 'outsider' | 'in'
  // ---------------------------------------------------------------------------
  let state = hasSession() ? 'checking' : 'out';
  async function check() {
    const c = await client();
    const { data } = await c.auth.getSession();
    me = null; factor = null;
    if (!data.session) { state = 'out'; return state; }
    const aal = must(await c.auth.mfa.getAuthenticatorAssuranceLevel());
    if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      factor = (must(await c.auth.mfa.listFactors()).totp || [])[0] || null;
      if (factor) { state = 'code'; return state; }
    }
    const row = (must(await c.rpc('me')) || [])[0];
    if (!row) { state = 'outsider'; return state; }
    if (row.mfa_required && !row.mfa_ok) {
      factor = (must(await c.auth.mfa.listFactors()).totp || [])[0] || null;
      state = factor ? 'code' : 'outsider';
      return state;
    }
    me = { id: data.session.user.id, name: row.display_name, admin: !!row.is_admin };
    names = new Map((must(await c.rpc('member_names')) || []).map(n => [n.user_id, n.display_name]));
    state = 'in';
    return state;
  }
  // Resolves once we know who's here. Doesn't load anything for a visitor who never signed in.
  let ready = state === 'out' ? Promise.resolve('out') : check().catch(e => { console.error(e); state = 'out'; return 'out'; });

  async function signIn(email, password) {
    const c = await client();
    must(await c.auth.signInWithPassword({ email, password }));
    ready = check(); await ready; emit();
  }
  async function verify(code) {
    must(await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code }));
    ready = check(); await ready; emit();
  }
  async function signOut() {
    if (sb) await sb.auth.signOut();
    me = null; state = 'out'; ready = Promise.resolve('out'); emit();
  }

  // ---------------------------------------------------------------------------
  // Recipe shapes. Files keep ingredients as a list, or an object of named groups;
  // the database keeps an ordered list of groups (jsonb would re-sort object keys).
  // ---------------------------------------------------------------------------
  const ORDER = ['id', 'title', 'from', 'serves', 'unit', 'time', 'video', 'tags', 'intro', 'ingredients', 'steps', 'notes'];
  const BODY = ['from', 'serves', 'unit', 'time', 'video', 'tags', 'intro', 'ingredients', 'steps', 'notes'];
  function groupsOf(ing) {
    if (Array.isArray(ing)) return ing.length ? [{ name: '', items: ing.slice() }] : [];
    return Object.entries(ing || {}).map(([name, items]) => ({ name, items: items.slice() }));
  }
  function ingredientsOf(groups) {
    groups = groups || [];
    if (groups.length === 1 && !groups[0].name) return groups[0].items.slice();
    const o = {};
    groups.forEach((g, i) => { let n = g.name || (i === 0 ? 'Ingredients' : 'More'); while (o[n]) n += ' (2)'; o[n] = g.items.slice(); });
    return o;
  }
  // A family-file recipe, with keys in the order the files are written in.
  function tidy(r) {
    const out = {};
    for (const k of ORDER) {
      const v = r[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length && k !== 'ingredients')) continue;
      out[k] = v;
    }
    return out;
  }
  function toRow(r) {
    const body = {};
    for (const k of BODY) {
      if (k === 'ingredients') { body.ingredients = groupsOf(r.ingredients); continue; }
      const v = r[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
      body[k] = v;
    }
    return { slug: r.id, title: r.title, body };
  }
  function fromRow(row) {
    const b = row.body || {};
    const r = tidy(Object.assign({}, b, { id: row.slug, title: row.title, ingredients: ingredientsOf(b.ingredients) }));
    Object.defineProperty(r, 'cloud', { enumerable: false, value: {
      row: row.id, status: row.status, updatedAt: row.updated_at, by: row.created_by, byName: names.get(row.created_by) || 'someone',
      note: row.review_note || '', deleted: !!row.deleted_at, mine: !!me && row.created_by === me.id, family: row.family_id,
    } });
    return r;
  }
  const same = (a, b) => JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));

  // ---------------------------------------------------------------------------
  // Loading: lay the database over the family files (as loaded by RecipeCore.loadFamilies)
  // ---------------------------------------------------------------------------
  let rows = [];
  async function overlay(families) {
    if ((await ready) !== 'in') return families;
    const [fams, recs] = await Promise.all([
      sb.from('recipe_families').select('id,name,about,deleted_at').order('name').then(must),
      sb.from('recipes').select('*').order('title').then(must),
    ]);
    rows = recs;
    for (const f of fams) {
      if (f.deleted_at) continue;
      let fam = families.find(x => x.id === f.id);
      if (!fam) { fam = { id: f.id, name: f.name, about: f.about || '', recipes: [], raw: { name: f.name, about: f.about || undefined, recipes: [] }, cloudOnly: true }; families.push(fam); }
      else if (fam.broken) { Object.assign(fam, { name: f.name, about: f.about || '', recipes: [], raw: { name: f.name, recipes: [] } }); delete fam.broken; }
    }
    for (const fam of families) fam.fileRecipes = fam.fileRecipes || fam.recipes.slice();
    for (const row of recs) {
      if (row.deleted_at) continue;
      const fam = families.find(x => x.id === row.family_id); if (!fam) continue;
      const r = fromRow(row);
      const at = fam.recipes.findIndex(x => x.id === r.id);
      if (at >= 0) fam.recipes[at] = r; else fam.recipes.push(r);
    }
    return families;
  }

  // ---------------------------------------------------------------------------
  // Saving from the editor
  //   status: 'draft' | 'submitted' | 'approved' (admin)
  //   prev:   the recipe's .cloud when editing one that's already in the database
  //   family: { id, name, about, isNew }  (only the admin can add a family)
  // ---------------------------------------------------------------------------
  async function save(family, recipe, status, prev) {
    if ((await ready) !== 'in') throw new Error('Sign in first.');
    if (family.isNew) must(await sb.from('recipe_families').insert({ id: family.id, name: family.name, about: family.about || null }));
    const row = Object.assign(toRow(recipe), { family_id: family.id, status });
    if (prev && prev.row) {
      const got = must(await sb.from('recipes').update(row).eq('id', prev.row).eq('updated_at', prev.updatedAt).select('*'));
      if (!got.length) throw new Error('Someone changed this recipe while you were editing. Copy anything you need, then reload to see their version.');
      return fromRow(got[0]);
    }
    return fromRow(must(await sb.from('recipes').insert(row).select('*'))[0]);
  }
  async function remove(cloud) {
    must(await sb.from('recipes').update({ deleted_at: new Date().toISOString() }).eq('id', cloud.row).select('id'));
  }
  async function restore(rowId) {
    must(await sb.from('recipes').update({ deleted_at: null }).eq('id', rowId).select('id'));
  }

  // ---------------------------------------------------------------------------
  // "I made this"
  // ---------------------------------------------------------------------------
  async function cooks(familyId, slug) {
    if ((await ready) !== 'in') return [];
    const list = must(await sb.from('recipe_cooks').select('id,cooked_on,note,created_by').eq('family_id', familyId).eq('slug', slug)
      .is('deleted_at', null).order('cooked_on', { ascending: false }).order('created_at', { ascending: false }).limit(50));
    return list.map(c => Object.assign(c, { name: names.get(c.created_by) || 'someone', mine: c.created_by === me.id }));
  }
  async function addCook(familyId, slug, note, on) {
    const row = { family_id: familyId, slug, note: note || null };
    if (on) row.cooked_on = on;
    must(await sb.from('recipe_cooks').insert(row).select('id'));
  }
  async function removeCook(id) {
    must(await sb.from('recipe_cooks').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id'));
  }

  // ---------------------------------------------------------------------------
  // The admin's desk
  // ---------------------------------------------------------------------------
  async function setStatus(rowId, status, note) {
    const patch = { status };
    if (note !== undefined) patch.review_note = note || null;
    must(await sb.from('recipes').update(patch).eq('id', rowId).select('id'));
  }
  // Recipes in the family files that the database doesn't have yet, copied in as approved.
  async function importFiles(families) {
    // any row counts, removed ones too, so a recipe the admin took out doesn't come back
    const have = new Set(rows.map(r => r.family_id + '/' + r.slug));
    const add = [];
    for (const fam of families) for (const r of (fam.fileRecipes || [])) {
      if (!have.has(fam.id + '/' + r.id)) add.push(Object.assign(toRow(r), { family_id: fam.id, status: 'approved' }));
    }
    for (let i = 0; i < add.length; i += 15) must(await sb.from('recipes').insert(add.slice(i, i + 15)).select('id'));
    return add.length;
  }
  // What the family file should become: the file's recipes, with approved database
  // recipes replacing or added to them, and recipes deleted in the database taken out.
  function familyFile(fam) {
    const live = rows.filter(r => r.family_id === fam.id && !r.deleted_at);
    const gone = new Set(rows.filter(r => r.family_id === fam.id && r.deleted_at && r.status === 'approved').map(r => r.slug));
    const approved = new Map(live.filter(r => r.status === 'approved').map(r => [r.slug, fromRow(r)]));
    const liveSlugs = new Set(live.map(r => r.slug));
    const recipes = [], changes = { added: [], changed: [], removed: [], waiting: live.filter(r => r.status !== 'approved').length };
    for (const r of (fam.fileRecipes || [])) {
      if (approved.has(r.id)) {
        const nr = approved.get(r.id); approved.delete(r.id);
        if (!same(r, nr)) changes.changed.push(nr.title);
        recipes.push(tidy(nr));
      } else if (gone.has(r.id) && !liveSlugs.has(r.id)) changes.removed.push(r.title);
      else recipes.push(r);
    }
    for (const nr of approved.values()) { changes.added.push(nr.title); recipes.push(tidy(nr)); }
    const raw = fam.raw || {};
    const file = { name: fam.name };
    if (fam.about) file.about = fam.about;
    for (const [k, v] of Object.entries(raw)) if (!['name', 'about', 'recipes'].includes(k)) file[k] = v;
    file.recipes = recipes;
    return { file, changes };
  }
  const allRows = () => rows.slice();

  // JSON with short lists kept on one line, matching how the family files are written by hand
  function pretty(obj) {
    return JSON.stringify(obj, null, 2).replace(/\[\n\s+("(?:[^"\\\n]|\\.)*"(?:,\n\s+"(?:[^"\\\n]|\\.)*")*)\n\s+\]/g, (m, inner) => {
      const one = '[' + inner.split(/,\n\s+/).join(', ') + ']';
      return one.length <= 70 ? one : m;
    }) + '\n';
  }

  // ---------------------------------------------------------------------------
  // The sign-in box, for any page. Calls onChange after signing in or out.
  // ---------------------------------------------------------------------------
  const CSS = `
    .rc-box { font-size: 14px; }
    .rc-box form { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin-top: 8px; }
    .rc-box label { display: block; font-size: 12px; color: var(--muted); }
    .rc-box input { padding: 7px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--field, var(--card)); min-width: 0; width: 220px; max-width: 100%; }
    .rc-box .rc-msg { color: var(--bad, #b3392b); margin: 6px 0 0; min-height: 0; }
    .rc-box p { margin: 0; }
    .rc-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .rc-badge { display: inline-block; font-size: 12px; font-weight: 600; border-radius: 99px; padding: 2px 9px; background: var(--mark, var(--chip)); color: var(--ink); }
    .rc-badge.draft { background: var(--chip); color: var(--muted); }
    .rc-note { margin-top: 8px; padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--chip); border-radius: 0 10px 10px 0; font-size: 14px; }
  `;
  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  }
  function mountAuth(el, opts) {
    opts = opts || {};
    style();
    el.classList.add('rc-box');
    const draw = () => {
      if (state === 'checking') { el.innerHTML = '<p class="hint">Checking your sign-in…</p>'; return; }
      if (state === 'in') {
        el.innerHTML = '<div class="rc-row"><span>Signed in as <b>' + esc(me.name) + '</b>' + (me.admin ? ' (admin)' : '') + '.</span>' +
          (opts.desk !== false ? '<a href="review.html">' + (me.admin ? 'Review recipes' : 'Your recipes') + '</a>' : '') +
          '<button type="button" data-rc="out">Sign out</button></div>';
      } else if (state === 'code') {
        el.innerHTML = '<form data-rc="code"><div><label for="rcCode">6-digit code from your authenticator app</label>' +
          '<input id="rcCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div>' +
          '<button type="submit" class="primary">Continue</button><button type="button" data-rc="out">Sign out</button></form><p class="rc-msg" role="alert"></p>';
      } else if (state === 'outsider') {
        el.innerHTML = '<div class="rc-row"><span>You’re signed in, but this account isn’t on the crew list.</span><button type="button" data-rc="out">Sign out</button></div>';
      } else if (el.dataset.open) {
        el.innerHTML = '<p class="hint">For the crew: same account as the lift log. No sign-ups.</p>' +
          '<form data-rc="in" autocomplete="on"><div><label for="rcEmail">Email</label><input id="rcEmail" type="email" autocomplete="username" required></div>' +
          '<div><label for="rcPw">Password</label><input id="rcPw" type="password" autocomplete="current-password" required></div>' +
          '<button type="submit" class="primary">Sign in</button><button type="button" data-rc="close">Cancel</button></form><p class="rc-msg" role="alert"></p>';
        el.querySelector('#rcEmail').focus();
      } else {
        el.innerHTML = '<div class="rc-row"><span class="hint" style="margin:0">' + esc(opts.pitch || 'On the crew? Sign in to add recipes and see what everyone’s cooked.') + '</span><button type="button" data-rc="open">Sign in</button></div>';
      }
    };
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-rc]'); if (!b || b.tagName === 'FORM') return;
      if (b.dataset.rc === 'open') { el.dataset.open = '1'; draw(); }
      if (b.dataset.rc === 'close') { delete el.dataset.open; draw(); }
      if (b.dataset.rc === 'out') { delete el.dataset.open; await signOut(); }
    });
    el.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, msg = el.querySelector('.rc-msg'), btn = f.querySelector('[type=submit]');
      btn.disabled = true; msg.textContent = '';
      try {
        if (f.dataset.rc === 'in') await signIn(f.querySelector('#rcEmail').value.trim(), f.querySelector('#rcPw').value);
        else await verify(f.querySelector('#rcCode').value.trim());
        delete el.dataset.open;
      } catch (x) { msg.textContent = friendly(x); btn.disabled = false; }
    });
    const onChange = () => { draw(); if (opts.onChange) opts.onChange(); };
    listeners.add(onChange);
    draw();
    if (state === 'checking') ready.then(draw);
    return () => listeners.delete(onChange);
  }
  function badge(r) {
    const c = r && r.cloud;
    if (!c) return '';
    if (c.status === 'draft') return '<span class="rc-badge draft">Draft · only you' + (me && me.admin && !c.mine ? ' and ' + esc(c.byName) : '') + '</span>';
    if (c.status === 'submitted') return '<span class="rc-badge">Waiting for review</span>';
    return '';
  }

  return {
    get state() { return state; }, get me() { return me; }, ready: () => ready, esc, friendly,
    mountAuth, badge, style, onChange: f => { listeners.add(f); return () => listeners.delete(f); },
    overlay, save, remove, restore, cooks, addCook, removeCook, setStatus, importFiles, familyFile, allRows, fromRow, toRow, tidy, same, pretty,
    nameOf: id => names.get(id) || 'someone',
  };
})();
