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
 * "Transactions summary" with type buttons Cash in / Cash out / Manual
 * Operations, Export, reload, Filters (Status, Payment method, Amount range,
 * Date range), rows with "See details".
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
  readonly cashInTab: Locator;
  readonly cashOutTab: Locator;
  readonly manualOpsTab: Locator;
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
    this.cashInTab = page.getByRole('button', { name: 'Cash in', exact: true })
      .or(page.getByText('Cash in', { exact: true })).first();
    this.cashOutTab = page.getByRole('button', { name: 'Cash out', exact: true })
      .or(page.getByText('Cash out', { exact: true })).first();
    this.manualOpsTab = page.getByRole('button', { name: 'Manual Operations', exact: true })
      .or(page.getByText('Manual Operations', { exact: true })).first();
    this.exportButton = page.getByRole('button', { name: 'Export' });
    this.reloadButton = page.getByRole('button', { name: 'reload' });
  }

  field(label: string) {
    return this.page.getByText(label, { exact: true }).first();
  }

  async expectLoaded(username: string) {
    await expect(this.transactionsSummary).toBeVisible();
    await expect(this.page.getByText(username, { exact: true }).first()).toBeVisible();
  }
}
