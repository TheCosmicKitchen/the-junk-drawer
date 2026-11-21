// Every tab draws, nothing throws, and the first-visit theme note behaves.
import { test, expect } from '@playwright/test';
import { openDemo, tab } from './helpers.mjs';

test('every tab draws without an error', async ({ page }) => {
  const errors = await openDemo(page);
  for (const name of ['routines', 'library', 'history', 'seasons', 'progress', 'log']) {
    await tab(page, name).click();
    await expect(page).toHaveURL(new RegExp('#' + name + '$'));
    await expect(page.locator('#view')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

test('the default look is Plain, named The Church of Iron', async ({ page }) => {
  await openDemo(page);
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'plain');
  await expect(page.locator('.brand-name').first()).toHaveText('The Church of Iron');
  await expect(page).toHaveTitle('The Church of Iron');
});

test('a first visit mentions the themes once; "Keep it plain" puts it away for good', async ({ page }) => {
  await openDemo(page, { prefs: {} });
  const note = page.locator('.theme-hint');
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Keep it plain' }).click();
  await expect(note).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#view .hero')).toBeVisible();
  await expect(page.locator('.theme-hint')).toHaveCount(0);
});

test('"See themes" opens the theme list, and picking one changes the look', async ({ page }) => {
  await openDemo(page, { prefs: {} });
  await page.getByRole('button', { name: 'See themes' }).click();
  const king = page.locator('#sheet [data-skin="king"]');
  await expect(king).toBeVisible();
  await king.click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'king');
  await expect(page.locator('.brand-name').first()).toHaveText('The Iron King');
});
