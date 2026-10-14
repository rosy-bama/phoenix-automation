import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FilterPanel } from '../components/FilterPanel';
import { DataTable } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { escapeRegex } from '../../utils/text';

/**
 * User management > Accounts (/users). CONFIRMED from scripts/snapshot-users.js
 * (13 Oct 2026): heading "Accounts", status buttons "Confirmed" / "Frozen" /
 * "Deactivated" / "Deleted" (Figma: "Active" for the first), "reload",
 * searchbox "Search ...", "search", "Filters", "Export", row checkboxes and
 * "See details". Tabs set ?status=confirmed|frozen|deactivated|deleted.
 *
 * Bare /users (the sidebar link) answered HTTP 500 on 13 Oct 2026 while every
 * /users?status=... URL loaded, so open() goes to the Confirmed URL directly;
 * USR-LST-001 checks the sidebar route on its own.
 */
export const USERS_HOME = '/users?status=confirmed';

/** Account details URL per username, found once per worker. */
const accountUrls = new Map<string, string>();

export class UsersListPage extends BasePage {
  readonly filters: FilterPanel;
  readonly table: DataTable;
  readonly pagination: Pagination;
  readonly main: Locator;
  readonly heading: Locator;
  readonly description: Locator;
  readonly firstTab: Locator;
  readonly frozenTab: Locator;
  readonly deactivatedTab: Locator;
  readonly deletedTab: Locator;
  readonly reloadButton: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly exportButton: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.filters = new FilterPanel(page);
    this.table = new DataTable(page);
    this.pagination = new Pagination(page);
    this.main = page.getByRole('main');
    this.heading = this.main.getByRole('heading', { name: 'Accounts', level: 1 });
    this.description = this.main.getByText(/^Let agents locate the right user/);
    this.firstTab = this.main.getByRole('button', { name: /^(Active|Confirmed)$/ });
    this.frozenTab = this.main.getByRole('button', { name: 'Frozen', exact: true });
    this.deactivatedTab = this.main.getByRole('button', { name: 'Deactivated', exact: true });
    this.deletedTab = this.main.getByRole('button', { name: 'Deleted', exact: true });
    this.reloadButton = this.main.getByRole('button', { name: 'reload' });
    this.searchInput = this.main.getByRole('searchbox').or(this.main.getByRole('textbox', { name: /search/i })).first();
    this.searchButton = this.main.getByRole('button', { name: 'search' });
    this.exportButton = this.main.getByRole('button', { name: 'Export' });
    this.emptyState = this.main.getByText(/^(No data|No accounts? found)/i).first();
  }

  tabs() {
    return [this.firstTab, this.frozenTab, this.deactivatedTab, this.deletedTab];
  }

  async open(path = USERS_HOME) {
    await this.goto(path);
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    await this.table.settle();
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
    await this.table.settle();
  }

  /** Row whose Username cell is exactly @username. */
  row(username: string) {
    return this.table.rows.filter({ has: this.page.getByRole('cell', { name: `@${username}`, exact: true }) });
  }

  /** Text of every cell of the data rows, by column name. */
  async column(name: string) {
    return this.table.column(name);
  }

  /**
   * Opens Account details of `username`. The search box does not narrow the
   * list in the 13 Oct build, so this walks the pages of each status tab
   * (Confirmed first) until the row shows up. The URL is cached per worker.
   */
  async openAccount(username: string) {
    const known = accountUrls.get(username);
    if (!known) accountUrls.set(username, await this.findAccount(username));
    await this.goto(accountUrls.get(username)!);
    await expect(this.page.getByRole('button', { name: 'Back to account list' })).toBeVisible({ timeout: 30_000 });
  }

  private async findAccount(username: string): Promise<string> {
    for (const status of ['confirmed', 'frozen', 'deactivated', 'deleted']) {
      await this.open(`/users?status=${status}`);
      await this.search(username);
      for (let n = 2; n <= 15 && !(await this.row(username).count()); n++) {
        const next = this.pagination.pageButton(n);
        if (!(await next.count())) break;
        await next.click();
        await this.table.settle();
      }
      const row = this.row(username);
      if (!(await row.count())) continue;
      await row.first().getByRole('button', { name: 'See details' }).click();
      await expect(this.page).toHaveURL(/\/users\/\d+/);
      return new URL(this.page.url()).pathname;
    }
    throw new Error(`@${username} not found on any status tab`);
  }

  /** Opens the first account of a status tab and returns its username. */
  async openFirstOf(tab: Locator): Promise<string | null> {
    await this.open();
    await tab.click();
    await this.table.settle();
    if (!(await this.table.rows.count())) return null;
    const username = ((await this.table.rows.first().getByRole('cell').nth(1).textContent()) ?? '').trim().replace(/^@/, '');
    await this.table.openFirstRowDetails();
    await expect(this.page).toHaveURL(/\/users\/\d+/);
    return username;
  }

  tabNamed(name: string) {
    return this.main.getByRole('button', { name: new RegExp(`^${escapeRegex(name)}$`) });
  }
}
