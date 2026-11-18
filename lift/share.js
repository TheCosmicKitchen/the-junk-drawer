// Share card: a picture of one finished workout, drawn on this phone in the current theme, to send
// to people outside the app (Messages, Instagram…). Nothing is uploaded; the image only goes where
// the share sheet sends it.

const W = 1080, H = 1350, PAD = 64;

// Theme colours and fonts, resolved to values a canvas understands (themes may use color-mix()).
function themeLook() {
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement('i');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const col = name => { probe.style.color = 'var(' + name + ')'; return getComputedStyle(probe).color; };
  const look = {
    bg: col('--bg'), card: col('--card'), ink: col('--ink'), muted: col('--muted'), line: col('--line'), chip: col('--chip'),
    accent: col('--accent'), accentSoft: col('--accent-soft'), gold: col('--gold'), goldSoft: col('--gold-soft'),
    display: root.getPropertyValue('--display').trim() || 'system-ui, sans-serif',
    body: root.getPropertyValue('--body').trim() || 'system-ui, sans-serif',
    head: root.getPropertyValue('--headfont').trim() || 'Georgia, serif',
    brand: root.getPropertyValue('--brandfont').trim() || 'Georgia, serif',
    brandWeight: root.getPropertyValue('--brandweight').trim() || '700',
  };
  probe.remove();
  return look;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// Shorten text with an ellipsis until it fits.
function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
// Largest font size (down to min) at which text fits in max.
function sizeTo(g, font, text, start, min, max) {
  let s = start;
  for (; s > min; s -= 2) { g.font = font(s); if (g.measureText(text).width <= max) break; }
  g.font = font(s);
  return s;
}

// card: { brand, motto, who, date, title, icon, stats: [{v, u, gold}], lifts: [{name, rx, pr}], more, badges: [text], foot, prIcon }
export async function drawShareCard(card) {
  const k = themeLook();
  try { await document.fonts.ready; } catch (e) {}
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.textBaseline = 'alphabetic';

  // Ground, then the card with an accent band across its top.
  g.fillStyle = k.bg; g.fillRect(0, 0, W, H);
  const cx = PAD, cy = PAD, cw = W - PAD * 2, ch = H - PAD * 2;
  g.save(); roundRect(g, cx, cy, cw, ch, 44); g.fillStyle = k.card; g.fill(); g.clip();
  g.fillStyle = k.accent; g.fillRect(cx, cy, cw, 14);
  g.restore();
  g.lineWidth = 2; g.strokeStyle = k.line; roundRect(g, cx, cy, cw, ch, 44); g.stroke();

  const x = cx + 56, right = cx + cw - 56, inner = right - x;
  let y = cy + 104;

  // Brand and motto.
  g.fillStyle = k.accent;
  sizeTo(g, s => k.brandWeight + ' ' + s + 'px ' + k.brand, card.brand, 52, 30, inner);
  g.fillText(card.brand, x, y);
  if (card.motto) {
    y += 40;
    g.fillStyle = k.muted; g.font = '700 22px ' + k.body;
    if ('letterSpacing' in g) g.letterSpacing = '3px';
    g.fillText(fit(g, card.motto, inner), x, y);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }

  // Who and when, then the workout's name.
  y += 72;
  g.fillStyle = k.muted; g.font = '600 30px ' + k.body;
  g.fillText(fit(g, [card.who, card.date].filter(Boolean).join(' · '), inner), x, y);
  y += 84;
  g.fillStyle = k.ink;
  const title = (card.icon ? card.icon + ' ' : '') + card.title;
  sizeTo(g, s => '700 ' + s + 'px ' + k.head, title, 76, 44, inner);
  g.fillText(fit(g, title, inner), x, y);

  // Big numbers.
  y += 46;
  if (card.stats.length) {
    const gap = 18, sw = (inner - gap * (card.stats.length - 1)) / card.stats.length, sh = 150;
    card.stats.forEach((st, i) => {
      const sx = x + i * (sw + gap);
      roundRect(g, sx, y, sw, sh, 26); g.fillStyle = st.gold ? k.goldSoft : k.chip; g.fill();
      g.fillStyle = st.gold ? k.gold : k.ink;
      sizeTo(g, s => '800 ' + s + 'px ' + k.display, st.v, 76, 36, sw - 36);
      g.fillText(st.v, sx + 22, y + 88);
      g.fillStyle = st.gold ? k.gold : k.muted; g.font = '600 26px ' + k.body;
      g.fillText(fit(g, st.u, sw - 36), sx + 22, y + 126);
    });
    y += sh + 30;
  }

  // The lifts, top set for each. PRs in gold.
  const footH = (card.badges.length ? 96 : 0) + (card.foot ? 56 : 0) + 40;
  const rowH = 64, room = Math.floor((cy + ch - footH - y) / rowH);
  const lifts = card.lifts.slice(0, Math.max(0, card.lifts.length > room ? room - 1 : room));
  const hidden = card.lifts.length - lifts.length + (card.more || 0);
  for (const l of lifts) {
    y += rowH;
    g.strokeStyle = k.line; g.lineWidth = 2; g.setLineDash([6, 8]);
    g.beginPath(); g.moveTo(x, y - rowH + 14); g.lineTo(right, y - rowH + 14); g.stroke(); g.setLineDash([]);
    g.font = (l.pr ? '700 ' : '600 ') + '30px ' + k.body;
    const rx = (l.pr ? card.prIcon + ' ' : '') + l.rx, rw = g.measureText(rx).width;
    g.fillStyle = l.pr ? k.gold : k.muted; g.textAlign = 'right'; g.fillText(rx, right, y - 8); g.textAlign = 'left';
    g.fillStyle = k.ink; g.font = '600 32px ' + k.body;
    g.fillText(fit(g, l.name, inner - rw - 24), x, y - 8);
  }
  if (hidden > 0) {
    y += 52; g.fillStyle = k.muted; g.font = '600 26px ' + k.body;
    g.fillText('+ ' + hidden + ' more', x, y - 8);
  }

  // Badges, then a footer line, pinned to the bottom of the card.
  let by = cy + ch - 48 - (card.foot ? 56 : 0);
  if (card.badges.length) {
    g.font = '700 26px ' + k.body;
    let bx = x;
    const top = by - 62;
    for (const b of card.badges) {
      const w = Math.min(g.measureText(b).width + 40, right - bx);
      if (w < 120) break;
      roundRect(g, bx, top, w, 54, 27); g.fillStyle = k.goldSoft; g.fill();
      g.fillStyle = k.gold; g.fillText(fit(g, b, w - 40), bx + 20, top + 36);
      bx += w + 12;
    }
  }
  if (card.foot) {
    by = cy + ch - 48;
    g.fillStyle = k.muted; g.font = '500 26px ' + k.body;
    g.fillText(fit(g, card.foot, inner), x, by);
  }
  return c;
}

// Hand the picture to the phone's share sheet, or save it where sharing files isn't supported.
export async function shareCard(card, filename) {
  const canvas = await drawShareCard(card);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Could not make the picture.');
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: card.title }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'saved';
}
