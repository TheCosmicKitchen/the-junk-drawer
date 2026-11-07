// Themes: each one is a look (colors, lettering, logo, a few ornaments) and a voice (the words on
// the page). Data never changes with the theme; only how it's shown. The choice is per browser.

const PLAIN = {
  brand: 'Lift Log', motto: 'SHOW UP · LIFT · WRITE IT DOWN', tagline: 'Log the set.',
  fonts: '', brandFont: 'var(--display)', headFont: 'var(--display)', brandWeight: 800,
  token: 'plate', css: '',
  titles: { log: 'Today', routines: 'Routines', history: 'Calendar', seasons: 'Seasons', progress: 'Progress' },
  tabs: { log: 'Log', routines: 'Routines', history: 'Calendar', seasons: 'Seasons', progress: 'Progress' },
  helloBig: 'Big day.', helloSome: 'In session.',
  finish: 'Finish ›', finishFeed: 'Finish · share it', finishPrivate: 'Finish', updateFeed: 'Update it in the feed',
  ended: 'Session done. Nice work.', endedFeed: 'Session done. It’s in the feed.', endedClock: '✓ Done · ',
  routineDone: '🎉 Routine complete.',
  emptyH: 'The bar awaits.', emptyP: 'Log a set to start today’s session.',
  prToast: '🏆 A PR: ', clubToast: '🎖️ New club: welcome to the ',
  clubs: 'Clubs', clubsSub: n => 'one plate for each of the ' + n + ' clubs joined',
  clubsLabel: (n, next) => n + ' plates racked, one for each club; the next fills in as you near the ' + next,
  weekly: 'Last week', streak: 'week streak',
  rest: n => n + ' weeks in a row. Consider a deload week: same lifts at about 60% of the weight, then come back fresh.',
  feed: 'Wins', feedEmpty: 'PRs, clubs, goals, records and finished sessions from the crew show up here.',
  icons: { pr: '🏆', club: '🎖️', goal: '✅', session: '💪', record: '👑', quest: '🎯', holder: '👑', questOpen: '▫️', rest: '🛌', dry: '📉' },
  win: { club: 'Joined the ', record: 'Took the record: ', quest: 'Finished a challenge: ', goal: 'Hit a goal: ', session: 'Finished a session: ' },
  records: 'Crew records', holderCol: 'Holder', recordsBlurb: 'Beat the best and the record is yours.', recordToast: '👑 The crew record on ',
  quests: 'Challenges', questsSub: 'this week’s challenges, the same for the whole crew', questDone: '🎯 Challenge done: ',
  goals: 'Goals', goalsKept: 'Goals hit', plan: 'The plan',
  points: 'points', pointsEarned: 'points earned',
  dry: 'A plateau: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
  ach: {},
};

const theme = (id, name, blurb, o) => ({
  ...PLAIN, ...o, id, name, blurb,
  titles: { ...PLAIN.titles, ...o.titles }, tabs: { ...PLAIN.tabs, ...o.tabs },
  icons: { ...PLAIN.icons, ...o.icons }, win: { ...PLAIN.win, ...o.win },
});

const svg = s => '<svg viewBox="0 0 40 40" aria-hidden="true">' + s + '</svg>';

