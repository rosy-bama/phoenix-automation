import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FilterPanel } from '../components/FilterPanel';
import { DataTable } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { TransactionDetailsPanel } from '../components/TransactionDetailsPanel';

/**
 * Wallet account details (opened with "See details" from Account list).
 * CONFIRMED from codegen: username + status badge, Copy button, fields
 * Account Type / Balance / Registration date / User type, "Freeze account"
 * button (tooltip "Only suspended accounts can ..."), stat cards Total amount
 * deposited / Highest deposit / Lowest deposit / Total amount withdrawn,
 * "Transactions summary", a native <select> "By transaction type" (all /
 * cash_in / cash_out) plus a "Manual Operations" button, Export, reload,
 * Filters (Transaction status, Payment method, Amount range, Date range),
 * rows with "See details". Clicking Freeze on an active account shows
 * "Only suspended accounts can be unfrozen." (snapshot 13 Oct 2026).
 * Stat values sit in the element right after their label, amounts in XAF.
 */
export class FiatAccountDetailsPage extends BasePage {
  readonly filters: FilterPanel;
  readonly table: DataTable;
  readonly pagination: Pagination;
  readonly txnDetails: TransactionDetailsPanel;

  readonly heading: Locator;
  readonly backToListButton: Locator;
  readonly copyButton: Locator;
  readonly freezeButton: Locator;
  readonly transactionsSummary: Locator;
  readonly transactionTypeSelect: Locator;
  readonly manualOpsButton: Locator;
  readonly exportButton: Locator;
  readonly reloadButton: Locator;
  readonly viewProfileLink: Locator;
  readonly breadcrumb: Locator;
  readonly manualOpsOptions: Locator;
  readonly cashInOption: Locator;
  readonly cashOutOption: Locator;

  constructor(page: Page) {
    super(page);
    this.filters = new FilterPanel(page);
    this.table = new DataTable(page);
    this.pagination = new Pagination(page);
    this.txnDetails = new TransactionDetailsPanel(page);

    this.heading = page.getByRole('heading', { name: 'Account details' });
    this.backToListButton = page.getByRole('button', { name: 'Back to account list' });
    this.copyButton = page.getByRole('button', { name: 'Copy' }).first();
    this.freezeButton = page.getByRole('button', { name: 'Freeze account' });
    this.transactionsSummary = page.getByText('Transactions summary', { exact: true });
    this.transactionTypeSelect = page.getByRole('main').locator('select')
      .filter({ has: page.locator('option[value="cash_in"]') });
    this.manualOpsButton = page.getByRole('button', { name: /^Manual operations$/i });
    this.exportButton = page.getByRole('button', { name: 'Export' });
    this.reloadButton = page.getByRole('button', { name: 'reload' });
    this.viewProfileLink = page.getByRole('link', { name: /^View profile$/i });
    this.breadcrumb = page.getByRole('banner');
    // CONFIRMED (snapshot 13 Oct 2026): a listbox with "Manual Deposit" /
    // "Manual Withdrawal". Figma names them "Cash in" / "Cash out".
    this.manualOpsOptions = page.getByRole('listbox').getByRole('option');
    this.cashInOption = this.manualOpsOptions.filter({ hasText: /^(Cash in|Manual Deposit)$/i });
    this.cashOutOption = this.manualOpsOptions.filter({ hasText: /^(Cash out|Manual Withdrawal)$/i });
  }

  async startCashIn() {
    await this.manualOpsButton.click();
    await this.cashInOption.click();
  }

  async startCashOut() {
    await this.manualOpsButton.click();
    await this.cashOutOption.click();
  }

  /** The profile + metadata block, as one line of text. */
  async headerText(): Promise<string> {
    const text = await this.page.getByRole('main').innerText();
    return text.split('Transactions summary')[0].replace(/\s+/g, ' ').trim();
  }

  /** Every transaction row of this account (walks all pages at 50 per page). */
  async allTransactions(): Promise<Record<string, string>[]> {
    await this.table.rows.first().or(this.table.table.getByText('No data', { exact: true }).first()).waitFor();
    if (!(await this.table.rows.count())) return [];
    if ((await this.pagination.counts()).total > (await this.table.rows.count())) await this.pagination.setPageSize(50);
    const headers = (await this.table.table.getByRole('columnheader').allTextContents()).map((h) => h.trim());
    const out: Record<string, string>[] = [];
    for (;;) {
      for (const row of await this.table.rows.all()) {
        const cells = (await row.getByRole('cell').allTextContents()).map((c) => c.trim());
        out.push(Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
      }
      const { to, total } = await this.pagination.counts();
      if (to >= total || !(await this.pagination.nextButton.isEnabled())) break;
      await this.pagination.nextButton.click();
      await this.pagination.waitForFrom(to + 1);
    }
    return out;
  }

  field(label: string) {
    return this.page.getByText(label, { exact: true }).first();
  }

  /** Text of the element right after a label, e.g. value('Highest deposit') -> "5,000 XAF". */
  async value(label: string): Promise<string> {
    const el = this.field(label).locator('xpath=following-sibling::*[1]');
    return ((await el.textContent()) ?? '').trim();
  }

  async expectLoaded(username: string) {
    await expect(this.transactionsSummary).toBeVisible();
    await expect(this.page.getByText(username, { exact: true }).first()).toBeVisible();
  }
}
