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

  async openRowDetails(text: string | RegExp) {
    await this.rowContaining(text).first().getByRole('button', { name: 'See details' }).click();
  }

  async openFirstRowDetails() {
    await this.rows.first().getByRole('button', { name: 'See details' }).click();
  }
}
