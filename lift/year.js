// Your Year: one long track that runs from January 1st to December 31st, outside any season, so
// nothing you earn disappears when a season ends. Everything here is worked out from what the app
// already has (gym days, bests, stamps, seasons and their goals); nothing new is kept on the server.
// Pure functions: app.js gathers the facts and draws the result.
//
// facts (all time, every list a list of ISO dates, one entry per thing earned):
//   days       gym days (a day with at least one working set)
//   prs        bests, by the day they were first lifted (lift_bests.first_lifted_on)
//   workouts   days a planned workout was done
//   challenges weekly challenges done, by the day they were done
//   stamps     stamps earned
//   goals      season and year goals met, by the day they count (the season's last day, or today)
//   seasons    seasons finished, by their last day
import * as L from './logic.js';

// What each thing is worth. A season's own scoring (day 1, PR 3, workout 5) is about the same
// shape at a tenth of the size; here the extras that only come now and then are worth more.
export const POINTS = { day: 10, pr: 5, workout: 10, challenge: 15, stamp: 20, goal: 30, season: 50 };
export const PRS_PER_DAY = 3;   // a new rep range shouldn't be worth a week of training
export const PARTS = ['day', 'pr', 'workout', 'challenge', 'stamp', 'goal', 'season'];
const FACT = { day: 'days', pr: 'prs', workout: 'workouts', challenge: 'challenges', stamp: 'stamps', goal: 'goals', season: 'seasons' };

export const inYear = (iso, year) => typeof iso === 'string' && iso.slice(0, 4) === String(year);

// The year's points, and where they came from: { total, parts: [{ id, count, points }] }.
export function yearPoints(facts, year) {
  const parts = PARTS.map(id => {
    const list = (facts[FACT[id]] || []).filter(d => inYear(d, year));
    let count = list.length;
    if (id === 'day') count = new Set(list).size;
    if (id === 'pr') { const by = new Map(); for (const d of list) by.set(d, (by.get(d) || 0) + 1); count = [...by.values()].reduce((a, n) => a + Math.min(PRS_PER_DAY, n), 0); }
    return { id, count, points: count * POINTS[id] };
  });
  return { total: parts.reduce((a, p) => a + p.points, 0), parts };
}

// Levels. Going from level n to n + 1 costs 80 + 8(n - 1) points. Training three times a week
// (about 80 to 100 points a week) that's a level every week or so at first and every three weeks by
// the autumn, ending the year around level 25; five days a week ends it in the mid-30s.
export const LEVEL_BASE = 80, LEVEL_STEP = 8;
export const levelCost = n => LEVEL_BASE + LEVEL_STEP * (n - 1);
export const pointsFor = level => { const k = level - 1; return LEVEL_BASE * k + LEVEL_STEP * k * (k - 1) / 2; };
export function levelOf(points) {
  const p = Math.max(0, Number(points) || 0);
  let level = 1;
  while (pointsFor(level + 1) <= p) level++;
  const floor = pointsFor(level), need = levelCost(level), into = p - floor;
  return { level, points: p, floor, into, need, toNext: need - into, ratio: into / need };
}

// A level's name: each theme has a list (yearLevels), one name for every four levels, the last
// name for everything beyond it.
export const LEVELS_PER_NAME = 4;
export function levelName(names, level) {
  const list = names && names.length ? names : ['Level'];
  return list[Math.min(list.length - 1, Math.floor((Math.max(1, level) - 1) / LEVELS_PER_NAME))];
}

export function yearSummary(facts, year) {
  const pts = yearPoints(facts, year);
  return { year: Number(year), ...pts, ...levelOf(pts.total) };
}

// Past years, newest first, as badges ("2025 · Level 22"). Worked out again each time from that
// year's facts; a year with nothing in it has no badge.
export function pastYears(facts, thisYear) {
  const years = new Set();
  for (const k of Object.values(FACT)) for (const d of facts[k] || []) if (typeof d === 'string' && d.slice(0, 4) < String(thisYear)) years.add(d.slice(0, 4));
  return [...years].sort().reverse().map(y => yearSummary(facts, y)).filter(s => s.total > 0);
}

// The few things that can't be worked out again later (the phone keeps only the last 120 days of
// sets, and a week's challenges only for that week) are noted once, the first time they're seen:
// { key: date }. Returns the same object when there's nothing new.
export function remember(log, entries) {
  const out = log || {};
  let fresh = null;
  for (const { key, on } of entries) if (key && !(key in out) && !(fresh && key in fresh)) (fresh || (fresh = {}))[key] = on;
  return fresh ? { ...out, ...fresh } : out;
}
export const fromLog = (log, prefix) => Object.entries(log || {}).filter(([k]) => k.startsWith(prefix)).map(([, on]) => on);

