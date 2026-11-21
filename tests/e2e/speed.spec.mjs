// Speed budgets, on three years of history (?demo&big=3, about 250 lifts). The work behind each tap
// is measured in the page, so the budgets hold on a slow CI machine as well as a fast laptop; they
// are several times what the app takes today, to catch a regression rather than noise.
import { test, expect } from '@playwright/test';
import { openDemo, tab, timeClick, logBtnSelector } from './helpers.mjs';

test('opening the picker and a lift stays quick with a big history', async ({ page }) => {
  await openDemo(page, { query: 'big=3' });
  const picker = await timeClick(page, await logBtnSelector(page));
  expect(picker, 'picker opens (ms)').toBeLessThan(150);
  const entry = await timeClick(page, '#exResults [data-pick]');
  expect(entry, 'a lift opens (ms)').toBeLessThan(150);
  await expect(page.locator('#lastLine')).toContainText('Last time');
});

test('switching tabs stays quick with a big history', async ({ page }) => {
  await openDemo(page, { query: 'big=3' });
  for (const name of ['routines', 'library', 'history', 'progress', 'log']) {
    const ms = await page.evaluate(n => { const t0 = performance.now(); location.hash = '#' + n; window.dispatchEvent(new HashChangeEvent('hashchange')); return performance.now() - t0; }, name);
    expect(ms, name + ' tab draws (ms)').toBeLessThan(400);
    await expect(tab(page, name)).toBeVisible();
  }
});
