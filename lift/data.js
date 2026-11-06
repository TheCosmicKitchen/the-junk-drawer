// The storage layer. Two implementations of the same small interface:
//   SupaStore  the real thing: Supabase, row level security does the guarding
//   DemoStore  in-memory sample data for trying the app (?demo). Nothing is saved.
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS } from './config.js';
import { localDate, addDays, setVolume } from './logic.js';

const SET_COLS = 'id,exercise_id,performed_on,logged_at,date_only,weight,reps,unit,count_bodyweight,bodyweight,is_warmup,notes,import_batch_id,deleted_at';

export async function connect(demo) {
  if (demo) return new DemoStore();
  // Arrived from a Supabase email link (magic link, password reset, invite)? The link puts
  // the sign-in in the address after '#'. Note what kind it was before supabase-js reads it.
  const params = new URLSearchParams(location.hash.slice(1));
  const link = params.get('access_token') ? params.get('type') || 'link'
    : params.get('error_description') ? { error: params.get('error_description') } : null;
  const { createClient } = await import(SUPABASE_JS);
  const store = new SupaStore(createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }));
  store.link = link;
  if (link) {
    await store.sb.auth.getSession();   // let supabase-js finish reading the link
    history.replaceState(null, '', location.pathname + location.search + '#log');   // and get the token out of the address bar
  }
  return store;
}

// Turn Supabase/Postgres errors into something a person can act on.
function friendly(error) {
  const msg = (error && (error.message || error.error_description)) || String(error);
  if (/row-level security|permission denied/i.test(msg)) return new Error('That isn’t allowed for your account.');
  if (/Invalid login credentials/i.test(msg)) return new Error('That email and password don’t match.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Can’t reach the server. Check your connection.');
  if (/JWT expired/i.test(msg)) return new Error('Your session expired. Sign in again.');
  return new Error(msg);
}
function must({ data, error }) { if (error) throw friendly(error); return data; }

class SupaStore {
  constructor(sb) { this.sb = sb; this.demo = false; }

