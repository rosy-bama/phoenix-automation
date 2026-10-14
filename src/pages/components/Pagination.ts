import { Page, Locator, expect } from '@playwright/test';
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
  readonly prevButton: Locator;
  readonly nextButton: Locator;

  constructor(private readonly page: Page) {
    this.pageSizeSelect = page.getByRole('main').getByRole('combobox', { name: 'Per page' });
    // -? : the User management list showed "Showing -19 to 0 of 135" (13 Oct 2026).
    this.counter = page.getByRole('main').getByText(/^Showing -?\d+/);
    // CONFIRMED (snapshot 13 Oct 2026): "←" / "→" inside "Previous Page" / "Next Page".
    this.prevButton = page.getByRole('main').getByRole('button', { name: '←' });
    this.nextButton = page.getByRole('main').getByRole('button', { name: '→' });
  }

  /** "Showing 21 to 40 of 134 results" -> { from: 21, to: 40, total: 134 }. */
  async counts() {
    const text = ((await this.counter.textContent()) ?? '').replace(/,/g, '');
    const m = text.match(/Showing (-?\d+) to (-?\d+) of (\d+)/);
    if (!m) throw new Error(`Unexpected result counter "${text}"`);
    return { from: Number(m[1]), to: Number(m[2]), total: Number(m[3]), text };
  }

  /** Waits until the counter starts at `from` (the list has re-rendered). */
  async waitForFrom(from: number) {
    await expect.poll(async () => (await this.counts()).from).toBe(from);
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
    // Wait until the list is re-paged (the counter's "to" follows the new size).
    await expect
      .poll(async () => {
        const c = await this.counts().catch(() => null);
        return c ? c.to === Math.min(size, c.total) || c.total === 0 : false;
      }, { timeout: 15_000 })
      .toBe(true)
      .catch(() => {});
  }
}
