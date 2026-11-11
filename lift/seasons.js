// Season packs: curated seasons that ship with the app. Each one is data: its workouts, its own
// little world (stations, advent doors, trials) and its stamps, each with a rule checked against
// your own logged sets. A pack never changes how the rest of the app works, and every pack works
// in every theme (it can suggest one). The database only remembers who joined (a run) and which
// stamps they earned (supabase/sql/25_season_packs.sql).
//
// Three kinds of pack, by who sets the clock:
//   'program'  workouts on a schedule and nothing else; start any time (no stamps, world or theme)
//   'season'   a long arc at your own pace: a program plus a world and stamps; start any time
//   'event'    a short, shared happening on the same dates every year for everyone (from/to as
//              'MM-DD'); comes back every year, so missing one is never final
// A pack:
//   key, name, blurb, theme (suggested look), kind, weeks (programs and seasons),
//   workouts: [{ key, name, unlock (week, optional), steps: [[exercise names (first one found
//     in your catalogue), sets, reps, flavour name]] }],
//   stamps: [{ key, name, mark, color, hint, rule }],
//   plus its own world: stations (pilgrimage), doors (advent), letters (one line a week).
//
// Rules (all counted inside the run's dates, working sets only):
//   { days: n }                      n different days with at least one set
//   { workout: key }                 every step of that workout done on one day (its sets, any weight)
//   { lift: [names], sets: n, reps } n sets of any of those lifts in one day (each at least reps)
//   { doors: n }                     n advent doors opened
//   { weeks: n, each: d }            the first n weeks of the run each had d days or more
//   { beat: [names] }                a better estimated 1-rep max in the run's last week than its first

const SQUAT = ['Back Squat', 'Front Squat', 'Goblet Squat', 'Hack Squat', 'Leg Press', 'Safety-Bar Squat'];
const BENCH = ['Barbell Bench Press', 'Dumbbell Bench Press', 'Incline Barbell Press', 'Machine Chest Press', 'Push-ups'];
const DEAD = ['Conventional Deadlift', 'Trap-Bar Deadlift', 'Sumo Deadlift', 'Romanian Deadlift'];
const PRESS = ['Standing Overhead Press', 'Seated Dumbbell Shoulder Press', 'Machine Shoulder Press'];
const PULL = ['Pull-ups', 'Chin-ups', 'Assisted Pull-Up', 'Lat Pulldown'];
const ROW = ['Barbell Bent-Over Row', 'Seated Cable Row', 'Chest-Supported Row', 'Single-Arm Dumbbell Row', 'Machine Row'];
const CARRY = ["Farmer's Carry", 'Suitcase Carry', 'Front-Rack Carry'];
const LUNGE = ['Walking Lunge', 'Reverse Lunge', 'Bulgarian Split Squat', 'Split Squat'];
const PUSHUP = ['Push-ups', 'Incline Push-Up'];
const SWING = ['Kettlebell Swing', 'Cable Pull Through'];
const CORE = ['Hanging Leg Raise', 'Ab Wheel Rollout', 'Cable Crunch'];

