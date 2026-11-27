// Your Year: a level for the calendar year at the top of Seasons, the year's seasons as chapters,
// and Year Wrapped for the year just gone from January 1st.
import { test, expect } from '@playwright/test';
import { openDemo, tab } from './helpers.mjs';

test('Seasons opens with your year: a level, points to the next, and a finished season as a chapter', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00'));   // mid-year, so every demo season falls inside it
  const errors = await openDemo(page);
  await tab(page, 'seasons').click();
  const card = page.locator('#view .year-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.yc-kicker')).toHaveText('Your year · 2026');
  await expect(card.locator('.yc-level')).toContainText(/Level \d+/);
  await expect(card.locator('.yc-next')).toContainText(/\d+ points to Level \d+/);
  await expect(card).toContainText('week streak');
  // The October block ended: it's a chapter, and tapping it opens its Wrapped.
  const oct = page.locator('#view .yc-chapters li.done', { hasText: 'October block' });
  await expect(oct).toContainText(/Finished · \d+ gym days/);
  await expect(page.locator('#view .yc-chapters li.live', { hasText: 'Fall block' })).toBeVisible();
  await oct.locator('button').click();
  await expect(page.locator('#view .wr-title')).toHaveText('That’s the season.');
  expect(errors).toEqual([]);
});

test('the level names follow the theme', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-15T12:00:00'));
  const errors = await openDemo(page, { prefs: { themeHint: 1, theme: 'arcade' } });
  await tab(page, 'seasons').click();
  await expect(page.locator('#view .yc-level')).toContainText(/LVL \d+ (Noob|Rookie|Player|Challenger)/);
  expect(errors).toEqual([]);
});

test('in January, last year is a badge and its Wrapped is ready; this year starts again', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-01-08T12:00:00'));   // the demo's weeks of lifting are mostly in December
  const errors = await openDemo(page);
  await tab(page, 'seasons').click();
  const card = page.locator('#view .year-card');
  await expect(card.locator('.yc-kicker')).toHaveText('Your year · 2027');
  const badge = card.locator('.yc-badge', { hasText: /^2026 · Level \d+$/ });
  await expect(badge).toBeVisible();
  const last = Number((await badge.textContent()).match(/Level (\d+)/)[1]);
  const now = Number((await card.locator('.yc-level').textContent()).match(/Level (\d+)/)[1]);
  expect(now).toBeLessThan(last);
  await card.locator('.yc-wrapped').click();
  await expect(page.locator('#view .wr-title')).toHaveText('That’s the year.');
  await expect(page.locator('#view .wr-kicker')).toHaveText('Your year · 2026');
  await expect(page.locator('#view .wr-hero small')).toHaveText('Level ' + last);
  await page.locator('#view [data-year-back]').click();
  await expect(page.locator('#view .year-card')).toBeVisible();
  expect(errors).toEqual([]);
});