// Weeks in a row with a gym day (weeks start on Monday): the longest run inside the year.
const monday = iso => L.addDays(iso, -((L.parseDate(iso).getDay() + 6) % 7));
export function longestStreak(days, year) {
  const weeks = [...new Set(days.filter(d => inYear(d, year)).map(monday))].sort();
  let best = 0, run = 0, prev = null;
  for (const w of weeks) { run = prev && L.addDays(prev, 7) === w ? run + 1 : 1; best = Math.max(best, run); prev = w; }
  return best;
}
// The month with the most gym days (the heavier one on a tie): { month: 'YYYY-MM', days, lb }.
export function bestMonth(dayRows, year, lbOf) {
  const by = new Map();
  for (const d of dayRows) if (d.sets > 0 && inYear(d.performed_on, year)) {
    const k = d.performed_on.slice(0, 7), m = by.get(k) || { month: k, days: 0, lb: 0 };
    m.days++; m.lb += lbOf(d); by.set(k, m);
  }
  return [...by.values()].sort((a, b) => b.days - a.days || b.lb - a.lb)[0] || null;
}

// This year's chapters: the seasons (and season packs) that ran during it, in the order they began.
// items: [{ starts_on, ends_on, ... }]; anything touching the year counts.
export const chaptersOf = (items, year) => items
  .filter(x => x.starts_on <= year + '-12-31' && x.ends_on >= year + '-01-01')
  .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.ends_on.localeCompare(b.ends_on));

// Year Wrapped shows up on January 1st, for the year just gone.
export const wrappedYear = today => Number(today.slice(0, 4)) - 1;
export const wrappedFresh = today => today.slice(5, 7) === '01';

// ---------------------------------------------------------------------------
// Drawing. T is the theme (its words), esc escapes text. Numbers come already formatted where the
// app has its own way of writing them.
// ---------------------------------------------------------------------------
const num = n => L.fmtNum(n, 0);
export function partLabel(id, T) {
  return { day: 'Gym days', pr: T.prs, workout: 'Planned workouts', challenge: T.quests, stamp: T.stamps, goal: T.goalsKept,
    season: T.seasonsWord + ' finished' }[id];
}
const levelLine = (s, T) => T.levelWord + ' ' + s.level;
export const badgeText = (s, T) => s.year + ' · ' + levelLine(s, T);

// The card at the top of Seasons. vm: { sum, streak, goals: { done, of } | null, club: { title, left } | null,
// badges: [summary], wrapped: year | null }.
export function yearCardHtml(vm, T, esc) {
  const s = vm.sum, pct = (s.ratio * 100).toFixed(1);
  const stat = (big, small, extra) => '<div class="yc-stat"' + (extra || '') + '><b>' + big + '</b><small>' + small + '</small></div>';
  const goals = vm.goals && vm.goals.of
    ? stat(vm.goals.done + ' / ' + vm.goals.of, esc(T.goalsKept.toLowerCase()))
    : '<div class="yc-stat"><button class="linkbtn" data-core-edit>+ ' + esc(T.goals) + ' for ' + s.year + '</button><small>optional</small></div>';
  return '<section class="card year-card" id="yearCard">' +
    '<div class="yc-head"><div><p class="yc-kicker">' + esc(T.yearTitle) + ' · ' + s.year + '</p>' +
      '<h2 class="yc-level">' + esc(levelLine(s, T)) + ' <span>' + esc(levelName(T.yearLevels, s.level)) + '</span></h2></div>' +
      '<div class="yc-pts"><b>' + num(s.total) + '</b><small>' + esc(T.points) + '</small></div></div>' +
    '<div class="bar" style="--p:' + pct + '%" role="img" aria-label="' + Math.round(s.ratio * 100) + '% of the way to ' + esc(T.levelWord) + ' ' + (s.level + 1) + '"><i></i></div>' +
    '<p class="hint-line yc-next">' + num(s.toNext) + ' ' + esc(T.points) + ' to ' + esc(T.levelWord) + ' ' + (s.level + 1) +
      (levelName(T.yearLevels, s.level + 1) !== levelName(T.yearLevels, s.level) ? ': <b>' + esc(levelName(T.yearLevels, s.level + 1)) + '</b>' : '') + '</p>' +
    '<div class="yc-stats">' +
      stat(vm.streak ? T.icons.streak + ' ' + vm.streak : '0', esc(vm.streak ? T.streak : 'no streak going')) +
      goals +
      (vm.club ? stat(esc(vm.club.left), 'to the ' + esc(vm.club.title)) : '') +
    '</div>' +
    (vm.wrapped ? '<button class="btn primary block yc-wrapped" data-year-wrapped="' + vm.wrapped + '">✨ ' + vm.wrapped + ' Wrapped</button>' : '') +
    '<details class="yc-how"><summary>How the year adds up</summary><ul>' + s.parts.map(p =>
      '<li><span>' + esc(partLabel(p.id, T)) + ' <small class="muted">' + num(p.count) + ' × ' + POINTS[p.id] + '</small></span><b>' + num(p.points) + '</b></li>').join('') + '</ul>' +
      '<p class="hint-line">Everything you do counts here, in a ' + esc(T.seasonWord.toLowerCase()) + ' or not. It starts again on January 1st; each year’s ' + esc(T.levelWord.toLowerCase()) + ' stays as a badge.</p></details>' +
    (vm.badges.length ? '<div class="yc-badges" aria-label="Past years">' + vm.badges.map(b =>
      '<button class="yc-badge" data-year-wrapped="' + b.year + '" title="' + esc(levelName(T.yearLevels, b.level)) + '">' + esc(badgeText(b, T)) + '</button>').join('') + '</div>' : '') +
  '</section>';
}

