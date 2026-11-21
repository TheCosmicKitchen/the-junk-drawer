// Browser tests: the lift app's demo (no account, no network) at phone and desktop sizes.
// `npm run test:e2e`. Locally it uses the Edge already on the machine; CI installs Chromium.
import { defineConfig, devices } from '@playwright/test';

const channel = process.env.CI ? undefined : process.env.PW_CHANNEL || 'msedge';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8799',
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',   // always the files on disk, never a cached shell
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel } },
  ],
  webServer: { command: 'node tests/serve.mjs', url: 'http://127.0.0.1:8799/lift/', reuseExistingServer: !process.env.CI },
});
