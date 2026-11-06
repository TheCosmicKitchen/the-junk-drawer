// Small SVG charts for the lift log: columns, lines, a calendar heatmap and sparklines.
// Colors come from CSS tokens (--s1..--s3 for people/series, --seq-1..--seq-5 for magnitude,
// --grid and --axis for chrome), so light and dark both work. Every chart has a hover/tap layer:
// any element with data-tip shows a tooltip, and line charts get a crosshair per x position.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
// Draw at about the space the chart gets, so its text stays near its real size on phones.
const chartW = () => Math.round(Math.max(320, Math.min(640, (window.innerWidth >= 960 ? 640 : window.innerWidth - 64))));

// Clean ticks: 0 and a few round steps up to (and past) the max.
function ticks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}
export function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return Math.round(n / 1e3) + 'K';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n * 10) / 10);
}
const roundTop = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h);
  return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h) + 'Z';
};

// Columns. data: [{ label, value, tip }]. Optional groups: series = [{ name, values }] for grouped columns.
export function columns({ data, series, height = 170, label = 'Chart', every = 1, fmt = compact }) {
  const W = chartW(), H = height, L = 40, R = 8, T = 10, B = 24;
  const groups = series || [{ name: '', values: data.map(d => d.value) }];
  const n = (series ? series[0].values.length : data.length) || 1;
  const labels = series ? data.map(d => d.label) : data.map(d => d.label);
  every = Math.max(every, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 64))));
  const max = Math.max(0, ...groups.flatMap(g => g.values.map(v => v || 0)));
  const tk = ticks(max), top = tk[tk.length - 1] || 1;
  const band = (W - L - R) / n, gw = Math.min(24 * groups.length + 2 * (groups.length - 1), band * 0.7), bw = (gw - 2 * (groups.length - 1)) / groups.length;
  const y = v => T + (H - T - B) * (1 - v / top);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
  for (const t of tk) s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + fmt(t) + '</text>';
  for (let i = 0; i < n; i++) {
    const x0 = L + band * i + (band - gw) / 2;
    groups.forEach((g, k) => {
      const v = g.values[i] || 0;
      if (v > 0) s += '<path d="' + roundTop(x0 + k * (bw + 2), y(v), bw, H - B - y(v), 4) + '" fill="' + (series ? SERIES[k] : 'var(--s1)') + '"/>';
    });
    if ((i % every === 0 && n - 1 - i >= every * 0.6) || i === n - 1) s += '<text class="tick" x="' + (L + band * i + band / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
    const tip = series ? esc(labels[i]) + '<br>' + groups.map((g, k) => '<i style="background:' + SERIES[k] + '"></i>' + esc(g.name) + ': <b>' + fmt(g.values[i] || 0) + '</b>').join('<br>')
      : (data[i].tip || esc(labels[i]) + ': <b>' + fmt(data[i].value || 0) + '</b>');
    s += '<rect class="hit" x="' + (L + band * i) + '" y="' + T + '" width="' + band + '" height="' + (H - T - B) + '" data-tip="' + esc(tip) + '"/>';
  }
  s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/></svg>';
  return s + (series && series.length > 1 ? legend(series) : '');
}

