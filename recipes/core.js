// Shared by the recipe box and the recipe entry page: reading ingredient lines, units and
// conversions, YouTube links, and loading the family files. Both pages load this one file,
// so a recipe is understood the same way when it is typed in and when it is cooked from.
window.RecipeCore = (function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // =====================================================================
  // Quantities: parse "1 1/2", "1½", "2-3", "0.5", work out units, scale
  // =====================================================================
  const UF = { '½': 1/2, '⅓': 1/3, '⅔': 2/3, '¼': 1/4, '¾': 3/4, '⅛': 1/8, '⅜': 3/8, '⅝': 5/8, '⅞': 7/8, '⅕': 1/5 };
  const NUM = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?(?:\\s?[½⅓⅔¼¾⅛⅜⅝⅞⅕])?|[½⅓⅔¼¾⅛⅜⅝⅞⅕])';
  const LEAD = new RegExp('^(' + NUM + ')(?:\\s*(?:-|–|to)\\s*(' + NUM + '))?(?=\\s|$|[a-zA-Z(])');
  function parseNum(s) {
    s = s.trim();
    let v = 0;
    const f = s.match(/[½⅓⅔¼¾⅛⅜⅝⅞⅕]/);
    if (f) { v += UF[f[0]]; s = s.replace(f[0], '').trim(); }
    if (!s) return v;
    for (const p of s.split(/\s+/)) {
      if (p.includes('/')) { const [a, b] = p.split('/').map(Number); v += a / b; }
      else v += Number(p);
    }
    return v;
  }
  const NICE = [[0, ''], [1/8, '⅛'], [1/4, '¼'], [1/3, '⅓'], [3/8, '⅜'], [1/2, '½'], [5/8, '⅝'], [2/3, '⅔'], [3/4, '¾'], [7/8, '⅞'], [1, '']];
  function niceNum(x) {
    if (x >= 20) return String(Math.round(x));
    if (x >= 10) return String(Math.round(x * 2) / 2).replace('.5', '½');
    let whole = Math.floor(x), frac = x - whole, best = NICE[0];
    for (const n of NICE) if (Math.abs(n[0] - frac) < Math.abs(best[0] - frac)) best = n;
    if (best[0] === 1) { whole += 1; best = NICE[0]; }
    if (!whole && !best[1]) return x > 0 ? '⅛' : '0';
    return (whole ? whole : '') + best[1];
  }

  // Units: words get pluralised to match the amount; abbreviations stay as they are.
  // CANON groups spellings so the grocery list can add "1 cup" and "2 cups" together.
  const WORDS = { cup: 'cups', tablespoon: 'tablespoons', teaspoon: 'teaspoons', pound: 'pounds', ounce: 'ounces', clove: 'cloves',
    can: 'cans', pinch: 'pinches', stick: 'sticks', slice: 'slices', quart: 'quarts', pint: 'pints', gallon: 'gallons', liter: 'liters',
    litre: 'litres', bunch: 'bunches', head: 'heads', sprig: 'sprigs', package: 'packages', jar: 'jars', handful: 'handfuls',
    dash: 'dashes', piece: 'pieces', bag: 'bags', box: 'boxes', bottle: 'bottles', sheet: 'sheets', envelope: 'envelopes',
    gram: 'grams', kilogram: 'kilograms', milliliter: 'milliliters', millilitre: 'millilitres' };
  const PLURAL_TO_WORD = Object.fromEntries(Object.entries(WORDS).map(([s, p]) => [p, s]));
  const ABBR = { tbsp: 'tbsp', tbs: 'tbsp', tsp: 'tsp', lb: 'lb', lbs: 'lb', oz: 'oz', g: 'g', kg: 'kg', ml: 'ml', l: 'l', qt: 'qt', pt: 'pt', gal: 'gal', floz: 'floz' };
  const CANON = { tablespoon: 'tbsp', teaspoon: 'tsp', pound: 'lb', ounce: 'oz', quart: 'qt', pint: 'pt', liter: 'l', litre: 'l',
    gallon: 'gal', gram: 'g', kilogram: 'kg', milliliter: 'ml', millilitre: 'ml' };

  // ---- conversions ----
  // Exact sizes (US customary), in millilitres and grams.
  const ML = { tsp: 4.92892, tbsp: 14.7868, cup: 236.588, floz: 29.5735, pt: 473.176, qt: 946.353, gal: 3785.41, stick: 118.294, ml: 1, l: 1000 };
  const G = { oz: 28.3495, lb: 453.592, g: 1, kg: 1000 };
  const METRIC = new Set(['ml', 'l', 'g', 'kg']);
  // Grams per US cup, mostly from King Arthur's ingredient weight chart. This is what lets
  // "1 cup flour" become grams; it's always approximate, so converted amounts are marked.
  // Longest name wins, and 0 means "a liquid, leave it as volume" (so buttermilk isn't butter).
  const DENSITY = Object.entries({
    'flour': 120, 'all-purpose flour': 120, 'bread flour': 120, 'whole wheat flour': 113, 'cake flour': 120, 'almond flour': 96,
    'sugar': 198, 'brown sugar': 213, 'powdered sugar': 113, "confectioners' sugar": 113, 'icing sugar': 113,
    'butter': 227, 'peanut butter': 270, 'buttermilk': 0, 'cocoa': 84, 'oats': 89, 'chocolate chips': 170,
    'honey': 336, 'maple syrup': 312, 'molasses': 337, 'cornstarch': 112, 'rice': 185, 'rice vinegar': 0, 'rice wine': 0,
    'lentils': 192, 'oat milk': 0, 'almond milk': 0, 'coconut milk': 0, 'shredded cheese': 113, 'parmesan': 100,
  }).sort((a, b) => b[0].length - a[0].length);
  function density(name) {
    const n = name.toLowerCase();
    const hit = DENSITY.find(([k]) => n.includes(k));
    return hit ? hit[1] : 0;
  }
  // Which unit reads best for an amount: standard cup sizes, else spoons; metric switches to ml/g
  // but keeps spoons for small amounts, since teaspoons and tablespoons are used everywhere.
  const STD_CUPS = [1/4, 1/3, 1/2, 2/3, 3/4];
  function pickUnit(dim, base, target) {
    if (dim === 'wt') return target === 'metric' ? (base >= 1000 ? 'kg' : 'g') : (base / G.oz >= 16 ? 'lb' : 'oz');
    if (target === 'metric' && base >= 45) return base >= 1000 ? 'l' : 'ml';
    const cups = base / ML.cup;
    if (cups >= 0.75 || STD_CUPS.some(s => Math.abs(cups - s) < 0.02)) return 'cup';
    return base / ML.tbsp >= 0.99 ? 'tbsp' : 'tsp';
  }
  function unitNum(n, unit) {
    if (unit === 'l' || unit === 'kg') return String(Math.round(n * 100) / 100);
    if (unit === 'ml' || unit === 'g') {
      const step = n < 5 ? 0.5 : n < 20 ? 1 : n < 250 ? 5 : 10;
      return String(Math.max(step, Math.round(n / step) * step));
    }
    return niceNum(n);
  }
  const UNIT_NAME = { cup: ['cup', 'cups'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'], oz: ['oz', 'oz'], lb: ['lb', 'lb'],
    g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['L', 'L'] };
  // Re-express an amount (base = ml or g) for a target system. With cross set it may switch
  // between volume and weight using the ingredient's weight per cup.
  function measure(dim, lo, hi, target, name, cross) {
    let approx = false;
    const d = cross ? density(name) : 0;
    const big = hi == null ? lo : hi;
    if (d && target === 'metric' && dim === 'vol' && big >= 29) {        // 2 tbsp and up go to grams
      lo = lo / ML.cup * d; if (hi != null) hi = hi / ML.cup * d; dim = 'wt'; approx = true;
    } else if (d && target === 'us' && dim === 'wt') {
      lo = lo / d * ML.cup; if (hi != null) hi = hi / d * ML.cup; dim = 'vol'; approx = true;
    }
    const top = hi == null ? lo : hi;
    const unit = pickUnit(dim, top, target);
    const per = dim === 'wt' ? G[unit] : ML[unit];
    const a = unitNum(lo / per, unit), b = hi == null ? null : unitNum(hi / per, unit);
    return { text: a + (b != null && b !== a ? '–' + b : '') + ' ' + UNIT_NAME[unit][top / per > 1.01 ? 1 : 0], unit, approx };
  }
  const isMeasure = p => p.info && !p.pre && (ML[p.info.canon] || G[p.info.canon]);
  const sysOf = canon => METRIC.has(canon) ? 'metric' : 'us';

  // Oven temperatures and pan sizes inside steps and notes.
  const f2c = f => Math.round((f - 32) * 5 / 9 / 5) * 5;
  const c2f = c => Math.round((c * 9 / 5 + 32) / 5) * 5;
  const inCm = x => { const c = x * 2.54; return c < 3 ? Math.round(c * 2) / 2 : Math.round(c); };
  const LEN = '(\\d+(?:\\.\\d+)?|\\d*[½¼¾])';
  function convertTextFor(text, units) {
    if (units === 'orig') return text;
    const want = units === 'metric' ? 'C' : 'F';
    // "375°F (190°C)": keep whichever one is wanted
    text = text.replace(/(\d{2,3})\s*°\s*([FC])\s*\(\s*(\d{2,3})\s*°\s*([FC])\s*\)/gi,
      (m, a, ua, b, ub) => ua.toUpperCase() === want ? a + '°' + want : ub.toUpperCase() === want ? b + '°' + want : m);
    text = text.replace(/(\d{2,3})\s*(?:°\s*|degrees\s+)([FC])\b/gi, (m, n, u) =>
      u.toUpperCase() === want ? m : (want === 'C' ? f2c(+n) : c2f(+n)) + '°' + want);
    if (units === 'metric') {
      text = text.replace(new RegExp(LEN + '\\s*[x×]\\s*' + LEN + '(?:\\s*|-)inch(?:es)?\\b', 'gi'), (m, a, b) => inCm(parseNum(a)) + '×' + inCm(parseNum(b)) + ' cm');
      text = text.replace(new RegExp(LEN + '(?:\\s*|-)inch(?:es)?\\b', 'gi'), (m, a) => inCm(parseNum(a)) + ' cm');
    } else {
      text = text.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm\b/gi, (m, a, b) => Math.round(a / 2.54) + '×' + Math.round(b / 2.54) + '-inch');
      text = text.replace(/(\d+(?:\.\d+)?)\s*cm\b/gi, (m, a) => niceNum(Math.round(a / 2.54 * 4) / 4) + '-inch');
    }
    // the number changed, so "an 8-inch pan" may now need to be "a 20 cm pan"
    return text.replace(/\b([Aa])n? (\d+)/g, (m, a, n) => a + (/^(8|11|18|8\d)$/.test(n) || /^8\d\d$/.test(n) ? 'n ' : ' ') + n);
  }
  const SHOW = { cup: ['cup', 'cups'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'], lb: ['lb', 'lb'], oz: ['oz', 'oz'], g: ['g', 'g'], kg: ['kg', 'kg'],
    ml: ['ml', 'ml'], l: ['l', 'l'], qt: ['qt', 'qt'], pt: ['pt', 'pt'] };
  function unitInfo(word) {
    const w = word.toLowerCase();
    if (ABBR[w]) return { canon: ABBR[w], word: null };
    const sing = WORDS[w] ? w : PLURAL_TO_WORD[w];
    if (!sing) return null;
    return { canon: CANON[sing] || sing, word: sing };
  }
  function unitText(raw, info, amount) {
    if (!info.word) return raw;
    const many = amount > 1;
    const out = many ? WORDS[info.word] : info.word;
    return raw[0] === raw[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
  }
  function pluralWord(w) {
    if (/(s|x|ch|sh)$/i.test(w)) return w + 'es';
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies';
    if (/[^aeiou]o$/i.test(w)) return w + 'es';
    return w + 's';
  }
  function singularWord(w) {
    if (/ies$/i.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
    if (/(ches|shes|xes|sses|oes)$/i.test(w)) return w.slice(0, -2);
    if (/[^s]s$/i.test(w) && w.length > 3) return w.slice(0, -1);
    return w;
  }
  // Split "3 1/2 cups flour, sifted" into its parts.
  function parseIng(line) {
    const m = LEAD.exec(line);
    if (!m) return { line, q1: null };
    const q1 = parseNum(m[1]), q2 = m[2] ? parseNum(m[2]) : null;
    let rest = line.slice(m[0].length).replace(/^\s+/, '');
    let unitRaw = '', info = null, pre = '';
    // a size in brackets before the unit belongs with it: "1 (14 oz) can tomatoes"
    const fl = /^(fl\.?\s?oz)\.?(?=\s|$|,)/i.exec(rest);
    const u = /^(\([^)]*\)\s*)?([A-Za-z]+)\.?(?=\s|$|,)/.exec(rest);
    if (fl) { info = { canon: 'floz', word: null }; unitRaw = fl[1]; rest = rest.slice(fl[0].length).replace(/^\s+/, ''); }
    else if (u && (info = unitInfo(u[2]))) { pre = u[1] || ''; unitRaw = u[2]; rest = rest.slice(u[0].length).replace(/^\s+/, ''); }
    return { line, q1, q2, unitRaw, info, pre, name: rest };
  }
  // A noun with no unit ("1½ egg") gets pluralised when there's more than one.
  function countedName(name, amount) {
    if (amount <= 1) return name;
    const m = /^([^,(]*?)([A-Za-z]+)(\b.*)$/.exec(name);
    if (!m || /s$/i.test(m[2])) return name;
    return m[1] + pluralWord(m[2]) + m[3];
  }
  const flatIngredients = r => Array.isArray(r.ingredients) ? r.ingredients : Object.values(r.ingredients || {}).flat();

  // Family files: data/families.json lists them, data/<id>.json holds each one.
  async function loadFamilies(base) {
    base = base || 'data/';
    const list = await fetch(base + 'families.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('families.json: ' + r.status); return r.json(); });
    return Promise.all(list.families.map(id =>
      fetch(base + id + '.json', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(id + '.json: ' + r.status); return r.json(); })
        .then(f => ({ id, name: f.name || id, about: f.about || '', recipes: f.recipes || [], raw: f }))
        .catch(err => { console.error(err); return { id, name: id, about: '', recipes: [], broken: String(err.message || err) }; })
    ));
  }

  // =====================================================================
  // YouTube
  // =====================================================================
  function youtube(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
      id = u.searchParams.get('v');
      const m = /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(u.pathname);
      if (!id && m) id = m[1];
    }
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    let start = 0;
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (t) {
      if (/^\d+$/.test(t)) start = Number(t);
      else { const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(t); start = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); }
    }
    return 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0' + (start ? '&start=' + start : '');
  }

  return { esc, LEAD, parseNum, niceNum, WORDS, unitInfo, unitText, pluralWord, singularWord, parseIng, countedName, ML, G, METRIC, density, pickUnit, unitNum, measure, isMeasure, sysOf, SHOW, flatIngredients, youtube, convertTextFor, loadFamilies };
})();
