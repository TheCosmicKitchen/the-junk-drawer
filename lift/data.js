// The storage layer. Two implementations of the same small interface:
//   SupaStore  the real thing: Supabase, row level security does the guarding
//   DemoStore  in-memory sample data for trying the app (?demo). Nothing is saved.
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS } from './config.js';
import { localDate, addDays, setVolume } from './logic.js';

const SET_COLS = 'id,exercise_id,performed_on,logged_at,date_only,weight,reps,unit,count_bodyweight,bodyweight,is_warmup,notes,import_batch_id,deleted_at';

export async function connect(demo) {
  if (demo) {
    // ?demo&slow pretends saving takes 1.5 s, &fail that the database refuses it, and &offline that there's
    // no signal until window.__demoOnline is set (then fire an 'online' event), to try the outbox.
    const st = new DemoStore(), q = new URLSearchParams(location.search);
    if (q.has('slow')) {
      const add = st.addSets.bind(st);
      st.addSets = async rows => {
        await new Promise(r => setTimeout(r, 1500));
        if (q.has('offline') && !window.__demoOnline) throw new Error('Can’t reach the server. Check your connection.');
        if (q.has('fail')) throw new Error('That isn’t allowed for your account (pretend).');
        return add(rows);
      };
    }
    return st;
  }
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
  async setsByIds(ids) { const out = must(await this.sb.from('lift_sets').select(SET_COLS).in('id', ids)); return ids.map(id => out.find(o => o.id === id)).filter(Boolean); }
  async addSets(rows) {   // several sets in one request, returned in the same order
    const out = must(await this.sb.from('lift_sets').insert(rows).select(SET_COLS));
    const t = x => new Date(x).getTime();
    return rows.map((r, i) => out.find(o => t(o.logged_at) === t(r.logged_at) && o.exercise_id === r.exercise_id) || out[i]);
  }
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
      this.all(() => this.sb.from('lift_templates').select(TPL).is('deleted_at', null).order('name')),
      this.all(() => this.sb.from('lift_routine_subscriptions').select('id,template_id').is('deleted_at', null)),
    ]);
    const ids = templates.map(t => t.id);
    const items = ids.length ? await this.all(() => this.sb.from('lift_template_items')
      .select('id,template_id,exercise_id,position,sets,reps,load_mode,load_value,unit,rest_s,note').is('deleted_at', null)
      .in('template_id', ids).order('position')) : [];
    return { templates, items, subs };
  }
  async addRoutine(fields) { return must(await this.sb.from('lift_templates').insert(fields).select(TPL).single()); }
  async updateRoutine(id, patch) { return must(await this.sb.from('lift_templates').update(patch).eq('id', id).select(TPL).single()); }
  deleteRoutine(id) { return this.updateRoutine(id, { deleted_at: new Date().toISOString() }); }
  async addItem(fields) { return must(await this.sb.from('lift_template_items').insert(fields).select('id,template_id,exercise_id,position,sets,reps,load_mode,load_value,unit,rest_s,note').single()); }
  async updateItem(id, patch) { return must(await this.sb.from('lift_template_items').update(patch).eq('id', id).select('id,template_id,exercise_id,position,sets,reps,load_mode,load_value,unit,rest_s,note').single()); }
  removeItem(id) { return this.updateItem(id, { deleted_at: new Date().toISOString() }); }
  async subscribe(templateId) { return must(await this.sb.from('lift_routine_subscriptions').insert({ template_id: templateId }).select('id,template_id').single()); }
  async unsubscribe(subId) { must(await this.sb.from('lift_routine_subscriptions').update({ deleted_at: new Date().toISOString() }).eq('id', subId)); }

  // ----- seasons -----
  async seasons() {
    const [seasons, goals, subs, plan] = await Promise.all([
      this.all(() => this.sb.from('lift_seasons').select(SEASON).is('deleted_at', null).order('starts_on', { ascending: false })),
      this.all(() => this.sb.from('lift_season_goals').select('id,season_id,name,metric,target,unit,exercise_id,template_id,created_by').is('deleted_at', null)),
      this.all(() => this.sb.from('lift_season_subscriptions').select('id,season_id').is('deleted_at', null)),
      this.all(() => this.sb.from('lift_season_plan').select(PLAN).is('deleted_at', null)),
    ]);
    return { seasons, goals, subs, plan };
  }
  async addSeason(f) { return must(await this.sb.from('lift_seasons').insert(f).select(SEASON).single()); }
  async updateSeason(id, patch) { return must(await this.sb.from('lift_seasons').update(patch).eq('id', id).select(SEASON).single()); }
  deleteSeason(id) { return this.updateSeason(id, { deleted_at: new Date().toISOString() }); }
  async addPlan(f) { return must(await this.sb.from('lift_season_plan').insert(f).select(PLAN).single()); }
  async updatePlan(id, patch) { return must(await this.sb.from('lift_season_plan').update(patch).eq('id', id).select(PLAN).single()); }
  removePlan(id) { return this.updatePlan(id, { deleted_at: new Date().toISOString() }); }
  async joinSeason(seasonId) { return must(await this.sb.from('lift_season_subscriptions').insert({ season_id: seasonId }).select('id,season_id').single()); }
  async leaveSeason(subId) { must(await this.sb.from('lift_season_subscriptions').update({ deleted_at: new Date().toISOString() }).eq('id', subId)); }
  // Everyone in a shared season, totals only (the database never hands over the other person's sets).
  async standings(seasonId) { return must(await this.sb.rpc('season_standings', { p_season: seasonId })); }
  async seasonWorkouts(seasonId) { return must(await this.sb.rpc('season_workouts', { p_season: seasonId })); }
  async seasonBests(seasonId) { return must(await this.sb.rpc('season_bests', { p_season: seasonId })); }
  async seasonPrs(seasonId) { return must(await this.sb.rpc('season_prs', { p_season: seasonId })); }
  async crewRecords() { return must(await this.sb.rpc('crew_records')); }
  async seasonDaily(seasonId) { return must(await this.sb.rpc('season_daily', { p_season: seasonId })); }

  // ----- the stream of wins: PRs, clubs, goals, finished sessions (no reactions, no comments) -----
  async wins() {
    return must(await this.sb.from('lift_posts').select(POST).is('deleted_at', null)
      .gte('performed_on', addDays(localDate(), -21)).order('created_at', { ascending: false }).limit(60));
  }
  // One line per person, kind, day and title: a second PR on the same lift today updates its line.
  async postWin(f) {
    const me = await this.userId();
    const have = must(await this.sb.from('lift_posts').select('id').eq('created_by', me).eq('kind', f.kind).eq('performed_on', f.performed_on).eq('title', f.title).is('deleted_at', null).limit(1));
    if (have.length) return must(await this.sb.from('lift_posts').update({ summary: f.summary }).eq('id', have[0].id).select(POST).single());
    return must(await this.sb.from('lift_posts').insert(f).select(POST).single());
  }
  async removeWin(id) { must(await this.sb.from('lift_posts').update({ deleted_at: new Date().toISOString() }).eq('id', id)); }
  // Every working set you've logged for one exercise, oldest first (for its trend chart).
  async exerciseHistory(exerciseId) {
    return this.all(() => this.sb.from('lift_sets').select('performed_on,weight,reps,unit,is_warmup').is('deleted_at', null)
      .eq('exercise_id', exerciseId).order('performed_on'));
  }

  // ----- workout days: a workout put on a date -----
  async workoutDays(fromDate) {
    return this.all(() => this.sb.from('lift_workout_days').select('id,template_id,on_date').is('deleted_at', null).gte('on_date', fromDate).order('on_date'));
  }
  async addWorkoutDay(f) { return must(await this.sb.from('lift_workout_days').insert(f).select('id,template_id,on_date').single()); }
  async removeWorkoutDay(id) { must(await this.sb.from('lift_workout_days').update({ deleted_at: new Date().toISOString() }).eq('id', id)); }

  // ----- bodyweight -----
  async bodyweights() {
    return must(await this.sb.from('lift_bodyweight').select('id,measured_on,weight,unit,created_at').is('deleted_at', null)
      .order('measured_on', { ascending: false }).order('created_at', { ascending: false }).limit(400));
  }
  async addBodyweight(f) { return must(await this.sb.from('lift_bodyweight').insert(f).select('id,measured_on,weight,unit,created_at').single()); }
  async removeBodyweight(id) { must(await this.sb.from('lift_bodyweight').update({ deleted_at: new Date().toISOString() }).eq('id', id)); }
  async addGoal(f) { return must(await this.sb.from('lift_season_goals').insert(f).select('id,season_id,name,metric,target,unit,exercise_id,template_id,created_by').single()); }
  async deleteGoal(id) { must(await this.sb.from('lift_season_goals').update({ deleted_at: new Date().toISOString() }).eq('id', id)); }
}

