import { Page, Locator, expect } from '@playwright/test';
import { escapeRegex } from '../../utils/text';

/**
 * "Transaction details" panel opened from any transaction row. CONFIRMED
 * field labels (codegen 29 Sep 2026): Total amount, Client, Transaction type,
 * Amount, Fees, Payment method, Source, Status, Date, Transaction reference
 * (with Copy), Transaction mode, Initiated by, Internal reference, Payment
 * provider. Label and value render inside one element ("StatusComplete").
 */
export class TransactionDetailsPanel {
  readonly heading: Locator;
  readonly root: Locator;
  readonly closeButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Transaction details' });
    this.root = page
      .locator('div')
      .filter({ has: this.heading })
      .filter({ has: page.getByText('Transaction reference', { exact: true }) })
      .last();
    this.closeButton = this.root.getByRole('button', { name: '×' });
  }

  async expectOpen() {
    await expect(this.heading).toBeVisible();
  }

  label(name: string) {
    return this.root.getByText(name, { exact: true }).first();
  }

  /** Text of the element holding "<label><value>", with the label stripped. */
  async value(name: string): Promise<string> {
    const el = this.root.getByText(new RegExp(`^${escapeRegex(name)}\\S`)).first();
    const text = (await el.textContent()) ?? '';
    return text.slice(name.length).trim();
  }

  async close() {
    await this.closeButton.click();
    await expect(this.heading).toBeHidden();
  }
}
