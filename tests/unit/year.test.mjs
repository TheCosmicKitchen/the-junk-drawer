// Your Year: points from everything you do, levels that start over each January, past years as badges.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yearPoints, yearSummary, levelOf, levelCost, pointsFor, levelName, pastYears, remember, fromLog, longestStreak, bestMonth,
  chaptersOf, wrappedYear, wrappedFresh, POINTS, PRS_PER_DAY, yearCardHtml, chaptersHtml, yearWrappedHtml } from '../../lift/year.js';
import { THEMES, ORDER } from '../../lift/themes.js';
import { addDays } from '../../lift/logic.js';

const none = { days: [], prs: [], workouts: [], challenges: [], stamps: [], goals: [], seasons: [] };
const facts = f => ({ ...none, ...f });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Three gym days a week (Mon, Wed, Fri) from `from` for `weeks` weeks.
const threeAWeek = (from, weeks) => Array.from({ length: weeks }, (_, w) => [0, 2, 4].map(d => addDays(from, w * 7 + d))).flat();

test('every kind of thing earns its points, and only in its own year', () => {
  const f = facts({ days: ['2026-03-02', '2026-03-04', '2025-12-31'], prs: ['2026-03-02'], workouts: ['2026-03-02'], challenges: ['2026-03-06'],
    stamps: ['2026-04-01'], goals: ['2026-05-01'], seasons: ['2026-05-01'] });
  const y = yearPoints(f, 2026);
  assert.equal(y.total, 2 * POINTS.day + POINTS.pr + POINTS.workout + POINTS.challenge + POINTS.stamp + POINTS.goal + POINTS.season);
  assert.deepEqual(y.parts.map(p => p.count), [2, 1, 1, 1, 1, 1, 1]);
  assert.equal(yearPoints(f, '2025').total, POINTS.day, 'a year given as text works the same');
});

test('a gym day counts once, and a day of new rep ranges only counts a few PRs', () => {
  const y = yearPoints(facts({ days: ['2026-03-02', '2026-03-02'], prs: Array(8).fill('2026-03-02').concat('2026-03-03') }), 2026);
  assert.equal(y.parts.find(p => p.id === 'day').count, 1);
  assert.equal(y.parts.find(p => p.id === 'pr').count, PRS_PER_DAY + 1);
});

test('levels: each one costs a little more than the last, with the remainder carried', () => {
  assert.deepEqual([1, 2, 3].map(levelCost), [80, 88, 96]);
  assert.equal(pointsFor(1), 0);
  assert.equal(pointsFor(2), 80);
  assert.equal(pointsFor(3), 168);
  assert.deepEqual(levelOf(0), { level: 1, points: 0, floor: 0, into: 0, need: 80, toNext: 80, ratio: 0 });
  assert.equal(levelOf(79).level, 1);
  assert.equal(levelOf(80).level, 2);
  const l = levelOf(200);
  assert.equal(l.level, 3); assert.equal(l.into, 32); assert.equal(l.toNext, 64);
  assert.equal(levelOf(-5).level, 1);
  for (let p = 0; p < 20000; p += 137) { const x = levelOf(p); assert.ok(x.into >= 0 && x.into < x.need && x.ratio < 1); }
});

test('the curve: three days a week levels up every week or two early on, slower later, mid-20s by December', () => {
  // Three gym days and three planned workouts a week, one challenge, a PR or two.
  const days = threeAWeek('2026-01-05', 51);
  const prs = days.filter((_, i) => i % 3 === 0 && i < 60);
  const challenges = Array.from({ length: 51 }, (_, w) => addDays('2026-01-09', w * 7));
  const f = facts({ days, workouts: days, prs, challenges });
  const at = weeks => yearSummary({ ...f, days: days.slice(0, weeks * 3), workouts: days.slice(0, weeks * 3), prs: prs.filter(d => d < addDays('2026-01-05', weeks * 7)), challenges: challenges.slice(0, weeks) }, 2026).level;
  assert.ok(at(1) >= 2 && at(1) <= 3, 'a level in the first week: ' + at(1));
  assert.ok(at(8) >= 6 && at(8) <= 9, 'one every week or so for two months: ' + at(8));
  const late = at(51) - at(43);
  assert.ok(late >= 2 && late <= 4, 'about one every two or three weeks by the autumn: ' + late);
  const end = yearSummary(f, 2026).level;
  assert.ok(end >= 22 && end <= 30, 'mid-20s at the end of the year: ' + end);
});

test('Dec 31 counts for the old year and Jan 1 starts the new one at level 1', () => {
  const f = facts({ days: threeAWeek('2026-01-05', 51).concat('2026-12-31', '2027-01-01'), stamps: ['2026-12-31'] });
  const old = yearSummary(f, 2026), fresh = yearSummary(f, 2027);
  assert.ok(old.level > 10);
  assert.equal(fresh.total, POINTS.day);
  assert.equal(fresh.level, 1);
  assert.ok(old.parts.find(p => p.id === 'stamp').count === 1 && fresh.parts.find(p => p.id === 'stamp').count === 0);
  const badges = pastYears(f, 2027);
  assert.deepEqual(badges.map(b => [b.year, b.level]), [[2026, old.level]], 'last year becomes a badge, worked out again from its days');
  assert.deepEqual(pastYears(f, 2026), [], 'nothing before this year: no badges');
});

test('badges come newest first and skip empty years', () => {
  const f = facts({ days: ['2023-05-01', '2025-05-01', '2025-05-02'], stamps: ['2024-02-02'] });
  assert.deepEqual(pastYears(f, 2026).map(b => b.year), [2025, 2024, 2023]);
});