const SEASON = 'id,name,starts_on,ends_on,is_shared,created_by,points';
const TPL = 'id,name,notes,is_shared,kind,created_by,updated_at';
const PLAN = 'id,season_id,template_id,position,weekdays';
const POST = 'id,kind,performed_on,title,summary,created_by,created_at';

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
  async addSets(rows) {
    if (rows.some(r => r.id && this.sets.some(x => x.id === r.id))) throw new Error('duplicate key value violates unique constraint "lift_sets_pkey"');
    const out = []; for (const r of rows) out.push(await this.addSet(r)); return out;
  }
  async setsByIds(ids) { return ids.map(id => this.sets.find(x => x.id === id)).filter(Boolean).map(clone); }
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
      { id: 't-push', name: 'Push day', notes: 'Heavy bench, then accessories.', is_shared: false, kind: 'workout', created_by: 'me', updated_at: now },
      { id: 't-legs', name: 'Alex’s leg day', notes: 'No skipping.', is_shared: true, kind: 'workout', created_by: 'alex', updated_at: now },
      { id: 't-pull', name: 'Alex’s pull day', notes: '', is_shared: true, kind: 'workout', created_by: 'alex', updated_at: now },
      { id: 'b-bench', name: 'Bench & triceps', notes: '', is_shared: true, kind: 'block', created_by: 'me', updated_at: now },
      { id: 'b-arms', name: 'Arms finisher', notes: '', is_shared: false, kind: 'block', created_by: 'me', updated_at: now },
      { id: 'b-calves', name: 'Hips & legs', notes: '', is_shared: true, kind: 'block', created_by: 'alex', updated_at: now },
    ];
    const it = (template_id, exercise_id, position, sets, reps, load_mode, load_value) =>
      ({ id: uid(), template_id, exercise_id, position, sets, reps, load_mode, load_value, unit: 'lb' });
    this.items = [
      it('t-push', 'ex0', 1, 3, 5, 'percent_1rm', 80), it('t-push', 'ex4', 2, 3, 8, 'last', 0), it('t-push', 'ex6', 3, 3, 10, 'last', 0), it('t-push', 'ex11', 4, 3, 12, 'last', 0),
      it('t-legs', 'ex1', 1, 4, 5, 'percent_1rm', 75), it('t-legs', 'ex15', 2, 3, 8, 'last', 0), it('t-legs', 'ex7', 3, 3, 10, 'last', 0),
      it('t-pull', 'ex3', 1, 3, 10, 'last', 0), it('t-pull', 'ex10', 2, 3, 10, 'last', 0), it('t-pull', 'ex5', 3, 3, 10, 'last', 0),
      it('b-bench', 'ex0', 1, 3, 5, 'last', 0), it('b-bench', 'ex11', 2, 3, 10, 'last', 0),
      it('b-arms', 'ex5', 1, 3, 10, 'last', 0), it('b-arms', 'ex11', 2, 3, 12, 'last', 0),
      it('b-calves', 'ex9', 1, 3, 10, 'last', 0), it('b-calves', 'ex7', 2, 3, 12, 'last', 0),
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
  async addRoutine(f) { this.seedRoutines(); const t = { id: uid(), notes: '', is_shared: false, kind: 'workout', created_by: 'me', updated_at: new Date().toISOString(), ...f }; this.templates.push(t); return clone(t); }
  async updateRoutine(id, patch) {
    const t = this.templates.find(x => x.id === id);
    if (!t || t.created_by !== 'me') throw new Error('That isn’t allowed for your account.');
    Object.assign(t, patch, { updated_at: new Date().toISOString() });
    return clone(t);
  }
  deleteRoutine(id) { return this.updateRoutine(id, { deleted_at: new Date().toISOString() }); }
  async addItem(f) { const i = { id: uid(), position: 1, sets: 3, reps: 8, load_mode: 'last', load_value: 0, unit: 'lb', rest_s: null, note: null, ...f }; this.items.push(i); return clone(i); }
  async updateItem(id, patch) { const i = this.items.find(x => x.id === id); Object.assign(i, patch); return clone(i); }
  removeItem(id) { return this.updateItem(id, { deleted_at: new Date().toISOString() }); }
  async subscribe(templateId) { const s = { id: uid(), template_id: templateId }; this.subs.push(s); return clone(s); }
  async unsubscribe(subId) { const s = this.subs.find(x => x.id === subId); if (s) s.deleted_at = new Date().toISOString(); }

  // ----- seasons -----
  async seasons() {
    if (!this.seasonRows) {
      const t = localDate();
      this.seasonRows = [
        { id: 's-fall', name: 'Fall block', starts_on: addDays(t, -40), ends_on: addDays(t, 20), is_shared: false, created_by: 'me' },
        { id: 's-crew', name: 'Crew winter challenge', starts_on: addDays(t, -30), ends_on: addDays(t, 30), is_shared: true, created_by: 'alex' },
      ];
      this.goalRows = [
        { id: uid(), season_id: 's-fall', name: 'Show up', metric: 'visits', target: 24, unit: null },
        { id: uid(), season_id: 's-fall', name: 'Move a mountain', metric: 'volume', target: 400000, unit: 'lb' },
        { id: uid(), season_id: 's-crew', name: 'Show up 30 times', metric: 'visits', target: 30, unit: null },
      ];
      this.seasonSubs = [];
      this.planRows = [
        { id: uid(), season_id: 's-fall', template_id: 't-push', position: 1, weekdays: 0 },
        { id: uid(), season_id: 's-fall', template_id: 't-pull', position: 2, weekdays: 0 },
        { id: uid(), season_id: 's-fall', template_id: 't-legs', position: 3, weekdays: 0 },
      ];
    }
    return { seasons: this.seasonRows.filter(s => !s.deleted_at).map(clone), goals: this.goalRows.filter(g => !g.deleted_at).map(clone),
      subs: this.seasonSubs.filter(s => !s.deleted_at).map(clone), plan: this.planRows.filter(p => !p.deleted_at).map(clone) };
  }
  async addSeason(f) { await this.seasons(); const s = { id: uid(), is_shared: false, created_by: 'me', ...f }; this.seasonRows.push(s); return clone(s); }
  async updateSeason(id, patch) { const s = this.seasonRows.find(x => x.id === id); Object.assign(s, patch); return clone(s); }
  deleteSeason(id) { return this.updateSeason(id, { deleted_at: new Date().toISOString() }); }
  async addPlan(f) { const p = { id: uid(), position: 1, weekdays: 0, ...f }; this.planRows.push(p); return clone(p); }
  async updatePlan(id, patch) { const p = this.planRows.find(x => x.id === id); Object.assign(p, patch); return clone(p); }
  removePlan(id) { return this.updatePlan(id, { deleted_at: new Date().toISOString() }); }
  async joinSeason(seasonId) { const s = { id: uid(), season_id: seasonId }; this.seasonSubs.push(s); return clone(s); }
  async leaveSeason(subId) { const s = this.seasonSubs.find(x => x.id === subId); if (s) s.deleted_at = new Date().toISOString(); }
  async standings(seasonId) {
    const s = this.seasonRows.find(x => x.id === seasonId);
    const mine = this.sets.filter(x => !x.deleted_at && !x.is_warmup && x.performed_on >= s.starts_on && x.performed_on <= s.ends_on);
    const vol = u => mine.filter(x => x.unit === u).reduce((a, x) => a + (Number(x.weight) + (x.count_bodyweight ? Number(x.bodyweight) || 0 : 0)) * x.reps, 0);
    const people = [{ user_id: 'me', display_name: 'Demo lifter', visits: new Set(mine.map(x => x.performed_on)).size, sets: mine.length, volume_lb: vol('lb'), volume_kg: vol('kg') }];
    if (s.created_by === 'alex' || this.seasonSubs.some(x => !x.deleted_at && x.season_id === seasonId))
      people.push({ user_id: 'alex', display_name: 'Alex', visits: 17, sets: 240, volume_lb: 286400, volume_kg: 0 });
    return people;
  }
  async seasonWorkouts(seasonId) {
    const plan = this.planRows.filter(p => !p.deleted_at && p.season_id === seasonId);
    const people = (await this.standings(seasonId)).map(p => p.user_id);
    return plan.flatMap((p, i) => people.map(u => ({ user_id: u, display_name: u === 'me' ? 'Demo lifter' : 'Alex', template_id: p.template_id, times: u === 'me' ? 4 - i : 3 + i })));
  }
  async seasonBests(seasonId) {
    const s = this.seasonRows.find(x => x.id === seasonId);
    const people = await this.standings(seasonId);
    const best = {};
    for (const x of this.live()) if (!x.is_warmup && x.weight > 0 && x.performed_on >= s.starts_on && x.performed_on <= s.ends_on)
      if (!best[x.exercise_id] || Number(x.weight) > best[x.exercise_id].best_weight) best[x.exercise_id] = { best_weight: Number(x.weight), reps: x.reps, unit: x.unit };
    const ids = Object.keys(best).slice(0, 6);
    return ids.flatMap((e, i) => people.map(p => ({ user_id: p.user_id, display_name: p.display_name, exercise_id: e, ...best[e],
      best_weight: p.user_id === 'me' ? best[e].best_weight : best[e].best_weight + (i % 2 ? 10 : -15) })));
  }
  async seasonPrs(seasonId) { return (await this.standings(seasonId)).map(p => ({ user_id: p.user_id, prs: p.user_id === 'me' ? 4 : 3 })); }
  async crewRecords() {
    const best = new Map();
    for (const x of this.live()) if (!x.is_warmup && x.weight > 0 && x.reps <= 12) {
      const e = x.weight * (1 + x.reps / 30);
      if (!best.has(x.exercise_id) || e > best.get(x.exercise_id).e1rm_lb) best.set(x.exercise_id, { exercise_id: x.exercise_id, user_id: 'me', display_name: 'Demo lifter', weight: x.weight, reps: x.reps, unit: x.unit, e1rm_lb: Math.round(e * 10) / 10, performed_on: x.performed_on, lifters: 2 });
    }
    let i = 0;
    for (const r of best.values()) if (i++ % 2) Object.assign(r, { user_id: 'alex', display_name: 'Alex', weight: r.weight + 10, e1rm_lb: Math.round((r.weight + 10) * (1 + r.reps / 30) * 10) / 10 });
    return [...best.values()];
  }
  async seasonDaily(seasonId) {
    const sn = this.seasonRows.find(x => x.id === seasonId);
    const people = await this.standings(seasonId);
    const mine = new Map();
    for (const x of this.live()) if (!x.is_warmup && x.performed_on >= sn.starts_on && x.performed_on <= sn.ends_on) {
      const d = mine.get(x.performed_on) || { performed_on: x.performed_on, sets: 0, volume_lb: 0, volume_kg: 0 };
      d.sets++; d['volume_' + x.unit] += setVolume(x); mine.set(x.performed_on, d);
    }
    const out = [...mine.values()].map(d => ({ user_id: 'me', display_name: 'Demo lifter', ...d }));
    if (people.some(p => p.user_id === 'alex'))
      for (const d of mine.values()) out.push({ user_id: 'alex', display_name: 'Alex', performed_on: addDays(d.performed_on, 1), sets: d.sets + 2, volume_lb: Math.round(d.volume_lb * 0.95), volume_kg: 0 });
    return out;
  }
  async exerciseHistory(exerciseId) {
    return this.live().filter(s => s.exercise_id === exerciseId).sort((a, b) => a.performed_on.localeCompare(b.performed_on))
      .map(s => ({ performed_on: s.performed_on, weight: s.weight, reps: s.reps, unit: s.unit, is_warmup: s.is_warmup }));
  }
  async wins() {
    if (!this.winRows) {
      const t = localDate(), at = d => new Date(d + 'T18:00:00').toISOString();
      this.winRows = [
        { id: uid(), kind: 'pr', performed_on: addDays(t, -1), title: 'Lat Pulldown PR', summary: { weight: 180, reps: 10, unit: 'lb' }, created_by: 'alex', created_at: at(addDays(t, -1)) },
        { id: uid(), kind: 'session', performed_on: addDays(t, -1), title: 'Alex’s pull day', created_by: 'alex', created_at: at(addDays(t, -1)),
          summary: { lb: 15400, sets: 18, minutes: 54, lifts: 5, prs: 1, streak: 6, nth: 3, where: 'Fall block · week 3',
            items: [['Lat Pulldown', 4, 10, 180, 'lb', 0, 1], ['Seated Cable Row', 4, 10, 160, 'lb', 0, 0], ['Face Pull', 4, 15, 45, 'lb', 0, 0], ['Bicep Curl', 3, 10, 35, 'lb', 0, 0], ['Pull-up', 3, 8, 0, 'lb', 1, 0]] } },
        { id: uid(), kind: 'quest', performed_on: addDays(t, -1), title: 'Show up three times', summary: {}, created_by: 'alex', created_at: at(addDays(t, -1)) },
        { id: uid(), kind: 'goal', performed_on: addDays(t, -1), title: 'Pull 60K · Fall block', summary: {}, created_by: 'alex', created_at: at(addDays(t, -1)) },
        { id: uid(), kind: 'club', performed_on: addDays(t, -3), title: '250K Club', summary: {}, created_by: 'alex', created_at: at(addDays(t, -3)) },
      ];
    }
    return this.winRows.filter(w => !w.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(clone);
  }
  async postWin(f) {
    await this.wins();
    const have = this.winRows.find(w => !w.deleted_at && w.created_by === 'me' && w.kind === f.kind && w.performed_on === f.performed_on && w.title === f.title);
    if (have) { have.summary = f.summary; return clone(have); }
    const w = { id: uid(), created_by: 'me', created_at: new Date().toISOString(), ...f }; this.winRows.push(w); return clone(w);
  }
  async removeWin(id) { const w = this.winRows.find(x => x.id === id); if (w) w.deleted_at = new Date().toISOString(); }
  async workoutDays(fromDate) {
    if (!this.dayRows) this.dayRows = [{ id: uid(), template_id: 't-push', on_date: addDays(localDate(), 1) }, { id: uid(), template_id: 't-pull', on_date: addDays(localDate(), 3) }];
    return this.dayRows.filter(d => !d.deleted_at && d.on_date >= fromDate).sort((a, b) => a.on_date.localeCompare(b.on_date)).map(clone);
  }
  async addWorkoutDay(f) { await this.workoutDays(''); const d = { id: uid(), ...f }; this.dayRows.push(d); return clone(d); }
  async removeWorkoutDay(id) { const d = this.dayRows.find(x => x.id === id); if (d) d.deleted_at = new Date().toISOString(); }
  async bodyweights() {
    if (!this.bwRows) {
      const t = localDate();
      this.bwRows = Array.from({ length: 14 }, (_, i) => ({ id: uid(), measured_on: addDays(t, -i * 5 - 1), weight: Math.round((181 + i * 0.35 + Math.sin(i) * 0.8) * 10) / 10, unit: 'lb', created_at: new Date().toISOString() }));
    }
    return this.bwRows.filter(b => !b.deleted_at).sort((a, b) => b.measured_on.localeCompare(a.measured_on) || b.created_at.localeCompare(a.created_at)).map(clone);
  }
  async addBodyweight(f) { await this.bodyweights(); const b = { id: uid(), created_at: new Date().toISOString(), ...f }; this.bwRows.push(b); return clone(b); }
  async removeBodyweight(id) { const b = this.bwRows.find(x => x.id === id); if (b) b.deleted_at = new Date().toISOString(); }
  async addGoal(f) { const g = { id: uid(), unit: null, exercise_id: null, template_id: null, created_by: 'me', ...f }; this.goalRows.push(g); return clone(g); }
  async deleteGoal(id) { const g = this.goalRows.find(x => x.id === id); if (g) g.deleted_at = new Date().toISOString(); }
}
const clone = o => ({ ...o });
const byNewest = (a, b) => (b.performed_on + b.logged_at).localeCompare(a.performed_on + a.logged_at);
