// Themes: each one is a look (colors, lettering, logo, a few ornaments) and a voice (the words on
// the page). Data never changes with the theme; only how it's shown. The choice is per browser.
//
// A new theme is one theme(...) entry below plus its id in ORDER. Anything it leaves out falls back
// to PLAIN (for words, icons and the club token) or to the steel palette in index.html (for colors).

const PLAIN = {
  brand: 'Lift Log', motto: 'SHOW UP · LIFT · WRITE IT DOWN', tagline: 'Log the set.',
  fonts: '', brandFont: 'var(--display)', headFont: 'var(--display)', brandWeight: 800, css: '',
  titles: { log: 'Today', routines: 'Routines', history: 'Calendar', seasons: 'Seasons', progress: 'Progress' },
  tabs: { log: 'Log', routines: 'Routines', history: 'Calendar', seasons: 'Seasons', progress: 'Progress' },
  helloBig: 'Big day.', helloSome: 'In session.', helloNone: 'Today',
  finish: 'Finish ›', finishFeed: 'Finish · share it', finishPrivate: 'Finish', updateFeed: 'Update it in the feed',
  ended: 'Session done. Nice work.', endedFeed: 'Session done. It’s in the feed.', endedClock: '✓ Done · ',
  routineDone: '🎉 Routine complete.', routineBtn: 'Routine done 🎉',
  emptyH: 'The bar awaits.', emptyP: 'Log a set to start today’s session.',
  prToast: '🏆 A PR: ', clubToast: '🎖️ New club: welcome to the ', goalToast: 'Goal done: ',
  // A PR by any other name: the noun on stat chips, the flag while logging, and the line in the feed.
  pr: 'PR', prs: 'PRs',
  prFlag: (reps, was) => 'That’s a PR: your best at ' + reps + ' reps was ' + was,
  winPr: ex => ex + ' PR: ',
  clubs: 'Clubs', clubsSub: n => 'one plate for each of the ' + n + ' clubs joined',
  clubsLabel: (n, next) => n + ' plates racked, one for each club; the next fills in as you near the ' + next,
  weekly: 'Last week', streak: 'week streak', restWeek: 'A rest week',
  rest: n => n + ' weeks in a row. Consider a deload week: same lifts at about 60% of the weight, then come back fresh.',
  feed: 'Wins', feedSub: 'the crew’s wins', feedEmpty: 'PRs, clubs, goals, records and finished sessions from the crew show up here.',
  icons: { pr: '🏆', club: '🎖️', goal: '✅', session: '💪', record: '👑', quest: '🎯', holder: '👑', questOpen: '▫️', rest: '🛌', dry: '📉', streak: '🔥', elephant: '🐘' },
  win: { club: 'Joined the ', record: 'Took the record: ', quest: 'Finished a challenge: ', goal: 'Hit a goal: ', session: 'Finished a session: ' },
  records: 'Crew records', holderCol: 'Holder', recordsBlurb: 'Beat the best and the record is yours.', recordToast: '👑 The crew record on ',
  quests: 'Challenges', questsSub: 'this week’s challenges, the same for the whole crew', questDone: '🎯 Challenge done: ',
  goals: 'Goals', goalsKept: 'Goals hit', plan: 'The plan',
  points: 'points', pointsEarned: 'points earned',
  dry: 'A plateau: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
  // ach: a description for an achievement id (first_visit, five_visits, twenty_visits, first_pr); achTitle: a new name for one.
  ach: {}, achTitle: {},
  // The club rack: one token per club joined, and the next one coming to life as you near it (glow 0 to 1).
  // Drawn in a 320 × 130 box on a shelf whose top edge is at y = 112; cx is the token's center.
  token: (cx, glow, next) => '<circle cx="' + cx + '" cy="88" r="21" fill="var(--chip)" stroke="var(--line)" stroke-width="1.5"/>' +
    (glow > 0.02 ? '<circle cx="' + cx + '" cy="88" r="21" fill="var(--accent)" opacity="' + (next ? (0.15 + glow * 0.6).toFixed(2) : 1) + '"/>' : '') +
    '<circle cx="' + cx + '" cy="88" r="5" fill="var(--card)"/>',
  // Progress bars (goals, season time, the routine you're following, clubs, challenges). Each value is CSS:
  // track and fill are backgrounds; texture is an image laid over every fill, person-colored ones included;
  // end is a character riding the tip of the fill ('' for none), flipped when flip is true (most emoji face left);
  // goal is a character waiting at the far end of the track. For anything fancier, style the bars in the
  // theme's css (BAR, FILL and the --p variable below help).
  bar: { height: '12px', track: 'var(--chip)', fill: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 45%, var(--gold)))', texture: 'none', end: '', goal: '', flip: false },
  // Colors on top of the steel palette in index.html, each becoming a CSS variable (--bg, --accent...).
  // Extra keys are fine too, for the theme's own css to use.
  colors: { light: {}, dark: {} },
};

const theme = (id, name, blurb, o) => ({
  ...PLAIN, ...o, id, name, blurb,
  titles: { ...PLAIN.titles, ...o.titles }, tabs: { ...PLAIN.tabs, ...o.tabs },
  icons: { ...PLAIN.icons, ...o.icons }, win: { ...PLAIN.win, ...o.win },
  ach: { ...o.ach }, achTitle: { ...o.achTitle }, bar: { ...PLAIN.bar, ...o.bar },
  colors: { light: { ...(o.colors || {}).light }, dark: { ...(o.colors || {}).dark } },
});

