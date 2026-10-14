import { Page } from '@playwright/test';

/**
 * Selector policy: role + accessible name first (checked in the DevTools
 * Accessibility panel), then placeholder/text, CSS classes last. Every
 * locator marked CONFIRMED came from Rose's codegen recording of 29 Sep 2026;
 * INFERRED ones still need a live check.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Opens a path. If the admin session has expired (testbox ends it after
   * about an hour - 13 Oct 2026, the 2nd half of a full run all landed on
   * /auth/login), logs in again, saves the new session for later tests, and
   * opens the path again. Login pages call super.goto() for /auth/* paths,
   * which are left alone.
   */
  async goto(path = '/') {
    await this.page.goto(path);
    if (path.startsWith('/auth')) return;
    const loginButton = this.page.getByRole('button', { name: 'Login to your account' });
    await this.page.getByRole('navigation').or(loginButton).first().waitFor({ timeout: 30_000 }).catch(() => {});
    if (!(await loginButton.isVisible())) return;
    // Lazy imports: LoginPage extends BasePage.
    const { LoginPage } = await import('./LoginPage');
    const { env } = await import('../utils/env');
    const { STATE_FILE, saveSessionStorage } = await import('../utils/session');
    await new LoginPage(this.page).login(env.username, env.password, env.otp);
    await this.page.context().storageState({ path: STATE_FILE, indexedDB: true });
    await saveSessionStorage(this.page);
    await this.page.goto(path);
  }
}
