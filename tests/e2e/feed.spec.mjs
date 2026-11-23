// The feed: a workout nobody finished posts itself 12 hours after its last set, and bodyweight PRs
// read as bodyweight.
import { test, expect } from '@playwright/test';
import { openDemo } from './helpers.mjs';

test('yesterday’s unfinished workout finishes itself as a card', async ({ page }) => {
  const errors = await openDemo(page);
  // The demo has sets yesterday and nobody tapped Finish: the feed shows it as a session card.
  const card = page.locator('#winsBox .win-session .ws-card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.ws-foot')).toContainText('finished automatically');
  expect(errors).toEqual([]);
});

test('with wins private, nothing finishes itself', async ({ page }) => {
  await openDemo(page, { prefs: { themeHint: 1, shareWins: false } });
  await page.waitForTimeout(800);
  await expect(page.locator('.ws-foot', { hasText: 'finished automatically' })).toHaveCount(0);
});