const svg = s => '<svg viewBox="0 0 40 40" aria-hidden="true">' + s + '</svg>';
const glowOp = (glow, next) => (next ? (0.25 + glow * 0.75).toFixed(2) : 1);
// Every progress bar (BAR) and its fill (FILL), for theme css. Each bar carries its percent as --p.
const BAR = '.bar, .gt-bar, .elapsed';
const FILL = (x = '') => ['.bar', '.gt-bar', '.elapsed'].map(b => b + ' > i' + x).join(', ');
const maskUrl = s => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" ' + s + '</svg>') + '")';

// The kaiju hero: a city skyline with something spiny rising behind it, head turned to the right.
const SKYLINE = maskUrl('viewBox="0 0 400 92" preserveAspectRatio="none">' +
  '<path d="M196 92 C196 70 205 52 222 40 L218 30 L230 35 L232 20 L242 30 L248 12 L256 27 L266 18 L268 31 C284 30 296 34 304 42 L322 40 L330 46 L318 52 C322 62 324 76 324 92 Z"/>' +
  '<path d="M0 92 V62 H18 V48 H34 V70 H44 V36 H58 V30 H66 V58 H80 V66 H96 V44 H112 V72 H122 V52 H140 V60 H150 V40 H158 V28 H164 V40 H172 V66 H190 V56 H210 V74 H226 V62 H246 V70 H262 V50 H278 V64 H296 V58 H314 V72 H326 V46 H340 V36 H352 V60 H366 V54 H382 V68 H400 V92 Z"/>');

// The kaiju bar: a block of city, flattened behind the monster as it goes.
const CITY = maskUrl('viewBox="0 0 90 22" preserveAspectRatio="none">' +
  '<path d="M0 22 V9 H9 V13 H13 V4 H22 V11 H28 V8 H37 V22 Z M41 22 V6 H48 V2 H51 V6 H58 V15 H66 V10 H78 V14 H86 V7 H90 V22 Z"/>');
// The stone bar: twelve columns stepping up, like a bar chart.
const COLUMNS = maskUrl('viewBox="0 0 120 20" preserveAspectRatio="none">' +
  Array.from({ length: 12 }, (_, k) => { const h = Math.round(5 + k * 15 / 11); return '<rect x="' + (k * 10 + 1) + '" y="' + (20 - h) + '" width="8" height="' + h + '"/>'; }).join(''));

