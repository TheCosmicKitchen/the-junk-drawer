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
  restUp: 'Rest’s up. Next set!',
  // Stamps: what a season gives you for its little achievements. The season decides each stamp's
  // name, mark and colour; the theme decides what they're called and the shape of the frame.
  stamp: 'Stamp', stamps: 'Stamps', stampBook: 'Stamp book', stampToast: 'Stamp earned: ', stampFrame: '50%',
  // What this theme calls a season (a long arc, start any time) and an event (shared, fixed dates).
  seasonWord: 'Season', seasonsWord: 'Seasons', eventWord: 'Event', eventsWord: 'Events',
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
  icons: { pr: '🏆', club: '🎖️', goal: '✅', session: '💪', record: '👑', quest: '🎯', holder: '👑', questOpen: '▫️', rest: '🛌', dry: '📉', streak: '🔥', elephant: '🐘', stamp: '🏅' },
  win: { club: 'Joined the ', record: 'Took the record: ', quest: 'Finished a challenge: ', goal: 'Hit a goal: ', session: 'Finished a session: ', stamp: 'Earned a stamp: ' },
  records: 'Crew records', holderCol: 'Holder', recordsBlurb: 'Beat the best and the record is yours.', recordToast: '👑 The crew record on ',
  quests: 'Challenges', questsSub: 'this week’s challenges, the same for the whole crew', questDone: '🎯 Challenge done: ',
  goals: 'Goals', goalsKept: 'Goals hit', plan: 'The plan',
  points: 'points', pointsEarned: 'points earned',
  dry: 'A plateau: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
  // ach: a description for an achievement id (first_visit, five_visits, twenty_visits, first_pr); achTitle: a new name for one.
  ach: {}, achTitle: {},
  // The club rack: one token per club joined, and the next one coming to life as you near it (glow 0 to 1).
  // Drawn in a 320 × 130 box on a shelf whose top edge is at y = 112; cx is the token's center.
  // clubMarks: optional [[up to lb, picture]] for club badges, in order (a picture is the inside of a
  // 24 x 24 SVG); clubs beyond the last use icons.club.
  // Or rack: (lit, ratio) => the whole rack as one picture in that box (lit clubs, ratio 0 to 1 toward the next).
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
  // Tab bar icons: the inside of a 24 x 24 line drawing, stroked in the tab's color with no fill.
  tabIcons: { log: '<path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12"/>', routines: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>', history: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', seasons: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>', progress: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
};

