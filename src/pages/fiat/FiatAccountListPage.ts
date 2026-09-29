import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AppShell } from '../AppShell';
import { FilterPanel } from '../components/FilterPanel';
import { DataTable } from '../components/DataTable';
import { Pagination } from '../components/Pagination';

/**
 * Wallet > Account list. CONFIRMED from codegen (29 Sep 2026):
 * heading "Account list", description starting "The list should show every",
 * wallet-type buttons "Main wallet" / "Jara wallet" / "Rewards", "reload",
 * search "Search account...", "Filters" (Status select with Frozen / Closed,
 * XAF currency select, Min/Max balance, Start/End date), row checkboxes,
 * "See details" per row.
 */
export class FiatAccountListPage extends BasePage {
  readonly shell: AppShell;
  readonly filters: FilterPanel;
  readonly table: DataTable;
  readonly pagination: Pagination;

  readonly heading: Locator;
  readonly description: Locator;
  readonly mainWalletTab: Locator;
  readonly jaraWalletTab: Locator;
  readonly rewardsTab: Locator;
  readonly reloadButton: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.shell = new AppShell(page);
    this.filters = new FilterPanel(page);
    this.table = new DataTable(page);
    this.pagination = new Pagination(page);

    this.heading = page.getByRole('heading', { name: 'Account list' });
    this.description = page.getByText(/^The list should show every/);
    this.mainWalletTab = page.getByRole('button', { name: 'Main wallet' });
    this.jaraWalletTab = page.getByRole('button', { name: 'Jara wallet' });
    this.rewardsTab = page.getByRole('button', { name: 'Rewards' });
    this.reloadButton = page.getByRole('button', { name: 'reload' });
    this.searchInput = page.getByRole('textbox', { name: 'Search account...' });
  }

  async open() {
    await this.goto('/');
    await this.shell.open('Wallet', 'Account list');
    await expect(this.heading).toBeVisible();
    await expect(this.description).toBeVisible();
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
  }

  async openAccount(username: string) {
    await this.search(username);
    await this.table.openRowDetails(`@${username}`);
  }
}
