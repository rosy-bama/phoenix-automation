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
  readonly completeButton: Locator;
  readonly copyButtons: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Transaction details' });
    this.root = page
      .locator('div')
      .filter({ has: this.heading })
      .filter({ has: page.getByText('Transaction reference', { exact: true }) })
      .last();
    this.closeButton = this.root.getByRole('button', { name: '×' });
    // INFERRED from Figma 484:19812 - footer button of a failed deposit.
    this.completeButton = page.getByRole('button', { name: /complete transaction/i });
    this.copyButtons = this.root.getByRole('button', { name: 'Copy' });
  }

  async has(name: string): Promise<boolean> {
    return (await this.root.getByText(name, { exact: true }).count()) > 0;
  }

  /** Whole panel text, for observations. */
  async text(): Promise<string> {
    return ((await this.root.innerText()) ?? '').replace(/\s+/g, ' ').trim();
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
