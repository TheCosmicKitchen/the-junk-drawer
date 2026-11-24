// Widgets: opt-in extras from Settings → Widgets. The first is the lifting pet, who hatches from an
// egg once you log a few sets. Its rules (growing, moods, devolving) are in tests/unit/pet.test.mjs.
import { test, expect } from '@playwright/test';
import { openDemo, openPicker } from './helpers.mjs';

const petCard = page => page.locator('#view .pet-card');
const petSwitch = page => page.locator('#sheet [data-widget-toggle="pet"]');
async function settings(page) {
  await page.locator('#menuBtn').click();
  await expect(petSwitch(page)).toBeVisible();
}
async function closeSheet(page) {
  await page.locator('#sheet [data-close]').first().click();
  await expect(page.locator('#sheet')).not.toHaveAttribute('open', '');
}

test('widgets are off until switched on; the pet hatches from a few sets, keeps its name, and stays through a reload', async ({ page }) => {
  const errors = await openDemo(page);
  await expect(petCard(page)).toHaveCount(0);

  await settings(page);
  await expect(petSwitch(page)).toHaveAttribute('aria-pressed', 'false');
  await petSwitch(page).click();
  await expect(petSwitch(page)).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);
  await expect(petCard(page)).toContainText('Pip');
  await expect(petCard(page)).toContainText('Egg');
  await expect(petCard(page).locator('svg')).toHaveAttribute('aria-label', /Pip, egg/);

  // Five sets of bench: enough to hatch it.
  await openPicker(page);
  await page.locator('#exSearch').fill('bench press');
  await page.waitForTimeout(250);   // the search runs 120 ms after typing stops
  await page.locator('#exResults [data-pick]').first().click();
  await page.locator('#nIn').fill('5');
  await page.locator('#saveBtn').click();
  await expect(page.locator('#sheet')).not.toHaveAttribute('open', '');
  await expect(petCard(page).locator('.pet-stage')).toContainText('Hatchling');
  await expect(petCard(page)).toContainText('full and happy: 5 sets');

  page.once('dialog', d => d.accept('Gains'));
  await petCard(page).getByRole('button', { name: /Rename/ }).click();
  await expect(petCard(page).locator('#petName')).toHaveText('Gains');

  await page.reload();
  await expect(page.locator('#view .hero')).toBeVisible();
  await expect(petCard(page).locator('#petName')).toHaveText('Gains');

  // Off hides it; on again brings the same pet back.
  await settings(page);
  await petSwitch(page).click();
  await closeSheet(page);
  await expect(petCard(page)).toHaveCount(0);
  await settings(page);
  await petSwitch(page).click();
  await closeSheet(page);
  await expect(petCard(page).locator('#petName')).toHaveText('Gains');
  expect(errors).toEqual([]);
});

test('the pet draws in another theme too', async ({ page }) => {
  const errors = await openDemo(page, { prefs: { themeHint: 1, theme: 'arcade', widgets: { pet: true } } });
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'arcade');
  await expect(petCard(page)).toContainText('Pip');
  await expect(petCard(page).locator('svg')).toBeVisible();
  expect(errors).toEqual([]);
});
