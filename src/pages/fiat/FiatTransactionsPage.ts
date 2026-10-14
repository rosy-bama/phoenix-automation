import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FilterPanel } from '../components/FilterPanel';
import { DataTable } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { TransactionDetailsPanel } from '../components/TransactionDetailsPanel';
import { ROUTES } from '../AppShell';

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
  readonly reloadButton: Locator;
  readonly exportButton: Locator;
  readonly oops: Locator;

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
    // CONFIRMED (snapshot): textbox "Search..."
    this.searchInput = page.getByRole('main').getByRole('textbox', { name: 'Search...' });
    this.reloadButton = page.getByRole('main').getByRole('button', { name: 'reload' });
    this.exportButton = page.getByRole('main').getByRole('button', { name: 'Export' });
    // App-wide error page (seen 13 Oct 2026 when filtering by status Failed/Pending).
    this.oops = page.getByRole('heading', { name: 'Oops!' });
  }

  static readonly productColumns = ['Username', 'Total amount', 'Source/Destination', 'Product', 'Status', 'Date'];

  static columnsFor(tab: TxnTab) {
    return tab === 'Sales' || tab === 'Purchases' ? FiatTransactionsPage.productColumns : FiatTransactionsPage.columns;
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
    await this.table.settle();
  }

  async open() {
    await this.goto(ROUTES.fiatTransactions);
    await expect(this.heading).toBeVisible();
  }

  tab(name: TxnTab) {
    return this.page.getByRole('button', { name, exact: true });
  }

  async openTab(name: TxnTab) {
    await this.tab(name).click();
    await this.table.settle();
  }
}
