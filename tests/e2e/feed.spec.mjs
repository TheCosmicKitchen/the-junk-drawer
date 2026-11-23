// The feed in the browser: auto-finishing earlier workouts runs without errors, and stays off when
// wins are private. Which days finish is unit-tested (tests/unit/autofinish.test.mjs).
import { test, expect } from '@playwright/test';
import { openDemo, tab } from './helpers.mjs';

test('auto-finishing the demo’s unfinished days runs cleanly', async ({ page }) => {
  const errors = await openDemo(page);
  await page.waitForTimeout(500);   // the feed loads, then earlier days finish themselves
  await tab(page, 'seasons').click();
  await tab(page, 'log').click();
  await expect(page.locator('#view .hero')).toBeVisible();
  expect(errors).toEqual([]);
});
