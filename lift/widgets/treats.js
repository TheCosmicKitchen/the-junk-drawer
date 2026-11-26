// Kintoremon's treats: snacks earned by things you do (a week's challenge, a new club, a season goal,
// a finished season), kept in a bag, and fed by tapping. Dessert, not dinner: only on a day you
// lifted, and at most a few a day, so treats never stand in for training.
//
// Pure. Saved state (in the widget's data) is { seen: { key: day }, got: [{ kind, day }],
// eaten: [{ kind, day }], since: day }. On the day treats are first worked out, everything done so
// far is marked seen without a treat (hats reward the past), including facts that only finish
// loading a moment later (seasons, goals); from the next day on each new thing earns one.

export const TREATS = [
  { id: 'cricket', name: 'Cricket', xp: 20, from: 'quest', hint: 'Finish a weekly challenge' },
  { id: 'shake', name: 'Protein shake', xp: 40, from: 'club', hint: 'Join a new club' },
  { id: 'golden', name: 'Golden cricket', xp: 60, from: 'goal', hint: 'Hit a season goal' },
  { id: 'dragonfruit', name: 'Dragonfruit', xp: 100, from: 'season', hint: 'Finish a season' },
];
export const PER_DAY = 3;
const KIND = Object.fromEntries(TREATS.map(t => [t.from, t.id]));
export const treatById = id => TREATS.find(t => t.id === id);

// What's been earned, as keys that never repeat. facts (from the app):
//   questsDone   ['2026-11-23:days3', ...]  this week's finished challenges, by week and challenge
//   clubs        [10000, 50000, ...]        club thresholds reached (lifetime lb)
//   goalsMet     [goal id, ...]             season goals met
//   seasonsDone  [{ id, ends_on }]          seasons you were in that have ended
export function treatKeys(facts, hatched) {
  const f = facts || {}, out = [];
  for (const q of f.questsDone || []) out.push({ key: 'quest:' + q, kind: KIND.quest });
  for (const c of f.clubs || []) out.push({ key: 'club:' + c, kind: KIND.club });
  for (const g of f.goalsMet || []) out.push({ key: 'goal:' + g, kind: KIND.goal });
  for (const s of f.seasonsDone || []) if (s.ends_on >= hatched) out.push({ key: 'season:' + s.id, kind: KIND.season });
  return out;
}
// Add treats for anything new. Returns the same object when nothing changed, so the app only saves
// when there's something new.
export function syncTreats(state, keys, today) {
  const st = state || {};
  if (!st.seen) {   // the first time: the past is the starting line
    const seen = {};
    for (const k of keys) seen[k.key] = today;
    return { seen, got: [], eaten: [], since: today };
  }
  const fresh = keys.filter(k => !st.seen[k.key]);
  if (!fresh.length) return st;
  const seen = { ...st.seen };
  for (const k of fresh) seen[k.key] = today;
  if (st.since === today) return { ...st, seen };   // still the starting day: part of the starting line
  return { ...st, seen, got: [...(st.got || []), ...fresh.map(k => ({ kind: k.kind, day: today }))] };
}
// How many of each are in the bag.
export function bag(state) {
  const n = Object.fromEntries(TREATS.map(t => [t.id, 0]));
  for (const g of (state && state.got) || []) if (g.kind in n) n[g.kind]++;
  for (const e of (state && state.eaten) || []) if (e.kind in n) n[e.kind]--;
  return n;
}
export const eatenOn = (state, day) => ((state && state.eaten) || []).filter(e => e.day === day);
export const gotOn = (state, day) => ((state && state.got) || []).filter(g => g.day === day);
// Can it have one now: one in the bag, a day you lifted, and room for dessert.
export function canFeed(state, kind, liftedToday, today) {
  if (!liftedToday) return { ok: false, why: 'After a workout today' };
  if (!(bag(state)[kind] > 0)) return { ok: false, why: 'None in the bag' };
  if (eatenOn(state, today).length >= PER_DAY) return { ok: false, why: 'Full for today' };
  return { ok: true };
}
export const feed = (state, kind, today) => ({ ...state, eaten: [...((state && state.eaten) || []), { kind, day: today }] });
// Treat XP by day, for the pet's replay (which only counts it on days you lifted).
export function bonusByDay(state) {
  const m = new Map();
  for (const e of (state && state.eaten) || []) m.set(e.day, (m.get(e.day) || 0) + ((treatById(e.kind) || {}).xp || 0));
  return m;
}
// "a Golden cricket", "2 Crickets and a Dragonfruit"
export function treatList(list) {
  const n = new Map();
  for (const x of list) n.set(x.kind, (n.get(x.kind) || 0) + 1);
  const words = [...n].map(([k, c]) => { const nm = treatById(k).name; return c === 1 ? (/^[AEIOU]/i.test(nm) ? 'an ' : 'a ') + nm : c + ' ' + nm + 's'; });
  return words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : words[0] || '';
}

// Little drawings, 40 × 40, for the bag.
const ICON = {
  cricket: '<ellipse cx="20" cy="22" rx="11" ry="6" fill="#6aa84f" stroke="#2b3a24" stroke-width="1.5"/><circle cx="31" cy="20" r="4" fill="#6aa84f" stroke="#2b3a24" stroke-width="1.5"/>' +
    '<path d="M12 26 l-5 7 M18 27 l-2 7 M24 27 l2 7 M34 17 q6 -8 3 -12 M32 17 q2 -9 -3 -12" fill="none" stroke="#2b3a24" stroke-width="1.5" stroke-linecap="round"/>',
  golden: '<ellipse cx="20" cy="22" rx="11" ry="6" fill="#e8b93a" stroke="#5a4310" stroke-width="1.5"/><circle cx="31" cy="20" r="4" fill="#e8b93a" stroke="#5a4310" stroke-width="1.5"/>' +
    '<path d="M12 26 l-5 7 M18 27 l-2 7 M24 27 l2 7 M34 17 q6 -8 3 -12 M32 17 q2 -9 -3 -12" fill="none" stroke="#5a4310" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M8 8 l2 -4 l2 4 l-2 4 z M30 34 l1.5 -3 l1.5 3 l-1.5 3 z" fill="#f6d77a"/>',
  shake: '<path d="M12 12 h16 l-2 24 h-12 z" fill="#f2efe8" stroke="#3a332b" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 20 h14 l-1.4 15 h-11.2 z" fill="#c9a27a"/>' +
    '<rect x="10" y="8" width="20" height="5" rx="2" fill="#7a5c45" stroke="#3a332b" stroke-width="1.5"/><path d="M22 8 l4 -6" stroke="#d94b4b" stroke-width="2.5" stroke-linecap="round"/>',
  dragonfruit: '<ellipse cx="20" cy="23" rx="12" ry="13" fill="#e0457b" stroke="#6b1634" stroke-width="1.5"/>' +
    '<path d="M11 15 q-4 -4 -2 -8 q4 2 5 6 M20 10 q0 -6 3 -8 q2 4 0 8 M29 15 q4 -4 2 -8 q-4 2 -5 6 M10 26 q-5 0 -6 -3 q4 -1 6 1 M30 26 q5 0 6 -3 q-4 -1 -6 1" fill="#7cc36a" stroke="#2f5a26" stroke-width="1.2"/>',
};
export const treatSvg = (id, label = '') => '<svg class="treat-svg" viewBox="0 0 40 40" role="img" aria-label="' + label + '">' + (ICON[id] || '') + '</svg>';
