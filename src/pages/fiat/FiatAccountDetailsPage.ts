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
    this.manualOpsButton = page.getByRole('button', { name: 'Manual Operations', exact: true });
    this.exportButton = page.getByRole('button', { name: 'Export' });
    this.reloadButton = page.getByRole('button', { name: 'reload' });
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
