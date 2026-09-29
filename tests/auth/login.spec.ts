import { test, expect } from '../../src/fixtures/test-fixtures';
import { knownBug } from '../../src/utils/known-bug';
import { env } from '../../src/utils/env';

// These tests start logged out - they must not reuse the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('AUTH-01 valid credentials lead to the OTP step, then the app', { tag: ['@smoke'] }, async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.submitCredentials(env.username, env.password);
    await expect(loginPage.otpFirstBox).toBeVisible();
    await loginPage.login(env.username, env.password, env.otp);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });

  test('AUTH-02 wrong password does not reach the OTP step', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.submitCredentials(env.username, 'Wrong-Password-1!');
    await expect(loginPage.otpFirstBox).toBeHidden();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('AUTH-03 empty fields keep the user on the login page', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.loginButton.click();
    await expect(loginPage.otpFirstBox).toBeHidden();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('AUTH-04 Reset password screen opens and returns to sign in', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.resetPasswordLink.click();
    await expect(loginPage.resetEmailInput).toBeVisible();
    await expect(loginPage.sendEmailButton).toBeVisible();
    await loginPage.backToSignInLink.click();
    await expect(loginPage.usernameInput).toBeVisible();
  });

  test('AUTH-05 unknown email on reset shows a readable error, not a translation key', { tag: ['@known-bug'] }, async ({ loginPage, page }) => {
    knownBug('AUTH-05', 'Raw i18n key "*.nonExistingEmailAccount" shown instead of an error message (codegen 29 Sep 2026)');
    await loginPage.goto();
    await loginPage.resetPasswordLink.click();
    await loginPage.resetEmailInput.fill('no-such-user-qa@example.com');
    await loginPage.sendEmailButton.click();
    await expect(page.getByText(/nonExistingEmailAccount/)).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText(/not found|does not exist|no account/i)).toBeVisible();
  });

  test('AUTH-06 Logout asks for confirmation; Cancel keeps the session', async ({ loginPage, shell, page }) => {
    await loginPage.login(env.username, env.password, env.otp);
    await shell.userMenuButton.click();
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(shell.nav).toBeVisible();
  });

  test('AUTH-07 Logout confirmed returns to the login page', { tag: ['@smoke'] }, async ({ loginPage, shell, page }) => {
    await loginPage.login(env.username, env.password, env.otp);
    await shell.logout();
    await page.goto('/fiat/transactions');
    await expect(page).toHaveURL(/\/auth\/login/); // INFERRED: protected routes redirect to login
  });
});