export const THEMES = {
  church: theme('church', 'Church of Iron', 'Gothic lettering, gold, candles and saints', {
    brand: 'The Church of Iron', motto: 'ORA ET LEVA · PRAY AND LIFT', tagline: 'Keep the faith. Log the set.',
    fonts: 'family=Cinzel:wght@600;700&family=UnifrakturMaguntia', brandFont: 'UnifrakturMaguntia, Cinzel, Georgia, serif',
    headFont: 'Cinzel, Georgia, "Times New Roman", serif', brandWeight: 400,
    logo: svg('<circle cx="20" cy="20" r="17.5" fill="none" stroke="var(--gold)" stroke-width="2.4"/><rect x="18.4" y="5" width="3.2" height="30" rx="1.6" fill="var(--accent)"/><rect x="7" y="13.4" width="26" height="3.2" rx="1.6" fill="var(--accent)"/><rect x="7.6" y="9.6" width="3.6" height="10.8" rx="1.4" fill="var(--ink)"/><rect x="28.8" y="9.6" width="3.6" height="10.8" rx="1.4" fill="var(--ink)"/><circle cx="20" cy="15" r="2.2" fill="var(--gold)"/>'),
    css: '.hero { border-radius: 160px 160px var(--radius) var(--radius) / 54px 54px var(--radius) var(--radius); padding-top: 26px; border-top: 3px solid var(--gold); }' +
      '.hero .date::before, .hero .date::after { content: " ✠ "; color: var(--gold); }',
    titles: { log: 'Today’s Mass', routines: 'Rites', history: 'The Calendar', seasons: 'Liturgical Seasons' },
    tabs: { routines: 'Rites' },
    helloBig: 'High Mass.', helloSome: 'In session.',
    finish: 'Ite, missa est · Finish ›', finishFeed: 'Ite, missa est · add to Miracles', finishPrivate: 'Ite, missa est · finish', updateFeed: 'Update it in Miracles',
    ended: 'The Mass is ended. Go in peace.', endedFeed: 'The Mass is ended. Go in peace (it’s in Miracles).', endedClock: '✓ The Mass is ended · ',
    routineDone: '🎉 Routine complete. Go in peace.',
    emptyP: 'Log a set and today’s service begins.',
    prToast: '🙌 Hallelujah, a PR: ', clubToast: '🕯️ A candle is lit: welcome to the ',
    clubs: 'Votive candles', clubsSub: n => 'one lit for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' candles lit, one for each club; the next catches as you near the ' + next,
    weekly: 'Sunday bulletin', streak: 'weeks of devotion',
    rest: n => n + ' weeks of devotion in a row. Consider a Sabbath week: same lifts at about 60% of the weight, then come back fresh.',
    feed: 'Miracles', feedEmpty: 'PRs, candles, kept vows, records and finished sessions from the crew show up here.',
    icons: { pr: '🙌', club: '🕯️', session: '⛪', record: '😇', quest: '🥾', holder: '😇', questOpen: '🥾', rest: '🕊️', dry: '🏜️' },
    win: { club: 'Lit a candle: the ', record: 'Canonized: ', quest: 'Finished a pilgrimage: ', goal: 'Kept a vow: ', session: 'Went to Mass: ' },
    records: 'Communion of Saints', holderCol: 'Saint', recordsBlurb: 'Beat a saint’s best and the record (and the halo) is yours.', recordToast: '😇 Canonized: the crew record on ',
    quests: 'Pilgrimages', questsSub: 'this week’s quests, the same for the whole crew', questDone: '🥾 Pilgrimage complete: ',
    goals: 'Vows', goalsKept: 'Vows kept', plan: 'The liturgy', points: 'indulgences', pointsEarned: 'indulgences earned', goalToast: 'Vow kept: ',
    dry: 'A dry spell: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Welcome to the congregation.', five_visits: 'Regular attendance.', twenty_visits: 'Twenty gym days. Front pew.' },
    // A string of rosary beads in gold, with a candle carried at the head of the procession.
    bar: { fill: 'linear-gradient(90deg, color-mix(in srgb, var(--gold) 50%, var(--card)), var(--gold))',
      texture: 'radial-gradient(circle, rgba(255,255,255,.6) 0 1.8px, transparent 2.4px) 2px 50% / 9px 100% repeat-x', end: '🕯️' },
    token: (cx, glow, next) => '<rect x="' + (cx - 15) + '" y="70" width="30" height="42" rx="7" fill="var(--accent-soft)" stroke="var(--line)" stroke-width="1.5"/>' +
      '<rect x="' + (cx - 10) + '" y="76" width="20" height="34" rx="4" fill="var(--card)"/>' +
      '<path d="M' + cx + ' 76 V69" stroke="var(--muted)" stroke-width="1.6" stroke-linecap="round"/>' +
      (glow > 0.02 ? '<g opacity="' + glowOp(glow, next) + '" transform="translate(' + cx + ' 68) scale(' + (next ? (0.5 + glow * 0.5).toFixed(2) : 1) + ')">' +
        '<path d="M0 -24 C 8 -14, 9 -6, 0 0 C -9 -6, -8 -14, 0 -24 Z" fill="var(--gold)"/><path d="M0 -13 C 4 -8, 4 -4, 0 -1 C -4 -4, -4 -8, 0 -13 Z" fill="#fff" opacity=".7"/></g>' : ''),
  }),

  trains: theme('trains', 'The Iron Line', 'Railway green, brass, timetables and stations', {
    brand: 'The Iron Line', motto: 'ALL ABOARD · LIFT ON TIME', tagline: 'Mind the gap. Log the set.',
    fonts: 'family=Alfa+Slab+One&family=Oswald:wght@500;600;700', brandFont: '"Alfa Slab One", Rockwell, Georgia, serif',
    headFont: 'Oswald, "Arial Narrow", system-ui, sans-serif', brandWeight: 400,
    logo: svg('<rect x="2" y="32.5" width="36" height="2.6" rx="1" fill="var(--gold)"/><rect x="6" y="35" width="3" height="3" fill="var(--muted)"/><rect x="18.5" y="35" width="3" height="3" fill="var(--muted)"/><rect x="31" y="35" width="3" height="3" fill="var(--muted)"/><rect x="3" y="20.6" width="34" height="2.8" rx="1.4" fill="var(--ink)"/><circle cx="11" cy="22" r="8.5" fill="var(--accent)"/><circle cx="29" cy="22" r="8.5" fill="var(--accent)"/><circle cx="11" cy="22" r="2.6" fill="var(--gold)"/><circle cx="29" cy="22" r="2.6" fill="var(--gold)"/><rect x="11" y="20.8" width="18" height="2.4" fill="var(--ink)"/>'),
    css: '.hero { border-top: 6px solid var(--accent); box-shadow: inset 0 -5px 0 var(--gold), var(--lift); }' +
      '.hero .date::before { content: "▶ "; color: var(--gold); }' +
      '.card-title, .section-title, .page-title, .hero h1, .sheet-head h2 { text-transform: uppercase; letter-spacing: .04em; }',
    titles: { log: 'Today’s Departure', routines: 'Timetables', history: 'The Logbook', seasons: 'Lines', progress: 'Mileage' },
    tabs: { routines: 'Timetables', history: 'Logbook', seasons: 'Lines', progress: 'Mileage' },
    helloBig: 'Full steam.', helloSome: 'Under way.',
    finish: 'All change · Finish ›', finishFeed: 'Terminus · post to Arrivals', finishPrivate: 'Terminus · finish', updateFeed: 'Update it on Arrivals',
    ended: 'Arrived on time. Mind the gap.', endedFeed: 'Arrived on time. It’s on the Arrivals board.', endedClock: '✓ Arrived · ',
    routineDone: '🎉 End of the line. All change.',
    emptyH: 'The platform awaits.', emptyP: 'Log a set and today’s train departs.',
    prToast: '🚄 Express! A PR: ', clubToast: '🚉 Now arriving: the ',
    clubs: 'Signal lamps', clubsSub: n => 'one lamp lit for each of the ' + n + ' stations reached',
    clubsLabel: (n, next) => n + ' lamps lit, one for each club; the next glows as you near the ' + next,
    weekly: 'Service report', streak: 'weeks on schedule',
    rest: n => n + ' weeks on schedule. Consider a maintenance week: same lifts at about 60% of the weight, then back on the line.',
    feed: 'Arrivals', feedEmpty: 'PRs, stations, destinations, records and finished runs from the crew arrive here.',
    icons: { pr: '🚄', club: '🚉', goal: '🏁', session: '🚂', record: '🎩', quest: '🎫', holder: '🎩', questOpen: '🎫', rest: '🔧', dry: '🚧' },
    win: { club: 'Reached a station: the ', record: 'Took the line record: ', quest: 'Finished a journey: ', goal: 'Reached a destination: ', session: 'Completed a run: ' },
    records: 'Line records', holderCol: 'Conductor', recordsBlurb: 'Beat the conductor’s best and the cap is yours.', recordToast: '🎩 The line record on ',
    quests: 'Journeys', questsSub: 'this week’s tickets, the same for the whole crew', questDone: '🎫 Journey complete: ',
    goals: 'Destinations', goalsKept: 'Destinations reached', plan: 'The route', points: 'miles', pointsEarned: 'miles earned', goalToast: 'Destination reached: ',
    dry: 'A slow section: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Ticket punched.', five_visits: 'A regular commuter.', twenty_visits: 'Twenty gym days. Season ticket.' },
    // Track with sleepers, a green train with a brass stripe and the engine pulling it, bound for the station.
    bar: { track: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--muted) 45%, transparent) 0 2px, transparent 2px 8px), var(--chip)',
      fill: 'var(--accent)', texture: 'linear-gradient(180deg, transparent 38%, var(--gold) 38% 62%, transparent 62%)', end: '🚂', flip: true, goal: '🚉' },
    token: (cx, glow, next) => '<rect x="' + (cx - 2) + '" y="70" width="4" height="42" fill="var(--muted)"/>' +
      '<rect x="' + (cx - 14) + '" y="36" width="28" height="36" rx="7" fill="var(--ink)"/>' +
      '<circle cx="' + cx + '" cy="54" r="9" fill="var(--chip)"/>' +
      (glow > 0.02 ? '<g opacity="' + glowOp(glow, next) + '"><circle cx="' + cx + '" cy="54" r="16" fill="var(--gold)" opacity=".22"/><circle cx="' + cx + '" cy="54" r="9" fill="var(--gold)"/><circle cx="' + (cx - 3) + '" cy="51" r="2.6" fill="#fff" opacity=".7"/></g>' : ''),
    colors: {
      light: { bg: '#f1ede4', card: '#fffdf7', ink: '#1b211d', muted: '#5d665f', line: '#ddd6c8', chip: '#ebe5d8', accent: '#1f6b45', 'accent-ink': '#ffffff', 'accent-soft': '#dcebe1', good: '#1d8754', gold: '#a0690a', 'gold-soft': '#f6ebcf', grid: '#e7e1d5', axis: '#cbc3b3' },
      dark: { bg: '#0e1310', card: '#161d19', ink: '#e9eee9', muted: '#97a39b', line: '#26302a', chip: '#1d2621', accent: '#5cc48d', 'accent-ink': '#08140d', 'accent-soft': '#183024', good: '#5cd197', gold: '#f0b445', 'gold-soft': '#33270f', grid: '#212a25', axis: '#36423b' },
    },
  }),

  kitchen: theme('kitchen', 'The Iron Skillet', 'Tomato and butter, recipes and specials', {
    brand: 'The Iron Skillet', motto: 'MISE EN PLACE · THEN LIFT', tagline: 'Prep, cook, lift.',
    fonts: 'family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Pacifico', brandFont: 'Pacifico, "Brush Script MT", cursive',
    headFont: 'Fraunces, Georgia, serif', brandWeight: 400,
    logo: svg('<rect x="27" y="18.4" width="12" height="3.6" rx="1.8" fill="var(--ink)"/><circle cx="17" cy="20.2" r="13" fill="var(--ink)"/><circle cx="17" cy="20.2" r="9.6" fill="var(--accent)"/><ellipse cx="15" cy="21" rx="5.5" ry="4.6" fill="#fff"/><circle cx="16" cy="21" r="2.4" fill="var(--gold)"/>'),
    css: '.hero { position: relative; overflow: hidden; padding-top: 26px; }' +
      '.hero::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 9px; background: repeating-linear-gradient(90deg, var(--accent) 0 9px, transparent 9px 18px), repeating-linear-gradient(0deg, color-mix(in srgb, var(--accent) 45%, transparent) 0 4px, transparent 4px 9px); }' +
      '.hero .date::before { content: "◆ "; color: var(--accent); }',
    titles: { log: 'Tonight’s Service', routines: 'Recipes', history: 'The Cookbook', seasons: 'Menus', progress: 'Tasting notes' },
    tabs: { log: 'Cook', routines: 'Recipes', history: 'Cookbook', seasons: 'Menus', progress: 'Tasting' },
    helloBig: 'A feast.', helloSome: 'Cooking.',
    finish: 'Order up · Finish ›', finishFeed: 'Order up · send to the pass', finishPrivate: 'Order up · finish', updateFeed: 'Update it on the pass',
    ended: 'Kitchen’s closed. Well fed.', endedFeed: 'Kitchen’s closed. It’s on the pass.', endedClock: '✓ Served · ',
    routineDone: '🎉 Every course served.',
    emptyH: 'The stove is cold.', emptyP: 'Log a set and the kitchen opens.',
    prToast: '🔥 Fired up, a PR: ', clubToast: '🫙 Jar filled: welcome to the ',
    clubs: 'Spice rack', clubsSub: n => 'one jar filled for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' jars filled, one for each club; the next fills as you near the ' + next,
    weekly: 'The week’s menu', streak: 'weeks cooking',
    rest: n => n + ' weeks cooking in a row. Consider a simmer week: same lifts at about 60% of the weight, then turn the heat back up.',
    feed: 'The pass', feedEmpty: 'PRs, filled jars, courses, records and finished sessions from the crew come up here.',
    icons: { pr: '🔥', club: '🫙', goal: '🍽️', session: '🍳', record: '🧑‍🍳', quest: '🧾', holder: '🧑‍🍳', questOpen: '🧾', rest: '🥣', dry: '🧊' },
    win: { club: 'Filled a jar: the ', record: 'Took the house record: ', quest: 'Served a special: ', goal: 'Served a course: ', session: 'Cooked a meal: ' },
    records: 'Chef’s table', holderCol: 'Chef', recordsBlurb: 'Beat the chef’s best and the toque is yours.', recordToast: '🧑‍🍳 The house record on ',
    quests: 'Specials', questsSub: 'this week’s specials, the same for the whole crew', questDone: '🧾 Special served: ',
    goals: 'Courses', goalsKept: 'Courses served', plan: 'The recipe', points: 'stars', pointsEarned: 'stars earned', goalToast: 'Course served: ',
    dry: 'Gone cold: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'First shift in the kitchen.', five_visits: 'A regular at the stove.', twenty_visits: 'Twenty gym days. Head chef.' },
    // A long burger seen from the side: sesame bun, lettuce, cheese, patty, bun. The burger rides the front.
    bar: { height: '14px', fill: 'linear-gradient(180deg, #d8913a 0 34%, #6aac3c 34% 46%, #f3c22f 46% 56%, #5b2d16 56% 80%, #c98233 80%)',
      texture: 'radial-gradient(1.4px 1px at 50% 50%, #fff3d6 80%, transparent) 2px 1px / 8px 4px repeat-x', end: '🍔' },
    token: (cx, glow, next) => { const h = Math.round(40 * (next ? glow : 1));
      return '<rect x="' + (cx - 15) + '" y="64" width="30" height="48" rx="8" fill="var(--card)" stroke="var(--line)" stroke-width="1.5"/>' +
        (glow > 0.02 ? '<rect x="' + (cx - 11) + '" y="' + (108 - h) + '" width="22" height="' + h + '" rx="5" fill="var(--gold)" opacity="' + (next ? 0.75 : 0.9) + '"/>' : '') +
        '<rect x="' + (cx - 13) + '" y="56" width="26" height="9" rx="3" fill="var(--accent)"/>'; },
    colors: {
      light: { bg: '#faf3e8', card: '#fffbf5', ink: '#2b1d15', muted: '#6f5e52', line: '#eadcca', chip: '#f3e8d9', accent: '#c23b22', 'accent-ink': '#ffffff', 'accent-soft': '#fbe1d9', good: '#3f7d3a', gold: '#9a6500', 'gold-soft': '#f8ecd0', grid: '#efe5d7', axis: '#d6c7b3' },
      dark: { bg: '#16100c', card: '#201812', ink: '#f3e9df', muted: '#b19f8f', line: '#33271e', chip: '#2a2018', accent: '#ff7a5c', 'accent-ink': '#2a0d05', 'accent-soft': '#3a1d14', good: '#8bd27f', gold: '#f2c14e', 'gold-soft': '#352a12', grid: '#2b2219', axis: '#45372b' },
    },
  }),

  kaiju: theme('kaiju', 'The Iron Kaiju', 'Hazard tape, a skyline, radioactive green and alarm orange', {
    brand: 'The Iron Kaiju', motto: 'RISE FROM THE DEEP · LEVEL THE CITY', tagline: 'Something stirs. Log the set.',
    fonts: 'family=Bungee&family=Chakra+Petch:wght@600;700', brandFont: 'Bungee, Impact, sans-serif',
    headFont: '"Chakra Petch", "Arial Narrow", system-ui, sans-serif', brandWeight: 400,
    // Three back spines rising over a loaded bar.
    logo: svg('<path d="M9 23 L12.5 11 L15 16 L20 3 L25 16 L27.5 11 L31 23 Z" fill="var(--accent)"/><rect x="2" y="22.6" width="36" height="3" rx="1.5" fill="var(--ink)"/><rect x="5" y="16" width="4.4" height="16" rx="1.4" fill="var(--ink)"/><rect x="30.6" y="16" width="4.4" height="16" rx="1.4" fill="var(--ink)"/><rect x="1" y="18.5" width="3" height="11" rx="1" fill="var(--gold)"/><rect x="36" y="18.5" width="3" height="11" rx="1" fill="var(--gold)"/>'),
    // Hazard tape across the top of the hero, the skyline along its bottom, and the monster's eye.
    css: '.hero { position: relative; overflow: hidden; padding-top: 26px; padding-bottom: 74px;' +
        ' background-image: radial-gradient(4px 2.5px at 78.5% calc(100% - 47px), var(--gold) 80%, transparent), radial-gradient(14px 9px at 78.5% calc(100% - 47px), color-mix(in srgb, var(--gold) 40%, transparent), transparent); }' +
      '.hero > * { position: relative; z-index: 1; }' +
      '.hero::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 8px; background: repeating-linear-gradient(135deg, var(--gold) 0 10px, var(--ink) 10px 20px); }' +
      '.hero::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 92px; background: var(--beast);' +
        ' -webkit-mask: ' + SKYLINE + ' bottom / 100% 100% no-repeat; mask: ' + SKYLINE + ' bottom / 100% 100% no-repeat; }' +
      '.hero .date { color: var(--gold); } .hero .date::before { content: "⚠ "; }' +
      '.hero h1 { text-shadow: var(--glow); } .finish-btn, .fab { box-shadow: var(--glow), var(--shadow); }' +
      '.card-title, .section-title, .page-title, .hero h1, .sheet-head h2 { text-transform: uppercase; letter-spacing: .04em; }' +
      '.top .brand { font-size: clamp(17px, 5.2vw, 24px); }' +  // Bungee runs wide
      BAR + ' { height: 22px; background: none; border-radius: 0; overflow: hidden; box-shadow: inset 0 -2px 0 var(--city);' +
        ' --city: color-mix(in srgb, var(--muted) 55%, transparent); --rubble: var(--muted); }' +
      '.gt-bar { --rubble: var(--who); } .elapsed { --city: rgba(255, 255, 255, .45); --rubble: #fff; }' +
      FILL() + ' { border-radius: 0; background: radial-gradient(4px 6px at 50% 100%, var(--gold) 55%, transparent) 0 100% / 17px 9px repeat-x,' +
        ' repeating-linear-gradient(120deg, var(--rubble) 0 3px, transparent 3px 7px) 0 100% / 100% 7px no-repeat,' +
        ' linear-gradient(var(--rubble), var(--rubble)) 0 100% / 100% 3px no-repeat; }' +
      FILL('::before') + ' { content: ""; position: absolute; left: 100%; bottom: 0; width: 2000px; height: 100%; background: var(--city);' +
        ' -webkit-mask: ' + CITY + ' 0 100% / 90px 100% repeat-x; mask: ' + CITY + ' 0 100% / 90px 100% repeat-x; }' +
      FILL('::after') + ' { font-size: 18px; top: auto; bottom: 1px; transform: scaleX(var(--bar-flip)); }',
    titles: { log: 'Today’s Rampage', routines: 'Attack patterns', history: 'Sightings', seasons: 'Eras', progress: 'Growth' },
    tabs: { log: 'Stomp', routines: 'Attacks', history: 'Sightings', seasons: 'Eras', progress: 'Growth' },
    helloBig: 'City-level threat.', helloSome: 'Surfacing.', helloNone: 'Dormant.',
    finish: 'Return to the sea · Finish ›', finishFeed: 'Return to the sea · broadcast it', finishPrivate: 'Return to the sea · finish', updateFeed: 'Update the broadcast',
    ended: 'Back to the deep. The city is still standing (mostly).', endedFeed: 'Back to the deep. It’s on the emergency broadcast.', endedClock: '✓ Submerged · ',
    routineDone: '🎉 Rampage complete.', routineBtn: 'Rampage complete 🦖',
    emptyH: 'The sea is calm.', emptyP: 'Log a set and something stirs.',
    prToast: '🧬 A new evolution! ', clubToast: '🏢 Building destroyed: welcome to the ', goalToast: 'Target leveled: ',
    pr: 'feat', prs: 'feats',
    prFlag: (reps, was) => 'A new evolution! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'A feat of monstrous strength: ' + ex + ', ',
    clubs: 'Buildings destroyed', clubsSub: n => 'one leveled for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' buildings destroyed, one for each club; the next one cracks as you near the ' + next,
    weekly: 'Threat report', streak: 'weeks rampaging', restWeek: 'Hibernating',
    rest: n => n + ' weeks rampaging in a row. Consider a hibernation week: same lifts at about 60% of the weight, then resurface.',
    feed: 'Emergency broadcast', feedSub: 'feats of monstrous strength from the crew',
    feedEmpty: 'Feats of monstrous strength, wrecked buildings, targets, alphas and rampages from the crew show up here.',
    icons: { pr: '🧬', club: '🏢', goal: '🎯', session: '🦖', record: '👑', quest: '🗺️', holder: '👑', questOpen: '🗺️', rest: '🌊', dry: '🧊' },
    win: { club: 'Destroyed a building: the ', record: 'Became alpha: ', quest: 'Finished an invasion: ', goal: 'Leveled a target: ', session: 'Went on a rampage: ' },
    records: 'The Alphas', holderCol: 'Alpha', recordsBlurb: 'Beat the alpha’s best and the territory is yours.', recordToast: '👑 Alpha status: the record on ',
    quests: 'Invasions', questsSub: 'this week’s targets, the same for the whole crew', questDone: '🗺️ Invasion complete: ',
    goals: 'Targets', goalsKept: 'Targets leveled', plan: 'The attack plan', points: 'megatons', pointsEarned: 'megatons released',
    dry: 'Frozen in the ice: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then thaw out.',
    ach: { first_visit: 'Something has surfaced.', five_visits: 'Sightings confirmed.', twenty_visits: 'Twenty gym days. Category 5.', first_pr: 'A new best for an exercise and rep count. It evolves.' },
    achTitle: { first_pr: 'A Feat of Monstrous Strength' },
    // A city block: the monster stomps along it, leaving burning rubble behind and buildings still standing ahead.
    bar: { end: '🦖', flip: true },
    // One wrecked, burning building per club joined. The next one still stands, but cracks and leans
    // further as you near the next club.
    token: (cx, glow, next) => {
      if (!next) return '<path d="M' + (cx - 14) + ' 112 V86 L' + (cx - 8) + ' 79 L' + (cx - 3) + ' 87 L' + (cx + 3) + ' 74 L' + (cx + 8) + ' 83 L' + (cx + 14) + ' 77 V112 Z" fill="var(--muted)"/>' +
        '<rect x="' + (cx - 9) + '" y="92" width="5" height="5" fill="var(--card)" opacity=".5"/><rect x="' + (cx + 3) + '" y="100" width="5" height="5" fill="var(--card)" opacity=".5"/>' +
        '<path d="M' + (cx + 3) + ' 76 C ' + (cx + 9) + ' 66, ' + (cx + 6) + ' 60, ' + (cx + 1) + ' 54 C ' + (cx + 1) + ' 62, ' + (cx - 6) + ' 64, ' + (cx - 5) + ' 72 C ' + (cx - 4) + ' 78, ' + (cx + 1) + ' 79, ' + (cx + 3) + ' 76 Z" fill="var(--gold)"/>' +
        '<path d="M' + (cx + 1) + ' 75 C ' + (cx + 4) + ' 70, ' + (cx + 3) + ' 67, ' + (cx + 1) + ' 64 C ' + cx + ' 68, ' + (cx - 3) + ' 70, ' + (cx - 2) + ' 73 Z" fill="#fff" opacity=".6"/>' +
        '<rect x="' + (cx - 19) + '" y="108" width="6" height="4" rx="1" fill="var(--muted)"/><rect x="' + (cx + 14) + '" y="107" width="5" height="5" rx="1" fill="var(--muted)"/>';
      let win = '';
      for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) win += '<rect x="' + (cx - 9 + c * 7) + '" y="' + (50 + r * 10) + '" width="4" height="5" fill="var(--card)"/>';
      return '<g transform="rotate(' + (glow * 9).toFixed(1) + ' ' + (cx + 13) + ' 112)">' +
        '<rect x="' + (cx - 13) + '" y="44" width="26" height="68" fill="var(--chip)" stroke="var(--line)" stroke-width="1.5"/>' + win +
        '<path d="M' + (cx - 13) + ' 70 L' + (cx - 4) + ' 76 L' + (cx - 7) + ' 86 L' + (cx + 3) + ' 92 L' + cx + ' 104 M' + (cx - 4) + ' 76 L' + (cx + 6) + ' 72 L' + (cx + 13) + ' 78" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round" opacity="' + glow.toFixed(2) + '"/></g>';
    },
    colors: {
      light: { bg: '#eceee8', card: '#fbfcf8', ink: '#141a16', muted: '#59655d', line: '#d6dcd3', chip: '#e3e8e0', accent: '#13804a', 'accent-ink': '#ffffff', 'accent-soft': '#d8eedf', good: '#1d8754', gold: '#c2410c', 'gold-soft': '#fde5d4', grid: '#e3e7df', axis: '#c6cdc2',
        beast: 'rgba(20, 26, 22, .10)', glow: '0 0 0 transparent' },
      dark: { bg: '#090d0b', card: '#111814', ink: '#e4f1e8', muted: '#8ea395', line: '#1f2c25', chip: '#18221d', accent: '#47e08f', 'accent-ink': '#03140a', 'accent-soft': '#10301f', good: '#7be3a6', gold: '#ff8a3d', 'gold-soft': '#36200f', grid: '#1a241f', axis: '#2f3d35',
        beast: 'rgba(71, 224, 143, .13)', glow: '0 0 18px rgba(71, 224, 143, .35)' },
    },
  }),

  stone: theme('stone', 'Stone', 'Plain graphite and gray, no costume', {
    // Bars as a little bar chart: twelve columns stepping up, filled from the left.
    bar: { fill: 'var(--accent)' },
    css: BAR + ' { height: 18px; border-radius: 0; -webkit-mask: ' + COLUMNS + ' 0 0 / 100% 100% no-repeat; mask: ' + COLUMNS + ' 0 0 / 100% 100% no-repeat; }' +
      FILL() + ' { border-radius: 0; }',
    logo: svg('<rect x="3" y="18.6" width="34" height="2.8" rx="1.4" fill="var(--muted)"/><rect x="8" y="10" width="5" height="20" rx="1.6" fill="var(--accent)"/><rect x="27" y="10" width="5" height="20" rx="1.6" fill="var(--accent)"/><rect x="4" y="14" width="3.4" height="12" rx="1.2" fill="var(--ink)"/><rect x="32.6" y="14" width="3.4" height="12" rx="1.2" fill="var(--ink)"/>'),
    colors: {
      light: { bg: '#f2f2f0', card: '#ffffff', ink: '#1a1a19', muted: '#63635f', line: '#e2e2de', chip: '#ececec', accent: '#3b3b38', 'accent-ink': '#ffffff', 'accent-soft': '#e6e6e2', good: '#2f7d4f', gold: '#85671a', 'gold-soft': '#f2ecdc', grid: '#e9e9e6', axis: '#cfcfca' },
      dark: { bg: '#121212', card: '#1b1b1b', ink: '#ececea', muted: '#9a9a96', line: '#2a2a2a', chip: '#232323', accent: '#e6e6e2', 'accent-ink': '#121212', 'accent-soft': '#2c2c2a', good: '#6fcf97', gold: '#e0bf63', 'gold-soft': '#2d2716', grid: '#242424', axis: '#3a3a3a' },
    },
  }),

  sand: theme('sand', 'Sand', 'Plain warm beige with a sage accent', {
    // Bars as a thin line ending in a ring that closes as you go.
    bar: { height: '5px', fill: 'var(--accent)' },
    css: BAR + ' { margin-right: 32px; --ring: var(--accent); --ring-track: var(--chip); }' +
      '.gt-bar { --ring: var(--who); } .elapsed { --ring: #fff; --ring-track: rgba(255, 255, 255, .3); }' +
      '.bar::after, .gt-bar::after, .elapsed::after { content: ""; right: -32px; width: 22px; height: 22px; border-radius: 50%;' +
        ' background: conic-gradient(var(--ring) var(--p, 0%), var(--ring-track) 0);' +
        ' -webkit-mask: radial-gradient(closest-side, transparent 64%, #000 67%); mask: radial-gradient(closest-side, transparent 64%, #000 67%); }',
    logo: svg('<rect x="3" y="18.6" width="34" height="2.8" rx="1.4" fill="var(--muted)"/><rect x="8" y="10" width="5" height="20" rx="1.6" fill="var(--accent)"/><rect x="27" y="10" width="5" height="20" rx="1.6" fill="var(--accent)"/><rect x="4" y="14" width="3.4" height="12" rx="1.2" fill="var(--gold)"/><rect x="32.6" y="14" width="3.4" height="12" rx="1.2" fill="var(--gold)"/>'),
    colors: {
      light: { bg: '#f4f1ea', card: '#fffdf9', ink: '#23211c', muted: '#6b665c', line: '#e3ddd1', chip: '#ece7dc', accent: '#56755a', 'accent-ink': '#ffffff', 'accent-soft': '#e2eadf', good: '#3d7d4a', gold: '#946a10', 'gold-soft': '#f4ead2', grid: '#ebe6dc', axis: '#d0c9bb' },
      dark: { bg: '#13120f', card: '#1c1a16', ink: '#eeeae2', muted: '#a29c90', line: '#2d2a24', chip: '#25221d', accent: '#9cc09a', 'accent-ink': '#10170f', 'accent-soft': '#222e21', good: '#8fd39b', gold: '#e6c06a', 'gold-soft': '#302815', grid: '#25231e', axis: '#3c3830' },
    },
  }),
};

