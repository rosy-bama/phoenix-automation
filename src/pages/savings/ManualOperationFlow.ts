import { Page, Locator, expect } from '@playwright/test';
import { fillOtp } from '../../utils/otp';

/**
 * Manual deposit flow. CONFIRMED on Savings box account details (codegen
 * 29 Sep 2026): "Manual Operations" -> "Deposit" -> "* Deposit Amount" +
 * "* Reason" -> "Review details" (Client, Amount, Date, Payment reference,
 * Reason, alert) -> "Confirm deposit" -> 6-box OTP -> "Deposit processed
 * successfully". Cancel / Back buttons exist on the form and review steps.
 * Withdrawal is INFERRED to mirror this ("Withdraw", "* Withdrawal Amount").
 */
export class ManualOperationFlow {
  readonly menuButton: Locator;
  readonly depositOption: Locator;
  readonly walletBalance: Locator;
  readonly amountInput: Locator;
  readonly reasonInput: Locator;
  readonly reviewButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;
  readonly confirmDepositButton: Locator;
  readonly successMessage: Locator;

  constructor(private readonly page: Page) {
    this.menuButton = page.getByRole('button', { name: 'Manual Operations' });
    this.depositOption = page.getByText('Deposit', { exact: true });
    this.walletBalance = page.getByText(/Wallet Balance/).first();
    this.amountInput = page.getByRole('spinbutton', { name: '* Deposit Amount' });
    this.reasonInput = page.getByRole('textbox', { name: '* Reason' });
    this.reviewButton = page.getByRole('button', { name: 'Review details' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.backButton = page.getByRole('button', { name: 'Back' });
    this.confirmDepositButton = page.getByRole('button', { name: 'Confirm deposit' });
    this.successMessage = page.getByText('Deposit processed successfully');
  }

  async startDeposit() {
    await this.menuButton.click();
    await this.depositOption.click();
    await expect(this.amountInput).toBeVisible();
  }

  async fillDeposit(amount: number, reason: string) {
    await this.amountInput.fill(String(amount));
    await this.reasonInput.fill(reason);
    await this.reviewButton.click();
  }

  async confirmWithOtp(otp: string) {
    await this.confirmDepositButton.click();
    await fillOtp(this.page, otp);
  }
}
