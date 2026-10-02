import { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';

/**
 * Playwright's storageState saves cookies + localStorage (+ IndexedDB when
 * asked) but NOT sessionStorage. If the Phoenix token lives in sessionStorage,
 * a reused session looks "logged out" - which is what the 2 Oct run showed.
 * We save sessionStorage separately and restore it before any page script runs.
 * Harmless if the app doesn't use sessionStorage (the file is just "{}").
 */
export const STATE_FILE = '.auth/state.json';
export const SESSION_FILE = '.auth/session-storage.json';

export async function saveSessionStorage(page: Page) {
  const data = await page.evaluate(() => JSON.stringify(sessionStorage));
  fs.writeFileSync(SESSION_FILE, data, 'utf-8');
}

export async function restoreSessionStorage(context: BrowserContext, origin: string) {
  if (!fs.existsSync(SESSION_FILE)) return;
  const data = fs.readFileSync(SESSION_FILE, 'utf-8');
  await context.addInitScript(
    ({ data, origin }) => {
      if (window.location.origin !== origin) return;
      const entries = JSON.parse(data) as Record<string, string>;
      for (const [k, v] of Object.entries(entries)) {
        if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, v);
      }
    },
    { data, origin }
  );
}