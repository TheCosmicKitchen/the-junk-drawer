// Reads recipes out of whatever someone has: typed or pasted text, Markdown, a family file,
// or the schema.org Recipe data that recipe websites carry. One parser for every way in, so
// whatever produces the input (a paste, a file, a bookmarklet, a transcription) only has to
// hand over text or JSON.
//
//   RecipeParse.parse(input) -> [{ recipe, warnings, source }]
//     recipe    a family-file recipe: { id, title, from, serves, unit, time, video, tags,
//               intro, ingredients, steps, notes } (only the fields it found)
//     warnings  things a person should look at ("no steps found")
//     source    the slice of text the recipe came from (for fixing and re-reading)
//
// Needs RecipeCore (core.js) for reading ingredient amounts. Works in Node for the tests.
(function (root) {
  'use strict';
  const core = () => root.RecipeCore;

  const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  // ---------------------------------------------------------------------------
  // Lines and headings
  // ---------------------------------------------------------------------------
  const BULLET = /^\s*(?:[-*•▢☐□◦‣·+]|\[\s?\]|\d+[.)](?=\s)|step\s*\d+\s*[:.)-]?)\s*/i;
  const NUMBERED = /^\s*(?:\d+[.)]|step\s*\d+\s*[:.)-]?)\s+/i;
  const clean = l => l.replace(/ /g, ' ').replace(/^#{1,6}\s+/, '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  const H = {
    ing: /^(?:the\s+)?(?:ingredients?|you(?:'|’| wi)ll need|what you(?:'|’| wi)ll need|shopping list)\b/i,
    method: /^(?:method|directions?|instructions?|preparation|prep(?:aration)? steps|steps|how to make(?: it| them)?|to make)\b/i,
    notes: /^(?:notes?|tips?|cook(?:'|’)?s notes?|variations?|storage|to store|make ahead)\b/i,
  };
  // A heading line: one of the words above, short, maybe with a colon, maybe a Markdown heading.
  function headingKind(raw) {
    const l = clean(raw);
    if (l.length > 45) return null;
    for (const k of ['ing', 'method', 'notes']) {
      if (H[k].test(l) && (/:$/.test(l) || /^#/.test(raw.trim()) || l.split(' ').length <= 5) && !/[.!?]$/.test(l)) return k;
    }
    return null;
  }
  // Clutter copied along with a recipe from a website.
  const JUNK = /^(?:print(?: recipe)?|pin(?: recipe)?|save(?: recipe)?|jump to recipe|rate (?:this )?recipe|share|email|\d(?:\s*x)?(?:\s+\d\s*x)+|1x|us customary|metric|us customary\s+metric|cook mode.*|prevent (?:your )?screen from going dark|equipment|servings?\s*$|scale|\d+(?:\.\d+)? (?:from \d+ )?(?:votes?|reviews?|ratings?)|(?:★|☆){2,}.*)$/i;
  const NUTRITION = /^nutrition(?:al)?(?: facts| information| info)?(?:\s*\(.*\))?\s*:?$/i;
  // "Notes: freezes well" on one line
  const inlineNotes = l => { const m = /^(?:notes?|tips?|cook(?:'|’)?s notes?)\s*[:\-–]\s*(\S.*)$/i.exec(clean(l)); return m ? m[1] : null; };
  // A line that could be a recipe's title: short, no sentence ending, not a list item or heading.
  const titleLike = raw => {
    const l = clean(raw);
    return l.length >= 2 && l.length <= 80 && !/[.!?:;,]$/.test(l) && !NUMBERED.test(raw) && !/^\s*[-*•▢☐□◦‣·+]/.test(raw) &&
      !headingKind(raw) && !/^\d/.test(l) && !/^(?:serves|makes|yield|prep|cook|total|time|from|by|tags?)\b/i.test(l);
  };
  const isBlank = l => !l.trim();

  // ---------------------------------------------------------------------------
  // Splitting a pasted pile into recipes
  // ---------------------------------------------------------------------------
  const SEP = /^\s*(?:-{3,}|\*{3,}|_{3,}|={3,}|~{3,}|\f)\s*$/;
  function split(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    // 1. Explicit separators (---, ***, ===) or Markdown "# Title" headings win.
    if (lines.some(l => SEP.test(l))) return chunks(lines, i => SEP.test(lines[i]), true);
    const h1 = lines.map((l, i) => /^#\s+\S/.test(l) ? i : -1).filter(i => i >= 0);
    if (h1.length > 1) return chunks(lines, i => h1.includes(i) && i > 0, false);
    // 2. Otherwise each "Ingredients" heading after the first starts a new recipe, which begins
    //    at the nearest title-looking paragraph above it (skipping an intro paragraph or two).
    const heads = lines.map((l, i) => headingKind(l) === 'ing' ? i : -1).filter(i => i >= 0);
    if (heads.length < 2) return [lines.join('\n')];
    const starts = [0];
    for (let h = 1; h < heads.length; h++) {
      const floor = heads[h - 1] + 1;
      let start = paraStart(lines, heads[h], floor);
      // the heading opens its own paragraph: look back up to 3 paragraphs for the title
      let at = start, tries = 0;
      while (!titleLike(lines[at] || '') && tries < 3 && at > floor) {
        let j = at - 1;
        while (j > floor && isBlank(lines[j])) j--;
        at = paraStart(lines, j, floor); tries++;
      }
      if (titleLike(lines[at] || '')) start = at;
      if (start > starts[starts.length - 1]) starts.push(start);
    }
    return starts.map((s, i) => lines.slice(s, starts[i + 1]).join('\n'));
  }
  function paraStart(lines, i, floor) {
    while (i > floor && !isBlank(lines[i - 1])) i--;
    return i;
  }
  function chunks(lines, isBreak, dropBreak) {
    const out = []; let cur = [];
    lines.forEach((l, i) => {
      if (isBreak(i)) { out.push(cur.join('\n')); cur = dropBreak ? [] : [l]; }
      else cur.push(l);
    });
    out.push(cur.join('\n'));
    return out.filter(c => c.trim());
  }

  // ---------------------------------------------------------------------------
  // Reading one recipe's text
  // ---------------------------------------------------------------------------
  const DOZEN = /(\d+(?:\.\d+)?|a|one|two|three|four)\s+dozen/i;
  const WORDN = { a: 1, one: 1, two: 2, three: 3, four: 4 };
  function readYield(s, r) {
    s = s.replace(/^(?:serves|servings|makes|yields?|portions)\s*[:\-–]?\s*/i, '').replace(/^(?:about|approx\.?|approximately|around|up to)\s+/i, '');
    const dz = DOZEN.exec(s);
    if (dz) { r.serves = Math.round((WORDN[dz[1].toLowerCase()] || Number(dz[1])) * 12); const rest = s.slice(dz.index + dz[0].length).trim().replace(/^of\s+/i, ''); if (rest) r.unit = rest.split(/[,(]/)[0].trim(); return true; }
    const m = /^(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(.*)$/.exec(s);
    if (!m) return false;
    r.serves = Number(m[2] || m[1]);
    const unit = m[3].replace(/^(?:people|persons|servings?|portions?)\b.*/i, '').split(/[,(;]/)[0].trim();
    if (unit && unit.length <= 40) r.unit = unit;
    return r.serves > 0;
  }
  function readMeta(part, r) {
    const p = part.trim();
    let m;
    if ((m = /^(?:from|by|source|author|recipe (?:from|by)|courtesy of)\s*[:\-–]?\s+(.+)$/i.exec(p))) { r.from = m[1].trim(); return true; }
    if (/^(?:calories|keyword|diet)\s*:/i.test(p)) return true;   // read and dropped
    if (/^(?:serves|servings|makes|yields?|portions)\b/i.test(p)) return readYield(p, r);
    if ((m = /^(?:total time|time|takes|ready in|active time)\s*[:\-–]?\s*(.+)$/i.exec(p))) { r.time = m[1].trim(); return true; }
    // a bare duration in a meta line: "45 minutes", "1½ hours, plus chilling"
    if (/^(?:about\s+|under\s+)?[\d½¼¾⅓][\d½¼¾⅓ ./-]*\s*(?:hours?|hrs?|minutes?|mins?)\b/i.test(p) && p.length <= 60) { r.time = p; return true; }
    if ((m = /^(prep(?:aration)?|cook(?:ing)?|bake|baking|chill(?:ing)?|rest(?:ing)?)\s*(?:time)?\s*[:\-–]\s*(.+)$/i.exec(p))) {
      r._times = (r._times || []).concat(m[1].toLowerCase().replace(/aration|ing$/, '').replace(/^bak$/, 'bake') + ' ' + m[2].trim()); return true;
    }
    if ((m = /^(?:tags?|categor(?:y|ies)|keywords|course|cuisine)\s*[:\-–]\s*(.+)$/i.exec(p))) {
      r.tags = (r.tags || []).concat(m[1].split(/[,;#]/).map(t => t.trim().toLowerCase()).filter(Boolean)); return true;
    }
    if ((m = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+)/i.exec(p))) { r.video = m[1].replace(/[)\].,]+$/, ''); return true; }
    return false;
  }
  // Ingredient group headings inside the list: "For the glaze:", "FILLING", "## Dough"
  function groupName(raw, l) {
    if (/\d/.test(l) || l.length > 40) return null;
    const caps = l === l.toUpperCase() && /[A-Z]{3}/.test(l);
    const name = (caps ? l[0] + l.slice(1).toLowerCase() : l).replace(/:$/, '').trim();
    if (/:$/.test(l) || /^#{2,}\s/.test(raw.trim())) return name;
    if (/^for (?:the )?\w/i.test(l) && l.split(' ').length <= 5) return name;
    if (caps && l.split(' ').length <= 4) return name;
    return null;
  }

  function parseText(chunk) {
    const lines = chunk.replace(/\r\n?/g, '\n').split('\n');
    const r = {}, warnings = [];
    let section = 'head', head = [], ing = [], steps = [], notes = [], sawHeading = false;
    for (const raw of lines) {
      if (isBlank(raw)) { if (section === 'method' || section === 'notes') (section === 'method' ? steps : notes).push(''); continue; }
      if (JUNK.test(clean(raw))) continue;
      if (NUTRITION.test(clean(raw))) { section = 'skip'; continue; }   // nutrition panels: leave them out
      if (section === 'skip') { if (!headingKind(raw)) continue; }
      const kind = headingKind(raw);
      if (kind) { section = kind; sawHeading = true; continue; }
      const n = inlineNotes(raw);
      if (n != null) { notes.push(n); section = 'notes'; continue; }
      if (section === 'head') head.push(raw);
      else if (section === 'ing') ing.push(raw);
      else if (section === 'method') steps.push(raw);
      else notes.push(raw);
    }
    // Header: the title, then meta lines ("Makes 24 · 30 minutes", "From Gran"), then an intro.
    head = head.filter(l => !isBlank(l));
    if (head.length) r.title = clean(head.shift()).replace(/^title\s*[:\-–]\s*/i, '');
    const intro = [];
    for (const raw of head) {
      const parts = clean(raw).split(/\s+[·|•]\s+|\s{2,}/);
      const leftovers = parts.filter(p => !readMeta(p, r));
      if (leftovers.length === parts.length) intro.push(clean(raw));
      else if (leftovers.length) intro.push(leftovers.join(' · '));
    }
    // No section headings at all: guess. Lines with an amount up front (or short lines before
    // any sentence) are ingredients; the rest are steps.
    if (!sawHeading && intro.length) {
      let inSteps = false;
      for (const l of intro.splice(0)) {
        const p = core().parseIng(l.replace(BULLET, ''));
        const looksIng = !inSteps && (p.q1 != null ? l.length < 120 : (l.length < 50 && !/[.!?]$/.test(l)));
        if (looksIng) ing.push(l); else { inSteps = true; steps.push(l); }
      }
      if (ing.length || steps.length) warnings.push('No “Ingredients” or “Method” headings, so these were guessed. Check where the list ends.');
    }
    if (intro.length) r.intro = intro.join(' ');
    if (r._times && !r.time) r.time = r._times.join(', ');
    delete r._times;

    // Ingredients, with groups
    const groups = [{ name: '', items: [] }];
    for (const raw of ing) {
      const l = clean(raw.replace(BULLET, ''));
      if (!l) continue;
      const g = groupName(raw, l);
      if (g) { if (groups[groups.length - 1].items.length || groups[groups.length - 1].name) groups.push({ name: g, items: [] }); else groups[groups.length - 1].name = g; continue; }
      groups[groups.length - 1].items.push(l);
    }
    const filled = groups.filter(g => g.items.length);
    if (filled.length === 1 && !filled[0].name) r.ingredients = filled[0].items;
    else if (filled.length) { r.ingredients = {}; filled.forEach((g, i) => { let k = g.name || (i === 0 ? 'Ingredients' : 'More'); while (r.ingredients[k]) k += ' (2)'; r.ingredients[k] = g.items; }); }

    // Steps: numbered lines start a step; a wrapped line (no sentence end before it, lower-case
    // start) joins the one above; otherwise each line or paragraph is a step.
    const numbered = steps.some(l => NUMBERED.test(l));
    const out = [];
    for (const raw of steps) {
      if (isBlank(raw)) continue;
      const isNew = NUMBERED.test(raw) || /^\s*[-*•]\s/.test(raw);
      const l = clean(raw.replace(BULLET, ''));
      if (!l) continue;
      const prev = out[out.length - 1];
      // in a numbered list, anything un-numbered belongs to the step above
      const join = prev != null && !isNew && (numbered || (!/[.!?)]$/.test(prev) && /^[a-z(]/.test(l)));
      if (join) out[out.length - 1] = prev + ' ' + l; else out.push(l);
    }
    if (out.length) r.steps = out;
    const nt = notes.map(clean).filter(Boolean).join(' ');
    if (nt) r.notes = nt;

    return finish(r, warnings, chunk);
  }

  // ---------------------------------------------------------------------------
  // JSON: family files, recipe lists, and schema.org Recipe (what recipe sites embed)
  // ---------------------------------------------------------------------------
  const decode = s => String(s == null ? '' : s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
  function isoDuration(s) {
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/i.exec(String(s || ''));
    if (!m || !(m[1] || m[2] || m[3])) return '';
    let h = (+m[1] || 0) * 24 + (+m[2] || 0), min = +m[3] || 0;
    h += Math.floor(min / 60); min %= 60;
    return [h && h + ' hour' + (h === 1 ? '' : 's'), min && min + ' minute' + (min === 1 ? '' : 's')].filter(Boolean).join(' ');
  }
  const asList = v => v == null ? [] : Array.isArray(v) ? v : [v];
  const typeIs = (o, t) => o && asList(o['@type']).some(x => String(x).toLowerCase() === t);
  function findSchemaRecipes(v, out) {
    if (!v || typeof v !== 'object') return out;
    if (Array.isArray(v)) { v.forEach(x => findSchemaRecipes(x, out)); return out; }
    if (typeIs(v, 'recipe')) out.push(v);
    else if (v['@graph']) findSchemaRecipes(v['@graph'], out);
    return out;
  }
  function fromSchema(o) {
    const r = { title: decode(o.name) }, warnings = [];
    const author = asList(o.author)[0];
    if (author) r.from = decode(typeof author === 'string' ? author : author.name);
    const y = asList(o.recipeYield).map(String).sort((a, b) => b.length - a.length)[0];
    if (y) readYield(/^\d/.test(y) ? y : 'makes ' + y, r);
    const t = isoDuration(o.totalTime) || [o.prepTime && 'prep ' + isoDuration(o.prepTime), o.cookTime && 'cook ' + isoDuration(o.cookTime)].filter(Boolean).join(', ');
    if (t) r.time = t;
    const vid = asList(o.video)[0];
    const vurl = vid && (vid.embedUrl || vid.contentUrl || vid.url);
    if (vurl && core().youtube(vurl)) r.video = vurl;
    const tags = [].concat(...asList(o.keywords).map(k => String(k).split(',')), asList(o.recipeCategory), asList(o.recipeCuisine))
      .map(x => decode(x).toLowerCase()).filter(x => x && x.length <= 30);
    if (tags.length) r.tags = tags;
    if (o.description) r.intro = decode(o.description);
    const ings = asList(o.recipeIngredient || o.ingredients).map(decode).filter(Boolean);
    if (ings.length) r.ingredients = ings;
    const steps = [];   // sections (HowToSection) are flattened into one list
    (function walk(v) {
      for (const s of asList(v)) {
        if (typeof s === 'string') String(s).split(/\n+|<br\s*\/?>|<\/p>|<\/li>/i).map(decode).forEach(x => x && steps.push(x));
        else if (typeIs(s, 'howtosection')) walk(s.itemListElement);
        else if (s && (s.text || s.name)) steps.push(decode(s.text || s.name));
      }
    })(o.recipeInstructions);
    if (steps.length) r.steps = steps;
    return finish(r, warnings, JSON.stringify(o, null, 2));
  }
  function fromJSON(data) {
    const schema = findSchemaRecipes(data, []);
    if (schema.length) return schema.map(fromSchema);
    let list = Array.isArray(data) ? data : data && Array.isArray(data.recipes) ? data.recipes : data && data.title ? [data] : null;
    if (!list) return [];
    return list.filter(x => x && typeof x === 'object').map(x => {
      const r = Object.assign({}, x);
      return finish(r, [], JSON.stringify(x, null, 2));
    });
  }

  // ---------------------------------------------------------------------------
  // Tidying, limits and warnings (the database's limits, so nothing fails on save)
  // ---------------------------------------------------------------------------
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  function finish(r, warnings, source) {
    const out = {};
    out.title = cut(String(r.title || '').trim(), 120);
    out.id = slug(r.id || out.title) || '';
    for (const k of ['from', 'unit', 'time']) if (r[k]) out[k] = cut(String(r[k]).trim(), 80);
    if (r.serves > 0 && r.serves <= 1000) out.serves = Math.round(r.serves);
    if (r.video && core().youtube(r.video)) out.video = r.video;
    else if (r.video) warnings.push('The video isn’t a YouTube link, so it was left out.');
    const tags = [...new Set(asList(r.tags).map(t => String(t).trim().toLowerCase()).filter(t => t && t.length <= 30))].slice(0, 12);
    if (tags.length) out.tags = tags;
    if (r.intro) out.intro = cut(String(r.intro), 3000);
    if (r.ingredients) {
      let ing = r.ingredients;
      const fix = list => asList(list).map(x => cut(String(x).trim(), 200)).filter(Boolean).slice(0, 100);
      if (Array.isArray(ing)) ing = fix(ing);
      else { const o = {}; Object.entries(ing).slice(0, 20).forEach(([k, v]) => { const f = fix(v); if (f.length) o[cut(k, 60)] = f; }); ing = o; }
      out.ingredients = ing;
    }
    if (r.steps) out.steps = asList(r.steps).map(x => cut(String(x).trim(), 2000)).filter(Boolean).slice(0, 60);
    if (r.notes) out.notes = cut(String(r.notes), 3000);

    if (!out.title) warnings.push('No title found.');
    const flat = core().flatIngredients(out);
    if (!flat.length) warnings.push('No ingredients found.');
    else {
      const loose = flat.filter(l => core().parseIng(l).q1 == null).length;
      if (loose > flat.length / 2 && flat.length > 2) warnings.push(loose + ' of ' + flat.length + ' ingredients have no amount. Is the list really ingredients?');
    }
    if (!out.steps || !out.steps.length) warnings.push('No steps found.');
    return { recipe: out, warnings, source };
  }

  // ---------------------------------------------------------------------------
  // The one way in
  // ---------------------------------------------------------------------------
  function parse(input) {
    if (input && typeof input === 'object') return fromJSON(input);
    const text = String(input || '').trim();
    if (!text) return [];
    if (/^[[{]/.test(text)) {
      try { return fromJSON(JSON.parse(text)); } catch (e) { /* not JSON after all: read it as text */ }
    }
    // HTML with schema.org data in it (a saved recipe web page)
    if (/<script[^>]+application\/ld\+json/i.test(text)) {
      const found = [];
      text.replace(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, (m, j) => { try { found.push(...fromJSON(JSON.parse(j))); } catch (e) {} return m; });
      if (found.length) return found;
    }
    return split(text).map(parseText).filter(x => x.recipe.title || core().flatIngredients(x.recipe).length);
  }

  root.RecipeParse = { parse, parseText, split, fromJSON, slug, isoDuration };
})(typeof window !== 'undefined' ? window : globalThis);