export const THEMES = {
  church: theme('church', 'Church of Iron', 'Gothic lettering, gold, candles and saints', {
    brand: 'The Church of Iron', motto: 'ORA ET LEVA · PRAY AND LIFT', tagline: 'Keep the faith. Log the set.',
    fonts: 'family=Cinzel:wght@600;700&family=UnifrakturMaguntia', brandFont: 'UnifrakturMaguntia, Cinzel, Georgia, serif',
    headFont: 'Cinzel, Georgia, "Times New Roman", serif', brandWeight: 400, token: 'candle',
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
    goals: 'Vows', goalsKept: 'Vows kept', plan: 'The liturgy', points: 'indulgences', pointsEarned: 'indulgences earned',
    dry: 'A dry spell: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Welcome to the congregation.', five_visits: 'Regular attendance.', twenty_visits: 'Twenty gym days. Front pew.' },
  }),

  trains: theme('trains', 'The Iron Line', 'Railway green, brass, timetables and stations', {
    brand: 'The Iron Line', motto: 'ALL ABOARD · LIFT ON TIME', tagline: 'Mind the gap. Log the set.',
    fonts: 'family=Alfa+Slab+One&family=Oswald:wght@500;600;700', brandFont: '"Alfa Slab One", Rockwell, Georgia, serif',
    headFont: 'Oswald, "Arial Narrow", system-ui, sans-serif', brandWeight: 400, token: 'lamp',
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
    goals: 'Destinations', goalsKept: 'Destinations reached', plan: 'The route', points: 'miles', pointsEarned: 'miles earned',
    dry: 'A slow section: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Ticket punched.', five_visits: 'A regular commuter.', twenty_visits: 'Twenty gym days. Season ticket.' },
  }),

  kitchen: theme('kitchen', 'The Iron Skillet', 'Tomato and butter, recipes and specials', {
    brand: 'The Iron Skillet', motto: 'MISE EN PLACE · THEN LIFT', tagline: 'Prep, cook, lift.',
    fonts: 'family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Pacifico', brandFont: 'Pacifico, "Brush Script MT", cursive',
    headFont: 'Fraunces, Georgia, serif', brandWeight: 400, token: 'jar',
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
    goals: 'Courses', goalsKept: 'Courses served', plan: 'The recipe', points: 'stars', pointsEarned: 'stars earned',
    dry: 'Gone cold: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'First shift in the kitchen.', five_visits: 'A regular at the stove.', twenty_visits: 'Twenty gym days. Head chef.' },
  }),

  stone: theme('stone', 'Stone', 'Plain graphite and gray, no costume', {
    logo: svg('<rect x="3" y="18.6" width="34" height="2.8" rx="1.4" fill="var(--muted)"/><rect x="8" y="10" width="5" height="20" rx="1.6" fill="var(--accent)"/><rect x="27" y="10" width="5" height="20" rx="1.6" fill="var(--accent)"/><rect x="4" y="14" width="3.4" height="12" rx="1.2" fill="var(--ink)"/><rect x="32.6" y="14" width="3.4" height="12" rx="1.2" fill="var(--ink)"/>'),
  }),

  sand: theme('sand', 'Sand', 'Plain warm beige with a sage accent', {
    logo: svg('<rect x="3" y="18.6" width="34" height="2.8" rx="1.4" fill="var(--muted)"/><rect x="8" y="10" width="5" height="20" rx="1.6" fill="var(--accent)"/><rect x="27" y="10" width="5" height="20" rx="1.6" fill="var(--accent)"/><rect x="4" y="14" width="3.4" height="12" rx="1.2" fill="var(--gold)"/><rect x="32.6" y="14" width="3.4" height="12" rx="1.2" fill="var(--gold)"/>'),
  }),
};