const theme = (id, name, blurb, o) => ({
  ...PLAIN, ...o, id, name, blurb,
  titles: { ...PLAIN.titles, ...o.titles }, tabs: { ...PLAIN.tabs, ...o.tabs }, tabIcons: { ...PLAIN.tabIcons, ...o.tabIcons },
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
    seasonWord: 'Pilgrimage', seasonsWord: 'Pilgrimages', eventWord: 'Feast day', eventsWord: 'Feast days',
    stamp: 'Seal', stamps: 'Seals', stampBook: 'The Book of Seals', stampFrame: '8px', stampToast: 'A seal for your book: ',
    tabIcons: { log: '<path d="M9 10h6v11H9z"/><path d="M12 10V7"/><path d="M12 2c2 2 2 3.5 0 5c-2-1.5-2-3 0-5z"/>', routines: '<path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5c2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6z"/><path d="M12 6v14.5"/>', history: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 12.5v5M10 14.5h4"/>', seasons: '<path d="M7 3h10c0 5-2 8-5 8s-5-3-5-8z"/><path d="M12 11v7M8 21h8M9.5 18h5"/>', progress: '<path d="M3 19h18"/><path d="M6 19a6 6 0 0 1 12 0"/><path d="M12 9V4M5.6 12.6 3.5 10.5M18.4 12.6l2.1-2.1"/>' },
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
    seasonWord: 'Line', seasonsWord: 'Lines', eventWord: 'Special service', eventsWord: 'Special services',
    stamp: 'Ticket punch', stamps: 'Ticket punches', stampBook: 'Ticket book', stampFrame: '6px', stampToast: 'Ticket punched: ',
    tabIcons: { log: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14"/><circle cx="9" cy="13.5" r="1"/><circle cx="15" cy="13.5" r="1"/><path d="M8 17l-2 4M16 17l2 4"/>', routines: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', history: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="2 2"/>', seasons: '<circle cx="5" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="18" r="2"/><path d="M6.5 7.5l4 3M13.5 13.5l4 3"/>', progress: '<path d="M8 21 11 3M16 21 13 3M7.5 17h9M8.5 12h7M9.5 7.5h5"/>' },
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
    seasonWord: 'Tasting menu', seasonsWord: 'Tasting menus', eventWord: 'Pop-up', eventsWord: 'Pop-ups',
    stamp: 'Sticker', stamps: 'Stickers', stampBook: 'Sticker book', stampFrame: '50%', stampToast: 'A sticker for the fridge: ',
    tabIcons: { log: '<circle cx="10" cy="13" r="7"/><path d="M17 13h5"/>', routines: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>', history: '<path d="M5 4h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3z"/><path d="M5 18a3 3 0 0 1 3-3h11"/>', seasons: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2 1-3 4-3 8h3"/>', progress: '<path d="M7 14a4 4 0 1 1 1.5-7.7a4 4 0 0 1 7 0A4 4 0 1 1 17 14z"/><path d="M7 14v6h10v-6M7 17h10"/>' },
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
    seasonWord: 'Era', seasonsWord: 'Eras', eventWord: 'Monster week', eventsWord: 'Monster weeks',
    stamp: 'Footprint', stamps: 'Footprints', stampBook: 'Field journal', stampFrame: '50%', stampToast: 'A new footprint: ',
    tabIcons: { log: '<path d="M8 21c-2-2-2-6 0-8s6-2 8 0 2 6 0 8-6 2-8 0z"/><path d="M7 9 5 5M12 8V3M17 9l2-4"/>', routines: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', history: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M12 8.5v7"/>', seasons: '<path d="M3 21 9 9h6l6 12z"/><path d="M9 9l1.5 3 1.5-2 1.5 2L15 9M10 6 9 3M14 6l1-3M12 5V2"/>', progress: '<path d="M3 20 7 11l3 4 4-11 4 10 3-5v11z"/>' },
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

  coach: theme('coach', 'The Dread Coach', 'Dark violet and green fire, and a menacing coach who secretly cares', {
    seasonWord: 'Apprenticeship', seasonsWord: 'Apprenticeships', eventWord: 'Blood moon', eventsWord: 'Blood moons',
    stamp: 'Sigil', stamps: 'Sigils', stampBook: 'The Grimoire of Sigils', stampFrame: '50%', stampToast: '“A sigil, earned.” ',
    tabIcons: { log: '<circle cx="12" cy="12" r="9"/><path d="M12 3l3 9-3 9-3-9z"/>', routines: '<path d="M5 4h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3z"/><path d="M12 9l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 15l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z"/>', history: '<path d="M7 4h11v13a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2v-1h11"/><path d="M7 4a2 2 0 0 0-2 2v1h2M10 8h5M10 12h5"/>', seasons: '<circle cx="12" cy="12" r="8"/><path d="M15 6a7 7 0 0 1 0 12"/>', progress: '<path d="M6 21L16 6"/><circle cx="17.5" cy="4.5" r="2.5"/><path d="M4 14l3 3"/>' },
    brand: 'The Dread Coach', motto: 'SUFFER · GROW · HYDRATE', tagline: 'Return, apprentice. Log the set.',
    fonts: 'family=Grenze+Gotisch:wght@600&family=Cormorant+Garamond:wght@700', brandFont: '"Grenze Gotisch", Georgia, serif',
    headFont: '"Cormorant Garamond", Georgia, serif', brandWeight: 600,
    // The coach: a hood with two green eyes, over a violet hem.
    logo: svg('<path d="M20 3 L32 30 H8 Z" fill="var(--ink)" opacity=".85"/><path d="M20 9 L28 28 H12 Z" fill="var(--bg)"/><circle cx="17" cy="21" r="1.8" fill="var(--gold)"/><circle cx="23" cy="21" r="1.8" fill="var(--gold)"/><path d="M6 30 H34 L31 36 H9 Z" fill="var(--accent)"/>'),
    // Summoning circles turning behind the hero.
    css: '.hero { position: relative; overflow: hidden; } .hero > * { position: relative; z-index: 1; }' +
      '.hero::before { content: ""; position: absolute; right: -50px; top: -50px; width: 190px; height: 190px; border-radius: 50%; border: 2px dashed color-mix(in srgb, var(--gold) 40%, transparent); }' +
      '.hero::after { content: ""; position: absolute; right: -16px; top: -16px; width: 120px; height: 120px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); }' +
      '.hero .date { color: var(--gold); } .hero .date::before { content: "✶ "; }',
    titles: { log: 'Today’s Ritual', routines: 'The Grimoire', history: 'The Chronicle', seasons: 'Eclipses', progress: 'Your Power' },
    tabs: { log: 'Ritual', routines: 'Grimoire', history: 'Chronicle', seasons: 'Eclipses', progress: 'Power' },
    helloBig: 'You honour me today.', helloSome: 'The ritual continues.', helloNone: 'You return, apprentice.',
    restUp: '“Rise. I have plans for you.”',
    finish: 'Enough, for now · Finish ›', finishFeed: 'Enough, for now · tell the coven', finishPrivate: 'Enough, for now · finish', updateFeed: 'Update the coven',
    ended: '“Adequate. Now eat something.”', endedFeed: '“Adequate. The coven has been told.”', endedClock: '✓ Dismissed · ',
    routineDone: '🎉 “Every rite performed. I am… almost proud.”', routineBtn: 'Rites complete 🔮',
    emptyH: 'The circle is cold.', emptyP: 'Log a set and the ritual begins.',
    prToast: '🔮 “Your power grows. As I foresaw.” ', clubToast: '✶ A rune ignites: welcome to the ', goalToast: 'Prophecy fulfilled: ',
    pr: 'triumph', prs: 'triumphs',
    prFlag: (reps, was) => '“Yes. YES.” Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'A triumph the coach foresaw: ' + ex + ', ',
    clubs: 'The circle', clubsSub: n => 'one rune lit for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' runes lit in the circle, one for each club; the next flickers as you near the ' + next,
    weekly: 'The coach’s report', streak: 'weeks of obedience', restWeek: 'A strategic retreat',
    rest: n => '“' + n + ' weeks without rest. Even I take holidays.” Consider a light week: same lifts at about 60% of the weight, then return.',
    feed: 'The coven', feedSub: 'the crew’s triumphs, noted by the coach',
    feedEmpty: 'Triumphs, runes, prophecies, champions and rituals from the crew are recorded here.',
    icons: { pr: '🔮', club: '💠', goal: '📜', session: '🌑', record: '👑', quest: '🗝️', holder: '👑', questOpen: '🗝️', rest: '🦇', dry: '🕸️' },
    win: { club: 'Lit a rune: the ', record: 'Named champion: ', quest: 'Completed a trial: ', goal: 'Fulfilled a prophecy: ', session: 'Performed a ritual: ' },
    records: 'The champions', holderCol: 'Champion', recordsBlurb: 'Surpass the champion and the coach will speak your name.', recordToast: '👑 The coach names a new champion: the record on ',
    quests: 'Trials', questsSub: 'this week’s trials, the same for every apprentice', questDone: '🗝️ Trial complete: ',
    goals: 'Prophecies', goalsKept: 'Prophecies fulfilled', plan: 'The grand design', points: 'favour', pointsEarned: 'favour earned',
    dry: '“Stagnation.” Three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: '“So. You have come.”', five_visits: 'Five rituals. The coach remembers your name.', twenty_visits: 'Twenty gym days. A true apprentice.', first_pr: 'A new best for an exercise and rep count. The coach foresaw it.' },
    achTitle: { first_visit: 'Summoned', first_pr: 'First Triumph' },
    // Dark power flowing up a staff, with the orb at its tip.
    bar: { height: '8px', fill: 'linear-gradient(90deg, var(--accent), var(--gold))', end: '🔮' },
    // One summoning circle of twelve runes: each club lights one, the next flickers in as you near
    // it, and the sigil in the middle ignites when the circle closes (then a new circle begins).
    rack: (lit, ratio) => {
      const glyphs = ['M-4 -7V7M-4 -2L4 -7M-4 3L4 -2', 'M-5 7L0 -7L5 7M-3 2H3', 'M0 -7V7M-5 -4L5 4M5 -4L-5 4'];
      const done = lit > 0 && lit % 12 === 0, k = lit === 0 ? 0 : done ? 12 : lit % 12, rounds = lit > 0 ? Math.floor((lit - 1) / 12) : 0;
      let s = '<circle cx="160" cy="65" r="62" fill="none" stroke="var(--line)" stroke-width="2"/><circle cx="160" cy="65" r="40" fill="none" stroke="var(--line)" stroke-width="2"/>' +
        '<path d="M160 38 L176 86 L135 56 H185 L144 86 Z" fill="none" stroke="' + (done ? 'var(--gold)' : 'var(--line)') + '" stroke-width="2" stroke-linejoin="round"/>';
      for (let i = 0; i < 12; i++) {
        const a = (i * 30 - 90) * Math.PI / 180, x = (160 + 52 * Math.cos(a)).toFixed(1), y = (65 + 52 * Math.sin(a)).toFixed(1);
        const on = i < k, next = !done && i === k;
        const col = on ? 'var(--gold)' : next ? 'var(--accent)' : 'var(--line)', op = next ? (0.3 + ratio * 0.7).toFixed(2) : 1;
        if (next) s += '<circle cx="' + x + '" cy="' + y + '" r="11" fill="var(--accent)" opacity="' + (ratio * 0.3).toFixed(2) + '"/>';
        s += '<path transform="translate(' + x + ' ' + y + ')" d="' + glyphs[i % 3] + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="' + op + '"/>';
      }
      if (rounds) s += '<text x="8" y="16" font-size="11" font-weight="700" fill="var(--muted)">' + rounds + (rounds === 1 ? ' circle' : ' circles') + ' closed</text>';
      return s;
    },
    token: (cx, glow, next) => '<path d="M' + cx + ' 58 l12 14 -12 40 -12 -40z" fill="' + (glow > 0.02 ? 'var(--gold)' : 'var(--chip)') + '" opacity="' + glowOp(glow, next) + '"/>',
    colors: {
      light: { bg: '#f3eff8', card: '#fdfbff', ink: '#1d1426', muted: '#625875', line: '#e2dbec', chip: '#ece6f4', accent: '#6b3fc4', 'accent-ink': '#ffffff', 'accent-soft': '#e6dcf8', good: '#1f8a52', gold: '#1f8a52', 'gold-soft': '#d8f3e2', grid: '#e8e2f0', axis: '#cbc2da' },
      dark: { bg: '#120d18', card: '#1c1524', ink: '#efe6d8', muted: '#a79cb8', line: '#33284a', chip: '#241b30', accent: '#a36bff', 'accent-ink': '#14081f', 'accent-soft': '#2a1f3d', good: '#8cf5a0', gold: '#8cf5a0', 'gold-soft': '#1d3326', grid: '#211a2c', axis: '#3d3150' },
    },
  }),

  claus: theme('claus', 'Iron Claus', 'Santa red and pine, snow, the Nice List and a tree to decorate', {
    seasonWord: 'Holiday season', seasonsWord: 'Holiday seasons', eventWord: 'Holiday', eventsWord: 'Holidays',
    stamp: 'Gift tag', stamps: 'Gift tags', stampBook: 'The Nice List book', stampFrame: '10px', stampToast: 'A gift tag for you: ',
    tabIcons: { log: '<path d="M4 14C5 6 15 3 20 9l-2 5z"/><circle cx="20.5" cy="8.5" r="1.8"/><path d="M3 14h16v3H3z"/>', routines: '<path d="M3 21V10l9-6 9 6v11z"/><path d="M9 21v-6h6v6"/>', history: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M10 14l2-1.5 2 1.5-.8 2.4h-2.4z"/>', seasons: '<path d="M12 2l6 9h-3l4 6H5l4-6H6z"/><path d="M12 17v4"/>', progress: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h4"/>' },
    brand: 'Iron Claus', motto: 'MAKE A LIST · LIFT IT TWICE', tagline: 'Ho ho hoist. Log the set.',
    fonts: 'family=Mountains+of+Christmas:wght@700&family=Fredoka:wght@600;700', brandFont: '"Mountains of Christmas", Georgia, serif',
    headFont: 'Fredoka, system-ui, sans-serif', brandWeight: 700,
    // A Santa hat on a loaded bar.
    logo: svg('<path d="M8 24 C10 10 26 6 33 14 L30 24 Z" fill="var(--accent)"/><circle cx="34" cy="13" r="3.5" fill="var(--fur)"/><rect x="5" y="23" width="28" height="6" rx="3" fill="var(--fur)"/><rect x="3" y="31" width="34" height="3" rx="1.5" fill="var(--ink)"/><rect x="2" y="28" width="5" height="9" rx="1.5" fill="var(--good)"/><rect x="33" y="28" width="5" height="9" rx="1.5" fill="var(--good)"/>'),
    // Fur trim along the top of the hero, and snow falling behind it.
    css: '.hero { position: relative; overflow: hidden; padding-top: 34px; } .hero > * { position: relative; z-index: 1; }' +
      '.hero::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 20px; z-index: 1;' +
        ' background: radial-gradient(circle at 10px 10px, var(--fur) 7px, var(--line) 8px, transparent 8.5px) 0 0 / 20px 20px repeat-x, linear-gradient(var(--accent), var(--accent)) 0 0 / 100% 10px no-repeat; }' +
      '.hero::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle, color-mix(in srgb, var(--muted) 30%, transparent) 1.2px, transparent 1.8px) 0 0 / 26px 26px; }' +
      '.hero .date::before { content: "❄ "; color: var(--accent); }',
    titles: { log: 'Today’s Shift', routines: 'The Workshop', history: 'Advent', seasons: 'Holidays', progress: 'The Gains List' },
    tabs: { log: 'Lift', routines: 'Workshop', history: 'Advent', seasons: 'Holidays', progress: 'Gains list' },
    helloBig: 'Christmas Eve energy.', helloSome: 'In the workshop.', helloNone: 'The workshop is quiet.',
    restUp: 'Break’s over. Back to the workshop!',
    finish: 'Wrap it up · Finish ›', finishFeed: 'Wrap it up · put it under the tree', finishPrivate: 'Wrap it up · finish', updateFeed: 'Update it under the tree',
    ended: 'Shift done. Have a cocoa.', endedFeed: 'Shift done. It’s under the tree.', endedClock: '✓ Wrapped · ',
    routineDone: '🎉 Everything on the list, checked twice.', routineBtn: 'Checked twice 🎁',
    emptyH: 'The workshop is quiet.', emptyP: 'Log a set and the elves get to work.',
    prToast: '⭐ Nice List! ', clubToast: '🎄 A new ornament: welcome to the ', goalToast: 'Wish granted: ',
    pr: 'star', prs: 'stars',
    prFlag: (reps, was) => 'Nice List! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'Made the Nice List on ' + ex + ': ',
    clubs: 'The tree', clubsSub: n => 'one ornament hung for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' ornaments on the tree, one for each club; the next one glows as you near the ' + next,
    weekly: 'Last week’s list', streak: 'weeks of good cheer', restWeek: 'Cocoa week',
    rest: n => n + ' weeks of good cheer in a row. Consider a cocoa week: same lifts at about 60% of the weight, then back to the workshop.',
    feed: 'Under the tree', feedSub: 'the crew’s gifts',
    feedEmpty: 'Nice Lists, ornaments, wishes, Head Elves and finished shifts from the crew show up under the tree.',
    icons: { pr: '⭐', club: '🎄', goal: '🎁', session: '🛷', record: '🎅', quest: '📜', holder: '🎅', questOpen: '📜', rest: '☕', dry: '🥶' },
    win: { club: 'Hung an ornament: the ', record: 'Became Head Elf: ', quest: 'Checked off a list: ', goal: 'Got a wish: ', session: 'Worked a shift: ' },
    records: 'Head Elves', holderCol: 'Head Elf', recordsBlurb: 'Beat the Head Elf’s best and the hat is yours.', recordToast: '🎅 Head Elf now: the crew record on ',
    quests: 'The lists', questsSub: 'this week’s lists, the same for the whole crew', questDone: '📜 Checked twice: ',
    goals: 'Wishes', goalsKept: 'Wishes granted', plan: 'The schedule', points: 'candy canes', pointsEarned: 'candy canes earned',
    dry: 'Snowed in: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Your first shift in the workshop.', five_visits: 'Five shifts. The elves know your name.', twenty_visits: 'Twenty gym days. Santa’s strongest helper.', first_pr: 'A new best for an exercise and rep count. Straight onto the Nice List.' },
    achTitle: { first_pr: 'First Nice List' },
    // A candy cane, with the sleigh out in front and the tree waiting at the end.
    bar: { height: '14px', fill: 'repeating-linear-gradient(135deg, var(--accent) 0 9px, var(--fur) 9px 18px)', end: '🛷', goal: '🎄' },
    // One tree: each club hangs an ornament, the next glows on its branch as you near it, and the
    // star lights when all twelve are up (then a fresh tree goes up).
    rack: (lit, ratio) => {
      const spots = [[148, 46], [172, 46], [160, 32], [136, 74], [156, 68], [176, 76], [186, 64], [122, 104], [140, 96], [160, 102], [178, 94], [198, 104]];
      const colors = ['var(--accent)', 'var(--gold)', '#2a5fd3', 'var(--fur)'];
      const done = lit > 0 && lit % 12 === 0, k = lit === 0 ? 0 : done ? 12 : lit % 12, rounds = lit > 0 ? Math.floor((lit - 1) / 12) : 0;
      let s = '<rect x="152" y="112" width="16" height="14" rx="2" fill="#7a4b2a"/>' +
        '<path d="M160 62 L100 112 H220 Z" fill="#1f6b45"/><path d="M160 34 L116 84 H204 Z" fill="#26804f"/><path d="M160 14 L130 52 H190 Z" fill="#2e9459"/>' +
        '<path d="M114 100 q46 18 92 -6 M128 72 q32 12 64 -4" fill="none" stroke="var(--gold)" stroke-width="1.6" stroke-dasharray="2 4" stroke-linecap="round"/>';
      spots.forEach(([x, y], i) => {
        if (i < k) s += '<circle cx="' + x + '" cy="' + y + '" r="6" fill="' + colors[i % 4] + '" stroke="#ffffff" stroke-width="1.2"/>';
        else if (!done && i === k) s += '<circle cx="' + x + '" cy="' + y + '" r="10" fill="var(--gold)" opacity="' + (ratio * 0.35).toFixed(2) + '"/><circle cx="' + x + '" cy="' + y + '" r="6" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-dasharray="3 2" opacity="' + (0.4 + ratio * 0.6).toFixed(2) + '"/>';
        else s += '<circle cx="' + x + '" cy="' + y + '" r="1.6" fill="#a8c7b0"/>';
      });
      s += '<path d="M160 0 l3.5 7.5 8.3 .9 -6.2 5.6 1.8 8.2 -7.4 -4.3 -7.4 4.3 1.8 -8.2 -6.2 -5.6 8.3 -.9z" transform="translate(0 2) scale(1)" fill="' + (done ? 'var(--gold)' : 'none') + '" stroke="var(--gold)" stroke-width="1.6" stroke-linejoin="round"/>';
      if (rounds) s += '<text x="8" y="16" font-size="11" font-weight="700" fill="var(--muted)">' + rounds + (rounds === 1 ? ' tree' : ' trees') + ' finished</text>';
      return s;
    },
    token: (cx, glow, next) => '<rect x="' + (cx - 14) + '" y="80" width="28" height="30" rx="3" fill="' + (glow > 0.02 ? 'var(--accent)' : 'var(--chip)') + '" opacity="' + glowOp(glow, next) + '"/>',
    colors: {
      light: { bg: '#f7f1e6', card: '#fffdf8', ink: '#2a1712', muted: '#6e5a4c', line: '#eadfcd', chip: '#f1e8d8', accent: '#b3261e', 'accent-ink': '#ffffff', 'accent-soft': '#f8dcd6', good: '#1f6b45', gold: '#a97a06', 'gold-soft': '#f7ecd0', grid: '#efe6d6', axis: '#d9cbb4', fur: '#ffffff' },
      dark: { bg: '#140d0b', card: '#1f1512', ink: '#f6ebe0', muted: '#bba795', line: '#352620', chip: '#2a1d18', accent: '#ff6b5e', 'accent-ink': '#2a0705', 'accent-soft': '#3d1a16', good: '#5cc48d', gold: '#ffd36a', 'gold-soft': '#352a12', grid: '#2a1e19', axis: '#4a372e', fur: '#f6ebe0' },
    },
  }),

  mission: theme('mission', 'Mission Control', 'Deep navy, starlight and rocket fire; every club a new world', {
    seasonWord: 'Mission', seasonsWord: 'Missions', eventWord: 'Launch window', eventsWord: 'Launch windows',
    stamp: 'Mission patch', stamps: 'Mission patches', stampBook: 'Patch collection', stampFrame: '50%', stampToast: 'Patch earned: ',
    tabIcons: { log: '<path d="M12 2c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z"/><circle cx="12" cy="9" r="1.6"/><path d="M8 13l-3 4h4M16 13l3 4h-4M10 19l2 3 2-3"/>', routines: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 10l2 2 4-4M8 16h8"/>', history: '<path d="M3 21l6-6M14 4l6 6-5 5-6-6z"/><path d="M12 12l-3 3"/><circle cx="19" cy="19" r="2"/>', seasons: '<circle cx="12" cy="12" r="5"/><path d="M2 15c4 3 17 1 20-7"/>', progress: '<path d="M3 20h18M6 17l4-6 4 3 5-9"/><path d="M15 5h4v4"/>' },
    brand: 'Mission Control', motto: 'T-MINUS NOW · ALL SYSTEMS GO', tagline: 'All systems go. Log the set.',
    fonts: 'family=Orbitron:wght@700&family=Rajdhani:wght@600;700', brandFont: 'Orbitron, "Arial Narrow", sans-serif',
    headFont: 'Rajdhani, system-ui, sans-serif', brandWeight: 700,
    // A rocket on its way up past a planet.
    logo: svg('<circle cx="29" cy="28" r="7" fill="var(--gold)" opacity=".85"/><path d="M14 30 C20 14 26 7 34 4 C33 12 26 19 10 26 Z" fill="var(--ink)"/><circle cx="26" cy="13" r="2.4" fill="var(--accent)"/><path d="M10 26 L6 34 L14 30 Z" fill="var(--gold)"/>'),
    // A field of stars behind the hero.
    css: '.hero { background-image: radial-gradient(circle, color-mix(in srgb, var(--ink) 35%, transparent) 1px, transparent 1.6px), radial-gradient(circle, color-mix(in srgb, var(--accent) 50%, transparent) 1.2px, transparent 1.8px); background-size: 34px 34px, 57px 57px; background-position: 0 0, 17px 11px; }' +
      '.hero .date::before { content: "◉ "; color: var(--accent); }' +
      '.card-title, .section-title, .page-title, .sheet-head h2 { letter-spacing: .03em; }',
    titles: { log: 'Today’s Launch', routines: 'Flight plans', history: 'Mission log', seasons: 'Missions', progress: 'Altitude' },
    tabs: { log: 'Launch', routines: 'Flight plans', history: 'Mission log', seasons: 'Missions', progress: 'Altitude' },
    helloBig: 'Maximum thrust.', helloSome: 'In orbit.', helloNone: 'On the launch pad.',
    restUp: 'Countdown complete. Next set: go!',
    finish: 'Splashdown · Finish ›', finishFeed: 'Splashdown · transmit to base', finishPrivate: 'Splashdown · finish', updateFeed: 'Update the transmission',
    ended: 'Splashdown. Welcome home.', endedFeed: 'Splashdown. Mission control has the report.', endedClock: '✓ Landed · ',
    routineDone: '🎉 Mission accomplished.', routineBtn: 'Mission accomplished 🚀',
    emptyH: 'On the launch pad.', emptyP: 'Log a set and the countdown starts.',
    prToast: '🚀 New apogee! ', clubToast: '🪐 A new world: welcome to the ', goalToast: 'Objective complete: ',
    pr: 'apogee', prs: 'apogees',
    prFlag: (reps, was) => 'New apogee! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'New apogee on ' + ex + ': ',
    clubs: 'The flight path', clubsSub: n => 'one world reached for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' worlds reached along the flight path, one for each club; the next comes into view as you near the ' + next,
    weekly: 'Last week’s flight report', streak: 'weeks in orbit', restWeek: 'Re-entry week',
    rest: n => n + ' weeks in orbit. Consider a re-entry week: same lifts at about 60% of the weight, then launch again.',
    feed: 'Transmissions', feedSub: 'the crew’s transmissions', feedEmpty: 'Apogees, new worlds, objectives, commanders and missions from the crew come in here.',
    icons: { pr: '🚀', club: '🪐', goal: '🎯', session: '🛰️', record: '👨‍🚀', quest: '📡', holder: '👨‍🚀', questOpen: '📡', rest: '🌙', dry: '☄️', stamp: '🎖️' },
    win: { club: 'Reached a new world: the ', record: 'Became commander: ', quest: 'Flew a sortie: ', goal: 'Hit an objective: ', session: 'Flew a mission: ', stamp: 'Earned a mission patch: ' },
    records: 'Mission records', holderCol: 'Commander', recordsBlurb: 'Beat the commander’s best and the patch is yours.', recordToast: '👨‍🚀 New commander: the crew record on ',
    quests: 'Sorties', questsSub: 'this week’s sorties, the same for the whole crew', questDone: '📡 Sortie complete: ',
    goals: 'Objectives', goalsKept: 'Objectives complete', plan: 'The flight plan', points: 'fuel', pointsEarned: 'fuel earned',
    dry: 'Stuck in orbit: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Lift-off.', five_visits: 'Five missions flown.', twenty_visits: 'Twenty gym days. Veteran astronaut.', first_pr: 'A new best for an exercise and rep count. A new apogee.' },
    achTitle: { first_visit: 'Lift-off', first_pr: 'First Apogee' },
    bar: { fill: 'linear-gradient(90deg, var(--gold), var(--accent))', end: '🚀', goal: '🪐' },
    // One flight path curving up from Earth: each club is a world along it; the next comes into
    // view as you near it, and a fresh path starts once all twelve are reached.
    rack: (lit, ratio) => {
      const colors = ['#ff7b54', '#ffd166', '#5ee6a8', '#6e9cff', '#c77dff', '#f2f2f2'];
      const done = lit > 0 && lit % 12 === 0, k = lit === 0 ? 0 : done ? 12 : lit % 12, rounds = lit > 0 ? Math.floor((lit - 1) / 12) : 0;
      const pt = t => { const x = (1 - t) * (1 - t) * 26 + 2 * (1 - t) * t * 70 + t * t * 300, y = (1 - t) * (1 - t) * 116 + 2 * (1 - t) * t * 8 + t * t * 16; return [x.toFixed(1), y.toFixed(1)]; };
      let s = '<path d="M26 116 Q70 8 300 16" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="3 5"/>' +
        '<circle cx="26" cy="116" r="11" fill="#3b82f6"/><path d="M19 112 q5 -3 9 1 q3 4 -2 7" fill="#5ee6a8"/>';
      for (let i = 0; i < 12; i++) {
        const [x, y] = pt((i + 1) / 12.4), r = 4 + (i % 4);
        if (i < k) s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + colors[i % colors.length] + '"/>';
        else if (!done && i === k) s += '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 5) + '" fill="var(--accent)" opacity="' + (ratio * 0.25).toFixed(2) + '"/><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="1.6" opacity="' + (0.4 + ratio * 0.6).toFixed(2) + '"/>';
        else s += '<circle cx="' + x + '" cy="' + y + '" r="1.5" fill="var(--muted)"/>';
      }
      if (rounds) s += '<text x="314" y="124" text-anchor="end" font-size="11" font-weight="700" fill="var(--muted)">' + rounds + (rounds === 1 ? ' flight path' : ' flight paths') + ' flown</text>';
      return s;
    },
    token: (cx, glow, next) => '<circle cx="' + cx + '" cy="88" r="16" fill="' + (glow > 0.02 ? 'var(--accent)' : 'var(--chip)') + '" opacity="' + glowOp(glow, next) + '"/>',
    colors: {
      light: { bg: '#eef2fb', card: '#ffffff', ink: '#0f1733', muted: '#4e5a80', line: '#d8def0', chip: '#e7ecf8', accent: '#2b4fd8', 'accent-ink': '#ffffff', 'accent-soft': '#dfe6fb', good: '#1f8a52', gold: '#d9480f', 'gold-soft': '#fde3d5', grid: '#e4e9f6', axis: '#c5cde6' },
      dark: { bg: '#0b1026', card: '#141c42', ink: '#dfe6ff', muted: '#9fb0e8', line: '#22306b', chip: '#1a2452', accent: '#ffd166', 'accent-ink': '#1a1000', 'accent-soft': '#2a2c4a', good: '#5ee6a8', gold: '#ff7b54', 'gold-soft': '#3a2018', grid: '#18214d', axis: '#2c3a78' },
    },
  }),

  greenhouse: theme('greenhouse', 'The Iron Greenhouse', 'Leaf green and terracotta; one plant that grows a leaf for every club', {
    seasonWord: 'Growing season', seasonsWord: 'Growing seasons', eventWord: 'Harvest festival', eventsWord: 'Harvest festivals',
    stamp: 'Pressed flower', stamps: 'Pressed flowers', stampBook: 'The flower press', stampFrame: '50%', stampToast: 'A flower for the press: ',
    tabIcons: { log: '<path d="M4 10h11l-1.5 10h-8z"/><path d="M15 12l4-4M17 6l3 3"/>', routines: '<path d="M12 21V11"/><path d="M12 11C12 6 8 4 4 4c0 5 3 7 8 7zM12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/>', history: '<path d="M5 4h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3z"/><path d="M12 15c0-3 2-4 4-4 0 2-2 4-4 4zM12 15c0-2-1.5-3-3-3 0 1.6 1.4 3 3 3z"/>', seasons: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', progress: '<path d="M7 21h10M12 21V9"/><path d="M12 9c0-4-3-6-6-6 0 4 2 6 6 6zM12 13c0-3 3-5 6-5 0 3-3 5-6 5z"/>' },
    brand: 'The Iron Greenhouse', motto: 'PLANT · WATER · GROW', tagline: 'Water the roots. Log the set.',
    fonts: 'family=Caprasimo&family=Lora:wght@700', brandFont: 'Caprasimo, Georgia, serif',
    headFont: 'Lora, Georgia, serif', brandWeight: 400,
    // A seedling in a terracotta pot.
    logo: svg('<path d="M10 22h20l-3 14H13z" fill="var(--gold)"/><rect x="8" y="19" width="24" height="5" rx="1.5" fill="var(--gold)"/><path d="M20 19V10" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/><path d="M20 12C20 6 15 4 10 4c0 6 4 8 10 8z" fill="var(--accent)"/><path d="M20 14c0-5 4-7 9-7 0 5-4 7-9 7z" fill="var(--good)"/>'),
    // A strip of grass along the bottom of the hero.
    css: '.hero { position: relative; overflow: hidden; padding-bottom: 30px; } .hero > * { position: relative; z-index: 1; }' +
      '.hero::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: linear-gradient(135deg, transparent 50%, var(--accent) 50%) 0 0 / 10px 16px repeat-x, linear-gradient(225deg, transparent 50%, color-mix(in srgb, var(--accent) 70%, #000) 50%) 5px 0 / 10px 16px repeat-x; opacity: .55; }' +
      '.hero .date::before { content: "❀ "; color: var(--gold); }' +
      '.top .brand { font-size: clamp(16px, 4.8vw, 22px); }',   // Caprasimo runs wide
    titles: { log: 'Today’s Watering', routines: 'Seeds', history: 'The Almanac', seasons: 'Growing seasons', progress: 'Growth' },
    tabs: { log: 'Water', routines: 'Seeds', history: 'Almanac', seasons: 'Growing', progress: 'Growth' },
    helloBig: 'Full bloom.', helloSome: 'Growing.', helloNone: 'The soil is ready.',
    restUp: 'Watered. Next set!',
    finish: 'Done for today · Finish ›', finishFeed: 'Done for today · show the garden', finishPrivate: 'Done for today · finish', updateFeed: 'Update the garden',
    ended: 'Watered and growing.', endedFeed: 'Watered and growing. It’s in the garden.', endedClock: '✓ Watered · ',
    routineDone: '🎉 Every bed tended.', routineBtn: 'All tended 🌿',
    emptyH: 'Fresh soil.', emptyP: 'Log a set and something sprouts.',
    prToast: '🌸 In bloom! ', clubToast: '🌱 New growth: welcome to the ', goalToast: 'Harvest in: ',
    pr: 'bloom', prs: 'blooms',
    prFlag: (reps, was) => 'In bloom! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'A new bloom on ' + ex + ': ',
    clubs: 'The plant', clubsSub: n => 'one leaf grown for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' leaves on the plant, one for each club; the next unfurls as you near the ' + next,
    weekly: 'Last week in the garden', streak: 'weeks growing', restWeek: 'A fallow week',
    rest: n => n + ' weeks growing in a row. Consider a fallow week: same lifts at about 60% of the weight, then plant again.',
    feed: 'The garden', feedSub: 'the crew’s blooms', feedEmpty: 'Blooms, new growth, harvests, sunflowers and tended gardens from the crew grow here.',
    icons: { pr: '🌸', club: '🌱', goal: '🧺', session: '🪴', record: '🌻', quest: '🐝', holder: '🌻', questOpen: '🐝', rest: '🌧️', dry: '🍂', stamp: '🌼' },
    win: { club: 'Grew a leaf: the ', record: 'Tallest sunflower: ', quest: 'Finished a chore: ', goal: 'Brought in a harvest: ', session: 'Tended the garden: ', stamp: 'Pressed a flower: ' },
    records: 'Tallest sunflowers', holderCol: 'Gardener', recordsBlurb: 'Outgrow the tallest sunflower and the ribbon is yours.', recordToast: '🌻 Tallest sunflower: the crew record on ',
    quests: 'Garden chores', questsSub: 'this week’s chores, the same for the whole crew', questDone: '🐝 Chore done: ',
    goals: 'Harvests', goalsKept: 'Harvests in', plan: 'The planting plan', points: 'seeds', pointsEarned: 'seeds sown',
    dry: 'Wilting: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'The first seed is planted.', five_visits: 'Five waterings. Green shoots.', twenty_visits: 'Twenty gym days. A proper gardener.', first_pr: 'A new best for an exercise and rep count. Your first bloom.' },
    achTitle: { first_visit: 'Seedling', first_pr: 'First Bloom' },
    bar: { fill: 'linear-gradient(90deg, #8bbf6a, var(--accent))', end: '🐝', flip: true, goal: '🌻' },
    // One plant in a pot: each club grows a leaf up the stem, the next unfurls as you near it, and a
    // flower opens at the top when all twelve are out (then a new seedling).
    rack: (lit, ratio) => {
      const done = lit > 0 && lit % 12 === 0, k = lit === 0 ? 0 : done ? 12 : lit % 12, rounds = lit > 0 ? Math.floor((lit - 1) / 12) : 0;
      let s = '<path d="M140 104h40l-5 24h-30z" fill="var(--gold)"/><rect x="136" y="98" width="48" height="8" rx="2" fill="var(--gold)"/>' +
        '<path d="M160 100 C156 80 166 60 158 40 C152 26 162 14 160 6" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>';
      for (let i = 0; i < 12; i++) {
        const y = 94 - i * 7.2, left = i % 2 === 0, x = 160 + (left ? -2 : 2), dir = left ? -1 : 1, len = 15 + (i % 3) * 3;
        const leaf = 'M' + x + ' ' + y.toFixed(1) + ' q' + (dir * len * 0.6) + ' -' + (len * 0.55).toFixed(1) + ' ' + (dir * len) + ' -2 q' + (-dir * len * 0.4) + ' ' + (len * 0.45).toFixed(1) + ' ' + (-dir * len) + ' 2z';
        if (i < k) s += '<path d="' + leaf + '" fill="' + (i % 3 === 0 ? 'var(--good)' : 'var(--accent)') + '"/>';
        else if (!done && i === k) s += '<path d="' + leaf + '" fill="var(--accent)" opacity="' + (0.15 + ratio * 0.45).toFixed(2) + '" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="2 2"/>';
      }
      if (done) s += '<g transform="translate(160 8)">' + [0, 72, 144, 216, 288].map(a => '<ellipse rx="5" ry="9" transform="rotate(' + a + ') translate(0 -7)" fill="#f2a7c3"/>').join('') + '<circle r="4" fill="#ffd166"/></g>';
      if (rounds) s += '<text x="8" y="16" font-size="11" font-weight="700" fill="var(--muted)">' + rounds + (rounds === 1 ? ' plant' : ' plants') + ' grown</text>';
      return s;
    },
    token: (cx, glow, next) => '<circle cx="' + cx + '" cy="88" r="14" fill="' + (glow > 0.02 ? 'var(--accent)' : 'var(--chip)') + '" opacity="' + glowOp(glow, next) + '"/>',
    colors: {
      light: { bg: '#eef5ea', card: '#fbfdf9', ink: '#1f2e1c', muted: '#58704f', line: '#d6e6cc', chip: '#e4efdc', accent: '#3b7d2a', 'accent-ink': '#ffffff', 'accent-soft': '#dcefd2', good: '#2f6e3a', gold: '#b8461c', 'gold-soft': '#fbe3d6', grid: '#e3eedd', axis: '#c3d6b8' },
      dark: { bg: '#0f1a10', card: '#162417', ink: '#e3f0dc', muted: '#9db897', line: '#25392a', chip: '#1c2e1f', accent: '#7bc96f', 'accent-ink': '#0a1a08', 'accent-soft': '#1f3a22', good: '#a6dc8f', gold: '#f08a5d', 'gold-soft': '#3a2015', grid: '#1c2c1e', axis: '#2f4732' },
    },
  }),

  west: theme('west', 'Iron Gulch', 'Dust, leather and sunset orange; a sheriff’s star for your clubs', {
    seasonWord: 'Frontier', seasonsWord: 'Frontiers', eventWord: 'Rodeo', eventsWord: 'Rodeos',
    stamp: 'Brand', stamps: 'Brands', stampBook: 'The brand book', stampFrame: '6px', stampToast: 'A new brand: ',
    tabIcons: { log: '<path d="M4 16c0-6 3-9 8-9s8 3 8 9"/><path d="M2 16h20M9 7V4h6v3"/>', routines: '<path d="M3 20c4-2 5-8 9-8s5 6 9 8"/><circle cx="12" cy="7" r="3"/>', history: '<path d="M5 4h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3z"/><path d="M9 9h6M9 13h6"/>', seasons: '<path d="M12 21V3M12 7c-3 0-5 2-5 5M12 10c3 0 5 2 5 5"/>', progress: '<path d="M12 3l2.5 6 6.5.5-5 4.2 1.6 6.3L12 16.5 6.4 20l1.6-6.3-5-4.2 6.5-.5z"/>' },
    brand: 'Iron Gulch', motto: 'SADDLE UP · LIFT HEAVY', tagline: 'Saddle up. Log the set.',
    fonts: 'family=Rye&family=Bitter:wght@700', brandFont: 'Rye, Georgia, serif',
    headFont: 'Bitter, Georgia, serif', brandWeight: 400,
    // A sheriff's star.
    logo: svg('<path d="M20 3l4.5 10.5 11.5 1-8.7 7.4 2.7 11.1L20 27l-10 6 2.7-11.1L4 14.5l11.5-1z" fill="var(--gold)"/><circle cx="20" cy="18" r="5" fill="var(--card)"/><circle cx="20" cy="18" r="2.4" fill="var(--accent)"/>'),
    // A rope border round the hero.
    css: '.hero { border: 3px dashed color-mix(in srgb, var(--gold) 70%, transparent); }' +
      '.hero .date::before { content: "✦ "; color: var(--accent); }',
    titles: { log: 'Today’s Ride', routines: 'Trails', history: 'The Ledger', seasons: 'The Frontier', progress: 'Legend' },
    tabs: { log: 'Ride', routines: 'Trails', history: 'Ledger', seasons: 'Frontier', progress: 'Legend' },
    helloBig: 'High noon.', helloSome: 'On the trail.', helloNone: 'Quiet in the saloon.',
    restUp: 'Back in the saddle!',
    finish: 'Ride into the sunset · Finish ›', finishFeed: 'Ride into the sunset · tell the saloon', finishPrivate: 'Ride into the sunset · finish', updateFeed: 'Update the saloon',
    ended: 'Rode off into the sunset.', endedFeed: 'Rode off into the sunset. The saloon heard all about it.', endedClock: '✓ Sunset · ',
    routineDone: '🎉 Trail ridden end to end.', routineBtn: 'Trail done 🤠',
    emptyH: 'Quiet in the saloon.', emptyP: 'Log a set and the dust starts flying.',
    prToast: '💰 Bounty claimed! ', clubToast: '⭐ Deputised: welcome to the ', goalToast: 'Got your man: ',
    pr: 'bounty', prs: 'bounties',
    prFlag: (reps, was) => 'Bounty claimed! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'Claimed a bounty on ' + ex + ': ',
    clubs: 'The sheriff’s star', clubsSub: n => 'one rivet set for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' rivets on the star, one for each club; the next is hammered in as you near the ' + next,
    weekly: 'Last week’s ledger', streak: 'weeks on the trail', restWeek: 'A week at the ranch',
    rest: n => n + ' weeks on the trail in a row. Consider a week at the ranch: same lifts at about 60% of the weight, then ride again.',
    feed: 'The saloon', feedSub: 'tall tales from the crew', feedEmpty: 'Bounties, deputies, wanted posters, sheriffs and rides from the crew get told here.',
    icons: { pr: '💰', club: '⭐', goal: '🎯', session: '🐎', record: '🤠', quest: '📜', holder: '🤠', questOpen: '📜', rest: '🏕️', dry: '🌵', stamp: '🔥' },
    win: { club: 'Got deputised: the ', record: 'Became sheriff: ', quest: 'Finished a job: ', goal: 'Got their man: ', session: 'Rode out: ', stamp: 'Earned a brand: ' },
    records: 'Most wanted', holderCol: 'Sheriff', recordsBlurb: 'Beat the sheriff’s best and the badge is yours.', recordToast: '🤠 New sheriff in town: the crew record on ',
    quests: 'Jobs', questsSub: 'this week’s jobs, the same for the whole posse', questDone: '📜 Job done: ',
    goals: 'Wanted posters', goalsKept: 'Posters claimed', plan: 'The trail map', points: 'gold', pointsEarned: 'gold panned',
    dry: 'Dust bowl: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'New in town.', five_visits: 'Five rides. The bartender knows your order.', twenty_visits: 'Twenty gym days. A local legend.', first_pr: 'A new best for an exercise and rep count. Your first bounty.' },
    achTitle: { first_visit: 'New in Town', first_pr: 'First Bounty' },
    bar: { fill: 'repeating-linear-gradient(90deg, var(--gold) 0 10px, color-mix(in srgb, var(--gold) 70%, #000) 10px 12px)', end: '🐎', flip: true, goal: '🌵' },
    // One sheriff's star: each club hammers in a rivet round it, the next glints as you near it, and
    // the star turns gold when all twelve are in (then a new star).
    rack: (lit, ratio) => {
      const done = lit > 0 && lit % 12 === 0, k = lit === 0 ? 0 : done ? 12 : lit % 12, rounds = lit > 0 ? Math.floor((lit - 1) / 12) : 0;
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = (i * 36 - 90) * Math.PI / 180, r = i % 2 ? 22 : 50; pts.push((160 + r * Math.cos(a)).toFixed(1) + ' ' + (66 + r * Math.sin(a)).toFixed(1)); }
      let s = '<path d="M' + pts.join(' L') + ' Z" fill="' + (done ? 'var(--gold)' : 'var(--gold-soft)') + '" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<circle cx="160" cy="66" r="14" fill="var(--card)" stroke="var(--gold)" stroke-width="2"/>';
      for (let i = 0; i < 12; i++) {
        const a = (i * 30 - 90) * Math.PI / 180, x = (160 + 60 * Math.cos(a)).toFixed(1), y = (66 + 58 * Math.sin(a)).toFixed(1);
        if (i < k) s += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="var(--accent)"/><circle cx="' + (x - 1.5) + '" cy="' + (y - 1.5) + '" r="1.4" fill="#fff" opacity=".6"/>';
        else if (!done && i === k) s += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="none" stroke="var(--accent)" stroke-width="1.8" opacity="' + (0.4 + ratio * 0.6).toFixed(2) + '"/>';
        else s += '<circle cx="' + x + '" cy="' + y + '" r="2" fill="var(--line)"/>';
      }
      if (rounds) s += '<text x="8" y="16" font-size="11" font-weight="700" fill="var(--muted)">' + rounds + (rounds === 1 ? ' star' : ' stars') + ' finished</text>';
      return s;
    },
    token: (cx, glow, next) => '<circle cx="' + cx + '" cy="88" r="14" fill="' + (glow > 0.02 ? 'var(--gold)' : 'var(--chip)') + '" opacity="' + glowOp(glow, next) + '"/>',
    colors: {
      light: { bg: '#f6efe2', card: '#fffaf0', ink: '#3b2a18', muted: '#7a6248', line: '#e8d9bf', chip: '#efe3cc', accent: '#993c1d', 'accent-ink': '#ffffff', 'accent-soft': '#f6dccf', good: '#4d7c2a', gold: '#a8650f', 'gold-soft': '#f7e6c4', grid: '#efe4cf', axis: '#d9c5a2' },
      dark: { bg: '#17110b', card: '#221a12', ink: '#f2e5cf', muted: '#bba585', line: '#3a2c1d', chip: '#2b2116', accent: '#e2733a', 'accent-ink': '#1e0a02', 'accent-soft': '#3b1f12', good: '#9bc46a', gold: '#f0b445', 'gold-soft': '#36270f', grid: '#2a2015', axis: '#4a3a27' },
    },
  }),

  circus: theme('circus', 'The Iron Big Top', 'Red and cream stripes, gold leaf, an old-time strongman and a high striker', {
    seasonWord: 'Tour', seasonsWord: 'Tours', eventWord: 'Spectacular', eventsWord: 'Spectaculars',
    stamp: 'Ticket stub', stamps: 'Ticket stubs', stampBook: 'The scrapbook', stampFrame: '4px', stampToast: 'A ticket stub for the scrapbook: ',
    tabIcons: { log: '<circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><path d="M8 12h8"/>', routines: '<path d="M3 20L12 4l9 16z"/><path d="M12 4v16M7.5 12h9"/>', history: '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M15 7v12" stroke-dasharray="2 2"/>', seasons: '<path d="M3 20c0-6 4-11 9-14 5 3 9 8 9 14"/><path d="M12 6V2l3 1.5L12 5M3 20h18M9 20v-4a3 3 0 0 1 6 0v4"/>', progress: '<path d="M12 3l2.4 5 5.6.6-4.2 3.8 1.2 5.5L12 15.2 7 17.9l1.2-5.5L4 8.6 9.6 8z"/>' },
    brand: 'The Iron Big Top', motto: 'ROLL UP · ROLL UP · LIFT', tagline: 'Step right up. Log the set.',
    fonts: 'family=Ultra&family=Abril+Fatface', brandFont: 'Ultra, Georgia, serif', headFont: '"Abril Fatface", Georgia, serif', brandWeight: 400,
    // An old-time globe barbell, the kind a circus strongman held overhead.
    logo: svg('<rect x="9" y="18.6" width="22" height="2.8" rx="1.4" fill="var(--ink)"/><circle cx="8" cy="20" r="7" fill="var(--accent)"/><circle cx="32" cy="20" r="7" fill="var(--accent)"/><path d="M3.5 17a6 6 0 0 1 4-4M28 13a6 6 0 0 1 4 1" stroke="var(--card)" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/><circle cx="8" cy="20" r="2" fill="var(--gold)"/><circle cx="32" cy="20" r="2" fill="var(--gold)"/>'),
    // A striped big-top valance along the top of the hero.
    css: '.hero { position: relative; overflow: hidden; padding-top: 34px; } .hero > * { position: relative; z-index: 1; }' +
      '.hero::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 22px; z-index: 1;' +
        ' background: radial-gradient(circle at 12px 12px, var(--accent) 11px, transparent 11.5px) 0 0 / 24px 22px repeat-x, repeating-linear-gradient(90deg, var(--accent) 0 12px, var(--card) 12px 24px) 0 0 / 100% 12px no-repeat; }' +
      '.hero .date::before { content: "★ "; color: var(--gold); }' +
      '.top .brand { font-size: clamp(15px, 4.6vw, 22px); }',   // Ultra runs very wide
    titles: { log: 'Tonight’s Performance', routines: 'The Acts', history: 'The Programme', seasons: 'Tours', progress: 'Feats of Strength' },
    tabs: { log: 'Perform', routines: 'Acts', history: 'Programme', seasons: 'Tours', progress: 'Feats' },
    helloBig: 'The crowd goes wild.', helloSome: 'On with the show.', helloNone: 'The tent is up.',
    restUp: 'Curtain up! Next set.',
    finish: 'Take a bow · Finish ›', finishFeed: 'Take a bow · tell the crowd', finishPrivate: 'Take a bow · finish', updateFeed: 'Update the bill',
    ended: 'Take a bow. What a show.', endedFeed: 'Take a bow. It’s on the bill.', endedClock: '✓ Curtain · ',
    routineDone: '🎉 Every act performed.', routineBtn: 'Show complete 🎪',
    emptyH: 'The tent is up.', emptyP: 'Log a set and the show begins.',
    prToast: '🌟 A marvel of strength! ', clubToast: '🔔 Ding! A new notch: welcome to the ', goalToast: 'Promise kept: ',
    pr: 'marvel', prs: 'marvels',
    prFlag: (reps, was) => 'A marvel of strength! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'A marvel of strength on ' + ex + ': ',
    clubs: 'Test your strength', clubsSub: n => 'one notch lit for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => 'A high striker with ' + n + ' notches lit, one for each club; the puck climbs toward the bell as you near the ' + next,
    weekly: 'Last week’s bill', streak: 'weeks on tour', restWeek: 'A week off the road',
    rest: n => n + ' weeks on tour in a row. Consider a week off the road: same lifts at about 60% of the weight, then raise the tent again.',
    feed: 'The ringmaster’s board', feedSub: 'the crew’s marvels', feedEmpty: 'Marvels, bells rung, promises, strongmen and shows from the crew get announced here.',
    icons: { pr: '🌟', club: '🎪', goal: '🎯', session: '🎭', record: '🦁', quest: '🤹', holder: '🦁', questOpen: '🤹', rest: '🎠', dry: '🤡', stamp: '🎟️' },
    win: { club: 'Hit a new notch: the ', record: 'Strongest in the world: ', quest: 'Pulled off a stunt: ', goal: 'Kept a promise: ', session: 'Put on a show: ', stamp: 'Kept a ticket stub: ' },
    records: 'Strongest in the world', holderCol: 'Strongman', recordsBlurb: 'Out-lift the strongman and the leopard-print leotard is yours.', recordToast: '🦁 Strongest in the world: the crew record on ',
    quests: 'Stunts', questsSub: 'this week’s stunts, the same for the whole troupe', questDone: '🤹 Stunt pulled off: ',
    goals: 'Promises', goalsKept: 'Promises kept', plan: 'The running order', points: 'tickets', pointsEarned: 'tickets sold',
    dry: 'A tough crowd: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Joined the circus.', five_visits: 'Five shows. The crowd knows your name.', twenty_visits: 'Twenty gym days. Top of the bill.', first_pr: 'A new best for an exercise and rep count. A marvel of strength.' },
    achTitle: { first_visit: 'Ran Away to the Circus', first_pr: 'First Marvel' },
    bar: { fill: 'repeating-linear-gradient(90deg, var(--accent) 0 10px, var(--card) 10px 20px)', end: '🐘', flip: true, goal: '🎪' },
    // The club badges tell a story over the whole climb: the strongman's singlet (up to 100K lb), his
    // mallet (to 300K), then a moustache that keeps growing (to 600K, 1M, 2M); beyond that, the big top.
    clubMarks: [
      [100000, '<path d="M8.5 2.5l2.2 4.5h2.6l2.2-4.5 2.2 1.6-1.6 5.2V21.5H7.9V9.3L6.3 4.1z" fill="#c8102e"/><path d="M7.9 12.5h8.2M7.9 16h8.2" stroke="#fff3df" stroke-width="1.6"/><path d="M7.9 19.4h8.2" stroke="#fff3df" stroke-width="1.6"/>'],
      [300000, '<path d="M4.2 22 L15.2 7.4" stroke="#a0642d" stroke-width="2.6" stroke-linecap="round"/><path d="M4.2 22 L6.6 18.8" stroke="#6e4220" stroke-width="3" stroke-linecap="round"/><path d="M12.5 1 L22.1 8.2 L18.5 13 L8.9 5.8 Z" fill="#7a4a2a" stroke="#7a4a2a" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.9 2.1 L20.7 7.2" stroke="#a46a3e" stroke-width="1.2" stroke-linecap="round"/><path d="M20.7 7.1 L17.1 11.9 M13.9 2.1 L10.3 6.9" stroke="#d9d4cc" stroke-width="1.4"/>'],
      [600000, '<g transform="translate(12 12.5) scale(.8 1.5) translate(-12 -12.5)"><path d="M12 11.2c-1.4-1.5-3.8-1.9-5.7-.6-1.5 1-2.5 2.7-4.1 2.3 1.4 2.7 4.9 3.3 7.4 1.8L12 13.2l2.4 1.5c2.5 1.5 6 .9 7.4-1.8-1.6.4-2.6-1.3-4.1-2.3-1.9-1.3-4.3-.9-5.7.6z" fill="#3b2418"/></g>'],
      [1000000, '<g transform="translate(12 12.5) scale(.95 1.9) translate(-12 -12.5)"><path d="M12 11.2c-1.4-1.5-3.8-1.9-5.7-.6-1.5 1-2.5 2.7-4.1 2.3 1.4 2.7 4.9 3.3 7.4 1.8L12 13.2l2.4 1.5c2.5 1.5 6 .9 7.4-1.8-1.6.4-2.6-1.3-4.1-2.3-1.9-1.3-4.3-.9-5.7.6z" fill="#3b2418"/></g>'],
      [2000000, '<g transform="translate(12 12.5) scale(.9 2) translate(-12 -12.5)"><path d="M12 11.2c-1.4-1.5-3.8-1.9-5.7-.6-1.5 1-2.5 2.7-4.1 2.3 1.4 2.7 4.9 3.3 7.4 1.8L12 13.2l2.4 1.5c2.5 1.5 6 .9 7.4-1.8-1.6.4-2.6-1.3-4.1-2.3-1.9-1.3-4.3-.9-5.7.6z" fill="#3b2418"/><path d="M2.4 13c-1.8-.2-2.1-2.4-.4-2.6M21.6 13c1.8-.2 2.1-2.4.4-2.6" fill="none" stroke="#3b2418" stroke-width="1" stroke-linecap="round"/></g>'],
    ],
    // Test Your Strength: the carnival high striker. Each club lights a notch up the tower, the puck
    // climbs toward the next one as you near it, and the bell rings at twelve (then a fresh tower).
    rack: (lit, ratio) => {
      const done = lit > 0 && lit % 12 === 0, k = lit === 0 ? 0 : done ? 12 : lit % 12, rounds = lit > 0 ? Math.floor((lit - 1) / 12) : 0;
      const top = 22, bottom = 116, step = (bottom - top) / 12, y = i => bottom - (i + 0.5) * step;
      let s = '<rect x="146" y="' + top + '" width="28" height="' + (bottom - top) + '" rx="3" fill="var(--card)" stroke="var(--line)" stroke-width="1.5"/>' +
        '<rect x="158" y="' + top + '" width="4" height="' + (bottom - top) + '" fill="var(--line)"/>';
      for (let i = 0; i < 12; i++) {
        const on = i < k;
        s += '<rect x="149" y="' + (y(i) - 2.5).toFixed(1) + '" width="8" height="5" rx="1" fill="' + (on ? (i % 2 ? 'var(--gold)' : 'var(--accent)') : 'var(--chip)') + '"/>' +
          '<rect x="163" y="' + (y(i) - 2.5).toFixed(1) + '" width="8" height="5" rx="1" fill="' + (on ? (i % 2 ? 'var(--gold)' : 'var(--accent)') : 'var(--chip)') + '"/>';
      }
      // The puck: at the top notch you've reached, plus how far you are toward the next.
      const py = done ? top + 4 : bottom - (k + ratio) * step;
      s += '<circle cx="160" cy="' + py.toFixed(1) + '" r="6" fill="var(--ink)"/><circle cx="158" cy="' + (py - 2).toFixed(1) + '" r="1.6" fill="#fff" opacity=".6"/>';
      // The bell, and the sign.
      s += '<circle cx="160" cy="14" r="10" fill="' + (done ? 'var(--gold)' : 'var(--card)') + '" stroke="var(--gold)" stroke-width="2.5"/>' +
        (done ? '<path d="M140 8l-7-4M140 20l-7 4M180 8l7-4M180 20l7 4" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"/>' : '');
      [['Strongman!', 11], ['Mighty', 8], ['Not bad', 4], ['Weakling', 1]].forEach(([label, i]) => {
        s += '<text x="180" y="' + (y(i) + 3.5).toFixed(1) + '" font-size="10" font-weight="700" fill="' + (i < k ? 'var(--ink)' : 'var(--muted)') + '">' + label + '</text>';
      });
      // The pad and the mallet at the foot.
      s += '<rect x="138" y="116" width="44" height="8" rx="2" fill="var(--accent)"/>' +
        '<g transform="translate(84 84) scale(1.7)"><path d="M4.2 22 L15.2 7.4" stroke="#a0642d" stroke-width="2.6" stroke-linecap="round"/><path d="M4.2 22 L6.6 18.8" stroke="#6e4220" stroke-width="3" stroke-linecap="round"/>' +
          '<path d="M12.5 1 L22.1 8.2 L18.5 13 L8.9 5.8 Z" fill="#7a4a2a" stroke="#7a4a2a" stroke-width="1.6" stroke-linejoin="round"/><path d="M20.7 7.1 L17.1 11.9 M13.9 2.1 L10.3 6.9" stroke="#d9d4cc" stroke-width="1.4"/></g>';
      if (rounds) s += '<text x="8" y="16" font-size="11" font-weight="700" fill="var(--muted)">Rang the bell ' + rounds + (rounds === 1 ? ' time' : ' times') + '</text>';
      return s;
    },
    token: (cx, glow, next) => '<path d="M' + (cx - 12) + ' 74 h24 l-12 22z" fill="' + (glow > 0.02 ? 'var(--accent)' : 'var(--chip)') + '" opacity="' + glowOp(glow, next) + '"/>',
    colors: {
      light: { bg: '#fbf3e4', card: '#fffaf0', ink: '#2a1a1f', muted: '#6f5a5f', line: '#ecdcc4', chip: '#f4e7d0', accent: '#c8102e', 'accent-ink': '#ffffff', 'accent-soft': '#f9d9dd', good: '#2f7d4f', gold: '#a8780a', 'gold-soft': '#f7e7bf', grid: '#f1e5cf', axis: '#dcc8a6' },
      dark: { bg: '#160d12', card: '#21141b', ink: '#f7ead8', muted: '#c4a9a5', line: '#3a2530', chip: '#2c1a23', accent: '#ff4d5e', 'accent-ink': '#2a0006', 'accent-soft': '#3d1520', good: '#7bd39b', gold: '#f2c14e', 'gold-soft': '#36290f', grid: '#2a1a22', axis: '#4a3240' },
    },
  }),

  dungeon: theme('dungeon', 'The Iron Dungeon', 'Parchment, torchlight, loot chests and an XP bar', {
    seasonWord: 'Campaign', seasonsWord: 'Campaigns', eventWord: 'Raid', eventsWord: 'Raids',
    stamp: 'Trophy', stamps: 'Trophies', stampBook: 'Trophy room', stampFrame: '6px', stampToast: 'Trophy claimed: ',
    tabIcons: { log: '<path d="M20 4 9 15M20 4v4M20 4h-4"/><path d="M6 12l6 6M4 20l4-4"/>', routines: '<path d="M4 20 15 9"/><path d="M17 3v4M15 5h4M20 10v2M19 11h2M10 4v2M9 5h2"/>', history: '<path d="M7 4h11v13a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2v-1h11"/><path d="M7 4a2 2 0 0 0-2 2v1h2M10 8h5M10 12h5"/>', seasons: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>', progress: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M12 16V9M9 12l3-3 3 3"/>' },
    brand: 'The Iron Dungeon', motto: 'ROLL FOR STRENGTH · LOOT THE GYM', tagline: 'Roll initiative. Log the set.',
    fonts: 'family=Pirata+One&family=Alegreya+SC:wght@700', brandFont: '"Pirata One", Georgia, serif',
    headFont: '"Alegreya SC", Georgia, serif', brandWeight: 400,
    // A sword crossed over a shield.
    logo: svg('<path d="M20 4 L34 9 V20 C34 28 28 33 20 36 C12 33 6 28 6 20 V9 Z" fill="var(--accent)"/><path d="M20 8 L30 11.6 V20 C30 26 26 29.6 20 32 Z" fill="#000" opacity=".22"/><rect x="18.8" y="2" width="2.4" height="26" rx="1" fill="var(--ink)"/><rect x="13" y="24" width="14" height="2.6" rx="1.3" fill="var(--gold)"/><rect x="18.6" y="26.4" width="2.8" height="7" rx="1" fill="var(--gold)"/><circle cx="20" cy="35" r="2" fill="var(--gold)"/>'),
    css: '.hero { border-top: 4px double var(--gold); border-bottom: 4px double var(--gold); }' +
      '.hero .date::before { content: "⚔ "; color: var(--gold); }' +
      BAR + ' { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 30%, transparent); border-radius: 3px; }' + FILL() + ' { border-radius: 2px; }',
    titles: { log: 'Today’s Quest', routines: 'Spellbook', history: 'The Chronicle', seasons: 'Campaigns', progress: 'Character sheet' },
    tabs: { log: 'Fight', routines: 'Spells', history: 'Chronicle', seasons: 'Campaigns', progress: 'Level up' },
    helloBig: 'Boss fight.', helloSome: 'In the dungeon.', helloNone: 'At the tavern.',
    finish: 'Leave the dungeon · Finish ›', finishFeed: 'Leave the dungeon · tell the tavern', finishPrivate: 'Leave the dungeon · finish', updateFeed: 'Update the tale',
    ended: 'Dungeon cleared. Rest at the inn.', endedFeed: 'Dungeon cleared. The bards are singing of it.', endedClock: '✓ Cleared · ',
    routineDone: '🎉 Every room cleared.', routineBtn: 'Dungeon cleared 🗝️',
    emptyH: 'The torches are lit.', emptyP: 'Log a set and the adventure begins.',
    prToast: '⚔️ Critical hit! ', clubToast: '🧰 Loot! Welcome to the ', goalToast: 'Quest complete: ',
    pr: 'crit', prs: 'crits',
    prFlag: (reps, was) => 'Critical hit! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'Critical hit on ' + ex + ': ',
    clubs: 'Loot chests', clubsSub: n => 'one opened for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' chests opened, one for each club; the next creaks open as you near the ' + next,
    weekly: 'Last week’s tale', streak: 'weeks adventuring', restWeek: 'A long rest',
    rest: n => n + ' weeks adventuring in a row. Consider a long rest: same lifts at about 60% of the weight, then back into the dungeon.',
    feed: 'The tavern', feedSub: 'tales of the crew’s deeds', feedEmpty: 'Crits, loot, quests, legends and cleared dungeons from the crew are told here.',
    icons: { pr: '⚔️', club: '🧰', goal: '📜', session: '🗝️', record: '🐉', quest: '🗺️', holder: '🐉', questOpen: '🗺️', rest: '🍺', dry: '🕸️' },
    win: { club: 'Opened a chest: the ', record: 'Slew the dragon: ', quest: 'Finished a side quest: ', goal: 'Completed a quest: ', session: 'Cleared a dungeon: ' },
    records: 'Dragon hoard', holderCol: 'Dragon', recordsBlurb: 'Beat the dragon’s best and the hoard is yours.', recordToast: '🐉 Dragon slain: the crew record on ',
    quests: 'Side quests', questsSub: 'this week’s bounties, the same for the whole party', questDone: '🗺️ Side quest complete: ',
    goals: 'Quests', goalsKept: 'Quests complete', plan: 'The campaign', points: 'XP', pointsEarned: 'XP earned',
    dry: 'Stuck in a web: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'You entered the dungeon.', five_visits: 'Five dungeons cleared. A seasoned adventurer.', twenty_visits: 'Twenty gym days. A legend of the realm.', first_pr: 'A new best for an exercise and rep count. A critical hit.' },
    achTitle: { first_visit: 'Level 1', five_visits: 'Adventurer', twenty_visits: 'Legend', first_pr: 'First Critical Hit' },
    // An XP bar, a sword at its tip and the dragon waiting at the end.
    bar: { fill: 'linear-gradient(180deg, color-mix(in srgb, var(--good) 60%, #fff), var(--good) 55%, color-mix(in srgb, var(--good) 75%, #000))', end: '⚔️', goal: '🐉' },
    // A treasure chest per club: open and full of gold. The next one's lid lifts as you near it.
    token: (cx, glow, next) => {
      const open = next ? glow : 1, coins = open > 0.02 ? '<g opacity="' + glowOp(glow, next) + '"><ellipse cx="' + cx + '" cy="89" rx="14" ry="4" fill="var(--gold)"/><circle cx="' + (cx - 6) + '" cy="85" r="3.4" fill="var(--gold)"/><circle cx="' + (cx + 5) + '" cy="84" r="3" fill="var(--gold)"/><circle cx="' + (cx + 5) + '" cy="83" r="1" fill="#fff" opacity=".8"/></g>' : '';
      return '<rect x="' + (cx - 16) + '" y="88" width="32" height="24" rx="3" fill="var(--gold-soft)" stroke="var(--gold)" stroke-width="1.5"/>' + coins +
        '<rect x="' + (cx - 16) + '" y="96" width="32" height="3" fill="var(--gold)"/><rect x="' + (cx - 3) + '" y="94" width="6" height="8" rx="1.5" fill="var(--ink)"/>' +
        '<g transform="rotate(' + (-open * 62).toFixed(1) + ' ' + (cx - 16) + ' 88)"><path d="M' + (cx - 16) + ' 88 V80 Q' + cx + ' 68 ' + (cx + 16) + ' 80 V88 Z" fill="var(--gold-soft)" stroke="var(--gold)" stroke-width="1.5"/></g>';
    },
    colors: {
      light: { bg: '#f3ead8', card: '#fbf5e8', ink: '#2a1d12', muted: '#6e5b45', line: '#e2d4ba', chip: '#ece0c8', accent: '#8f2d1f', 'accent-ink': '#ffffff', 'accent-soft': '#f3dcd3', good: '#3f7d2a', gold: '#9a6a00', 'gold-soft': '#f6e7c4', grid: '#ebdfc8', axis: '#d2c09f' },
      dark: { bg: '#130e0a', card: '#1d1610', ink: '#f1e4cc', muted: '#b09c80', line: '#33281d', chip: '#271e16', accent: '#e0614a', 'accent-ink': '#1a0703', 'accent-soft': '#3a1a12', good: '#7bc96f', gold: '#e8b04a', 'gold-soft': '#352710', grid: '#271f17', axis: '#463829' },
    },
  }),

  arcade: theme('arcade', 'Iron Arcade', 'Neon on black, pixel lettering, coins and high scores', {
    seasonWord: 'World', seasonsWord: 'Worlds', eventWord: 'Tournament', eventsWord: 'Tournaments',
    stamp: 'Sticker', stamps: 'Stickers', stampBook: 'Sticker album', stampFrame: '4px', stampToast: 'STICKER GET: ',
    tabIcons: { log: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="16" cy="11.5" r=".9"/><circle cx="18" cy="13.5" r=".9"/>', routines: '<path d="M5 17h14v4H5z"/><path d="M12 17V9"/><circle cx="12" cy="6" r="3"/>', history: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>', seasons: '<circle cx="12" cy="12" r="6.5"/><path d="M2.5 15.5c3 2.5 16 0 19-7"/>', progress: '<path d="M4 20h4v-6H4zM10 20h4V8h-4zM16 20h4V4h-4z"/>' },
    brand: 'IRON ARCADE', motto: 'INSERT COIN · PRESS START', tagline: 'Player 1 ready. Log the set.',
    fonts: 'family=Press+Start+2P&family=Silkscreen:wght@400;700', brandFont: '"Press Start 2P", ui-monospace, monospace',
    headFont: 'Silkscreen, ui-monospace, monospace', brandWeight: 400,
    // A pixel space invader.
    logo: svg('<path fill="var(--accent)" d="M10 8h4v4h-4zM26 8h4v4h-4zM14 12h12v4H14zM10 16h20v4H10zM6 20h8v4H6zM18 20h4v4h-4zM26 20h8v4h-8zM6 24h28v4H6zM6 28h4v4H6zM14 28h12v4H14zM30 28h4v4h-4zM14 32h4v4h-4zM22 32h4v4h-4z"/>'),
    css: '.hero { background-image: repeating-linear-gradient(0deg, color-mix(in srgb, var(--ink) 6%, transparent) 0 1px, transparent 1px 3px); border: 2px solid var(--accent); }' +
      '.hero h1 { text-shadow: 3px 3px 0 var(--accent-soft); } .hero .date::before { content: "▶ "; color: var(--gold); }' +
      '.top .brand { font-size: clamp(11px, 3.4vw, 16px); letter-spacing: .02em; }' +   // Press Start runs very wide
      '.card-title, .section-title, .page-title, .sheet-head h2 { letter-spacing: .02em; }' +
      BAR + ' { border-radius: 0; }' + FILL() + ' { border-radius: 0; }',
    titles: { log: 'Player 1', routines: 'Combos', history: 'High scores', seasons: 'Worlds', progress: 'Stats' },
    tabs: { log: 'Play', routines: 'Combos', history: 'Scores', seasons: 'Worlds', progress: 'Stats' },
    helloBig: 'Boss level.', helloSome: 'Game on.', helloNone: 'Press start.',
    finish: 'Game over · Finish ›', finishFeed: 'Game over · post your score', finishPrivate: 'Game over · finish', updateFeed: 'Update your score',
    ended: 'Game over. Well played.', endedFeed: 'Game over. Your score is on the board.', endedClock: '✓ Game over · ',
    routineDone: '🎉 Level complete.', routineBtn: 'Level complete 🕹️',
    emptyH: 'Insert coin.', emptyP: 'Log a set to press start.',
    prToast: '🌟 New high score! ', clubToast: '🪙 Coin collected: welcome to the ', goalToast: 'Level cleared: ',
    pr: 'high score', prs: 'high scores',
    prFlag: (reps, was) => 'New high score! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'New high score on ' + ex + ': ',
    clubs: 'Coins', clubsSub: n => 'one collected for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' coins collected, one for each club; the next spins in as you near the ' + next,
    weekly: 'Last week’s run', streak: 'week combo', restWeek: 'Paused',
    rest: n => n + '-week combo. Consider a bonus stage: same lifts at about 60% of the weight, then continue.',
    feed: 'Scoreboard', feedSub: 'the crew’s high scores', feedEmpty: 'High scores, coins, levels, world records and finished games from the crew show up here.',
    icons: { pr: '🌟', club: '🪙', goal: '🏁', session: '🕹️', record: '🏆', quest: '👾', holder: '🏆', questOpen: '👾', rest: '⏸️', dry: '🧱' },
    win: { club: 'Collected a coin: the ', record: 'World record: ', quest: 'Beat a bonus stage: ', goal: 'Cleared a level: ', session: 'Played a game: ' },
    records: 'World records', holderCol: 'Champ', recordsBlurb: 'Beat the champ’s best and your initials go on the board.', recordToast: '🏆 World record on ',
    quests: 'Bonus stages', questsSub: 'this week’s bonus stages, the same for every player', questDone: '👾 Bonus stage cleared: ',
    goals: 'Levels', goalsKept: 'Levels cleared', plan: 'The level map', points: 'pts', pointsEarned: 'pts scored',
    dry: 'Stuck on this level: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Player 1 has entered the game.', five_visits: 'Five games played.', twenty_visits: 'Twenty gym days. Arcade regular.', first_pr: 'A new best for an exercise and rep count. New high score.' },
    achTitle: { first_visit: '1UP', five_visits: 'Combo x5', twenty_visits: 'Arcade legend', first_pr: 'First High Score' },
    // Chunky blocks, like an 8-bit health bar, with a space invader on the front.
    bar: { height: '14px', track: 'repeating-linear-gradient(90deg, var(--chip) 0 10px, transparent 10px 13px)', fill: 'var(--good)',
      texture: 'repeating-linear-gradient(90deg, transparent 0 10px, var(--card) 10px 13px)', end: '👾' },
    // A gold coin per club; the next one spins in edge-on and turns to face you as you near it.
    token: (cx, glow, next) => {
      const rx = next ? Math.max(2, 17 * glow) : 17;
      return '<circle cx="' + cx + '" cy="88" r="17" fill="none" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 3"/>' +
        (glow > 0.02 ? '<g opacity="' + glowOp(glow, next) + '"><ellipse cx="' + cx + '" cy="88" rx="' + rx.toFixed(1) + '" ry="17" fill="var(--gold)"/>' +
          '<ellipse cx="' + cx + '" cy="88" rx="' + (rx * 0.7).toFixed(1) + '" ry="12" fill="none" stroke="var(--gold-soft)" stroke-width="2"/>' +
          '<rect x="' + (cx - Math.min(2.5, rx * 0.15)).toFixed(1) + '" y="80" width="' + Math.min(5, rx * 0.3).toFixed(1) + '" height="16" fill="var(--gold-soft)"/></g>' : '');
    },
    colors: {
      light: { bg: '#f2f0fa', card: '#ffffff', ink: '#14112a', muted: '#5d5878', line: '#dedaf0', chip: '#ebe8f7', accent: '#c2189b', 'accent-ink': '#ffffff', 'accent-soft': '#fbdcf2', good: '#1f8a3a', gold: '#a86b00', 'gold-soft': '#fbecc8', grid: '#e7e4f3', axis: '#c9c4e0' },
      dark: { bg: '#05040c', card: '#0f0d1c', ink: '#f1efff', muted: '#9a95bd', line: '#24203d', chip: '#1a1730', accent: '#ff4fd8', 'accent-ink': '#1a0216', 'accent-soft': '#3a0f33', good: '#7dff4f', gold: '#ffe14f', 'gold-soft': '#36300c', grid: '#1b1830', axis: '#36305a' },
    },
  }),

  viking: theme('viking', 'The Iron Forge', 'Smoke and embers, rune stones and sagas', {
    seasonWord: 'Voyage', seasonsWord: 'Voyages', eventWord: 'Feast', eventsWord: 'Feasts',
    stamp: 'Mark', stamps: 'Marks', stampBook: 'The saga book', stampFrame: '50%', stampToast: 'A mark in the saga: ',
    tabIcons: { log: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21"/>', routines: '<path d="M3 6c5 0 14 3 18 11l-3 2C14 12 7 10 3 10z"/><path d="M8 6.4v3.8M14 8.6l-1.6 3.6"/>', history: '<path d="M6 21V8a6 6 0 0 1 12 0v13z"/><path d="M11 8v10M11 10l3-2M11 13l3-2"/>', seasons: '<path d="M2 15h20l-3 4H5z"/><path d="M12 15V3l6 9h-6"/>', progress: '<path d="M4 15a8 8 0 0 1 16 0v4H4z"/><path d="M12 7v12M6 9 3 4M18 9l3-5"/>' },
    brand: 'The Iron Forge', motto: 'FORGED IN FIRE · CARVED IN STONE', tagline: 'Strike while it’s hot. Log the set.',
    fonts: 'family=New+Rocker&family=Alegreya+Sans+SC:wght@800', brandFont: '"New Rocker", Georgia, serif',
    headFont: '"Alegreya Sans SC", system-ui, sans-serif', brandWeight: 400,
    // A hammer over an anvil.
    logo: svg('<path d="M6 22 H32 C32 26 28 27 25 27 L27 34 H11 L13 27 C9 27 6 25 6 22 Z" fill="var(--ink)"/><rect x="18.6" y="4" width="3" height="16" rx="1.2" fill="var(--gold)" transform="rotate(-35 20 12)"/><rect x="20" y="2" width="14" height="7" rx="1.6" fill="var(--accent)" transform="rotate(-35 20 12)"/><circle cx="31" cy="18" r="1.4" fill="var(--accent)"/><circle cx="34" cy="14" r="1" fill="var(--gold)"/>'),
    css: '.hero { position: relative; overflow: hidden; padding-top: 24px; }' +
      '.hero::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px; background: linear-gradient(90deg, transparent, var(--accent) 20%, #ffd27a 50%, var(--accent) 80%, transparent); }' +
      '.hero .date::before { content: "⚒ "; color: var(--accent); }' +
      '.card-title, .section-title, .page-title, .hero h1, .sheet-head h2 { letter-spacing: .03em; }',
    titles: { log: 'Today’s Raid', routines: 'Sagas', history: 'Runestones', seasons: 'Voyages', progress: 'Glory' },
    tabs: { log: 'Raid', routines: 'Sagas', history: 'Runes', seasons: 'Voyages', progress: 'Glory' },
    helloBig: 'A great raid.', helloSome: 'At the forge.', helloNone: 'The fire is banked.',
    finish: 'Sail home · Finish ›', finishFeed: 'Sail home · tell it in the hall', finishPrivate: 'Sail home · finish', updateFeed: 'Update the saga',
    ended: 'Home from the raid. Feast well.', endedFeed: 'Home from the raid. The skalds tell of it in the hall.', endedClock: '✓ Home · ',
    routineDone: '🎉 The saga is told.', routineBtn: 'Saga complete ⚒️',
    emptyH: 'The forge is cold.', emptyP: 'Log a set and the fire catches.',
    prToast: '🔥 Saga-worthy! ', clubToast: '🪨 A rune carved: welcome to the ', goalToast: 'Oath fulfilled: ',
    pr: 'saga', prs: 'sagas',
    prFlag: (reps, was) => 'Saga-worthy! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'A saga-worthy ' + ex + ': ',
    clubs: 'Rune stones', clubsSub: n => 'one carved for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' rune stones carved, one for each club; the next takes shape as you near the ' + next,
    weekly: 'Last week’s raid', streak: 'weeks raiding', restWeek: 'Wintering',
    rest: n => n + ' weeks raiding in a row. Consider a winter week: same lifts at about 60% of the weight, then sail again.',
    feed: 'The mead hall', feedSub: 'the crew’s deeds, told in the hall', feedEmpty: 'Sagas, runes, oaths, jarls and raids from the crew are told here.',
    icons: { pr: '🔥', club: '🪨', goal: '🛡️', session: '⛵', record: '👑', quest: '🧭', holder: '👑', questOpen: '🧭', rest: '❄️', dry: '🧊' },
    win: { club: 'Carved a rune: the ', record: 'Became jarl: ', quest: 'Finished a voyage: ', goal: 'Fulfilled an oath: ', session: 'Went raiding: ' },
    records: 'The jarls', holderCol: 'Jarl', recordsBlurb: 'Beat the jarl’s best and the hall is yours.', recordToast: '👑 Jarl now: the crew record on ',
    quests: 'Voyages', questsSub: 'this week’s voyages, the same for the whole crew', questDone: '🧭 Voyage complete: ',
    goals: 'Oaths', goalsKept: 'Oaths fulfilled', plan: 'The saga', points: 'glory', pointsEarned: 'glory won',
    dry: 'Frozen in: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Your first raid.', five_visits: 'Five raids. The crew knows your name.', twenty_visits: 'Twenty gym days. Your saga is sung.', first_pr: 'A new best for an exercise and rep count. Worth a saga.' },
    achTitle: { first_pr: 'First Saga' },
    // Iron in the fire: cold grey at the start, glowing hotter toward the tip, with the hammer coming down.
    bar: { fill: 'linear-gradient(90deg, #5d5a55, color-mix(in srgb, var(--accent) 85%, #000) 55%, var(--accent) 80%, #ffd27a)', end: '🔨' },
    // A rune stone per club, carved and glowing. The next one's rune is cut deeper as you near it.
    token: (cx, glow, next) => '<path d="M' + (cx - 14) + ' 112 V66 Q' + (cx - 14) + ' 50 ' + cx + ' 50 Q' + (cx + 14) + ' 50 ' + (cx + 14) + ' 66 V112 Z" fill="color-mix(in srgb, var(--muted) 28%, var(--card))" stroke="var(--axis)" stroke-width="1.5"/>' +
      (glow > 0.02 ? '<path d="M' + (cx - 4) + ' 60 V104 M' + (cx - 4) + ' 66 L' + (cx + 7) + ' 59 M' + (cx - 4) + ' 78 L' + (cx + 7) + ' 71" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" opacity="' + glowOp(glow, next) + '"/>' : ''),
    colors: {
      light: { bg: '#ecebe7', card: '#faf9f6', ink: '#1d1b18', muted: '#5f5a52', line: '#dad6ce', chip: '#e5e2dc', accent: '#b8441b', 'accent-ink': '#ffffff', 'accent-soft': '#f7dfd3', good: '#3f7d4a', gold: '#8a6a1f', 'gold-soft': '#f1e7cf', grid: '#e4e1da', axis: '#c9c3b8' },
      dark: { bg: '#100f0e', card: '#1a1816', ink: '#efe6da', muted: '#a59a8c', line: '#2c2925', chip: '#23201d', accent: '#ff7a3d', 'accent-ink': '#1c0800', 'accent-soft': '#3a1c0e', good: '#8fd39b', gold: '#d9b45a', 'gold-soft': '#2f2614', grid: '#24211e', axis: '#3e3a34' },
    },
  }),

  deep: theme('deep', 'The Iron Deep', 'Teal water, bubbles, portholes and glowing creatures', {
    seasonWord: 'Expedition', seasonsWord: 'Expeditions', eventWord: 'Tide', eventsWord: 'Tides',
    stamp: 'Shell', stamps: 'Shells', stampBook: 'Shell collection', stampFrame: '50%', stampToast: 'A new shell: ',
    tabIcons: { log: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 10h8M4 13a8 8 0 0 0 16 0"/>', routines: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>', history: '<path d="M3 12c3-4 9-5 13-1l5-3v8l-5-3c-4 4-10 3-13-1z"/><circle cx="8" cy="11" r=".9"/>', seasons: '<rect x="3" y="10" width="16" height="7" rx="3.5"/><path d="M9 10V7h4v3M19 13.5h2"/><circle cx="8" cy="13.5" r=".9"/><circle cx="12" cy="13.5" r=".9"/>', progress: '<path d="M2 6c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M12 10v11M8 17l4 4 4-4"/>' },
    brand: 'The Iron Deep', motto: 'DIVE DEEP · COME UP STRONGER', tagline: 'Hold your breath. Log the set.',
    fonts: 'family=Righteous&family=Exo+2:wght@700', brandFont: 'Righteous, "Trebuchet MS", sans-serif',
    headFont: '"Exo 2", system-ui, sans-serif', brandWeight: 400,
    // A porthole with a wave inside.
    logo: svg('<circle cx="20" cy="20" r="16" fill="var(--accent)"/><circle cx="20" cy="20" r="16" fill="none" stroke="var(--gold)" stroke-width="3"/><path d="M7 22 C11 18 15 18 20 22 C25 26 29 26 33 22 V27 C30 33 10 33 7 27 Z" fill="var(--card)" opacity=".85"/><circle cx="15" cy="13" r="2" fill="var(--card)" opacity=".7"/><circle cx="21" cy="10" r="1.3" fill="var(--card)" opacity=".7"/>'),
    css: '.hero { position: relative; overflow: hidden; padding-bottom: 30px; } .hero > * { position: relative; z-index: 1; }' +
      '.hero::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: radial-gradient(14px 12px at 14px 0, transparent 92%, color-mix(in srgb, var(--accent) 22%, transparent)) 0 0 / 28px 14px repeat-x; }' +
      '.hero .date::before { content: "≈ "; color: var(--accent); }',
    titles: { log: 'Today’s Dive', routines: 'Dive charts', history: 'Dive log', seasons: 'Expeditions', progress: 'Depth' },
    tabs: { log: 'Dive', routines: 'Charts', history: 'Dive log', seasons: 'Trips', progress: 'Depth' },
    helloBig: 'The abyss.', helloSome: 'Under water.', helloNone: 'On deck.',
    finish: 'Surface · Finish ›', finishFeed: 'Surface · radio it in', finishPrivate: 'Surface · finish', updateFeed: 'Update the radio log',
    ended: 'Back on the surface. Breathe.', endedFeed: 'Back on the surface. It’s on the radio.', endedClock: '✓ Surfaced · ',
    routineDone: '🎉 Dive complete.', routineBtn: 'Dive complete 🤿',
    emptyH: 'Calm waters.', emptyP: 'Log a set to start the dive.',
    prToast: '🐋 A new depth! ', clubToast: '🪼 A new creature: welcome to the ', goalToast: 'Treasure found: ',
    pr: 'new depth', prs: 'new depths',
    prFlag: (reps, was) => 'A new depth! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'New depth on ' + ex + ': ',
    clubs: 'Creatures found', clubsSub: n => 'one discovered for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' creatures found, one for each club; the next one glows into view as you near the ' + next,
    weekly: 'Last week’s dives', streak: 'weeks diving', restWeek: 'Shore leave',
    rest: n => n + ' weeks diving in a row. Consider a shallow week: same lifts at about 60% of the weight, then go deep again.',
    feed: 'Sonar', feedSub: 'pings from the crew', feedEmpty: 'New depths, creatures, treasure, records and dives from the crew ping here.',
    icons: { pr: '🐋', club: '🪼', goal: '💎', session: '🤿', record: '🔱', quest: '🧭', holder: '🔱', questOpen: '🧭', rest: '🏝️', dry: '🪸' },
    win: { club: 'Discovered a creature: the ', record: 'Claimed the trident: ', quest: 'Finished an expedition: ', goal: 'Found treasure: ', session: 'Went diving: ' },
    records: 'The trench', holderCol: 'Deepest', recordsBlurb: 'Dive deeper than the record and the trident is yours.', recordToast: '🔱 The trident: the crew record on ',
    quests: 'Expeditions', questsSub: 'this week’s expeditions, the same for the whole crew', questDone: '🧭 Expedition complete: ',
    goals: 'Treasure', goalsKept: 'Treasure found', plan: 'The dive plan', points: 'fathoms', pointsEarned: 'fathoms dived',
    dry: 'Stuck in the reef: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'First dive.', five_visits: 'Five dives. Getting your sea legs.', twenty_visits: 'Twenty gym days. Deep-sea veteran.', first_pr: 'A new best for an exercise and rep count. Deeper than ever.' },
    achTitle: { first_pr: 'First New Depth' },
    // Water getting darker as it goes down, with bubbles rising and a fish swimming for the octopus.
    bar: { fill: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 50%, #fff), var(--accent) 55%, color-mix(in srgb, var(--accent) 55%, #031a2a))',
      texture: 'radial-gradient(circle, rgba(255,255,255,.55) 0 1.4px, transparent 2px) 0 30% / 11px 100% repeat-x', end: '🐠', flip: true, goal: '🐙' },
    // A porthole per club, each with a jellyfish glowing inside; the next one glows brighter as you near it.
    token: (cx, glow, next) => '<circle cx="' + cx + '" cy="88" r="19" fill="var(--chip)" stroke="var(--gold)" stroke-width="3"/>' +
      [[-14, -14], [14, -14], [-14, 14], [14, 14]].map(([x, y]) => '<circle cx="' + (cx + x * 0.98) + '" cy="' + (88 + y * 0.98) + '" r="1.4" fill="var(--gold)"/>').join('') +
      (glow > 0.02 ? '<g opacity="' + glowOp(glow, next) + '"><circle cx="' + cx + '" cy="88" r="15" fill="var(--accent-soft)"/>' +
        '<path d="M' + (cx - 8) + ' 88 Q' + (cx - 8) + ' 76 ' + cx + ' 76 Q' + (cx + 8) + ' 76 ' + (cx + 8) + ' 88 Z" fill="var(--accent)"/>' +
        '<path d="M' + (cx - 5) + ' 88 q2 5 0 10 M' + cx + ' 88 q2 5 0 11 M' + (cx + 5) + ' 88 q2 5 0 10" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/></g>' : ''),
    colors: {
      light: { bg: '#e8f4f6', card: '#fbfeff', ink: '#0b2430', muted: '#4c6a75', line: '#cfe3e8', chip: '#dcedf1', accent: '#0b7f86', 'accent-ink': '#ffffff', 'accent-soft': '#d3eeef', good: '#1d8a64', gold: '#a35f00', 'gold-soft': '#f6e6cc', grid: '#d9eaee', axis: '#b5cfd6' },
      dark: { bg: '#03121a', card: '#082029', ink: '#d9f3f8', muted: '#86aab4', line: '#123542', chip: '#0c2a35', accent: '#3fe0d0', 'accent-ink': '#021412', 'accent-soft': '#0d3a3e', good: '#5dcaa5', gold: '#ffc65c', 'gold-soft': '#2f2610', grid: '#0d2833', axis: '#1d4452' },
    },
  }),

  patisserie: theme('patisserie', 'The Iron Patisserie', 'Blush and raspberry, piped frosting and showstoppers', {
    seasonWord: 'Menu', seasonsWord: 'Menus', eventWord: 'Bake-off', eventsWord: 'Bake-offs',
    stamp: 'Recipe card', stamps: 'Recipe cards', stampBook: 'Recipe box', stampFrame: '10px', stampToast: 'A recipe card for the box: ',
    tabIcons: { log: '<path d="M12 21v-7"/><path d="M12 14c-4 0-6-4-6-7a6 6 0 0 1 12 0c0 3-2 7-6 7z"/><path d="M12 14c-1.5 0-2.5-4-2.5-7s1-5 2.5-5 2.5 2 2.5 5-1 7-2.5 7z"/>', routines: '<path d="M3 3l3.5 3.5M17.5 17.5 21 21"/><path d="M5 9l4-4 10 10-4 4z"/>', history: '<path d="M6 12h12l-2 9H8z"/><path d="M5 12a4 4 0 0 1 3-6 4 4 0 0 1 8 0 4 4 0 0 1 3 6"/>', seasons: '<path d="M3 19h18v-7L3 7z"/><path d="M3 13l18 3"/>', progress: '<path d="M4 21h16v-6H4zM6 15v-5h12v5M8 10V6h8v4M12 6V3"/>' },
    brand: 'The Iron Patisserie', motto: 'KNEAD · PROOF · LIFT', tagline: 'No soggy bottoms. Log the set.',
    fonts: 'family=Playball&family=Playfair+Display:wght@700', brandFont: 'Playball, "Brush Script MT", cursive',
    headFont: '"Playfair Display", Georgia, serif', brandWeight: 400,
    // A cupcake with a cherry on top.
    logo: svg('<path d="M10 22 H30 L27 36 H13 Z" fill="var(--gold)"/><path d="M15 22 L16 36 M20 22 V36 M25 22 L24 36" stroke="var(--card)" stroke-width="1.2" opacity=".6"/><path d="M8 23 C6 16 12 11 16 12 C17 7 23 7 24 12 C28 11 34 16 32 23 Z" fill="var(--accent)"/><path d="M12 16 C15 15 18 17 21 15" stroke="var(--card)" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/><circle cx="21" cy="7" r="3" fill="#d02a3c"/><path d="M21 4 Q22 1 25 1" stroke="var(--good)" stroke-width="1.2" fill="none"/>'),
    css: '.hero { position: relative; overflow: hidden; padding-top: 24px; }' +
      '.hero::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 12px; background: radial-gradient(circle at 10px 0, var(--accent-soft) 9px, transparent 9.5px) 0 0 / 20px 12px repeat-x; }' +
      '.hero .date::before { content: "✿ "; color: var(--accent); }',
    titles: { log: 'Today’s Bake', routines: 'Recipes', history: 'The Bake book', seasons: 'Menus', progress: 'Layers' },
    tabs: { log: 'Bake', routines: 'Recipes', history: 'Bake book', seasons: 'Menus', progress: 'Layers' },
    helloBig: 'Showstopper day.', helloSome: 'In the oven.', helloNone: 'Preheating.',
    finish: 'Out of the oven · Finish ›', finishFeed: 'Out of the oven · put it in the window', finishPrivate: 'Out of the oven · finish', updateFeed: 'Update the window',
    ended: 'Out of the oven. Let it cool.', endedFeed: 'Out of the oven. It’s in the shop window.', endedClock: '✓ Baked · ',
    routineDone: '🎉 Every layer baked.', routineBtn: 'Bake complete 🧁',
    emptyH: 'The oven is warming.', emptyP: 'Log a set to start today’s bake.',
    prToast: '🎂 A showstopper! ', clubToast: '🧁 A new tier: welcome to the ', goalToast: 'Bake done: ',
    pr: 'showstopper', prs: 'showstoppers',
    prFlag: (reps, was) => 'A showstopper! Your best at ' + reps + ' reps was ' + was,
    winPr: ex => 'A showstopper ' + ex + ': ',
    clubs: 'Cupcakes', clubsSub: n => 'one iced for each of the ' + n + ' clubs joined',
    clubsLabel: (n, next) => n + ' cupcakes iced, one for each club; the next gets its frosting as you near the ' + next,
    weekly: 'Last week’s bakes', streak: 'weeks baking', restWeek: 'Proving',
    rest: n => n + ' weeks baking in a row. Consider a proving week: same lifts at about 60% of the weight, then back in the oven.',
    feed: 'The shop window', feedSub: 'the crew’s bakes on display', feedEmpty: 'Showstoppers, cupcakes, bakes, star bakers and finished sessions from the crew go in the window.',
    icons: { pr: '🎂', club: '🧁', goal: '🍰', session: '🥐', record: '⭐', quest: '🥧', holder: '⭐', questOpen: '🥧', rest: '🫖', dry: '🍞' },
    win: { club: 'Iced a cupcake: the ', record: 'Star baker: ', quest: 'Won a technical: ', goal: 'Finished a bake: ', session: 'Baked a session: ' },
    records: 'Star bakers', holderCol: 'Star baker', recordsBlurb: 'Beat the star baker’s best and the apron is yours.', recordToast: '⭐ Star baker on ',
    quests: 'Technicals', questsSub: 'this week’s technical challenges, the same for the whole crew', questDone: '🥧 Technical won: ',
    goals: 'Bakes', goalsKept: 'Bakes finished', plan: 'The recipe', points: 'sprinkles', pointsEarned: 'sprinkles earned',
    dry: 'A sunken middle: three sessions without a new best on this lift. Try a lighter week (about 10% off) or a different rep range, then come back to it.',
    ach: { first_visit: 'Your first bake.', five_visits: 'Five bakes. Flour on your apron.', twenty_visits: 'Twenty gym days. Master baker.', first_pr: 'A new best for an exercise and rep count. A showstopper.' },
    achTitle: { first_pr: 'First Showstopper' },
    // Frosting piped along the bar, a cupcake on the front, and the cake at the end.
    bar: { height: '14px', fill: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 55%, #fff), var(--accent))',
      texture: 'radial-gradient(circle at 50% 35%, rgba(255,255,255,.7) 0 2px, transparent 2.6px) 0 0 / 8px 100% repeat-x', end: '🧁', goal: '🎂' },
    // A cupcake per club, frosted and topped with a cherry. The next one's frosting fills in as you near it.
    token: (cx, glow, next) => '<path d="M' + (cx - 13) + ' 112 L' + (cx - 16) + ' 88 H' + (cx + 16) + ' L' + (cx + 13) + ' 112 Z" fill="var(--gold-soft)" stroke="var(--line)" stroke-width="1.5"/>' +
      '<path d="M' + (cx - 6) + ' 89 L' + (cx - 5) + ' 111 M' + cx + ' 89 V111 M' + (cx + 6) + ' 89 L' + (cx + 5) + ' 111" stroke="var(--line)" stroke-width="1.2"/>' +
      '<path d="M' + (cx - 18) + ' 89 Q' + (cx - 18) + ' 70 ' + cx + ' 66 Q' + (cx + 18) + ' 70 ' + (cx + 18) + ' 89 Z" fill="var(--card)" stroke="var(--line)" stroke-width="1.5"/>' +
      (glow > 0.02 ? '<path d="M' + (cx - 18) + ' 89 Q' + (cx - 18) + ' 70 ' + cx + ' 66 Q' + (cx + 18) + ' 70 ' + (cx + 18) + ' 89 Z" fill="var(--accent)" opacity="' + glowOp(glow, next) + '"/>' : '') +
      (!next || glow > 0.95 ? '<circle cx="' + cx + '" cy="62" r="4.5" fill="#d02a3c"/><circle cx="' + (cx - 1.5) + '" cy="60.5" r="1.3" fill="#fff" opacity=".7"/>' : ''),
    colors: {
      light: { bg: '#fdf1f4', card: '#fffafb', ink: '#3a1424', muted: '#7a5363', line: '#f3d9e1', chip: '#f8e3ea', accent: '#c2306a', 'accent-ink': '#ffffff', 'accent-soft': '#fbdbe7', good: '#3d7d4a', gold: '#9a6a10', 'gold-soft': '#f7eacd', grid: '#f6e3e9', axis: '#e2bfcb' },
      dark: { bg: '#170c0c', card: '#22130f', ink: '#f9e6ea', muted: '#c49aa6', line: '#3a221c', chip: '#2c1915', accent: '#ff7fb0', 'accent-ink': '#2a0612', 'accent-soft': '#43182a', good: '#8fd39b', gold: '#f0c56a', 'gold-soft': '#33271a', grid: '#2c1a16', axis: '#4c3029' },
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

export const ORDER = ['church', 'trains', 'kitchen', 'kaiju', 'coach', 'claus', 'mission', 'greenhouse', 'west', 'circus', 'dungeon', 'arcade', 'viking', 'deep', 'patisserie', 'stone', 'sand'];

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
  document.querySelectorAll('.tabs a[href^="#"]').forEach(a => {
    const k = a.getAttribute('href').slice(1), lab = a.querySelector('.tab-label'), ic = a.querySelector('svg');
    if (lab && t.tabs[k]) lab.textContent = t.tabs[k];
    if (ic && t.tabIcons[k]) { ic.innerHTML = t.tabIcons[k]; ic.setAttribute('stroke-linejoin', 'round'); ic.setAttribute('aria-hidden', 'true'); }
  });
  const light = document.querySelector('meta[name="theme-color"][media*="light"]'), dark = document.querySelector('meta[name="theme-color"][media*="dark"]');
  if (light) light.content = color(t, 'light', 'bg');
  if (dark) dark.content = color(t, 'dark', 'bg');
  const icon = document.querySelector('link[rel="icon"]');
  if (icon && t.logo) icon.href = favicon(t);
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = 'A lifting log for a small crew. ' + t.tagline;
  return t;
}
