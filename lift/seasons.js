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
//   plus its own world: stations (pilgrimage), doors (a calendar of daily tasks: sets of reps of a
//   lift, or a workout; named by
//   calendar: { title, one, many }), letters (one line a week).
//
// Rules (all counted inside the run's dates, working sets only):
//   { days: n }                      n different days with at least one set
//   { workout: key }                 every step of that workout done on one day (its sets, any weight)
//   { lift: [names], sets: n, reps } n sets of any of those lifts in one day (each at least reps)
//   { doors: n }                     n calendar doors (daily tasks) opened
//   { weeks: n, each: d }            the first n weeks of the run each had d days or more
//   { beat: [names] }                a better estimated 1-rep max in the run's last week than its first
//   { record: [names] }              a better estimated 1-rep max during the run than ever before it
// A stamp can carry art: a small line drawing (24 x 24) drawn in white on its colour; else its mark.

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
const OHP = ['Standing Overhead Press', 'Push Press', 'Seated Dumbbell Shoulder Press', 'Arnold Press', 'Machine Shoulder Press'];

export const PACKS = {
  pilgrimage: {
    key: 'pilgrimage', name: 'The Long Pilgrimage', theme: 'church', kind: 'season', weeks: 8,
    blurb: 'Eight weeks on the road from the Chapel to the Cathedral. Every two sessions reach the next station, so a missed week only means a longer walk.',
    stations: ['Chapel', 'Well', 'Bridge', 'Abbey', 'Shrine', 'Pass', 'Sabbath', 'Cathedral'],
    workouts: [
      { key: 'road', name: 'Pilgrim’s Road', steps: [[SQUAT, 3, 5, 'The road'], [BENCH, 3, 5, ''], [ROW, 3, 8, ''], [CARRY, 3, 1, 'Carry your pack']] },
      { key: 'climb', name: 'The Long Climb', steps: [[DEAD, 3, 5, 'The climb'], [PRESS, 3, 5, ''], [PULL, 3, 6, 'Or pulldowns'], [LUNGE, 3, 10, 'Steps uphill']] },
    ],
    stamps: [
      { key: 'chapel', name: 'Chapel', mark: 'I', color: '#2a5fd3', hint: '2 sessions', rule: { days: 2 },
        art: '<path d="M5 21V11l7-5 7 5v10"/><path d="M3 21h18"/><path d="M12 6V2M10.2 3.6h3.6"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/><circle cx="12" cy="12" r="1.3"/>' },
      { key: 'well', name: 'Well', mark: 'II', color: '#2a5fd3', hint: '4 sessions', rule: { days: 4 },
        art: '<path d="M3 8l9-5 9 5z"/><path d="M6 8v6M18 8v6M12 8v3"/><path d="M10.5 11h3l-.5 2h-2z"/><path d="M5 14h14v7H5z"/><path d="M5 17.5h14M9 14v3.5M15 17.5V21"/>' },
      { key: 'bridge', name: 'Bridge', mark: 'III', color: '#2a5fd3', hint: '6 sessions', rule: { days: 6 },
        art: '<path d="M2 11h20"/><path d="M4 11v6M20 11v6"/><path d="M7.5 17a4.5 4.5 0 0 1 9 0"/><path d="M4 8v3M8 8v3M12 8v3M16 8v3M20 8v3"/><path d="M2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>' },
      { key: 'abbey', name: 'Abbey', mark: 'IV', color: '#a97a06', hint: '8 sessions', rule: { days: 8 },
        art: '<path d="M3 21V12h5V7l4-3.5L16 7v14"/><path d="M16 12h5v9"/><path d="M2 21h20"/><path d="M10.5 21v-3.5a1.5 1.5 0 0 1 3 0V21"/><path d="M12 9v2M5.5 15v2M18.5 15v2"/>' },
      { key: 'shrine', name: 'Shrine', mark: 'V', color: '#c8423b', hint: '10 sessions', rule: { days: 10 },
        art: '<path d="M5 21V9.5a7 7 0 0 1 14 0V21"/><path d="M3 21h18"/><path d="M10 21v-5h4v5"/><path d="M12 16v-2.5"/><path d="M12 8c1.3 1.2 1.3 2.6 0 3.6-1.3-1-1.3-2.4 0-3.6z"/>' },
      { key: 'pass', name: 'Pass', mark: 'VI', color: '#c8423b', hint: '12 sessions', rule: { days: 12 },
        art: '<path d="M2 20l6.5-11 4 6.5 3-4.5L22 20z"/><path d="M8.5 9l1.5 2.5-1.5.5"/><path d="M12 20c0-1.6 1.6-2.4 1-4" stroke-dasharray="1.5 2"/>' },
      { key: 'sabbath', name: 'Sabbath', mark: 'VII', color: '#1d7f50', hint: '14 sessions', rule: { days: 14 },
        art: '<path d="M7.5 21V11.5h3.5V21M13 21V11.5h3.5V21"/><path d="M5 21h14"/><path d="M9.25 11.5V9.5M14.75 11.5V9.5"/><path d="M9.25 4.2c1.2 1.2 1.2 2.6 0 3.6-1.2-1-1.2-2.4 0-3.6zM14.75 4.2c1.2 1.2 1.2 2.6 0 3.6-1.2-1-1.2-2.4 0-3.6z"/>' },
      { key: 'cathedral', name: 'Cathedral', mark: '✠', color: '#a97a06', hint: '16 sessions', rule: { days: 16 },
        art: '<path d="M3 21V8.5l3-4 3 4V21M15 21V8.5l3-4 3 4V21"/><path d="M9 21v-8.5l3-3 3 3V21"/><circle cx="12" cy="14" r="1.8"/><path d="M2 21h20M11 21v-2.5h2V21M6 2v2.5M18 2v2.5"/>' },
      { key: 'road', name: 'Walked the road', mark: '⟿', color: '#38475a', hint: 'Finish Pilgrim’s Road', rule: { workout: 'road' },
        art: '<path d="M12 20.5L3.8 9.2a9.4 9.4 0 0 1 16.4 0z"/><path d="M12 20.5L7.6 5.3M12 20.5V4.4M12 20.5l4.4-15.2M12 20.5L4.5 8M12 20.5L19.5 8"/><path d="M10 21.5h4"/>' },
      { key: 'climb', name: 'Made the climb', mark: '△', color: '#38475a', hint: 'Finish The Long Climb', rule: { workout: 'climb' },
        art: '<path d="M2 20l7.5-12.5 4 6 2.5-3.5L22 20z"/><path d="M9.5 7.5V2.5l4 1.6-4 1.6"/><path d="M5 20l2.5-3.5"/>' },
    ],
  },

  hoist: {
    key: 'hoist', name: 'Ho Ho Hoist', theme: 'claus', kind: 'event', from: '12-01', to: '12-24',
    blurb: 'An advent calendar of lifting. A door a day from the 1st to the 24th, each a small task. Missed doors stay open until Christmas Eve. Back every December.',
    calendar: { title: 'The advent calendar', one: 'Door', many: 'Doors' },
    doors: [
      { name: 'Present Carry', lifts: CARRY, sets: 3, reps: 1 }, { name: 'Chimney Climb', lifts: PULL, sets: 3, reps: 5 }, { name: 'Snow Shovel', lifts: SQUAT, sets: 3, reps: 5 },
      { name: 'Reindeer Lunges', lifts: LUNGE, sets: 3, reps: 8 }, { name: 'The Big Sack', lifts: DEAD, sets: 3, reps: 5 }, { name: 'Present Press', lifts: BENCH, sets: 3, reps: 5 },
      { name: 'Star on Top', lifts: PRESS, sets: 3, reps: 5 }, { name: 'Bell Ringer', lifts: SWING, sets: 3, reps: 10 }, { name: 'Stocking Hang', lifts: CORE, sets: 3, reps: 8 },
      { name: 'Sleigh Rows', lifts: ROW, sets: 3, reps: 8 }, { name: 'Gingerbread Push-ups', lifts: PUSHUP, sets: 3, reps: 10 }, { name: 'Chimney Climb', lifts: PULL, sets: 4, reps: 5 },
      { name: 'Snow Shovel', lifts: SQUAT, sets: 4, reps: 5 }, { name: 'Present Carry', lifts: CARRY, sets: 4, reps: 1 }, { name: 'The Big Sack', lifts: DEAD, sets: 4, reps: 5 },
      { name: 'Reindeer Lunges', lifts: LUNGE, sets: 4, reps: 8 }, { name: 'Present Press', lifts: BENCH, sets: 4, reps: 5 }, { name: 'Bell Ringer', lifts: SWING, sets: 4, reps: 10 },
      { name: 'Star on Top', lifts: PRESS, sets: 4, reps: 5 }, { name: 'Sleigh Rows', lifts: ROW, sets: 4, reps: 8 }, { name: 'Stocking Hang', lifts: CORE, sets: 4, reps: 8 },
      { name: 'Gingerbread Push-ups', lifts: PUSHUP, sets: 4, reps: 10 }, { name: 'Snow Shovel', lifts: SQUAT, sets: 5, reps: 5 }, { name: 'Christmas Eve', workout: 'eve' },
    ],
    workouts: [
      { key: 'loading', name: 'Loading Day', steps: [[DEAD, 3, 5, 'The Big Sack'], [BENCH, 3, 8, 'Present Press'], [CARRY, 3, 1, 'Present Carry · 40 m']] },
      { key: 'rooftop', name: 'Rooftop Run', steps: [[SQUAT, 3, 8, 'Snow Shovel'], [PULL, 4, 5, 'Chimney Climb · or pulldowns'], [LUNGE, 3, 10, 'Reindeer Lunges · each leg']] },
      { key: 'eve', name: 'Christmas Eve', steps: [[['Goblet Squat', 'Leg Press', 'Back Squat'], 3, 12, 'Twelve days'], [PUSHUP, 3, 12, 'Twelve days'], [ROW, 3, 12, 'Twelve days'], [['Romanian Deadlift', 'Kettlebell Romanian Deadlift', 'Good Morning'], 3, 10, 'Light, all reps clean']] },
    ],
    stamps: [
      { key: 'first-door', name: 'First door', mark: '1', color: '#b3261e', hint: 'Open a door', rule: { doors: 1 },
        art: '<path d="M4 3h16v18H4z"/><path d="M4 3l6.5 2.5v17L4 21"/><circle cx="8.6" cy="13" r=".7"/><path d="M15.5 8.5l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>' },
      { key: 'ten-doors', name: 'Ten doors', mark: '10', color: '#1f6b45', hint: 'Open 10 doors', rule: { doors: 10 },
        art: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 10h18M3 15.5h18M9 4.5V21M15 4.5V21"/><path d="M7 2.5v3.5M17 2.5v3.5"/><path d="M10.8 12.8l.9.9 1.6-1.8"/>' },
      { key: 'all-doors', name: 'All 24 doors', mark: '24', color: '#a97a06', hint: 'Open every door', rule: { doors: 24 },
        art: '<circle cx="12" cy="11" r="7.5"/><circle cx="12" cy="11" r="3.8"/><path d="M5.5 7.5l1.5.6M18.5 7.5L17 8.1M5 13l1.6-.4M19 13l-1.6-.4M8.5 4.6l.6 1.4M15.5 4.6l-.6 1.4"/><path d="M12 17.5l-2.6 4.5M12 17.5l2.6 4.5M9.8 18.5h4.4"/>' },
      { key: 'chimney', name: 'Chimney sweep', mark: '⌂', color: '#1f6b45', hint: '4 sets of pull-ups (or pulldowns) of 5 or more in a day', rule: { lift: PULL, sets: 4, reps: 5 },
        art: '<path d="M6 21V11h12v10"/><path d="M4.5 8h15v3h-15z"/><path d="M6 14.5h12M6 18h12M12 11v3.5M9 14.5V18M15 14.5V18M12 18v3"/><path d="M14 6c0-1.6 2-1.8 2-3.4M10.5 6c0-1 1-1.2 1-2.2"/>' },
      { key: 'carry', name: 'Present carry', mark: '▣', color: '#b3261e', hint: '3 carries in a day', rule: { lift: CARRY, sets: 3, reps: 1 },
        art: '<rect x="4" y="10" width="16" height="11" rx="1"/><path d="M3 10h18v3H3z"/><path d="M12 10v11"/><path d="M12 10c-1.8-3.6-6-4-5.2-1.2.4 1.2 3.2 1.2 5.2 1.2zM12 10c1.8-3.6 6-4 5.2-1.2-.4 1.2-3.2 1.2-5.2 1.2z"/>' },
      { key: 'loading', name: 'Loading Day', mark: '⛟', color: '#b3261e', hint: 'Finish Loading Day', rule: { workout: 'loading' },
        art: '<path d="M3 16h14.5a3.5 3.5 0 0 0 3.5-3.5V9"/><path d="M5 16v-5.5h8.5L16 16"/><path d="M2 19.5h15.5c2 0 3.5-1 3.5-2.5"/><path d="M6.5 16v3.5M13.5 16v3.5"/><path d="M7 10.5V7h5v3.5M9.5 7V5.5"/>' },
      { key: 'rooftop', name: 'Rooftop Run', mark: '✦', color: '#1f6b45', hint: 'Finish Rooftop Run', rule: { workout: 'rooftop' },
        art: '<path d="M2 21l10-9 10 9"/><path d="M15.5 15V10h3v8"/><path d="M14.5 10h5"/><path d="M7 2.8a3.6 3.6 0 1 0 4 4.6 2.8 2.8 0 0 1-4-4.6z"/><path d="M19 4.5l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4z"/>' },
      { key: 'eve', name: 'Christmas Eve', mark: '★', color: '#a97a06', hint: 'Finish the Christmas Eve workout', rule: { workout: 'eve' },
        art: '<path d="M12 1.8l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 4.1l2.2-.3z"/><path d="M12 8.2L7 14h3l-4.5 5.5h13L14 14h3z"/><path d="M12 19.5V22"/><circle cx="10.5" cy="16" r=".7"/><circle cx="14" cy="12.2" r=".7"/>' },
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
      { key: 'gauntlet', name: 'I · The Gauntlet', unlock: 1, steps: [[['Goblet Squat', 'Bodyweight Squat', 'Back Squat'], 4, 10, 'Short rests'], [PUSHUP, 4, 10, 'Short rests']] },
      { key: 'ages', name: 'II · The Weight of Ages', unlock: 3, steps: [[SQUAT, 4, 3, 'Heavy, rest 3 min'], [['Romanian Deadlift', 'Kettlebell Romanian Deadlift', 'Good Morning'], 3, 8, 'Moderate']] },
      { key: 'damned', name: 'III · Endurance of the Damned', unlock: 5, steps: [[['Leg Press', 'Goblet Squat', 'Back Squat'], 3, 20, 'Twenty'], [['Lat Pulldown', 'Seated Cable Row', 'Inverted Row'], 3, 20, 'Twenty'], [PUSHUP, 3, 15, 'As many as you can, up to 15']] },
      { key: 'final', name: 'IV · The Final Test', unlock: 8, steps: [[SQUAT, 2, 5, 'Top set, then a back-off'], [BENCH, 2, 5, 'Top set, then a back-off'], [DEAD, 2, 5, 'Top set, then a back-off']] },
    ],
    stamps: [
      { key: 'taken-on', name: 'Taken on', mark: '▲', color: '#6b3fc4', hint: 'Your first session', rule: { days: 1 },
        art: '<path d="M12 2C8.6 5 6 9 6 14v7.5h12V14c0-5-2.6-9-6-12z"/><path d="M9.2 16c0-2.6 1.2-4.8 2.8-5.9 1.6 1.1 2.8 3.3 2.8 5.9v2.2H9.2z"/><circle cx="10.9" cy="15.4" r=".75" fill="currentColor"/><circle cx="13.1" cy="15.4" r=".75" fill="currentColor"/><path d="M3.5 21.5h17"/>' },
      { key: 'gauntlet', name: 'Ran the Gauntlet', mark: '◆', color: '#1f8a52', hint: 'Finish trial I', rule: { workout: 'gauntlet' },
        art: '<path d="M7 21.5V17l-2-3V8.5a1.5 1.5 0 0 1 3 0V6.5a1.5 1.5 0 0 1 3 0V6a1.5 1.5 0 0 1 3 0v1.5a1.5 1.5 0 0 1 3 0V14l-2 3v4.5z"/><path d="M7 18.5h10M8 12h8"/><path d="M19 4l1.5-1.5M21 7h1.5M5 4L3.5 2.5"/>' },
      { key: 'ages', name: 'Weight of Ages', mark: '⧗', color: '#6b3fc4', hint: 'Finish trial II', rule: { workout: 'ages' },
        art: '<path d="M6 2.5h12M6 21.5h12"/><path d="M7 2.5c0 5 5 6 5 9.5s-5 4.5-5 9.5M17 2.5c0 5-5 6-5 9.5s5 4.5 5 9.5"/><path d="M9.5 18.5h5M10.5 7h3"/>' },
      { key: 'damned', name: 'Endured', mark: '∞', color: '#1f8a52', hint: 'Finish trial III', rule: { workout: 'damned' },
        art: '<path d="M12 22c-4.2 0-6.5-3-6.5-6.2 0-4.3 4-6.2 4-10.3 3 2 4.3 4.3 4.3 6.5 1.2-1 2-2.3 2-4.2 2.3 2.3 4 5.2 4 8.2 0 3.3-3.2 6-7.8 6z"/><path d="M12 22c-1.8 0-3-1.4-3-3 0-2 2-3 2-5 2 1.2 3.2 3 3.2 5 0 1.6-.9 3-2.2 3z"/>' },
      { key: 'pleased', name: 'The coach was pleased', mark: '✶', color: '#6b3fc4', hint: '10 sessions', rule: { days: 10 },
        art: '<path d="M14.5 3.5a8.5 8.5 0 1 0 6 14 7.5 7.5 0 0 1-6-14z"/><path d="M17.5 8l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z"/><path d="M20.5 3.5l.4.8.8.4-.8.4-.4.8-.4-.8-.8-.4.8-.4z"/>' },
      { key: 'faithful', name: 'No week missed', mark: '☾', color: '#1f8a52', hint: 'Two sessions in every one of the 8 weeks', rule: { weeks: 8, each: 2 },
        art: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M6.5 13.5l1 1 1.5-1.8M11 13.5l1 1 1.5-1.8M15.5 13.5l1 1 1.5-1.8M6.5 17.5l1 1 1.5-1.8M11 17.5l1 1 1.5-1.8M15.5 17.5l1 1 1.5-1.8"/>' },
      { key: 'graduated', name: 'Graduated', mark: '⚝', color: '#6b3fc4', hint: 'Beat week one on squat, bench or deadlift in week 8', rule: { beat: [...SQUAT, ...BENCH, ...DEAD] },
        art: '<path d="M5 22L14.5 8"/><circle cx="16.8" cy="5.6" r="3"/><path d="M16.8 1v.9M21.4 5.6h-.9M20.1 2.3l-.6.6M13.5 2.3l.6.6M20.1 8.9l-.6-.6"/><path d="M3 18.5l3.5 2.5"/>' },
    ],
  },

  strongman: {
    key: 'strongman', name: 'The Strongman Spectacular', theme: 'circus', kind: 'event', from: '07-01', to: '07-14',
    blurb: 'Roll up! Two weeks under the big top every July: strongman acts and carnival games. Lift the pony, walk the elephant, win the ring toss, ring the bell. Acts you miss stay open until closing night.',
    calendar: { title: 'Tonight’s programme', one: 'Act', many: 'Acts' },
    doors: [
      { name: 'The Pony Lift', lifts: DEAD, sets: 3, reps: 5 }, { name: 'Test Your Strength', lifts: SWING, sets: 3, reps: 10 }, { name: 'The Elephant Walk', lifts: CARRY, sets: 3, reps: 1 },
      { name: 'Ring Toss', lifts: OHP, sets: 3, reps: 5 }, { name: 'The Human Pyramid', lifts: SQUAT, sets: 3, reps: 5 }, { name: 'Tug of War', lifts: ROW, sets: 3, reps: 8 },
      { name: 'The Flying Trapeze', lifts: PULL, sets: 3, reps: 5 }, { name: 'Whack-a-Mole', lifts: PUSHUP, sets: 3, reps: 10 }, { name: 'The Iron Jaw', lifts: CORE, sets: 3, reps: 8 },
      { name: 'The Tightrope', lifts: LUNGE, sets: 3, reps: 8 }, { name: 'Test Your Strength', lifts: SWING, sets: 4, reps: 10 }, { name: 'The Anvil Press', lifts: BENCH, sets: 3, reps: 5 },
      { name: 'The Pony Lift', lifts: DEAD, sets: 4, reps: 5 }, { name: 'Closing Night', workout: 'finale' },
    ],
    workouts: [
      { key: 'opening', name: 'Opening Night', steps: [[DEAD, 3, 5, 'The Pony Lift'], [OHP, 3, 5, 'The Circus Dumbbell'], [CARRY, 3, 1, 'The Elephant Walk']] },
      { key: 'midway', name: 'The Midway', steps: [[SWING, 3, 12, 'Test Your Strength'], [OHP, 3, 8, 'Ring Toss'], [ROW, 3, 10, 'Tug of War'], [PUSHUP, 3, 10, 'Whack-a-Mole']] },
      { key: 'ring', name: 'The Main Ring', steps: [[SQUAT, 4, 5, 'The Human Pyramid'], [PULL, 3, 6, 'The Flying Trapeze · or pulldowns'], [CORE, 3, 10, 'The Iron Jaw']] },
      { key: 'finale', name: 'Closing Night', steps: [[DEAD, 2, 3, 'Work up to a heavy triple'], [SQUAT, 2, 3, 'Work up to a heavy triple'], [OHP, 2, 3, 'Work up to a heavy triple'], [CARRY, 3, 1, 'The Elephant Walk · 40 m']] },
    ],
    // Each stamp's art is a small line drawing (24 x 24), drawn in white on the stamp's colour.
    stamps: [
      { key: 'first-act', name: 'Admit one', mark: 'I', color: '#c8102e', hint: 'Perform your first act', rule: { doors: 1 },
        art: '<path d="M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 8v10" stroke-dasharray="2 2"/>' },
      { key: 'bell', name: 'Rang the bell', mark: '♪', color: '#a8780a', hint: 'Beat your best estimated max on a big lift during the Spectacular', rule: { record: [...DEAD, ...SQUAT, ...BENCH, ...OHP] },
        art: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0M12 3v2M3 7l2 1M21 7l-2 1"/>' },
      { key: 'pony', name: 'Lifted the pony', mark: '♞', color: '#1f3a6e', hint: '3 deadlift sets of 5 or more in a day', rule: { lift: DEAD, sets: 3, reps: 5 },
        art: '<path d="M7 4v8a5 5 0 0 0 10 0V4"/><path d="M5 4h4M15 4h4"/><circle cx="7" cy="8" r=".6"/><circle cx="17" cy="8" r=".6"/><circle cx="8.6" cy="13.5" r=".6"/><circle cx="15.4" cy="13.5" r=".6"/>' },
      { key: 'elephant', name: 'Walked the elephant', mark: '⚖', color: '#5a5f6e', hint: '3 carries in a day', rule: { lift: CARRY, sets: 3, reps: 1 },
        art: '<path d="M4 16c0-5 3-8 8-8s8 3 8 7v5h-3v-3h-3v3h-3v-3H8v3H5v-3"/><path d="M20 15c1.2 1 1.2 3.5 0 4.5"/><circle cx="15.5" cy="11.5" r=".8"/><path d="M11 8c-1 2-1 4 1 5"/>' },
      { key: 'ring-toss', name: 'Ring toss champ', mark: '◯', color: '#c8102e', hint: '3 overhead press sets of 8 or more in a day', rule: { lift: OHP, sets: 3, reps: 8 },
        art: '<path d="M10 3h4v3l2 3v12H8V9l2-3z"/><ellipse cx="12" cy="13" rx="7" ry="2.2"/>' },
      { key: 'tug', name: 'Won the tug of war', mark: '≈', color: '#2f7d4f', hint: '3 rowing sets of 10 or more in a day', rule: { lift: ROW, sets: 3, reps: 10 },
        art: '<path d="M3 12c2.5-2 4.5 2 7 0s4.5 2 7 0 2.5-1 4 0"/><path d="M5 8l-3 4 3 4M19 8l3 4-3 4"/>' },
      { key: 'seven-acts', name: 'Half the bill', mark: 'VII', color: '#a8780a', hint: 'Perform 7 acts', rule: { doors: 7 },
        art: '<path d="M3 20c1-6 4-11 9-15 5 4 8 9 9 15z"/><path d="M12 5v15M7.5 20c0-4 2-8 4.5-11M16.5 20c0-4-2-8-4.5-11M12 5V2l3 1.2L12 4.4"/>' },
      { key: 'every-act', name: 'Every act', mark: '★', color: '#c8102e', hint: 'Perform all 14 acts', rule: { doors: 14 },
        art: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5l1.6 3.4 3.7.5-2.7 2.6.7 3.7L12 15l-3.3 1.7.7-3.7-2.7-2.6 3.7-.5z"/>' },
      { key: 'opening', name: 'Opening night', mark: '🎟', color: '#1f3a6e', hint: 'Finish Opening Night', rule: { workout: 'opening' },
        art: '<path d="M3 4h18"/><path d="M4 4v16c3.5 0 5.5-6 5.5-16M20 4v16c-3.5 0-5.5-6-5.5-16"/>' },
      { key: 'midway', name: 'Played the midway', mark: '◎', color: '#2f7d4f', hint: 'Finish The Midway', rule: { workout: 'midway' },
        art: '<circle cx="12" cy="10" r="7"/><path d="M12 3v14M5 10h14M7 5l10 10M17 5L7 15M8 21l4-4 4 4"/>' },
      { key: 'ring', name: 'The main ring', mark: '◉', color: '#a8780a', hint: 'Finish The Main Ring', rule: { workout: 'ring' },
        art: '<ellipse cx="12" cy="15" rx="9" ry="4"/><path d="M12 11V4M9 6l3-2 3 2M7 15h10"/>' },
      { key: 'finale', name: 'Closing night', mark: '✦', color: '#c8102e', hint: 'Finish the Closing Night workout', rule: { workout: 'finale' },
        art: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/><circle cx="12" cy="12" r="1.6"/>' },
    ],
  },
};
export const PACK_ORDER = ['pilgrimage', 'hoist', 'strongman', 'apprenticeship'];

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
    if (door.workout ? workoutDone[door.workout] && workoutDone[door.workout] <= d : count(byDay.get(d), door.lifts, door.reps) >= door.sets) doorDone[i] = d;
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
    } else if (r.record) {
      const ids = h.ids(r.record), before = new Map();
      for (const s of sets) if (s.performed_on < from && s.is_warmup !== true && ids.has(s.exercise_id)) { const e = h.e1rm(Number(s.weight), s.reps) || 0; if (e > (before.get(s.exercise_id) || 0)) before.set(s.exercise_id, e); }
      on = days.find(d => byDay.get(d).some(s => ids.has(s.exercise_id) && before.has(s.exercise_id) && (h.e1rm(Number(s.weight), s.reps) || 0) > before.get(s.exercise_id))) || null;
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
