import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FilterPanel } from '../components/FilterPanel';
import { DataTable } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { TransactionDetailsPanel } from '../components/TransactionDetailsPanel';

export type TxnTab = 'Deposits' | 'Withdrawals' | 'Sales' | 'Purchases';

/**
 * Wallet > Transactions. URL CONFIRMED: /fiat/transactions.
 * Tabs: Deposits / Withdrawals / Sales / Purchases. Columns: Username,
 * Total amount, Payment method, Source/Destination, Status, Date, See details.
 */
export class FiatTransactionsPage extends BasePage {
  readonly filters: FilterPanel;
  readonly table: DataTable;
  readonly pagination: Pagination;
  readonly txnDetails: TransactionDetailsPanel;

  readonly heading: Locator;
  readonly description: Locator;
  readonly searchInput: Locator;

  static readonly columns = [
    'Username',
    'Total amount',
    'Payment method',
    'Source/Destination',
    'Status',
    'Date',
  ];

  constructor(page: Page) {
    super(page);
    this.filters = new FilterPanel(page);
    this.table = new DataTable(page);
    this.pagination = new Pagination(page);
    this.txnDetails = new TransactionDetailsPanel(page);

    this.heading = page.getByRole('heading', { name: 'Transactions' });
    this.description = page.getByText(/^The transaction list covers/);
    // INFERRED placeholder - confirm.
    this.searchInput = page.getByRole('main').getByRole('textbox', { name: /search/i });
  }

  async open() {
    await this.goto('/fiat/transactions');
    await expect(this.heading).toBeVisible();
  }

  tab(name: TxnTab) {
    return this.page.getByRole('button', { name, exact: true });
  }

  async openTab(name: TxnTab) {
    await this.tab(name).click();
  }
}
