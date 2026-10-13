import { Page, Locator } from '@playwright/test';
import { escapeRegex } from '../../utils/text';

/**
 * CONFIRMED from codegen: page buttons ("1"). Page size is an Ant select
 * named "Per page" (an <input class="ant-select-input">, NOT a native
 * <select> - snapshot 13 Oct 2026) with options 10 / 20 / 50.
 * INFERRED: result counter copy "Showing X to Y of Z results" (from test plan
 * known defect: stray comma "of, Z").
 */
export class Pagination {
  readonly pageSizeSelect: Locator;
  readonly counter: Locator;

  constructor(private readonly page: Page) {
    this.pageSizeSelect = page.getByRole('main').getByRole('combobox', { name: 'Per page' });
    this.counter = page.getByRole('main').getByText(/^Showing \d+/);
  }

  pageButton(n: number) {
    return this.page.getByRole('main').getByRole('button', { name: String(n), exact: true });
  }

  async setPageSize(size: 10 | 20 | 50) {
    // force: Ant draws the selected value over the input.
    await this.pageSizeSelect.click({ force: true });
    await this.page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ visible: true })
      .filter({ hasText: new RegExp(`^${escapeRegex(String(size))}$`) })
      .first()
      .click();
  }
}
