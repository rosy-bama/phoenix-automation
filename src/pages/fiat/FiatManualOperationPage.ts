import { Page, Locator, expect } from '@playwright/test';
import { escapeRegex } from '../../utils/text';
import { fillOtp } from '../../utils/otp';

/**
 * Full-page Manual deposit / Manual withdrawal / Complete transaction flow
 * (Figma 338:10592, 441:12847, 2098:143942). CONFIRMED from snapshots
 * (13 Oct 2026):
 * - URLs /fiat/accounts/<id>/manual-deposit and /manual-withdrawal; entering
 *   Review gives /manual-<kind>/<uuid>/verify.
 * - Banner: breadcrumb text ("/ ... / Manual Deposit"), "Do you need help?",
 *   and an unnamed close (X) button. Stepper is the <aside> (complementary).
 * - Deposit: "* Deposit Amount", "* Payment Method" (Cash / Mobile Money),
 *   "* Payment Operator", "* Payment Reference", "* Reason".
 * - Withdrawal: "Withdrawal amount", switch "Empty entire account",
 *   "* Payment method", "* Payment operator", "* Reason of the operation",
 *   switches "Automatic fees calculation" / "Charge subscription fees".
 * - Footer: Cancel + Review details, then Back + Confirm deposit/withdrawal.
 */
export class FiatManualOperationPage {
  readonly banner: Locator;
  readonly main: Locator;
  readonly stepper: Locator;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly helpButton: Locator;
  readonly closeButton: Locator;
  readonly amount: Locator;
  readonly paymentMethod: Locator;
  readonly paymentOperator: Locator;
  readonly reference: Locator;
  readonly reason: Locator;
  readonly internalReference: Locator;
  readonly emptyAccountSwitch: Locator;
  readonly reviewButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;
  readonly confirmButton: Locator;
  readonly infoBox: Locator;

  constructor(private readonly page: Page) {
    this.banner = page.getByRole('banner');
    this.main = page.getByRole('main');
    // Two <aside>s on the page; the first one holds the stepper.
    this.stepper = page.getByRole('complementary').first();
    this.heading = this.main.getByRole('heading', { level: 1 });
    this.subtitle = this.main.getByRole('paragraph').first();
    this.helpButton = this.banner.getByRole('button', { name: 'Do you need help?' });
    this.closeButton = this.banner.getByRole('button').last();
    this.amount = this.main.getByRole('spinbutton', { name: /(deposit|withdrawal) amount/i });
    this.paymentMethod = this.main.getByRole('combobox', { name: /payment method/i });
    this.paymentOperator = this.main.getByRole('combobox', { name: /payment operator/i });
    this.reference = this.main.getByRole('textbox', { name: /payment reference|transaction id reference/i });
    this.reason = this.main.getByRole('textbox', { name: /reason/i });
    this.internalReference = this.main.getByText(/internal payment reference/i).first();
    // First switch on the withdrawal form = "Empty entire account" (switches have no name).
    this.emptyAccountSwitch = this.main.getByRole('switch').first();
    this.reviewButton = page.getByRole('button', { name: 'Review details' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.backButton = page.getByRole('button', { name: 'Back' });
    this.confirmButton = page.getByRole('button', { name: /^Confirm/ });
    this.infoBox = this.main.getByRole('heading', { name: /make sure you confirm/i }).locator('xpath=..');
  }

  async expectPaymentInformation() {
    await expect(this.main.getByRole('heading', { name: 'Payment information' })).toBeVisible();
  }

  /** Options of the most recently opened Ant dropdown (an earlier one may still be fading out). */
  private options() {
    return this.page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
      .last()
      .locator('.ant-select-item-option');
  }

  private async waitDropdownsClosed() {
    await expect(this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toHaveCount(0);
  }

  /** Opens an Ant select and returns its option texts (dropdown left open). */
  async openOptions(select: Locator): Promise<string[]> {
    await this.waitDropdownsClosed();
    await select.click({ force: true });
    await this.options().first().waitFor();
    return (await this.options().allTextContents()).map((o) => o.trim());
  }

  async choose(select: Locator, option: string | RegExp) {
    await this.waitDropdownsClosed();
    await select.click({ force: true });
    const re = typeof option === 'string' ? new RegExp(`^${escapeRegex(option)}$`, 'i') : option;
    await this.options().filter({ hasText: re }).first().click();
    await this.waitDropdownsClosed();
  }

  /** Fills the Payment information step with Mobile Money + first operator. */
  async fillMobileMoney(amount: number | null, reason: string, reference?: string) {
    if (amount !== null) await this.amount.fill(String(amount));
    await this.choose(this.paymentMethod, /^Mobile Money$/i);
    await this.choose(this.paymentOperator, /\S/);
    if (reference !== undefined && (await this.reference.count())) await this.reference.fill(reference);
    await this.reason.fill(reason);
  }

  /** Visible field labels of the form, without the "* " required marker. */
  async labels(): Promise<string[]> {
    const texts = await this.main.locator('label').allTextContents();
    return texts.map((t) => t.replace(/^\*\s*/, '').trim()).filter(Boolean);
  }

  /** Value next to a label on the Review step ("Client@rose" -> "@rose"). */
  async reviewValue(label: string): Promise<string> {
    const el = this.main.getByText(new RegExp(`^${escapeRegex(label)}\\S`)).first();
    if (!(await el.count())) return '';
    return ((await el.textContent()) ?? '').slice(label.length).trim();
  }

  async mainText(): Promise<string> {
    return (await this.main.innerText()).replace(/\s+/g, ' ').trim();
  }

  async bannerText(): Promise<string> {
    return (await this.banner.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Confirm + OTP (if asked). Moves money: callers must check requireMoneyOps(). */
  /** Returns whether an OTP was asked for. */
  async confirm(otp: string): Promise<boolean> {
    await this.confirmButton.click();
    const otpBox = this.page.getByRole('textbox', { name: 'OTP Input 1' });
    const asked = await otpBox.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    if (asked) await fillOtp(this.page, otp);
    return asked;
  }
}