// Colors on top of the base (steel) palette in index.html. Chart series colors stay the same in every
// theme so charts read the same way everywhere.
const VARS = {
  church: { light: {}, dark: {} },
  trains: {
    light: { bg: '#f1ede4', card: '#fffdf7', ink: '#1b211d', muted: '#5d665f', line: '#ddd6c8', chip: '#ebe5d8', accent: '#1f6b45', 'accent-ink': '#ffffff', 'accent-soft': '#dcebe1', good: '#1d8754', gold: '#a0690a', 'gold-soft': '#f6ebcf', grid: '#e7e1d5', axis: '#cbc3b3' },
    dark: { bg: '#0e1310', card: '#161d19', ink: '#e9eee9', muted: '#97a39b', line: '#26302a', chip: '#1d2621', accent: '#5cc48d', 'accent-ink': '#08140d', 'accent-soft': '#183024', good: '#5cd197', gold: '#f0b445', 'gold-soft': '#33270f', grid: '#212a25', axis: '#36423b' },
  },
  kitchen: {
    light: { bg: '#faf3e8', card: '#fffbf5', ink: '#2b1d15', muted: '#6f5e52', line: '#eadcca', chip: '#f3e8d9', accent: '#c23b22', 'accent-ink': '#ffffff', 'accent-soft': '#fbe1d9', good: '#3f7d3a', gold: '#9a6500', 'gold-soft': '#f8ecd0', grid: '#efe5d7', axis: '#d6c7b3' },
    dark: { bg: '#16100c', card: '#201812', ink: '#f3e9df', muted: '#b19f8f', line: '#33271e', chip: '#2a2018', accent: '#ff7a5c', 'accent-ink': '#2a0d05', 'accent-soft': '#3a1d14', good: '#8bd27f', gold: '#f2c14e', 'gold-soft': '#352a12', grid: '#2b2219', axis: '#45372b' },
  },
  stone: {
    light: { bg: '#f2f2f0', card: '#ffffff', ink: '#1a1a19', muted: '#63635f', line: '#e2e2de', chip: '#ececec', accent: '#3b3b38', 'accent-ink': '#ffffff', 'accent-soft': '#e6e6e2', good: '#2f7d4f', gold: '#85671a', 'gold-soft': '#f2ecdc', grid: '#e9e9e6', axis: '#cfcfca' },
    dark: { bg: '#121212', card: '#1b1b1b', ink: '#ececea', muted: '#9a9a96', line: '#2a2a2a', chip: '#232323', accent: '#e6e6e2', 'accent-ink': '#121212', 'accent-soft': '#2c2c2a', good: '#6fcf97', gold: '#e0bf63', 'gold-soft': '#2d2716', grid: '#242424', axis: '#3a3a3a' },
  },
  sand: {
    light: { bg: '#f4f1ea', card: '#fffdf9', ink: '#23211c', muted: '#6b665c', line: '#e3ddd1', chip: '#ece7dc', accent: '#56755a', 'accent-ink': '#ffffff', 'accent-soft': '#e2eadf', good: '#3d7d4a', gold: '#946a10', 'gold-soft': '#f4ead2', grid: '#ebe6dc', axis: '#d0c9bb' },
    dark: { bg: '#13120f', card: '#1c1a16', ink: '#eeeae2', muted: '#a29c90', line: '#2d2a24', chip: '#25221d', accent: '#9cc09a', 'accent-ink': '#10170f', 'accent-soft': '#222e21', good: '#8fd39b', gold: '#e6c06a', 'gold-soft': '#302815', grid: '#25231e', axis: '#3c3830' },
  },
};

export const ORDER = ['church', 'trains', 'kitchen', 'stone', 'sand'];
export const swatch = id => [VARS[id].light.bg || '#eef1f4', VARS[id].light.accent || '#2a5fd3', VARS[id].light.gold || '#a97a06'];

const decls = o => Object.entries(o).map(([k, v]) => '--' + k + ':' + v).join(';');

export function applyTheme(id) {
  const t = THEMES[id] || THEMES.church, v = VARS[t.id], root = document.documentElement, sel = ':root[data-skin="' + t.id + '"]';
  root.dataset.skin = t.id;
  let style = document.getElementById('skinStyle');
  if (!style) { style = document.createElement('style'); style.id = 'skinStyle'; document.head.appendChild(style); }
  style.textContent =
    sel + '{' + decls(v.light) + ';--brandfont:' + t.brandFont + ';--headfont:' + t.headFont + ';--brandweight:' + t.brandWeight + '}' +
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
  if (light) light.content = v.light.bg || '#eef1f4';
  if (dark) dark.content = v.dark.bg || '#0e1217';
  return t;
}
