import { Page, Locator } from '@playwright/test';

/**
 * CONFIRMED from codegen: page buttons ("1"), and a custom page-size select
 * showing "10▼"/"20▼" with options 10 / 20 / 50.
 * INFERRED: result counter copy "Showing X to Y of Z results" (from test plan
 * known defect: stray comma "of, Z").
 */
export class Pagination {
  readonly pageSizeToggle: Locator;
  readonly counter: Locator;

  constructor(private readonly page: Page) {
    this.pageSizeToggle = page.getByRole('main').getByText(/^\d+\s*▼$/);
    this.counter = page.getByRole('main').getByText(/^Showing \d+/);
  }

  pageButton(n: number) {
    return this.page.getByRole('main').getByRole('button', { name: String(n), exact: true });
  }

  async setPageSize(size: 10 | 20 | 50) {
    await this.pageSizeToggle.click();
    await this.page
      .getByRole('main')
      .getByText(String(size), { exact: true })
      .filter({ visible: true })
      .last()
      .click();
  }
}
