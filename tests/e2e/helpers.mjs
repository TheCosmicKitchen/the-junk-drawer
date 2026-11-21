// Shared by the browser tests: open the demo with a clean slate and fail on any page error.
import { expect } from '@playwright/test';

// Opens the lift demo. `query` adds to ?demo (e.g. 'big=3' for three years of history).
// prefs: what's in the browser's settings before the page loads ({} = a first visit).
export async function openDemo(page, { query = '', prefs = { themeHint: 1 } } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(p => { try { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('lift.prefs', p); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, JSON.stringify(prefs));
  await page.goto('/lift/?demo' + (query ? '&' + query : ''));
  await expect(page.locator('#view .hero')).toBeVisible();
  return errors;
}

// "Log a set": the floating button on a phone, the sidebar's button on a wide screen.
export const LOG_BTN = '#fab:visible, #navLog:visible';
export async function openPicker(page) {
  await page.locator(LOG_BTN).first().click();
  await expect(page.locator('#exResults li').first()).toBeVisible();
}
export const logBtnSelector = async page => ((await page.locator('#fab').isVisible()) ? '#fab' : '#navLog');

// The tab bar: by label, whichever layout (bottom bar on phones, sidebar on desktop).
export const tab = (page, name) => page.locator('.tabs a[href="#' + name + '"]');

// Time a tap that redraws synchronously (opening a sheet, switching a tab): from the click to the
// end of the handler, in ms, measured in the page.
export async function timeClick(page, selector) {
  return page.evaluate(sel => { const t0 = performance.now(); document.querySelector(sel).click(); return performance.now() - t0; }, selector);
}
