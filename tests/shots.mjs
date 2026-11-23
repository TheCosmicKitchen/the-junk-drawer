// Screenshot baseline of the lift demo: every tab and the main sheets, at phone and desktop sizes,
// light and dark, in three themes. `npm run shots` writes JPEGs to docs/lift-baseline/ so later
// changes can be compared screen by screen. Options:
//   npm run shots -- --only=plain        just one theme (comma-separated list)
//   npm run shots -- --shot=tab-log      just shots whose name contains this
//   npm run shots -- --png           lossless PNG instead of JPEG (bigger; for pixel diffs)
//   PW_CHANNEL=chrome npm run shots      use Chrome instead of Edge (CI-style: PW_CHANNEL=chromium)
// It starts tests/serve.mjs itself unless something already answers on port 8799.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs', 'lift-baseline');
const BASE = 'http://127.0.0.1:8799';
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];

const THEMES = (arg('only') || 'plain,king,arcade').split(',');
const SCHEMES = ['light', 'dark'];
const SIZES = {
  phone: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const LOG_BTN = '#fab:visible, #navLog:visible';
const tab = (page, name) => page.locator('.tabs a[href="#' + name + '"]').first();
// Sheets and full-page sheets (routine editor, plan designer, season page) all live in #sheet.
const sheetOpen = async page => { await page.locator('#sheet[open]').waitFor(); await page.locator('#sheetInner > *').first().waitFor(); };

async function goTab(page, name) {
  await tab(page, name).click();
  await page.waitForURL(new RegExp('#' + name + '$'));
  await page.locator('#view').first().waitFor();
}
async function openPicker(page) {
  await page.locator(LOG_BTN).first().click();
  await page.locator('#exResults li').first().waitFor();
}
async function pickLift(page, q) {
  await openPicker(page);
  await page.locator('#exSearch').fill(q);
  // Search runs 120 ms after typing stops. Let it land before tapping: a pick inside that window
  // makes the late redraw throw, because the picker is gone by then (an app bug, logged for #85).
  await page.waitForTimeout(300);
  await page.locator('#exResults [data-pick]').first().click();
  await page.locator('#lastLine').waitFor();
}

// Each shot starts from a fresh demo on the Log tab. `full` captures the whole scrolling page.
const SHOTS = [
  { name: 'tab-log', full: true, go: async () => {} },
  { name: 'tab-routines', full: true, go: p => goTab(p, 'routines') },
  { name: 'tab-library', go: p => goTab(p, 'library') },
  { name: 'tab-calendar', full: true, go: p => goTab(p, 'history') },
  { name: 'tab-seasons', full: true, go: p => goTab(p, 'seasons') },
  { name: 'tab-progress', full: true, go: p => goTab(p, 'progress') },
  { name: 'sheet-picker', go: p => openPicker(p) },
  { name: 'sheet-logger', go: p => pickLift(p, 'bench press') },
  { name: 'sheet-cardio', go: async p => {
    await openPicker(p);
    await p.locator('[data-pk-kind="c"]').click();
    await p.locator('#exResults [data-cardio-new]').first().click();
    await sheetOpen(p);
  } },
  { name: 'sheet-exercise-info', go: async p => {
    await goTab(p, 'library');
    await p.locator('#libList [data-lib-ex]').first().click();
    await sheetOpen(p);
  } },
  { name: 'sheet-routine-editor', go: async p => {
    await goTab(p, 'routines');
    await p.locator('#view [data-design]').first().click();
    await sheetOpen(p);
  } },
  // Desktop: the plan designer page. Phone: the minimal program designer (same button).
  { name: 'sheet-plan-designer', go: async p => {
    await goTab(p, 'routines');
    const edit = p.locator('#view [data-plan-edit]');
    if (p.viewportSize().width >= 1000 && await edit.count()) await edit.first().click();
    else await p.locator('#view [data-prog-new]').first().click();
    await sheetOpen(p);
  } },
  { name: 'sheet-new', go: async p => {
    await goTab(p, 'routines');
    await p.locator('#view [data-new-any]').first().click();
    await sheetOpen(p);
  } },
  // A season's page draws in place of the Seasons tab, not in a sheet.
  { name: 'page-season', full: true, go: async p => {
    await goTab(p, 'seasons');
    await p.locator('#view [data-season]').first().click();
    await p.locator('#view .band h1').waitFor();
  } },
  { name: 'sheet-season-new', go: async p => {
    await goTab(p, 'routines');
    await p.locator('#view [data-new-any]').first().click();
    await p.locator('#sheet [data-new-kind="season"]').click();
    await sheetOpen(p);
  } },
  { name: 'sheet-settings', go: async p => {
    await p.locator('#menuBtn').click();
    await sheetOpen(p);
  } },
  // Log one set so the Finish button shows, then open the recap.
  { name: 'sheet-recap', go: async p => {
    if (!(await p.locator('#view [data-recap]').count())) {
      await pickLift(p, 'bench press');
      await p.locator('#saveBtn').click();
      await p.locator('#view [data-recap]').first().waitFor();
    }
    await p.locator('#view [data-recap]').first().click();
    await sheetOpen(p);
  } },
];

async function serverUp() {
  try { return (await fetch(BASE + '/lift/')).ok; } catch { return false; }
}
async function startServer() {
  if (await serverUp()) return null;
  const child = spawn(process.execPath, [join(ROOT, 'tests', 'serve.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await serverUp()); i++) await new Promise(r => setTimeout(r, 100));
  return child;
}

const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : process.env.PW_CHANNEL || (process.env.CI ? undefined : 'msedge');
const filter = arg('shot');
const PNG = process.argv.includes('--png');
const server = await startServer();
const browser = await chromium.launch({ channel });
if (!filter && !arg('only')) await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
let made = 0;
const failed = [];

try {
  for (const theme of THEMES) for (const scheme of SCHEMES) for (const [size, dev] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({ ...dev, colorScheme: scheme, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
    await ctx.addInitScript(p => { localStorage.clear(); localStorage.setItem('lift.prefs', p); }, JSON.stringify({ themeHint: 1, theme }));
    for (const shot of SHOTS) {
      if (filter && !shot.name.includes(filter)) continue;
      const file = [theme, scheme, size, shot.name].join('_') + (PNG ? '.png' : '.jpg');
      const page = await ctx.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(BASE + '/lift/?demo');
        await page.locator('#view .hero').waitFor();
        await shot.go(page);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(OUT, file), fullPage: !!shot.full, animations: 'disabled', caret: 'hide', ...(PNG ? {} : { type: 'jpeg', quality: 70 }) });
        made++;
        if (errors.length) failed.push(file + ': page error: ' + errors[0]);
      } catch (e) {
        failed.push(file + ': ' + e.message.split('\n')[0]);
      }
      await page.close();
    }
    await ctx.close();
    process.stdout.write('.');
  }
} finally {
  await browser.close();
  server?.kill();
}
console.log('\n' + made + ' screenshots in ' + OUT);
if (failed.length) { console.error(failed.length + ' failed:\n  ' + failed.join('\n  ')); process.exitCode = 1; }