export const PACKS = {
  pilgrimage: {
    key: 'pilgrimage', name: 'The Long Pilgrimage', theme: 'church', kind: 'season', weeks: 8,
    blurb: 'Eight weeks on the road from the Chapel to the Cathedral. Every two sessions reach the next station, so a missed week only means a longer walk.',
    stations: ['Chapel', 'Well', 'Bridge', 'Abbey', 'Shrine', 'Pass', 'Sabbath', 'Cathedral'],
    workouts: [
      { key: 'road', name: 'Pilgrim’s Road', steps: [[SQUAT, 3, 5, 'The road'], [BENCH, 3, 5, ''], [ROW, 3, 8, ''], [CARRY, 3, 1, 'Carry your pack']] },
      { key: 'climb', name: 'The Long Climb', steps: [[DEAD, 3, 5, 'The climb'], [PRESS, 3, 5, ''], [PULL, 3, 8, ''], [LUNGE, 3, 10, 'Steps uphill']] },
    ],
    stamps: [
      { key: 'chapel', name: 'Chapel', mark: 'I', color: '#2a5fd3', hint: '2 sessions', rule: { days: 2 } },
      { key: 'well', name: 'Well', mark: 'II', color: '#2a5fd3', hint: '4 sessions', rule: { days: 4 } },
      { key: 'bridge', name: 'Bridge', mark: 'III', color: '#2a5fd3', hint: '6 sessions', rule: { days: 6 } },
      { key: 'abbey', name: 'Abbey', mark: 'IV', color: '#a97a06', hint: '8 sessions', rule: { days: 8 } },
      { key: 'shrine', name: 'Shrine', mark: 'V', color: '#c8423b', hint: '10 sessions', rule: { days: 10 } },
      { key: 'pass', name: 'Pass', mark: 'VI', color: '#c8423b', hint: '12 sessions', rule: { days: 12 } },
      { key: 'sabbath', name: 'Sabbath', mark: 'VII', color: '#1d7f50', hint: '14 sessions', rule: { days: 14 } },
      { key: 'cathedral', name: 'Cathedral', mark: '✠', color: '#a97a06', hint: '16 sessions', rule: { days: 16 } },
      { key: 'road', name: 'Walked the road', mark: '⟿', color: '#38475a', hint: 'Finish Pilgrim’s Road', rule: { workout: 'road' } },
      { key: 'climb', name: 'Made the climb', mark: '△', color: '#38475a', hint: 'Finish The Long Climb', rule: { workout: 'climb' } },
    ],
  },

  hoist: {
    key: 'hoist', name: 'Ho Ho Hoist', theme: 'claus', kind: 'event', from: '12-01', to: '12-24',
    blurb: 'An advent calendar of lifting. A door a day from the 1st to the 24th, each a small task. Missed doors stay open until Christmas Eve. Back every December.',
    doors: [
      { name: 'Present Carry', lifts: CARRY, sets: 3 }, { name: 'Chimney Climb', lifts: PULL, sets: 3 }, { name: 'Snow Shovel', lifts: SQUAT, sets: 3 },
      { name: 'Reindeer Lunges', lifts: LUNGE, sets: 3 }, { name: 'The Big Sack', lifts: DEAD, sets: 3 }, { name: 'Present Press', lifts: BENCH, sets: 3 },
      { name: 'Star on Top', lifts: PRESS, sets: 3 }, { name: 'Bell Ringer', lifts: SWING, sets: 3 }, { name: 'Stocking Hang', lifts: CORE, sets: 3 },
      { name: 'Sleigh Rows', lifts: ROW, sets: 3 }, { name: 'Gingerbread Push-ups', lifts: PUSHUP, sets: 3 }, { name: 'Chimney Climb', lifts: PULL, sets: 4 },
      { name: 'Snow Shovel', lifts: SQUAT, sets: 4 }, { name: 'Present Carry', lifts: CARRY, sets: 4 }, { name: 'The Big Sack', lifts: DEAD, sets: 4 },
      { name: 'Reindeer Lunges', lifts: LUNGE, sets: 4 }, { name: 'Present Press', lifts: BENCH, sets: 4 }, { name: 'Bell Ringer', lifts: SWING, sets: 4 },
      { name: 'Star on Top', lifts: PRESS, sets: 4 }, { name: 'Sleigh Rows', lifts: ROW, sets: 4 }, { name: 'Stocking Hang', lifts: CORE, sets: 4 },
      { name: 'Gingerbread Push-ups', lifts: PUSHUP, sets: 4 }, { name: 'Snow Shovel', lifts: SQUAT, sets: 5 }, { name: 'Christmas Eve', workout: 'eve' },
    ],
    workouts: [
      { key: 'loading', name: 'Loading Day', steps: [[DEAD, 5, 5, 'The Big Sack'], [CARRY, 4, 1, 'Present Carry'], [BENCH, 3, 8, 'Present Press']] },
      { key: 'rooftop', name: 'Rooftop Run', steps: [[PULL, 4, 5, 'Chimney Climb'], [LUNGE, 3, 20, 'Reindeer Lunges'], [SQUAT, 3, 8, 'Snow Shovel']] },
      { key: 'eve', name: 'Christmas Eve', steps: [[SQUAT, 1, 12, 'Twelve days'], [BENCH, 1, 12, 'Twelve days'], [DEAD, 1, 12, 'Twelve days'], [PULL, 1, 12, 'Twelve days']] },
    ],
    stamps: [
      { key: 'first-door', name: 'First door', mark: '1', color: '#b3261e', hint: 'Open a door', rule: { doors: 1 } },
      { key: 'ten-doors', name: 'Ten doors', mark: '10', color: '#1f6b45', hint: 'Open 10 doors', rule: { doors: 10 } },
      { key: 'all-doors', name: 'All 24 doors', mark: '24', color: '#a97a06', hint: 'Open every door', rule: { doors: 24 } },
      { key: 'chimney', name: 'Chimney sweep', mark: '⌂', color: '#1f6b45', hint: '4 sets of pull-ups in a day', rule: { lift: PULL, sets: 4, reps: 1 } },
      { key: 'carry', name: 'Present carry', mark: '▣', color: '#b3261e', hint: '3 carries in a day', rule: { lift: CARRY, sets: 3, reps: 1 } },
      { key: 'loading', name: 'Loading Day', mark: '⛟', color: '#b3261e', hint: 'Finish Loading Day', rule: { workout: 'loading' } },
      { key: 'rooftop', name: 'Rooftop Run', mark: '✦', color: '#1f6b45', hint: 'Finish Rooftop Run', rule: { workout: 'rooftop' } },
      { key: 'eve', name: 'Christmas Eve', mark: '★', color: '#a97a06', hint: 'Finish the Christmas Eve workout', rule: { workout: 'eve' } },
    ],
  },

  apprenticeship: {
    key: 'apprenticeship', name: 'The Apprenticeship', theme: 'coach', kind: 'season', weeks: 8,
    blurb: 'The coach takes you on. Eight weeks, a word from the coach each week, a new trial every fortnight, and a final test: beat your week-one numbers.',
    letters: [
      '“So. You have come. Show me what you can do, and nothing more. I want to see your bad form before I fix it.”',
      '“Again. Consistency is the only spell that works. Twice this week, at least.”',
      '“The Weight of Ages awaits. Heavy triples. Rest as long as you need. I will be watching. Mostly.”',
      '“You are halfway. Your strength grows; your humility had better grow faster.”',
      '“Endurance of the Damned. Twenty reps. You will hate me. That is the point.”',
      '“Eat. Sleep. You are no use to me exhausted.”',
      '“A light week, apprentice. Even dark lords take holidays. Lift at about 60%.”',
      '“The Final Test. Beat the apprentice who walked in eight weeks ago.”',
    ],
    workouts: [
      { key: 'gauntlet', name: 'I · The Gauntlet', unlock: 1, steps: [[['Goblet Squat', 'Bodyweight Squat', 'Back Squat'], 12, 5, 'Every minute'], [PUSHUP, 12, 5, 'Every minute']] },
      { key: 'ages', name: 'II · The Weight of Ages', unlock: 3, steps: [[SQUAT, 3, 3, 'Heavy'], [DEAD, 3, 3, 'Heavy']] },
      { key: 'damned', name: 'III · Endurance of the Damned', unlock: 5, steps: [[['Leg Press', 'Goblet Squat', 'Back Squat'], 3, 20, 'Twenty'], [['Lat Pulldown', 'Seated Cable Row', 'Inverted Row'], 3, 20, 'Twenty'], [PUSHUP, 3, 20, 'Twenty']] },
      { key: 'final', name: 'IV · The Final Test', unlock: 8, steps: [[SQUAT, 3, 5, 'Beat week one'], [BENCH, 3, 5, 'Beat week one'], [DEAD, 3, 5, 'Beat week one']] },
    ],
    stamps: [
      { key: 'taken-on', name: 'Taken on', mark: '▲', color: '#6b3fc4', hint: 'Your first session', rule: { days: 1 } },
      { key: 'gauntlet', name: 'Ran the Gauntlet', mark: '◆', color: '#1f8a52', hint: 'Finish trial I', rule: { workout: 'gauntlet' } },
      { key: 'ages', name: 'Weight of Ages', mark: '⧗', color: '#6b3fc4', hint: 'Finish trial II', rule: { workout: 'ages' } },
      { key: 'damned', name: 'Endured', mark: '∞', color: '#1f8a52', hint: 'Finish trial III', rule: { workout: 'damned' } },
      { key: 'pleased', name: 'The coach was pleased', mark: '✶', color: '#6b3fc4', hint: '10 sessions', rule: { days: 10 } },
      { key: 'faithful', name: 'No week missed', mark: '☾', color: '#1f8a52', hint: 'Two sessions in every one of the 8 weeks', rule: { weeks: 8, each: 2 } },
      { key: 'graduated', name: 'Graduated', mark: '⚝', color: '#6b3fc4', hint: 'Beat week one on squat, bench or deadlift in week 8', rule: { beat: [...SQUAT, ...BENCH, ...DEAD] } },
    ],
  },
};
export const PACK_ORDER = ['pilgrimage', 'hoist', 'apprenticeship'];