  // ----- auth -----
  async session() { return must(await this.sb.auth.getSession()).session; }
  async signIn(email, password) { must(await this.sb.auth.signInWithPassword({ email, password })); }
  async signOut() { await this.sb.auth.signOut(); }
  async aal() { return must(await this.sb.auth.mfa.getAuthenticatorAssuranceLevel()); }
  async totpFactors() { return must(await this.sb.auth.mfa.listFactors()).totp || []; }
  async enrollTotp() {
    // Clear out any half-finished setup first, so a reload doesn't pile them up.
    const all = must(await this.sb.auth.mfa.listFactors()).all || [];
    for (const f of all) if (f.factor_type === 'totp' && f.status !== 'verified') await this.sb.auth.mfa.unenroll({ factorId: f.id });
    return must(await this.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Lift log' }));
  }
  async verifyTotp(factorId, code) { must(await this.sb.auth.mfa.challengeAndVerify({ factorId, code })); }
  async me() { return must(await this.sb.rpc('me'))[0] || null; }
  async updatePassword(password) { must(await this.sb.auth.updateUser({ password })); }

  // ----- reads -----
  async all(build) {   // PostgREST returns at most 1000 rows per request
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = must(await build().range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }
  async catalog() {
    const [exercises, aliases] = await Promise.all([
      this.all(() => this.sb.from('lift_exercises').select('id,name,supports_bodyweight,deleted_at').order('name')),
      this.all(() => this.sb.from('lift_exercise_aliases').select('exercise_id,alias')),
    ]);
    return { exercises, aliases };
  }
  setsSince(date) {
    return this.all(() => this.sb.from('lift_sets').select(SET_COLS).is('deleted_at', null)
      .gte('performed_on', date).order('performed_on', { ascending: false }).order('logged_at', { ascending: false }));
  }
  async daySets(date) {
    return must(await this.sb.from('lift_sets').select(SET_COLS).is('deleted_at', null)
      .eq('performed_on', date).order('logged_at'));
  }
  async lastFor(exerciseId, beforeDate) {   // every set from the most recent day before `beforeDate`
    let q = this.sb.from('lift_sets').select(SET_COLS).is('deleted_at', null).eq('exercise_id', exerciseId);
    if (beforeDate) q = q.lt('performed_on', beforeDate);
    const rows = must(await q.order('performed_on', { ascending: false }).order('logged_at').limit(40));
    const day = rows[0] && rows[0].performed_on;
    return rows.filter(r => r.performed_on === day);
  }
  days() { return this.all(() => this.sb.from('lift_days').select('*').order('performed_on', { ascending: false })); }
  bests() { return this.all(() => this.sb.from('lift_bests').select('*')); }

  // ----- writes -----
  async addSet(row) { return must(await this.sb.from('lift_sets').insert(row).select(SET_COLS).single()); }
  async updateSet(id, patch) { return must(await this.sb.from('lift_sets').update(patch).eq('id', id).select(SET_COLS).single()); }
  deleteSet(id) { return this.updateSet(id, { deleted_at: new Date().toISOString() }); }
  restoreSet(id) { return this.updateSet(id, { deleted_at: null }); }
  async addExercise(name) {
    return must(await this.sb.from('lift_exercises').insert({ name }).select('id,name,supports_bodyweight,deleted_at').single());
  }

  // ----- people -----
  async userId() { const s = await this.session(); return s && s.user.id; }
  async memberNames() { return must(await this.sb.rpc('member_names')); }

  // ----- routines (lift_templates) -----
  // Returns your own routines plus everything the other person shares (the rules decide),
  // their exercises, and which shared ones you've subscribed to.
  async routines() {
    const [templates, subs] = await Promise.all([
      this.all(() => this.sb.from('lift_templates').select('id,name,notes,is_shared,created_by,updated_at').is('deleted_at', null).order('name')),
      this.all(() => this.sb.from('lift_routine_subscriptions').select('id,template_id').is('deleted_at', null)),
    ]);
    const ids = templates.map(t => t.id);
    const items = ids.length ? await this.all(() => this.sb.from('lift_template_items')
      .select('id,template_id,exercise_id,position,sets,reps,load_mode,load_value,unit').is('deleted_at', null)
      .in('template_id', ids).order('position')) : [];
    return { templates, items, subs };
  }
  async addRoutine(fields) { return must(await this.sb.from('lift_templates').insert(fields).select('id,name,notes,is_shared,created_by,updated_at').single()); }
  async updateRoutine(id, patch) { return must(await this.sb.from('lift_templates').update(patch).eq('id', id).select('id,name,notes,is_shared,created_by,updated_at').single()); }
  deleteRoutine(id) { return this.updateRoutine(id, { deleted_at: new Date().toISOString() }); }
  async addItem(fields) { return must(await this.sb.from('lift_template_items').insert(fields).select('id,template_id,exercise_id,position,sets,reps,load_mode,load_value,unit').single()); }
  async updateItem(id, patch) { return must(await this.sb.from('lift_template_items').update(patch).eq('id', id).select('id,template_id,exercise_id,position,sets,reps,load_mode,load_value,unit').single()); }
  removeItem(id) { return this.updateItem(id, { deleted_at: new Date().toISOString() }); }
  async subscribe(templateId) { return must(await this.sb.from('lift_routine_subscriptions').insert({ template_id: templateId }).select('id,template_id').single()); }
  async unsubscribe(subId) { must(await this.sb.from('lift_routine_subscriptions').update({ deleted_at: new Date().toISOString() }).eq('id', subId)); }

  // ----- seasons -----
  async seasons() {
    const [seasons, goals] = await Promise.all([
      this.all(() => this.sb.from('lift_seasons').select('id,name,starts_on,ends_on').is('deleted_at', null).order('starts_on', { ascending: false })),
      this.all(() => this.sb.from('lift_season_goals').select('id,season_id,name,metric,target,unit').is('deleted_at', null)),
    ]);
    return { seasons, goals };
  }
  async addSeason(f) { return must(await this.sb.from('lift_seasons').insert(f).select('id,name,starts_on,ends_on').single()); }
  async updateSeason(id, patch) { return must(await this.sb.from('lift_seasons').update(patch).eq('id', id).select('id,name,starts_on,ends_on').single()); }
  deleteSeason(id) { return this.updateSeason(id, { deleted_at: new Date().toISOString() }); }
  async addGoal(f) { return must(await this.sb.from('lift_season_goals').insert(f).select('id,season_id,name,metric,target,unit').single()); }
  async deleteGoal(id) { must(await this.sb.from('lift_season_goals').update({ deleted_at: new Date().toISOString() }).eq('id', id)); }
}

// ---------------------------------------------------------------------------
// Demo: a few weeks of believable lifting, held in memory.
// ---------------------------------------------------------------------------
const DEMO_EXERCISES = [
  ['Bench Press', ['bench']], ['Barbell Squat', ['squat']], ['Deadlift', []], ['Lat Pulldown', []],
  ['Shoulder Press', ['ohp']], ['Bicep Curl', ['curl']], ['Dips', []], ['Leg Press', []],
  ['Face Pull', []], ['Hip Thrust', []], ['Seated Cable Row', []], ['Tricep Pushdown', []],
  ['Pull Up', ['pullups', 'pull-ups']], ['Goblet Squat', []], ['Lateral Raise', []], ['RDL', ['romanian deadlift']],
];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

class DemoStore {
  constructor() {
    this.demo = true;
    this.exercises = DEMO_EXERCISES.map(([name], i) => ({ id: 'ex' + i, name, supports_bodyweight: /Dips|Pull Up/.test(name), deleted_at: null }));
    this.aliases = DEMO_EXERCISES.flatMap(([, al], i) => al.map(alias => ({ exercise_id: 'ex' + i, alias })));
    this.sets = [];
    // Push / pull / legs, three or four days a week, slowly getting stronger.
    const plan = [
      [['ex0', 135, 8, 3], ['ex4', 85, 8, 3], ['ex6', 0, 10, 3], ['ex11', 50, 12, 3]],
      [['ex3', 120, 10, 3], ['ex10', 110, 10, 3], ['ex5', 30, 10, 3], ['ex8', 40, 15, 3]],
      [['ex1', 185, 5, 4], ['ex15', 155, 8, 3], ['ex7', 270, 10, 3], ['ex9', 185, 10, 3]],
    ];
    const today = localDate();
    let n = 0;
    for (let back = 52; back >= 1; back--) {
      if ([1, 3, 5].includes((back * 3) % 7) === false && back % 7 !== 2) continue;
      const day = addDays(today, -back), block = plan[n++ % 3], grow = Math.floor((52 - back) / 10);
      let minute = 0;
      block.forEach(([ex, w, r, sets]) => {
        for (let s = 0; s < sets; s++) this.push({
          exercise_id: ex, performed_on: day, logged_at: new Date(new Date(day + 'T18:00:00').getTime() + (minute++) * 150000).toISOString(),
          weight: w ? w + grow * (w >= 100 ? 10 : 5) : 0, reps: Math.max(3, r - (s === sets - 1 ? 1 : 0)), unit: 'lb',
          count_bodyweight: ex === 'ex6', bodyweight: ex === 'ex6' ? 180 : null });
      });
    }
  }
  push(r) {
    const row = { id: uid(), date_only: false, is_warmup: false, notes: null, import_batch_id: null, deleted_at: null,
      count_bodyweight: false, bodyweight: null, ...r };
    this.sets.push(row);
    return row;
  }
  live() { return this.sets.filter(s => !s.deleted_at); }
  async session() { return { user: { email: 'demo@example.com' } }; }
  async signIn() {}
  async signOut() { location.search = ''; }
  async aal() { return { currentLevel: 'aal2', nextLevel: 'aal2' }; }
  async updatePassword() {}
  async me() { return { display_name: 'Demo lifter', is_admin: true, mfa_required: false, mfa_ok: true }; }
  async catalog() { return { exercises: structuredClone(this.exercises), aliases: structuredClone(this.aliases) }; }
  async setsSince(date) { return this.live().filter(s => s.performed_on >= date).sort(byNewest).map(clone); }
  async daySets(date) { return this.live().filter(s => s.performed_on === date).sort((a, b) => a.logged_at.localeCompare(b.logged_at)).map(clone); }
  async lastFor(exerciseId, beforeDate) {
    const rows = this.live().filter(s => s.exercise_id === exerciseId && (!beforeDate || s.performed_on < beforeDate)).sort(byNewest);
    const day = rows[0] && rows[0].performed_on;
    return rows.filter(r => r.performed_on === day).reverse().map(clone);
  }
  async days() {
    const m = new Map();
    for (const s of this.live()) {
      if (s.is_warmup === true) continue;
      const d = m.get(s.performed_on) || { performed_on: s.performed_on, sets: 0, ex: new Set(), volume_lb: 0, volume_kg: 0 };
      d.sets++; d.ex.add(s.exercise_id); d['volume_' + s.unit] += setVolume(s);
      m.set(s.performed_on, d);
    }
    return [...m.values()].map(({ ex, ...d }) => ({ ...d, exercises: ex.size })).sort((a, b) => b.performed_on.localeCompare(a.performed_on));
  }
  async bests() {
    const m = new Map();
    for (const s of this.live().sort((a, b) => a.performed_on.localeCompare(b.performed_on))) {
      if (s.is_warmup === true) continue;
      const k = s.exercise_id + '|' + s.unit + '|' + s.reps, cur = m.get(k);
      if (!cur || s.weight > cur.heaviest) m.set(k, { exercise_id: s.exercise_id, unit: s.unit, reps: s.reps, heaviest: s.weight, first_lifted_on: s.performed_on });
    }
    return [...m.values()];
  }
  async addSet(r) { return clone(this.push({ ...r, logged_at: r.logged_at || new Date().toISOString() })); }
  async updateSet(id, patch) {
    const s = this.sets.find(x => x.id === id);
    if (!s) throw new Error('That set is gone.');
    Object.assign(s, patch);
    return clone(s);
  }
  deleteSet(id) { return this.updateSet(id, { deleted_at: new Date().toISOString() }); }
  restoreSet(id) { return this.updateSet(id, { deleted_at: null }); }
  async addExercise(name) {
    const e = { id: uid(), name, supports_bodyweight: false, deleted_at: null };
    this.exercises.push(e);
    return clone(e);
  }

  // ----- people: you, and a pretend friend who shares a routine -----
  async userId() { return 'me'; }
  async memberNames() { return [{ user_id: 'me', display_name: 'Demo lifter' }, { user_id: 'alex', display_name: 'Alex' }]; }

  // ----- routines -----
  seedRoutines() {
    if (this.templates) return;
    const now = new Date().toISOString();
    this.templates = [
      { id: 't-push', name: 'Push day', notes: 'Heavy bench, then accessories.', is_shared: false, created_by: 'me', updated_at: now },
      { id: 't-legs', name: 'Alex’s leg day', notes: 'No skipping.', is_shared: true, created_by: 'alex', updated_at: now },
      { id: 't-pull', name: 'Alex’s pull day', notes: '', is_shared: true, created_by: 'alex', updated_at: now },
    ];
    const it = (template_id, exercise_id, position, sets, reps, load_mode, load_value) =>
      ({ id: uid(), template_id, exercise_id, position, sets, reps, load_mode, load_value, unit: 'lb' });
    this.items = [
      it('t-push', 'ex0', 1, 3, 5, 'percent_1rm', 80), it('t-push', 'ex4', 2, 3, 8, 'fixed', 95), it('t-push', 'ex6', 3, 3, 10, 'fixed', 0), it('t-push', 'ex11', 4, 3, 12, 'fixed', 50),
      it('t-legs', 'ex1', 1, 4, 5, 'percent_1rm', 75), it('t-legs', 'ex15', 2, 3, 8, 'fixed', 155), it('t-legs', 'ex7', 3, 3, 10, 'fixed', 270),
      it('t-pull', 'ex3', 1, 3, 10, 'fixed', 120), it('t-pull', 'ex10', 2, 3, 10, 'fixed', 110), it('t-pull', 'ex5', 3, 3, 10, 'fixed', 30),
    ];
    this.subs = [{ id: uid(), template_id: 't-legs' }];
  }
  async routines() {
    this.seedRoutines();
    const visible = this.templates.filter(t => !t.deleted_at && (t.created_by === 'me' || t.is_shared));
    const ids = new Set(visible.map(t => t.id));
    return {
      templates: visible.map(clone),
      items: this.items.filter(i => !i.deleted_at && ids.has(i.template_id)).sort((a, b) => a.position - b.position).map(clone),
      subs: this.subs.filter(s => !s.deleted_at).map(clone),
    };
  }
  async addRoutine(f) { this.seedRoutines(); const t = { id: uid(), notes: '', is_shared: false, created_by: 'me', updated_at: new Date().toISOString(), ...f }; this.templates.push(t); return clone(t); }
  async updateRoutine(id, patch) {
    const t = this.templates.find(x => x.id === id);
    if (!t || t.created_by !== 'me') throw new Error('That isn’t allowed for your account.');
    Object.assign(t, patch, { updated_at: new Date().toISOString() });
    return clone(t);
  }
  deleteRoutine(id) { return this.updateRoutine(id, { deleted_at: new Date().toISOString() }); }
  async addItem(f) { const i = { id: uid(), position: 1, sets: 3, reps: 8, load_mode: 'fixed', load_value: 0, unit: 'lb', ...f }; this.items.push(i); return clone(i); }
  async updateItem(id, patch) { const i = this.items.find(x => x.id === id); Object.assign(i, patch); return clone(i); }
  removeItem(id) { return this.updateItem(id, { deleted_at: new Date().toISOString() }); }
  async subscribe(templateId) { const s = { id: uid(), template_id: templateId }; this.subs.push(s); return clone(s); }
  async unsubscribe(subId) { const s = this.subs.find(x => x.id === subId); if (s) s.deleted_at = new Date().toISOString(); }

  // ----- seasons -----
  async seasons() {
    if (!this.seasonRows) {
      const t = localDate();
      this.seasonRows = [{ id: 's-fall', name: 'Fall block', starts_on: addDays(t, -40), ends_on: addDays(t, 20) }];
      this.goalRows = [
        { id: uid(), season_id: 's-fall', name: 'Show up', metric: 'visits', target: 24, unit: null },
        { id: uid(), season_id: 's-fall', name: 'Move a mountain', metric: 'volume', target: 400000, unit: 'lb' },
      ];
    }
    return { seasons: this.seasonRows.filter(s => !s.deleted_at).map(clone), goals: this.goalRows.filter(g => !g.deleted_at).map(clone) };
  }
  async addSeason(f) { await this.seasons(); const s = { id: uid(), ...f }; this.seasonRows.push(s); return clone(s); }
  async updateSeason(id, patch) { const s = this.seasonRows.find(x => x.id === id); Object.assign(s, patch); return clone(s); }
  deleteSeason(id) { return this.updateSeason(id, { deleted_at: new Date().toISOString() }); }
  async addGoal(f) { const g = { id: uid(), unit: null, ...f }; this.goalRows.push(g); return clone(g); }
  async deleteGoal(id) { const g = this.goalRows.find(x => x.id === id); if (g) g.deleted_at = new Date().toISOString(); }
}
const clone = o => ({ ...o });
const byNewest = (a, b) => (b.performed_on + b.logged_at).localeCompare(a.performed_on + a.logged_at);
