// Goals: a lift goal picks its exercise from a searchable list (the browser's own suggestion list
// never showed up on phones).
import { test, expect } from '@playwright/test';
import { openDemo, tab } from './helpers.mjs';

// Your goals open from the "Your week" card on Routines (its Edit / + Plan it button). Wait for that
// card itself: a tab draws a moment after its click, so checking #view straight away can find the
// previous tab's button and click it just as it's replaced (flaky on CI's slower machines).
async function openGoals(page) {
  await tab(page, 'routines').click();
  await expect(page).toHaveURL(/#routines$/);
  await page.locator('#view .week-home [data-core-edit]').click();
  await expect(page.locator('#gMetric')).toBeVisible();
}

test('a lift goal: search, tap the exercise, add it', async ({ page }) => {
  const errors = await openDemo(page);
  await openGoals(page);
  await page.locator('#gMetric').selectOption('lift:lb');

  // Recent lifts show before typing anything.
  const results = page.locator('#gExRes [data-gex]');
  await expect(results.first()).toBeVisible();

  await page.locator('#gEx').fill('bench');
  await expect(results.first()).toContainText('Bench Press');
  await results.filter({ hasText: /^Bench Press/ }).first().click();
  await expect(page.locator('#gEx')).toHaveValue('Bench Press');
  await expect(page.locator('#gExRes [data-gex-clear]')).toContainText('Bench Press');

  await page.locator('#gTarget').fill('225');
  await page.locator('#gAdd').click();
  await expect(page.locator('#snGoals')).toContainText('Bench Press 225 lb');
  await expect(page.locator('#snErr')).toHaveText('');
  expect(errors).toEqual([]);
});

test('a lift goal without an exercise says what to do', async ({ page }) => {
  await openDemo(page);
  await openGoals(page);
  await page.locator('#gMetric').selectOption('lift:kg');
  await page.locator('#gEx').fill('zzzz');
  await expect(page.locator('#gExRes')).toContainText('No matches');
  await page.locator('#gTarget').fill('100');
  await page.locator('#gAdd').click();
  await expect(page.locator('#snErr')).toContainText('Tap an exercise');
});
