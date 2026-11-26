// Logging a set: the picker, last time, the log button, and the set showing up on the Log tab.
import { test, expect } from '@playwright/test';
import { openDemo, openPicker } from './helpers.mjs';

test('the picker lists results right under the filters, with cardio behind a switch', async ({ page }) => {
  await openDemo(page);
  await openPicker(page);
  const first = page.locator('#exResults li').first();
  await expect(first).toBeVisible();
  const chips = await page.locator('#pkFilters').boundingBox(), row = await first.boundingBox();
  expect(row.y - (chips.y + chips.height), 'first result sits right under the chips').toBeLessThan(30);
  await expect(page.locator('.cardio-pick')).toHaveCount(0);

  await page.locator('[data-pk-kind="c"]').click();
  await expect(page.locator('#pkFilters')).toBeHidden();
  await expect(page.locator('#exSearch')).toHaveAttribute('placeholder', 'Search cardio');
  await expect(page.locator('#exResults [data-cardio-new]').first()).toBeVisible();
  await page.locator('[data-pk-kind="w"]').click();
  await expect(page.locator('#exResults [data-pick]').first()).toBeVisible();
});

test('search finds a lift by name and by part of a name', async ({ page }) => {
  await openDemo(page);
  await openPicker(page);
  await page.locator('#exSearch').fill('bench');
  await expect(page.locator('#exResults [data-pick]').first()).toContainText('Bench Press');
  await page.locator('#exSearch').fill('zzzz-nothing');
  await expect(page.locator('#resTitle')).toHaveText('No matches');
});

test('opening a lift fills in last time straight away, and logging puts the set on the Log tab', async ({ page }) => {
  const errors = await openDemo(page);
  await openPicker(page);
  await page.locator('#exSearch').fill('bench press');
  await expect(page.locator('#exResults [data-pick]').first()).toContainText('Bench Press');
  await page.locator('#exResults [data-pick]').first().click();
  await expect(page.locator('#sheetTitle')).toHaveText('Bench Press');
  // Last time comes from what's already on the phone: no "Looking up" wait.
  await expect(page.locator('#lastLine')).toContainText('Last time');
  await expect(page.locator('#wIn')).not.toHaveValue('');

  await page.locator('#wIn').fill('200');
  await page.locator('#aIn').fill('3');
  await page.locator('#nIn').fill('1');
  await expect(page.locator('#saveBtn')).toHaveText(/Log 3 reps @ 200 lb/);
  await page.locator('#saveBtn').click();
  // Logged: back to today, with the set counted.
  await expect(page.locator('#sheet')).not.toHaveAttribute('open', '');
  await expect(page.locator('#view .hero')).toContainText('600');   // 200 × 3 lb moved today
  await expect(page.locator('#view')).toContainText('Bench Press');
  expect(errors).toEqual([]);
});

test('picking a lift straight after typing does not throw', async ({ page }) => {
  // Search waits 120 ms after the last key. A quick tap (easy with reduced motion) used to open the
  // lift first, then the late search tried to redraw a picker that was gone.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await openDemo(page);
  await openPicker(page);
  await page.locator('#exSearch').fill('bench');
  await page.locator('#exResults [data-pick]').first().click();
  await expect(page.locator('#lastLine')).toBeVisible();
  await page.waitForTimeout(300);   // past the search delay
  expect(errors).toEqual([]);
});

test('a hold logs a time, not reps', async ({ page }) => {
  await openDemo(page);
  await openPicker(page);
  await page.locator('#exSearch').fill('plank');
  await expect(page.locator('#exResults [data-pick]').first()).toContainText('Plank');
  await page.locator('#exResults [data-pick]').first().click();
  await expect(page.locator('.trio')).toContainText('Time');
  await page.locator('#aIn').fill('1:15');
  await expect(page.locator('#saveBtn')).toContainText('1:15');
});

test('on a phone, Log a set is a round button in the bottom-right corner', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'desktop has the sidebar button');
  await openDemo(page);
  const box = await page.locator('#fab').boundingBox(), vw = page.viewportSize().width;
  expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  expect(box.width).toBeLessThan(80);
  expect(vw - (box.x + box.width)).toBeLessThan(40);   // hugging the right edge
  expect(box.x).toBeGreaterThan(vw / 2);
  await expect(page.locator('#fab')).toHaveAccessibleName('Log a set');
});

test('an exercise card shows your PR next to its name', async ({ page }) => {
  const errors = await openDemo(page);
  await openPicker(page);
  await page.locator('#exSearch').fill('bench press');
  await page.waitForTimeout(250);
  await page.locator('#exResults [data-pick]').first().click();
  await page.locator('#wIn').fill('100');
  await page.locator('#aIn').fill('5');
  await page.locator('#saveBtn').click();
  const card = page.locator('#view .ex-card', { hasText: 'Bench Press' });
  await expect(card.locator('.ex-pr')).toHaveText(/^PR \d[\d.,]* × 5$/);   // a light set: the old best stands
  await openPicker(page);
  await page.locator('#exSearch').fill('bench press');
  await page.waitForTimeout(250);
  await page.locator('#exResults [data-pick]').first().click();
  await page.locator('#wIn').fill('999');
  await page.locator('#aIn').fill('5');
  await page.locator('#saveBtn').click();
  await expect(card.locator('.ex-pr')).toContainText('New PR');
  expect(errors).toEqual([]);
});
