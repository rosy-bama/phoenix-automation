import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Tests share one admin session and the same customer accounts - keep
  // sequential until we know the modules are independent.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry: testbox response times vary a lot. A test that passes only on
  // retry is reported as "flaky" in the summary - not hidden.
  retries: 1,  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.PHX_BASE_URL ?? 'https://phoenix-testbox.ejaraapis.xyz',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    viewport: { width: 1440, height: 900 },
  },

    // Order matters: login/logout tests run LAST (teardown of 'setup').
  // Logging out (AUTH-07) or logging in again (AUTH-01) appears to end the
  // shared session saved by auth.setup.ts, so running them first broke
  // every test after them (2 Oct 2026). Teardown runs even if tests fail.
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/, teardown: 'auth-flows' },
    {
      name: 'chromium',
      testIgnore: /auth\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: '.auth/state.json' },
      dependencies: ['setup'],
    },
    {
      name: 'auth-flows',
      testMatch: /auth\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
