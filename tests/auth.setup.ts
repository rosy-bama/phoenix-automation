import { test as setup } from '@playwright/test';
import { LoginPage } from '../src/pages/LoginPage';
import { env } from '../src/utils/env';

/**
 * Logs in once and saves the session to .auth/state.json; every other test
 * reuses it. Testbox accepts any 6-digit OTP (confirmed by Rose, 29 Sep 2026).
 */
setup('authenticate', async ({ page }) => {
  await new LoginPage(page).login(env.username, env.password, env.otp);
  await page.context().storageState({ path: '.auth/state.json' });
});
