import { Page, Locator, expect } from '@playwright/test';
import { escapeRegex } from '../../utils/text';

/**
 * The "Filter by" side panel shared by every list page. CONFIRMED from codegen:
 * heading "Filter by", close button "×", "Reset", "Apply filters",
 * spinbuttons "Min"/"Max" (or "Start amount"/"End amount" in Savings/Bond),
 * textboxes "Start date"/"End date", and Ant Design selects.
 */
export class FilterPanel {
  readonly openButton: Locator;
  readonly heading: Locator;
  readonly root: Locator;
  readonly closeButton: Locator;
  readonly resetButton: Locator;
  readonly applyButton: Locator;
  readonly minAmount: Locator;
  readonly maxAmount: Locator;
  readonly startDate: Locator;
  readonly endDate: Locator;

  constructor(private readonly page: Page) {
    this.openButton = page.getByRole('button', { name: 'Filters' });
    this.heading = page.getByRole('heading', { name: 'Filter by' });
    this.applyButton = page.getByRole('button', { name: 'Apply filters' });
    // Innermost element that holds both the heading and the Apply button = the panel.
    this.root = page
      .locator('div')
      .filter({ has: this.heading })
      .filter({ has: this.applyButton })
      .last();
    this.closeButton = this.root.getByRole('button', { name: '×' });
    this.resetButton = this.root.getByRole('button', { name: 'Reset' });
    this.minAmount = this.root.getByRole('spinbutton', { name: /^(Min|Start amount)$/ });
    this.maxAmount = this.root.getByRole('spinbutton', { name: /^(Max|End amount)$/ });
    // Fiat Wallet date pickers are named "Start"/"End" (snapshot 13 Oct 2026).
    this.startDate = this.root.getByRole('textbox', { name: /^Start( date)?$/ });
    this.endDate = this.root.getByRole('textbox', { name: /^End( date)?$/ });
  }

  async open() {
    await this.openButton.click();
    await expect(this.heading).toBeVisible();
  }

  async close() {
    await this.closeButton.click();
    await expect(this.heading).toBeHidden();
  }

  async apply() {
    await this.applyButton.click();
  }

  /**
   * The Ant select that follows a field label. Fiat Wallet labels (snapshot
   * 13 Oct 2026): 'Account status' (account list), 'Transaction status' and
   * 'Payment method' (transaction lists).
   */
  select(label: string) {
    return this.root
      .getByText(label, { exact: true })
      .first()
      .locator('xpath=following::*[contains(@class,"ant-select")][1]');
  }

  /** Visible options of the currently open Ant Design dropdown. */
  dropdownOptions() {
    return this.page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ visible: true });
  }

  async choose(label: string, option: string) {
    await this.select(label).click();
    await this.dropdownOptions()
      .filter({ hasText: new RegExp(`^${escapeRegex(option)}$`) })
      .first()
      .click();
  }

  async setAmountRange(min?: number, max?: number) {
    if (min !== undefined) await this.minAmount.fill(String(min));
    if (max !== undefined) await this.maxAmount.fill(String(max));
  }
}