export const ORDER = ['church', 'trains', 'kitchen', 'kaiju', 'stone', 'sand'];

// The steel palette in index.html, for the few places that need real colors instead of CSS variables.
const BASE = {
  light: { bg: '#eef1f4', card: '#ffffff', ink: '#121820', muted: '#5b6674', line: '#dce2e9', chip: '#e9eef3', accent: '#2a5fd3', 'accent-soft': '#e1eafb', gold: '#a97a06' },
  dark: { bg: '#0e1217', card: '#161b22', ink: '#e8edf3', muted: '#95a0ad', line: '#262d37', chip: '#1e252f', accent: '#6e9cff', 'accent-soft': '#19253d', gold: '#f0c04a' },
};
const color = (t, mode, k) => t.colors[mode][k] || BASE[mode][k];
export const swatch = id => ['bg', 'accent', 'gold'].map(k => color(THEMES[id], 'light', k));

// The browser-tab icon: the theme's logo on a dark tile, with its colors filled in.
function favicon(t) {
  const inner = t.logo.replace(/^<svg[^>]*>|<\/svg>$/g, '').replace(/var\(--([a-z-]+)\)/g, (_, k) => color(t, 'dark', k));
  return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="' + color(t, 'dark', 'bg') + '"/>' + inner + '</svg>');
}