test('level names come from the theme, four levels to a name, the last for everything after', () => {
  const names = ['A', 'B', 'C'];
  assert.deepEqual([1, 4, 5, 8, 9, 40].map(l => levelName(names, l)), ['A', 'A', 'B', 'B', 'C', 'C']);
  assert.equal(levelName(undefined, 3), 'Level');
});

test('every theme has year words of its own or Plain’s', () => {
  for (const id of ORDER) {
    const T = THEMES[id];
    assert.ok(Array.isArray(T.yearLevels) && T.yearLevels.length >= 8, id + ' has level names');
    assert.equal(new Set(T.yearLevels).size, T.yearLevels.length, id + ' level names are all different');
    for (const k of ['yearTitle', 'levelWord', 'chaptersWord', 'yearDone']) assert.ok(typeof T[k] === 'string' && T[k], id + ' ' + k);
  }
  assert.equal(THEMES.stone.yearLevels, THEMES.plain.yearLevels, 'a theme without its own falls back to Plain');
});

test('what can’t be worked out later is noted once, on the day it was first seen', () => {
  const a = remember({}, [{ key: 'w:2026-03-02', on: '2026-03-02' }, { key: 'q:2026-03-02:days3', on: '2026-03-05' }]);
  const b = remember(a, [{ key: 'q:2026-03-02:days3', on: '2026-03-06' }, { key: 'w:2026-03-02', on: '2026-03-02' }]);
  assert.equal(b, a, 'nothing new: the same object');
  assert.deepEqual(fromLog(b, 'q:'), ['2026-03-05']);
  assert.deepEqual(fromLog(b, 'w:'), ['2026-03-02']);
  assert.deepEqual(fromLog(undefined, 'w:'), []);
  assert.equal(remember(undefined, []) && typeof remember(undefined, []), 'object');
});

test('longest streak and best month stay inside the year', () => {
  const days = ['2025-12-29', '2026-01-05', '2026-01-12', '2026-01-26', '2026-02-02', '2026-02-09', '2026-02-16'];
  assert.equal(longestStreak(days, 2026), 4, 'Jan 26 to Feb 16; the week of Dec 29 belongs to last year’s days');
  assert.equal(longestStreak([], 2026), 0);
  const rows = days.map(d => ({ performed_on: d, sets: 10, volume_lb: d < '2026-02' ? 1000 : 1500 }));
  assert.deepEqual(bestMonth(rows, 2026, d => d.volume_lb), { month: '2026-02', days: 3, lb: 4500 }, 'three days each: the heavier month');
  assert.deepEqual(bestMonth(rows.concat({ performed_on: '2026-01-30', sets: 5, volume_lb: 10 }), 2026, d => d.volume_lb).month, '2026-01', 'more days wins');
  assert.equal(bestMonth(rows, 2024, d => d.volume_lb), null);
});

test('chapters: anything that touched the year, in the order it began', () => {
  const items = [{ id: 'b', starts_on: '2026-03-01', ends_on: '2026-04-01' }, { id: 'a', starts_on: '2025-12-01', ends_on: '2026-01-31' },
    { id: 'old', starts_on: '2025-01-01', ends_on: '2025-12-31' }, { id: 'next', starts_on: '2027-01-01', ends_on: '2027-02-01' }];
  assert.deepEqual(chaptersOf(items, 2026).map(x => x.id), ['a', 'b']);
});

test('Year Wrapped is for last year, fresh in January', () => {
  assert.equal(wrappedYear('2027-01-01'), 2026);
  assert.equal(wrappedFresh('2027-01-01'), true);
  assert.equal(wrappedFresh('2027-01-31'), true);
  assert.equal(wrappedFresh('2027-02-01'), false);
  assert.equal(wrappedFresh('2026-12-31'), false);
});

test('the card, chapters and Wrapped draw in every theme, escaping what they show', () => {
  const sum = yearSummary(facts({ days: threeAWeek('2026-01-05', 20) }), 2026);
  for (const id of ORDER) {
    const T = THEMES[id];
    const card = yearCardHtml({ sum, streak: 3, goals: { done: 1, of: 2 }, club: { title: '100K Club', left: '12K lb' }, badges: [{ ...sum, year: 2025 }], wrapped: 2025 }, T, esc);
    assert.match(card, new RegExp(T.levelWord + ' ' + sum.level));
    assert.match(card, /data-year-wrapped="2025"/);
    assert.ok(!/undefined|NaN/.test(card), id + ' card');
    const ch = chaptersHtml([{ name: '<Fall>', when: 'Oct 1 – Nov 1', phase: 'done', result: '2 of 3 goals', stamps: '', open: 'data-wrapped="s1"' }], 2026, T, esc);
    assert.match(ch, /&lt;Fall&gt;/);
    assert.ok(!/undefined|NaN/.test(ch), id + ' chapters');
    const wr = yearWrappedHtml({ sum, days: 60, sets: 900, lb: 400000, heavy: 'A blue whale.', prs: 12, streak: 20, month: { name: 'March', days: 13, lb: 90000 }, chapters: [], stamps: '' }, T, esc, v => String(v));
    assert.ok(wr.includes(T.yearDone.replace(/[&<>"']/g, c => esc(c))) && !/undefined|NaN/.test(wr), id + ' wrapped');
  }
  assert.match(chaptersHtml([], 2026, THEMES.plain, esc), /No seasons yet this year/);
  assert.match(yearCardHtml({ sum, streak: 0, goals: null, club: null, badges: [], wrapped: null }, THEMES.plain, esc), /data-core-edit/);
});
