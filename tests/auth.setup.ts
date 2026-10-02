import { test as setup } from '@playwright/test';
import { LoginPage } from '../src/pages/LoginPage';
import { env } from '../src/utils/env';
import { STATE_FILE, saveSessionStorage } from '../src/utils/session';

/**
 * Logs in once and saves the session; every other test reuses it.
 * Saves cookies, localStorage, IndexedDB AND sessionStorage, because we
 * don't yet know which one Phoenix keeps its token in (see scripts/diagnose.js).
 * Testbox accepts any 6-digit OTP (confirmed by Rose, 29 Sep 2026).
 */
setup('authenticate', async ({ page }) => {
  await new LoginPage(page).login(env.username, env.password, env.otp);
  await page.context().storageState({ path: STATE_FILE, indexedDB: true });
  await saveSessionStorage(page);
});