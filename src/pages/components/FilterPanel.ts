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
  readonly subtitle: Locator;

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
    this.subtitle = this.root.getByRole('paragraph').first();
  }

  /** A field label / section title inside the panel. */
  label(text: string | RegExp) {
    return this.root.getByText(text, { exact: typeof text === 'string' }).first();
  }

  /** Options of a select, read by opening and closing it. */
  async options(label: string): Promise<string[]> {
    await this.select(label).click();
    let list: string[] = [];
    // The dropdown animates in: poll until its options are readable.
    await expect.poll(async () => (list = (await this.dropdownOptions().allTextContents()).map((o) => o.trim()).filter(Boolean)).length).toBeGreaterThan(0);
    await this.page.keyboard.press('Escape');
    return list;
  }

  /** Quick ranges ("Today", "Last 7 days", ...) of the open date picker. CONFIRMED 13 Oct 2026. */
  quickRange(name: string) {
    return this.page
      .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-presets li')
      .filter({ hasText: new RegExp(`^${escapeRegex(name)}$`) });
  }

  /**
   * Picks a start and an end date (both "YYYY-MM-DD", in the current month).
   * Start and End are two separate Ant pickers (snapshot 13 Oct 2026): each
   * opens its own calendar; we click the in-view cell with the day number.
   */
  async pickDateRange(start: string, end: string) {
    const pick = async (input: Locator, d: string) => {
      await input.click();
      await this.page
        // last(): the previous picker's dropdown can still be in the DOM while it fades out.
        .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
        .last()
        .locator('td.ant-picker-cell-in-view')
        .filter({ hasText: new RegExp(`^${Number(d.slice(8))}$`) })
        .first()
        .click();
    };
    await pick(this.startDate, start);
    await pick(this.endDate, end);
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
