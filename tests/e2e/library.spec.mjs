// The exercise library's data: other names in search, and the week's muscles on Progress.
import { test, expect } from '@playwright/test';
import { openDemo, openPicker, tab } from './helpers.mjs';

test('searching another name for a lift finds ours and says so', async ({ page }) => {
  await openDemo(page);
  await openPicker(page);
  await page.locator('#exSearch').fill('barbell bench press');
  const first = page.locator('#exResults [data-pick]').first();
  await expect(first).toContainText('Bench Press');
  await expect(first.locator('.lib-sub')).toContainText('also called Barbell Bench Press');
  await expect(first.locator('.lib-sub')).toContainText('Chest · Barbell');
  await page.locator('#sheet .sheet-head [data-close]').click();

  await tab(page, 'library').click();
  await page.locator('#libSearch').fill('barbell full squat');
  await expect(page.locator('#libList [data-lib-ex]').first()).toContainText('also called Barbell Full Squat');
});

test('Progress shows the muscles a week hit and missed', async ({ page }) => {
  const errors = await openDemo(page);
  await tab(page, 'progress').click();
  await expect(page.locator('#musclesBox')).toBeVisible();
  // Last week, so it doesn't matter whether anything's been logged yet this week (a Monday).
  await page.locator('#musclesBox [data-mus-week="last"]').click();
  await expect(page.locator('#musclesBox [data-mus-week="last"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#musclesBox .mus-row')).toHaveCount(14);
  await expect(page.locator('#musclesBox .mus-sum')).toContainText(/Missing:|Every muscle hit/);
  expect(errors).toEqual([]);
});

test('filtering the library by muscle uses real data', async ({ page }) => {
  await openDemo(page);
  await tab(page, 'library').click();
  await page.locator('#libFilters [data-lib-mus="posterior"]').click();
  await expect(page.locator('#libList')).toContainText('RDL');   // hamstrings, from its data
});
