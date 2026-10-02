import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { fillOtp } from '../utils/otp';

/** CONFIRMED from codegen (29 Sep 2026). URL: /auth/login */
export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly resetPasswordLink: Locator;

  // Reset password screen
  readonly resetEmailInput: Locator;
  readonly sendEmailButton: Locator;
  readonly backToSignInLink: Locator;

  readonly otpFirstBox: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.getByRole('textbox', { name: 'ex: johndoe21' });
    this.passwordInput = page.getByRole('textbox', { name: 'Enter your password...' });
    this.loginButton = page.getByRole('button', { name: 'Login to your account' });
    this.resetPasswordLink = page.getByRole('link', { name: 'Reset password' });

    this.resetEmailInput = page.getByRole('textbox', { name: 'ex: johndoe@ejara.africa' });
    this.sendEmailButton = page.getByRole('button', { name: 'Send email' });
    this.backToSignInLink = page.getByRole('link', { name: /Back to sign in/ });

    this.otpFirstBox = page.getByRole('textbox', { name: 'OTP Input 1' });
  }

  async goto() {
    await super.goto('/auth/login');
    // Testbox is sometimes slow to render the form (AUTH-06, 2 Oct 2026).
    await expect(this.usernameInput).toBeVisible({ timeout: 30_000 });
  }

  async submitCredentials(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /** Full login: credentials + OTP, waits for the app shell. */
  async login(username: string, password: string, otp: string) {
    await this.goto();
    await this.submitCredentials(username, password);
        await fillOtp(this.page, otp);
    // Wait until we have actually left /auth/* - the nav alone isn't proof.
    await expect(this.page).not.toHaveURL(/\/auth\//, { timeout: 20_000 });
    await expect(this.page.getByRole('navigation')).toBeVisible({ timeout: 20_000 });
  }
}
