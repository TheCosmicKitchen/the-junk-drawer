// Words for Piroshki: the tracker itself. Works on its own from a cookie; shared.js can swap in a
// copy kept in Supabase (the writer's own, or a friend's to follow along).
(function () {
  const TRAY = 12;
  const MAX = 5;     // the cookie format has room for 10 if this ever goes up
  const now = new Date();
  const KEY = 'piroshki_' + now.getFullYear();
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const col = i => 'var(--s' + (i + 1) + ')';
  const dot = i => '<span class="dot" style="background:' + col(i) + '"></span>';

  // Day of November we're on: 0 before it starts, 30 after it ends.
  const TODAY = now.getMonth() < 10 ? 0 : now.getMonth() > 10 ? 30 : now.getDate();

  // ---- storage ----
  // The cookie uses a compact text format so even ten stories x 30 days stays well under the ~4 KB cookie limit:
  //   v2!<setup 0|1>!<name>~<goal>~<day1>.<day2>...|<next story>   (numbers in base 36, names URI-encoded)
  // localStorage keeps a JSON copy as a backup in case the cookie is cleared.
  function encode(st) {
    return 'v2!' + (st.setup ? 1 : 0) + '!' + st.stories.map(s => {
      const days = [];
      for (let d = 1; d <= 30; d++) days.push(s.days[d] ? s.days[d].toString(36) : '');
      return encodeURIComponent(s.name).replace(/~/g, '%7E') + '~' + s.goal.toString(36) + '~' + days.join('.').replace(/\.+$/, '');
    }).join('|');
  }
  function decode(v) {
    const m = /^v2!([01])!(.*)$/.exec(v);
    if (!m) return null;
    return { setup: m[1] === '1', stories: m[2].split('|').map(part => {
      const [name, goal, days = ''] = part.split('~');
      const out = { name: decodeURIComponent(name), goal: parseInt(goal, 36), days: {} };
      days.split('.').forEach((w, i) => { const n = parseInt(w, 36); if (n > 0) out.days[i + 1] = n; });
      return out;
    }) };
  }
  function tidy(d) {
    if (d && Array.isArray(d.stories) && d.stories.length) {
      return { setup: !!d.setup, stories: d.stories.slice(0, MAX).map((s, i) => ({
        name: String(s.name || 'Story ' + (i + 1)).slice(0, 40),
        goal: s.goal > 0 ? Math.floor(s.goal) : 25000,
        days: s.days && typeof s.days === 'object' ? s.days : {},
      })) };
    }
    if (d && d.days && typeof d.days === 'object') {
      // the very first, single-goal version
      return { setup: false, stories: [{ name: 'My novel', goal: d.goal || 50000, days: d.days }] };
    }
    return null;
  }
  function load() {
    let d = null;
    try {
      const hit = document.cookie.split('; ').find(c => c.startsWith(KEY + '='));
      if (hit) {
        const v = hit.slice(KEY.length + 1);
        d = v.startsWith('v2!') ? decode(v) : JSON.parse(decodeURIComponent(v));
      }
    } catch (e) {}
    if (!tidy(d)) { try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} }
    return tidy(d) || { setup: false, stories: [{ name: 'My novel', goal: 50000, days: {} }] };
  }
  // mode: 'local' (this browser's cookie), 'write' (also saved to Supabase by shared.js),
  // 'read' (following someone else's progress: nothing can be changed, nothing is saved here).
  let mode = 'local', onSave = null, owner = '';
  function save() {
    if (mode === 'read') return;
    if (onSave) onSave(JSON.parse(JSON.stringify(state)));
    keep();
  }
  function keep() {   // this browser's copy: the cookie, plus a JSON backup
    try {
      document.cookie = KEY + '=' + encode(state) +
        '; max-age=' + 60 * 60 * 24 * 400 + '; path=/; SameSite=Lax' +
        (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) {}
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  const state = load();
  const blank = () => ({ setup: true, stories: [] });

  // ---- numbers ----
  const on = (s, d) => s.days[d] || 0;
  const sum = s => Object.values(s.days).reduce((a, b) => a + b, 0);
  const dayTotal = d => state.stories.reduce((a, s) => a + on(s, d), 0);
  const daysLeft = 30 - Math.max(TODAY, 1) + 1;   // today counts
  function streak() {
    let d = TODAY;
    if (d >= 1 && !dayTotal(d)) d--;          // today isn't over yet
    let n = 0;
    while (d >= 1 && dayTotal(d) > 0) { n++; d--; }
    return n;
  }

  // ---- piroshok drawing ----
  const SHAPE = 'M8 38 C8 18 30 9 50 9 C70 9 92 18 92 38 C92 50 72 55 50 55 C28 55 8 50 8 38 Z';
  const SEAM = 'M15 31 Q20 23 26 27 Q32 18 38 24 Q44 15 50 21 Q56 15 62 24 Q68 18 74 27 Q80 23 85 31';
  function piroshok(i, frac) {
    const label = frac >= 1 ? 'baked piroshok' : frac > 0 ? 'piroshok in the oven' : 'raw piroshok';
    return '<svg class="pk' + (frac >= 1 ? ' done' : '') + '" viewBox="0 0 100 62" role="img" aria-label="' + label + '">' +
      '<defs><clipPath id="c' + i + '"><rect x="0" y="0" height="62" width="' + (100 * frac) + '"/></clipPath></defs>' +
      '<path class="raw" d="' + SHAPE + '"/>' +
      '<g clip-path="url(#c' + i + ')"><path class="baked" d="' + SHAPE + '"/></g>' +
      '<path class="seam" d="' + SEAM + '"/></svg>';
  }

  let lastBaked = -1;
  function render() {
    const S = state.stories;
    $('emptyShare').hidden = S.length > 0;
    document.querySelectorAll('.needs-data').forEach(el => { el.hidden = !S.length; });
    if (!S.length) { $('win').classList.remove('show'); return; }
    // The tray's goal is every story's goal added up. Each story counts only up to its own goal,
    // so racing ahead on one can't cover for another that's still short.
    const goal = S.reduce((a, s) => a + s.goal, 0);
    const tots = S.map(sum);
    const counted = S.reduce((a, s, i) => a + Math.min(tots[i], s.goal), 0);
    const all = tots.reduce((a, b) => a + b, 0);
    const per = goal / TRAY;
    const baked = Math.floor(counted / per + 1e-9);
    const won = S.every((s, i) => tots[i] >= s.goal);

    let tray = '';
    for (let i = 0; i < TRAY; i++) tray += piroshok(i, Math.max(0, Math.min(1, (counted - i * per) / per)));
    $('tray').innerHTML = tray;
    document.querySelectorAll('.pk.done').forEach((el, i) => { if (lastBaked < 0 || i < lastBaked) el.style.animation = 'none'; });
    lastBaked = baked;

    $('total').textContent = fmt(counted);
    $('totalOf').textContent = 'of ' + fmt(goal) + ' words' + (S.length > 1 ? ' across ' + S.length + ' stories' : '') +
      ' · ' + Math.min(baked, TRAY) + ' of ' + TRAY + ' piroshki baked';
    const pct = Math.min(100, counted / goal * 100);
    $('bar').style.width = pct + '%';
    $('pct').textContent = (pct < 10 ? pct.toFixed(1) : Math.floor(pct)) + '%';
    $('parMark').style.left = 'calc(' + (TODAY / 30 * 100) + '% - 1px)';
    $('parMark').style.display = TODAY ? '' : 'none';
    $('win').classList.toggle('show', won);

    // per story
    $('stories').innerHTML = S.map((s, i) => {
      const t = tots[i], par = s.goal * TODAY / 30, diff = t - par, left = s.goal - t;
      const p = Math.min(100, t / s.goal * 100);
      const line = left <= 0
        ? '<span class="ahead">Done!' + (t > s.goal ? ' ' + fmt(t - s.goal) + ' over goal.' : '') + '</span>'
        : fmt(Math.ceil(left / daysLeft)) + ' a day to finish · ' + (TODAY
          ? '<span class="' + (diff >= 0 ? 'ahead' : 'behind') + '">' + fmt(Math.abs(diff)) + (diff >= 0 ? ' ahead' : ' behind') + '</span>'
          : 'starts Nov 1');
      return '<div class="story"><h3>' + dot(i) + esc(s.name) + '</h3>' +
        '<div class="nums"><b>' + fmt(t) + '</b> <span>of ' + fmt(s.goal) + ' · ' + Math.floor(p) + '%</span></div>' +
        '<div class="meter" aria-hidden="true"><div style="width:' + p + '%;background:' + col(i) + '"></div>' +
        (TODAY ? '<span class="par" style="left:calc(' + (TODAY / 30 * 100) + '% - 1px)"></span>' : '') + '</div>' +
        '<p>' + line + '</p></div>';
    }).join('');

    // shared stats: each day's words are summed across every story
    const projected = all / Math.max(TODAY, 1) * 30;
    let best = 0, bestDay = 0;
    for (let d = 1; d <= 30; d++) if (dayTotal(d) > best) { best = dayTotal(d); bestDay = d; }
    const st = streak();
    const scope = S.length > 1 ? 'all stories' : '';
    const stats = [
      ['Today', fmt(dayTotal(TODAY)), TODAY ? (scope ? scope + ', ' : '') + 'Nov ' + TODAY : 'November hasn’t started'],
      ['Streak', st + ' day' + (st === 1 ? '' : 's'), 'writing every day'],
      ['On this pace', fmt(projected), 'words by Nov 30, of ' + fmt(goal)],
      ['Best day', fmt(best), best ? 'Nov ' + bestDay : 'not yet'],
    ];
    $('stats').innerHTML = stats.map(s =>
      '<div class="stat"><small>' + s[0] + '</small><b>' + s[1] + '</b><small>' + s[2] + '</small></div>').join('');

    // chart: stacked bars, one colour per story
    const daily = goal / 30;
    const top = Math.max(daily * 1.5, best) || 1;
    let bars = '';
    for (let d = 1; d <= 30; d++) {
      const t = dayTotal(d);
      bars += '<div class="b' + (d === TODAY ? ' today' : '') + '" style="height:' + (t / top * 100) + '%" title="Nov ' + d + ': ' + fmt(t) +
        (S.length > 1 && t ? ' (' + S.filter(s => on(s, d)).map(s => esc(s.name) + ' ' + fmt(on(s, d))).join(', ') + ')' : '') + '">' +
        S.map((s, i) => '<i style="background:' + col(i) + ';height:' + (t ? on(s, d) / t * 100 : 0) + '%"></i>').join('') + '</div>';
    }
    $('chart').innerHTML = bars + '<span class="daily" style="bottom:' + (daily / top * 100) + '%" title="' + fmt(daily) + ' a day keeps you on pace"></span>';
    $('chartLegend').innerHTML = (S.length > 1 ? S.map((s, i) => '<span>' + dot(i) + esc(s.name) + '</span>').join('') : '') +
      '<span>dashed line = ' + fmt(daily) + ' a day</span>';

    // log
    const rows = [];
    for (let d = 30; d >= 1; d--) S.forEach((s, i) => { if (on(s, d)) rows.push([d, i]); });
    $('log').innerHTML = rows.length
      ? rows.map(([d, i]) => '<li><span>Nov ' + d + (S.length > 1 ? '&nbsp;·&nbsp;' + dot(i) + esc(S[i].name) : '') + '</span><span>' +
          fmt(on(S[i], d)) + ' words' + (mode === 'read' ? '' : ' <button type="button" data-day="' + d + '" data-story="' + i + '">clear</button>') + '</span></li>').join('')
      : '<li><p class="empty">Nothing logged yet. The dough is waiting.</p></li>';

    // story picker keeps its selection across re-renders; hidden when there's only one
    const sel = $('story'), keep = sel.value;
    sel.innerHTML = S.map((s, i) => '<option value="' + i + '">' + esc(s.name) + '</option>').join('');
    sel.value = keep && keep < S.length ? keep : '0';
    $('storyPick').hidden = S.length < 2;

    // goals: up top until they've been saved once
    $('goalsSec').classList.toggle('first', !state.setup && mode !== 'read');
    $('goalsIntro').hidden = state.setup;
  }

  // ---- goals editor (edits a draft; nothing changes until Save) ----
  let draft;
  function resetDraft() { draft = state.stories.map((s, i) => ({ name: s.name, goal: s.goal, src: i })); drawGoals(); }
  function drawGoals() {
    $('goalRows').innerHTML = draft.map((g, i) =>
      '<div class="goalrow">' +
        '<div><label for="n' + i + '">' + dot(i) + 'Story ' + (i + 1) + '</label>' +
          '<input id="n' + i + '" data-i="' + i + '" data-k="name" maxlength="40" required value="' + esc(g.name) + '"></div>' +
        '<div><label for="g' + i + '">Goal (words)</label>' +
          '<input id="g' + i + '" data-i="' + i + '" data-k="goal" type="number" inputmode="numeric" min="1" step="1" required value="' + g.goal + '"></div>' +
        '<button type="button" data-rm="' + i + '"' + (draft.length < 2 ? ' disabled' : '') + ' aria-label="Remove ' + esc(g.name) + '">Remove</button>' +
      '</div>').join('');
    $('addStory').disabled = draft.length >= MAX;
    $('addStory').textContent = draft.length >= MAX ? 'Five is the most' : 'Add a story';
  }
  $('goalRows').addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (k) draft[e.target.dataset.i][k] = k === 'goal' ? Math.floor(Number(e.target.value)) : e.target.value;
  });
  $('goalRows').addEventListener('click', e => {
    const b = e.target.closest('button[data-rm]');
    if (!b) return;
    draft.splice(Number(b.dataset.rm), 1);
    drawGoals();
  });
  $('addStory').addEventListener('click', () => {
    if (draft.length >= MAX) return;
    draft.push({ name: 'Story ' + (draft.length + 1), goal: 25000, src: -1 });
    drawGoals();
    const inp = $('n' + (draft.length - 1)); inp.focus(); inp.select();
  });
  $('goalForm').addEventListener('submit', e => {
    e.preventDefault();
    const kept = new Set(draft.map(g => g.src));
    const lost = state.stories.filter((s, i) => !kept.has(i) && sum(s) > 0);
    if (lost.length && !confirm('Removing ' + lost.map(s => s.name + ' (' + fmt(sum(s)) + ' words)').join(' and ') +
        ' also deletes the words logged for it. Go ahead?')) return;
    state.stories = draft.map((g, i) => ({
      name: String(g.name).trim().slice(0, 40) || 'Story ' + (i + 1),
      goal: g.goal > 0 ? g.goal : 25000,
      days: g.src >= 0 ? state.stories[g.src].days : {},
    }));
    state.setup = true;
    save(); render(); resetDraft();
    const m = $('savedMsg'); m.hidden = false; setTimeout(() => { m.hidden = true; }, 1500);
  });

  // ---- day picker ----
  const daySel = $('day');
  for (let d = 1; d <= 30; d++) {
    const o = document.createElement('option');
    o.value = d; o.textContent = 'Nov ' + d + (d === TODAY ? ' (today)' : '');
    daySel.appendChild(o);
  }
  daySel.value = Math.max(TODAY, 1);

  // ---- logging ----
  $('logForm').addEventListener('submit', e => {
    e.preventDefault();
    const mode = (e.submitter && e.submitter.dataset.mode) || 'add';
    const n = Math.floor(Number($('words').value));
    if (!(n >= 0)) return;
    const s = state.stories[Number($('story').value)];
    const d = Number(daySel.value);
    if (mode === 'set') {
      const others = sum(s) - on(s, d);
      if (n < others) { alert('That total is lower than your other days on ' + s.name + ' add up to (' + fmt(others) + '). Clear a day first?'); return; }
      s.days[d] = n - others;
    } else {
      s.days[d] = on(s, d) + n;
    }
    if (!s.days[d]) delete s.days[d];
    save(); render();
    $('words').value = '';
  });
  $('log').addEventListener('click', e => {
    const b = e.target.closest('button[data-day]');
    if (!b) return;
    const s = state.stories[b.dataset.story], d = b.dataset.day;
    if (!confirm('Clear ' + s.name + ' for Nov ' + d + '?')) return;
    delete s.days[d]; save(); render();
  });

  // ---- share card ----
  // Drawn on a canvas in fixed, light bakery colours so it looks the same whoever opens it.
  const CARD = { bg: '#fbf6ec', panel: '#ffffff', ink: '#2b2118', muted: '#7a6a58', line: '#eadfca', accent: '#b5652a',
    dough: '#f1e4c6', doughEdge: '#d9c49b', baked: '#c8843a', bakedEdge: '#8f5520', good: '#3f7d4e', warn: '#b0562f',
    story: ['#c4702f', '#4f7f8c', '#8a63b5', '#5a8a3c', '#c24d6b'] };
  const SERIF = 'Fraunces, Georgia, serif', SANS = 'Inter, system-ui, sans-serif';
  function summary() {
    const S = state.stories;
    const goal = S.reduce((a, s) => a + s.goal, 0);
    const tots = S.map(sum);
    const counted = S.reduce((a, s, i) => a + Math.min(tots[i], s.goal), 0);
    const all = tots.reduce((a, b) => a + b, 0);
    let best = 0;
    for (let d = 1; d <= 30; d++) best = Math.max(best, dayTotal(d));
    return {
      S, goal, tots, counted, all, best,
      baked: Math.min(TRAY, Math.floor(counted / (goal / TRAY) + 1e-9)),
      pct: Math.min(100, counted / goal * 100),
      diff: counted - goal * TODAY / 30,
      won: S.every((s, i) => tots[i] >= s.goal),
      today: dayTotal(TODAY), streak: streak(), projected: all / Math.max(TODAY, 1) * 30,
      date: TODAY ? 'Nov ' + TODAY : now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
  function fitText(c, text, max) {
    if (c.measureText(text).width <= max) return text;
    while (text.length > 1 && c.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
  }
  async function drawCard() {
    try { await Promise.all([document.fonts.load('700 100px Fraunces'), document.fonts.load('600 30px Inter'), document.fonts.load('400 30px Inter')]); } catch (e) {}
    const m = summary();
    const W = 1080, P = 72, inner = W - 2 * P;
    const storyH = 92, rows = m.S.length;
    const H = 1000 + rows * storyH;   // generous; trimmed to what was drawn at the end
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = CARD.bg; c.fillRect(0, 0, W, H);
    c.textBaseline = 'alphabetic';

    // header
    let y = P + 26;
    c.fillStyle = CARD.accent; c.font = '600 28px ' + SANS;
    c.fillText('WORDS FOR PIROSHKI', P, y);
    c.fillStyle = CARD.muted; c.textAlign = 'right'; c.fillText(m.date, W - P, y); c.textAlign = 'left';

    // big number
    y += 120;
    c.fillStyle = CARD.ink; c.font = '700 116px ' + SERIF;
    const big = fmt(m.counted);
    c.fillText(big, P, y);
    const bw = c.measureText(big).width;
    c.fillStyle = CARD.muted; c.font = '400 34px ' + SANS;
    c.fillText('of ' + fmt(m.goal) + ' words', P + bw + 22, y - 44);
    c.fillStyle = CARD.ink; c.font = '600 34px ' + SANS;
    c.fillText((m.pct < 10 ? m.pct.toFixed(1) : Math.floor(m.pct)) + '%', P + bw + 22, y);

    // tray
    y += 48;
    const cols = 6, gap = 18, cw = (inner - (cols - 1) * gap) / cols, ch = cw * 0.62;
    const shape = new Path2D(SHAPE), seam = new Path2D(SEAM), per = m.goal / TRAY;
    for (let i = 0; i < TRAY; i++) {
      const x = P + (i % cols) * (cw + gap), ty = y + Math.floor(i / cols) * (ch + gap);
      const frac = Math.max(0, Math.min(1, (m.counted - i * per) / per));
      c.save(); c.translate(x, ty); c.scale(cw / 100, ch / 62);
      c.lineWidth = 2.2;
      c.fillStyle = CARD.dough; c.strokeStyle = CARD.doughEdge; c.fill(shape); c.stroke(shape);
      if (frac > 0) {
        c.save(); c.beginPath(); c.rect(0, 0, 100 * frac, 62); c.clip();
        c.fillStyle = CARD.baked; c.strokeStyle = CARD.bakedEdge; c.fill(shape); c.stroke(shape);
        c.restore();
      }
      c.lineWidth = 2.6; c.lineCap = 'round'; c.strokeStyle = frac >= 1 ? CARD.bakedEdge : CARD.doughEdge; c.stroke(seam);
      c.restore();
    }
    y += 2 * ch + gap + 64;

    // headline
    c.fillStyle = CARD.ink; c.font = '700 46px ' + SERIF;
    c.fillText(m.won ? 'Piroshki are coming!' : m.baked + ' of ' + TRAY + ' piroshki baked', P, y);
    if (!m.won && TODAY) {
      c.font = '600 30px ' + SANS; c.textAlign = 'right';
      c.fillStyle = m.diff >= 0 ? CARD.good : CARD.warn;
      c.fillText(fmt(Math.abs(m.diff)) + (m.diff >= 0 ? ' ahead of pace' : ' behind pace'), W - P, y);
      c.textAlign = 'left';
    }
    y += 40;

    // stories
    c.strokeStyle = CARD.line; c.lineWidth = 2;
    c.beginPath(); c.moveTo(P, y); c.lineTo(W - P, y); c.stroke();
    y += 22;
    m.S.forEach((s, i) => {
      const t = m.tots[i], col = CARD.story[i % CARD.story.length];
      y += 36;
      c.fillStyle = col; c.beginPath(); c.arc(P + 9, y - 11, 9, 0, Math.PI * 2); c.fill();
      c.font = '600 30px ' + SANS; c.fillStyle = CARD.ink;
      const right = fmt(t) + ' / ' + fmt(s.goal) + (t >= s.goal ? '  ✓' : '');
      c.textAlign = 'right'; c.fillText(right, W - P, y);
      const rw = c.measureText(right).width;
      c.textAlign = 'left'; c.fillText(fitText(c, s.name, inner - rw - 60), P + 30, y);
      y += 20;
      c.fillStyle = CARD.line; roundRect(c, P, y, inner, 14, 7); c.fill();
      c.fillStyle = col; roundRect(c, P, y, Math.max(14, inner * Math.min(1, t / s.goal)), 14, 7); c.fill();
      y += storyH - 56;
    });
    y += 30;

    // stats strip
    const stats = [['Today', fmt(m.today)], ['Streak', m.streak + (m.streak === 1 ? ' day' : ' days')], ['On pace for', fmt(m.projected)]];
    const sw = inner / 3;
    c.fillStyle = CARD.panel; roundRect(c, P, y, inner, 150, 24); c.fill();
    c.strokeStyle = CARD.line; c.lineWidth = 2; c.stroke();
    stats.forEach(([label, value], i) => {
      const x = P + i * sw + 32;
      c.fillStyle = CARD.muted; c.font = '400 26px ' + SANS; c.fillText(label, x, y + 52);
      c.fillStyle = CARD.ink; c.font = '700 48px ' + SERIF; c.fillText(value, x, y + 110);
    });
    y += 150 + 56;

    // footer
    c.fillStyle = CARD.muted; c.font = '400 26px ' + SANS;
    c.fillText(m.won ? 'NaNoWriMo, done. Time to start the dough.' : 'NaNoWriMo · ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' to go', P, y);

    // trim to what was drawn
    const out = document.createElement('canvas');
    out.width = W; out.height = Math.ceil(y + P - 20);
    const oc = out.getContext('2d');
    oc.drawImage(cv, 0, 0);
    return out;
  }
  function shareText() {
    const m = summary();
    return 'Words for Piroshki, ' + m.date + ': ' + fmt(m.counted) + ' of ' + fmt(m.goal) + ' words (' + Math.floor(m.pct) + '%). ' +
      (m.won ? 'Every goal done, piroshki are coming! 🥟' : m.baked + ' of ' + TRAY + ' piroshki baked' +
        (TODAY ? ', ' + fmt(Math.abs(m.diff)) + (m.diff >= 0 ? ' ahead of pace.' : ' behind pace.') : '.')) +
      (m.S.length > 1 ? ' ' + m.S.map((s, i) => s.name + ' ' + fmt(m.tots[i]) + '/' + fmt(s.goal)).join(', ') + '.' : '');
  }
  let cardBlob = null;
  const fileName = () => 'piroshki-progress-' + (TODAY ? 'nov-' + TODAY : 'today') + '.png';
  function shareMsg(t) { $('shareMsg').textContent = t; }
  $('shareBtn').addEventListener('click', async () => {
    const dlg = $('shareDlg');
    shareMsg('Making your card…');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    const cv = await drawCard();
    $('shareImg').src = cv.toDataURL('image/png');
    $('shareImg').alt = shareText();
    cardBlob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const file = cardBlob && new File([cardBlob], fileName(), { type: 'image/png' });
    let canSendFile = false;
    try { canSendFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
    $('shareSend').hidden = !canSendFile;
    $('shareCopyImg').hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) || canSendFile;
    shareMsg('Or just screenshot it.');
  });
  $('shareClose').addEventListener('click', () => $('shareDlg').close());
  $('shareDlg').addEventListener('click', e => { if (e.target === $('shareDlg')) $('shareDlg').close(); });   // tap outside to close
  $('shareSend').addEventListener('click', async () => {
    try { await navigator.share({ files: [new File([cardBlob], fileName(), { type: 'image/png' })], text: shareText() }); shareMsg('Sent.'); }
    catch (e) { if (e && e.name !== 'AbortError') shareMsg('Couldn’t open sharing. Save the image instead.'); }
  });
  $('shareCopyImg').addEventListener('click', async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })]); shareMsg('Image copied. Paste it into a message.'); }
    catch (e) { shareMsg('Couldn’t copy the image here. Save it instead.'); }
  });
  $('shareSave').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(cardBlob); a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    shareMsg('Saved.');
  });
  $('shareText').addEventListener('click', () => {
    const t = shareText();
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
      .then(() => shareMsg('Copied: ' + t), () => prompt('Copy this:', t));
  });

  // ---- hooks for shared.js ----
  function swap(d) {
    const t = tidy(d) || (mode === 'read' ? blank() : { setup: false, stories: [{ name: 'My novel', goal: 50000, days: {} }] });
    state.setup = t.setup; state.stories = t.stories;
    lastBaked = -1;
    const ro = mode === 'read';
    $('logSec').hidden = ro; $('goalsSec').hidden = ro;
    $('storiesH').textContent = ro ? owner + '’s stories' : 'Your stories';
    $('daysH').textContent = ro ? owner + '’s days' : 'Your days';
    $('shareH').textContent = ro ? owner + '’s progress card' : 'Your progress card';
    $('modeNote').hidden = !ro;
    $('modeNote').textContent = ro ? 'Following ' + owner + '’s November. Read-only.' : '';
    resetDraft(); render();
  }
  window.Piroshki = {
    snapshot: () => JSON.parse(JSON.stringify(state)),
    hasWords: () => state.stories.some(s => sum(s) > 0),
    // The writer signing in: fold this browser's words into the shared copy. Same story name = same
    // story, and for each day the larger count wins, so nothing typed on any device is lost and doing it
    // twice changes nothing. Returns the merged progress and how many words this browser added.
    mergeLocal(shared) {
      const here = tidy(load()), base = tidy(shared);
      const words = d => d ? d.stories.reduce((a, s) => a + sum(s), 0) : 0;
      if (!here || (!words(here) && !here.setup)) return { data: base, added: 0 };
      if (!base || (!words(base) && !base.setup)) return { data: here, added: words(here) };
      const out = JSON.parse(JSON.stringify(base));
      let added = 0;
      here.stories.forEach(s => {
        const key = s.name.trim().toLowerCase();
        let t = out.stories.find(x => x.name.trim().toLowerCase() === key);
        if (!t) {
          if (!sum(s) || out.stories.length >= MAX) return;
          t = { name: s.name, goal: s.goal, days: {} };
          out.stories.push(t);
        }
        for (const [d, n] of Object.entries(s.days)) if (n > (t.days[d] || 0)) { added += n - (t.days[d] || 0); t.days[d] = n; }
      });
      return { data: out, added };
    },
    write(data, push) {
      // Keep one untouched copy of what this browser had before it first joined the shared tracker.
      try { if (!localStorage.getItem(KEY + '_before_shared')) localStorage.setItem(KEY + '_before_shared', JSON.stringify(load())); } catch (e) {}
      mode = 'write'; onSave = null; owner = ''; swap(data || load()); keep(); onSave = push;
    },
    read(data, name) { mode = 'read'; onSave = null; owner = name || 'Your friend'; swap(data); },
    local() { mode = 'local'; onSave = null; owner = ''; swap(load()); },
    get mode() { return mode; },
  };

  resetDraft();
  render();
})();