// The dates a run covers: a season from the day you joined; an event this year's dates.
export function runWindow(pack, run, addDays) {
  if (pack.kind === 'event') { const y = run.starts_on.slice(0, 4); return { from: y + '-' + pack.from, to: y + '-' + pack.to }; }
  return { from: run.starts_on, to: addDays(run.starts_on, pack.weeks * 7 - 1) };
}
// This year's (or next year's) dates for an event, as of a day.
export function eventDates(pack, day) {
  let y = Number(day.slice(0, 4));
  if (day > y + '-' + pack.to) y++;
  return { from: y + '-' + pack.from, to: y + '-' + pack.to };
}

// Everything a run has done, from your sets: which stamps are earned and when, which doors and
// workouts are done, and how many days. sets = your working sets; ids(names) = the exercise ids
// of those names in your catalogue; e1rm(weight, reps).
export function progress(pack, run, sets, h) {
  const { from, to } = runWindow(pack, run, h.addDays);
  const mine = sets.filter(s => s.performed_on >= from && s.performed_on <= to && s.is_warmup !== true);
  const byDay = new Map();
  for (const s of mine) { if (!byDay.has(s.performed_on)) byDay.set(s.performed_on, []); byDay.get(s.performed_on).push(s); }
  const days = [...byDay.keys()].sort();
  const count = (list, names, reps) => { const ids = h.ids(names); return list.filter(s => ids.has(s.exercise_id) && (reps == null || s.reps >= reps)).length; };
  // Workouts: the first day every step was done (its number of sets of one of its lifts).
  const workoutDone = {};
  for (const w of pack.workouts || []) {
    const day = days.find(d => w.steps.every(([names, n]) => count(byDay.get(d), names) >= n));
    if (day) workoutDone[w.key] = day;
  }
  // Advent doors: each day opens every door already due whose task that day's sets meet.
  const doorDone = {};
  if (pack.doors) for (const d of days) pack.doors.forEach((door, i) => {
    const due = from.slice(0, 8) + String(i + 1).padStart(2, '0');
    if (doorDone[i] || d < due) return;
    if (door.workout ? workoutDone[door.workout] && workoutDone[door.workout] <= d : count(byDay.get(d), door.lifts) >= door.sets) doorDone[i] = d;
  });
  const doorDays = Object.values(doorDone).sort();
  const week = d => Math.floor(h.daysBetween(from, d) / 7) + 1;
  const earned = {};
  for (const st of pack.stamps || []) {
    const r = st.rule;
    let on = null;
    if (r.days) on = days[r.days - 1] || null;
    else if (r.workout) on = workoutDone[r.workout] || null;
    else if (r.lift) on = days.find(d => count(byDay.get(d), r.lift, r.reps) >= r.sets) || null;
    else if (r.doors) on = doorDays[r.doors - 1] || null;
    else if (r.weeks) {
      const per = new Map(); for (const d of days) per.set(week(d), (per.get(week(d)) || 0) + 1);
      let ok = true; for (let w = 1; w <= r.weeks; w++) if ((per.get(w) || 0) < r.each) ok = false;
      if (ok) on = days.filter(d => week(d) <= r.weeks).pop() || null;
    } else if (r.beat) {
      const ids = h.ids(r.beat), best = list => { const m = new Map(); for (const s of list) if (ids.has(s.exercise_id)) { const e = h.e1rm(Number(s.weight), s.reps) || 0; if (e > (m.get(s.exercise_id) || 0)) m.set(s.exercise_id, e); } return m; };
      const lastWeek = pack.weeks, first = best(mine.filter(s => week(s.performed_on) === 1));
      const lastDays = days.filter(d => week(d) === lastWeek);
      for (const d of lastDays) { const b = best(byDay.get(d)); if ([...b].some(([id, e]) => first.has(id) && e > first.get(id))) { on = d; break; } }
    }
    if (on) earned[st.key] = on;
  }
  return { from, to, days: days.length, earned, workoutDone, doorDone, doorsOpen: doorDays.length };
}
