import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { AppShell } from '../AppShell';
import { DataTable } from '../components/DataTable';

/** Savings box > Account list. CONFIRMED heading + "Locate the right account" description. */
export class SavingsAccountListPage extends BasePage {
  readonly shell: AppShell;
  readonly table: DataTable;
  readonly heading: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.shell = new AppShell(page);
    this.table = new DataTable(page);
    this.heading = page.getByRole('heading', { name: 'Account list' });
    this.searchInput = page.getByRole('textbox', { name: 'Search account...' });
  }

  async open() {
    await this.goto('/');
    await this.shell.open('Savings box', 'Account list');
    await expect(this.heading).toBeVisible();
  }

  async openAccount(username: string) {
    await this.searchInput.fill(username);
    await this.searchInput.press('Enter');
    await this.table.openRowDetails(new RegExp(username));
  }
}