// Lines. labels: x labels; series: [{ name, values: [number|null] }]. One y axis, always.
export function lines({ labels, series, height = 190, label = 'Chart', every = 1, fmt = compact, zero = true, endLabels = true }) {
  const W = chartW(), H = height, L = 40, R = endLabels ? 78 : 10, T = 12, B = 24;
  const n = labels.length || 1;
  every = Math.max(every, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 70))));
  const all = series.flatMap(s => s.values.filter(v => v != null));
  const maxV = Math.max(...all, 0), minV = zero ? 0 : Math.min(...all);
  let lo = 0, tk;
  if (zero) tk = ticks(maxV);
  else {   // a window around the data, starting and stepping on round numbers
    const span = Math.max(1, maxV - minV), t0 = ticks(span * 1.3), step = t0[1] - t0[0];
    lo = Math.floor((minV - span * 0.1) / step) * step; tk = [];
    for (let v = lo; v < maxV + step; v += step) tk.push(v);
  }
  const hi = Math.max(tk[tk.length - 1], lo + 1);
  const x = i => L + (n === 1 ? (W - L - R) / 2 : (W - L - R) * i / (n - 1));
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
  for (const t of tk) s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + fmt(t) + '</text>';
  labels.forEach((lb, i) => { if ((i % every === 0 && n - 1 - i >= every * 0.6) || i === n - 1) s += '<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '">' + esc(lb) + '</text>'; });
  s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
  series.forEach((sr, k) => {
    const pts = sr.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
    let d = '', pen = false;
    for (const p of pts) { if (!p) { pen = false; continue; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); pen = true; }
    const c = sr.color || SERIES[k];
    if (series.length === 1 && zero) {
      const first = pts.findIndex(Boolean), last = pts.length - 1 - [...pts].reverse().findIndex(Boolean);
      if (first >= 0) s += '<path d="' + d + 'L' + pts[last][0].toFixed(1) + ' ' + y(lo) + 'L' + pts[first][0].toFixed(1) + ' ' + y(lo) + 'Z" fill="' + c + '" opacity=".1"/>';
    }
    s += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    const lastI = sr.values.length - 1 - [...sr.values].reverse().findIndex(v => v != null);
    if (lastI >= 0 && lastI < sr.values.length) {
      s += '<circle cx="' + x(lastI) + '" cy="' + y(sr.values[lastI]) + '" r="4.5" fill="' + c + '" stroke="var(--card)" stroke-width="2"/>';
      if (endLabels) s += '<text class="endlab" x="' + (x(lastI) + 9) + '" y="' + (y(sr.values[lastI]) + 4) + '">' + esc(fmt(sr.values[lastI])) + '</text>';
    }
  });
  for (let i = 0; i < n; i++) {
    const tip = esc(labels[i]) + '<br>' + series.map((sr, k) => (series.length > 1 ? '<i style="background:' + (sr.color || SERIES[k]) + '"></i>' + esc(sr.name) + ': ' : '') + '<b>' + (sr.values[i] == null ? '–' : fmt(sr.values[i])) + '</b>').join('<br>');
    const w = (W - L - R) / Math.max(1, n - 1);
    s += '<g class="hx"><line class="cross" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + T + '" y2="' + (H - B) + '"/>' +
      '<rect class="hit" x="' + (x(i) - w / 2) + '" y="' + T + '" width="' + w + '" height="' + (H - T - B) + '" data-tip="' + esc(tip) + '"/></g>';
  }
  return s + '</svg>' + (series.length > 1 ? legend(series) : '');
}

export function legend(series) {
  return '<div class="legend">' + series.map((s, k) => '<span><i style="background:' + (s.color || SERIES[k]) + '"></i>' + esc(s.name) + '</span>').join('') + '</div>';
}

// Calendar heatmap: one column per week (Sunday on top), shaded by a single-hue ramp.
export function heatmap({ values, end, weeks = 26, label = 'Training calendar', fmt = compact, unit = 'lb' }) {
  const endD = new Date(end + 'T12:00:00'), start = new Date(endD);
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
  const vals = [...values.values()].filter(v => v > 0).sort((a, b) => a - b);
  const q = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const step = v => (!(v > 0) ? 0 : v <= cuts[0] ? 2 : v <= cuts[1] ? 3 : v <= cuts[2] ? 4 : 5);
  const C = 13, G = 3, Lp = 26, Tp = 16;
  const W = Lp + weeks * (C + G), H = Tp + 7 * (C + G);
  let s = '<svg class="chart heat" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
  ['M', 'W', 'F'].forEach((d, i) => { s += '<text class="tick" x="0" y="' + (Tp + (1 + i * 2) * (C + G) + C - 2) + '">' + d + '</text>'; });
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
      if (dt > endD) continue;
      const iso = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      if (d === 0 && dt.getMonth() !== lastMonth) { lastMonth = dt.getMonth(); s += '<text class="tick" x="' + (Lp + w * (C + G)) + '" y="10">' + dt.toLocaleDateString('en-US', { month: 'short' }) + '</text>'; }
      const v = values.get(iso) || 0, st = step(v);
      s += '<rect x="' + (Lp + w * (C + G)) + '" y="' + (Tp + d * (C + G)) + '" width="' + C + '" height="' + C + '" rx="3" fill="' + (st ? 'var(--seq-' + st + ')' : 'var(--chip)') + '" data-tip="' +
        esc(dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (v > 0 ? ': <b>' + fmt(v) + ' ' + unit + '</b>' : ': rest')) + '"/>';
    }
  }
  return s + '</svg><div class="legend scale"><span>Less</span>' + [0, 2, 3, 4, 5].map(k => '<i style="background:' + (k ? 'var(--seq-' + k + ')' : 'var(--chip)') + '"></i>').join('') + '<span>More</span></div>';
}

export function spark(values, color = 'var(--s1)') {
  const v = values.length ? values : [0], max = Math.max(...v, 1), W = 120, H = 32;
  const pts = v.map((y, i) => (v.length === 1 ? W / 2 : (i * W) / (v.length - 1)).toFixed(1) + ',' + (H - 3 - (y / max) * (H - 6)).toFixed(1));
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

// One tooltip for the whole page. Hover with a mouse, tap on a phone.
let tipEl = null;
function place(e, html) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip-pop'; tipEl.setAttribute('role', 'tooltip'); }
  const host = document.querySelector('dialog[open]') || document.body;
  if (tipEl.parentNode !== host) host.appendChild(tipEl);
  tipEl.innerHTML = html; tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY - r.height - 12;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y < 8) y = e.clientY + 18;
  tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = y + 'px';
}
const hide = () => { if (tipEl) tipEl.hidden = true; };
document.addEventListener('pointermove', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t && e.pointerType === 'mouse') place(e, t.getAttribute('data-tip')); else if (e.pointerType === 'mouse') hide();
});
document.addEventListener('pointerdown', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t && e.pointerType !== 'mouse') place(e, t.getAttribute('data-tip')); else if (e.pointerType !== 'mouse') hide();
});
document.addEventListener('scroll', hide, { passive: true });
