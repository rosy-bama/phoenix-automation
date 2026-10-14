import { Page, Locator } from '@playwright/test';

/**
 * Generic list table. Data rows are identified by their "See details" action
 * (CONFIRMED in Fiat account list and Transactions list), which keeps header
 * and empty-state rows out of counts.
 */
export class DataTable {
  readonly table: Locator;
  readonly rows: Locator;
  readonly selectAll: Locator;

  constructor(private readonly page: Page) {
    this.table = page.getByRole('main').getByRole('table').first();
    this.rows = this.table
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'See details' }) });
    this.selectAll = page.getByRole('checkbox', { name: 'Select all' });
  }

  rowContaining(text: string | RegExp) {
    return this.rows.filter({ hasText: text });
  }

  columnHeader(name: string) {
    return this.table.getByRole('columnheader', { name, exact: true });
  }

  /** Row checkbox - its name flips from "Select row N" to "Row N selected". CONFIRMED. */
  rowCheckbox(n: number) {
    return this.page.getByRole('checkbox', {
      name: new RegExp(`^(Select row ${n}|Row ${n} selected)$`),
    });
  }

  /** Visible column header texts, in order (empty headers dropped). */
  async headers(): Promise<string[]> {
    const all = await this.table.getByRole('columnheader').allTextContents();
    return all.map((h) => h.trim()).filter(Boolean);
  }

  /** Text of one column for every data row (by header name, case-insensitive). */
  async column(name: string): Promise<string[]> {
    const headers = (await this.table.getByRole('columnheader').allTextContents()).map((h) => h.trim().toLowerCase());
    const index = headers.indexOf(name.toLowerCase());
    if (index < 0) throw new Error(`No column "${name}" (columns: ${headers.join(', ')})`);
    const values: string[] = [];
    for (const row of await this.rows.all()) {
      values.push(((await row.getByRole('cell').nth(index).textContent()) ?? '').trim());
    }
    return values;
  }

  /** Waits for the list to settle after a filter/search/tab change. */
  async settle() {
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // networkidle can resolve before React re-renders the rows (13 Oct 2026:
    // filters and tab switches were read while the old rows still showed).
    await this.page.waitForTimeout(1_500);
    // Report the app's error page plainly instead of as a locator timeout.
    if (await this.page.getByRole('heading', { name: 'Oops!' }).isVisible()) {
      throw new Error('App crashed: "Oops! An unexpected error occurred." page shown instead of the list');
    }
    await this.table.waitFor({ state: 'visible' });
  }

  async openRowDetails(text: string | RegExp) {
    await this.rowContaining(text).first().getByRole('button', { name: 'See details' }).click();
  }

  async openFirstRowDetails() {
    await this.rows.first().getByRole('button', { name: 'See details' }).click();
  }
}