const decls = o => Object.entries(o).map(([k, v]) => '--' + k + ':' + v).join(';');

export function applyTheme(id) {
  const t = THEMES[id] || THEMES.church, v = t.colors, b = t.bar, root = document.documentElement, sel = ':root[data-skin="' + t.id + '"]';
  const bar = { 'bar-h': b.height, 'bar-track': b.track, 'bar-fill': b.fill, 'bar-texture': b.texture, 'bar-end': b.end ? JSON.stringify(b.end) : 'none', 'bar-goal': b.goal ? JSON.stringify(b.goal) : 'none', 'bar-flip': b.flip ? -1 : 1 };
  root.dataset.skin = t.id;
  let style = document.getElementById('skinStyle');
  if (!style) { style = document.createElement('style'); style.id = 'skinStyle'; document.head.appendChild(style); }
  style.textContent =
    sel + '{' + decls(bar) + ';' + decls(v.light) + ';--brandfont:' + t.brandFont + ';--headfont:' + t.headFont + ';--brandweight:' + t.brandWeight + '}' +
    '@media (prefers-color-scheme: dark){' + sel + ':not([data-theme="light"]){' + decls(v.dark) + '}}' +
    sel + '[data-theme="dark"]{' + decls(v.dark) + '}' + t.css;
  let link = document.getElementById('skinFonts');
  if (t.fonts) {
    const href = 'https://fonts.googleapis.com/css2?' + t.fonts + '&display=swap';
    if (!link) { link = document.createElement('link'); link.id = 'skinFonts'; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.getAttribute('href') !== href) link.href = href;
  } else if (link) link.remove();
  document.title = t.brand;
  document.querySelectorAll('.brand-logo').forEach(e => { e.innerHTML = t.logo; });
  document.querySelectorAll('.brand-name').forEach(e => { e.textContent = t.brand; });
  document.querySelectorAll('.tabs a[href^="#"]').forEach(a => { const k = a.getAttribute('href').slice(1), lab = a.querySelector('.tab-label'); if (lab && t.tabs[k]) lab.textContent = t.tabs[k]; });
  const light = document.querySelector('meta[name="theme-color"][media*="light"]'), dark = document.querySelector('meta[name="theme-color"][media*="dark"]');
  if (light) light.content = color(t, 'light', 'bg');
  if (dark) dark.content = color(t, 'dark', 'bg');
  const icon = document.querySelector('link[rel="icon"]');
  if (icon && t.logo) icon.href = favicon(t);
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = 'A lifting log for a small crew. ' + t.tagline;
  return t;
}