// The year's chapters, under the card. chapters: [{ name, when, phase, result, stamps (html), open (attribute) }].
export function chaptersHtml(chapters, year, T, esc) {
  return '<section class="card year-chapters"><h3 class="card-title">' + esc(T.chaptersWord) + ' of ' + year + '</h3>' +
    (chapters.length ? '<ol class="yc-chapters">' + chapters.map(c =>
      '<li class="' + esc(c.phase) + '"><button class="yc-chapter" ' + c.open + '><span class="yc-ch-top"><b>' + esc(c.name) + '</b><small>' + esc(c.when) + '</small></span>' +
        '<span class="yc-ch-result">' + esc(c.result) + '</span>' + (c.stamps ? '<span class="pack-mini">' + c.stamps + '</span>' : '') + '</button></li>').join('') + '</ol>'
      : '<p class="muted" style="margin:0">No ' + esc(T.seasonsWord.toLowerCase()) + ' yet this year. Every one you join becomes a chapter here; the year keeps counting either way.</p>') +
  '</section>';
}

// Year Wrapped, in the season Wrapped's layout. vm: { sum, days, sets, lb, heavy (a line), prs, streak,
// month: { name, days, lb } | null, chapters (as above), stamps (html) }.
export function yearWrappedHtml(vm, T, esc, compact) {
  const s = vm.sum, box = (h, big, p) => '<div class="wr-box"><h3>' + h + '</h3><b class="wr-big">' + big + '</b><p>' + p + '</p></div>';
  const n = (v, label) => '<div><b>' + v + '</b><small>' + label + '</small></div>';
  return '<button class="linkbtn back" data-year-back>← ' + esc(T.titles.seasons) + '</button>' +
    '<section class="wr year-wr">' +
      '<p class="wr-kicker">' + esc(T.yearTitle) + ' · ' + s.year + '</p><h1 class="wr-title">' + esc(T.yearDone) + '</h1>' +
      '<div class="wr-hero"><small>' + esc(levelLine(s, T)) + '</small><b>' + esc(levelName(T.yearLevels, s.level)) + '</b><p>' + num(s.total) + ' ' + esc(T.points) + ' over the year. It stays as a badge.</p></div>' +
      '<div class="wr-card"><div class="wr-nums">' + n(num(vm.days), 'gym days') + n(num(vm.sets), 'sets') + n(compact(vm.lb), 'lb moved') + n(num(vm.prs), esc(T.prs)) + '</div>' +
        '<p class="wr-foot">' + esc(vm.heavy) + '</p></div>' +
      '<div class="wr-pair">' +
        box('Longest streak', (vm.streak ? T.icons.streak + ' ' : '') + vm.streak, esc(vm.streak === 1 ? 'week' : 'weeks') + ' in a row.') +
        (vm.month ? box('Best month', esc(vm.month.name), num(vm.month.days) + ' gym days, ' + compact(vm.month.lb) + ' lb.') : box('Best month', '–', 'Nothing logged.')) +
      '</div>' +
      '<div class="wr-box"><h3>How it added up</h3><ul class="wr-bests">' + s.parts.filter(p => p.count).map(p =>
        '<li><i style="background:var(--gold)"></i><span>' + esc(partLabel(p.id, T)) + ' · ' + num(p.count) + '</span><b>' + num(p.points) + '</b></li>').join('') + '</ul></div>' +
      (vm.chapters.length ? '<div class="wr-box"><h3>' + esc(T.chaptersWord) + '</h3><ol class="wr-list">' + vm.chapters.map(c =>
        '<li><span>' + esc(c.name) + '</span><b>' + esc(c.result) + '</b></li>').join('') + '</ol></div>' : '') +
      (vm.stamps ? '<div class="wr-box"><h3>' + esc(T.stamps) + '</h3><div class="stamp-grid">' + vm.stamps + '</div></div>' : '') +
    '</section>';
}
