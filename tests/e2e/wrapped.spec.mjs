// A finished season's Wrapped: everyone's numbers, and yours: favourite lifts, the ones new to you,
// and your PRs, worked out from your own sets (so they show even when your wins aren't shared).
import { test, expect } from '@playwright/test';
import { openDemo, tab } from './helpers.mjs';

test('Wrapped shows your favourites, new lifts and PRs, one line per lift', async ({ page }) => {
  const errors = await openDemo(page);
  await tab(page, 'seasons').click();
  await page.locator('#view [data-season="s-oct"]').click();
  await page.locator('#view [data-wrapped]').click();
  await expect(page.locator('#view .wr-title')).toHaveText('That’s the season.');

  const faves = page.locator('#view .wr-faves li');
  await expect(faves).toHaveCount(3);
  await expect(faves.first()).toContainText(/\d+ sets/);
  await expect(page.locator('#view .wr-new')).toContainText('New to you');

  const prs = page.locator('#view .wr-myprs');
  await expect(prs).toContainText(/new bests this season, on \d+ lifts?/);
  const names = await prs.locator('li span').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length);   // one line per lift
  // Your card's "new bests" matches, though the demo's wins aren't in the feed.
  const count = (await prs.locator('.wr-big').textContent()).trim();
  await expect(page.locator('#view .wr-people')).toContainText(count + 'new bests');
  expect(errors).toEqual([]);
});
