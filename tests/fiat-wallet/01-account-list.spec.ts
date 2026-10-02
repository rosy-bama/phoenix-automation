import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';

/** Test plan Section 1 - Wallet Account List. */
test.describe('Fiat Wallet - 1. Account list', () => {
  test.beforeEach(async ({ fiatAccounts }) => {
    await fiatAccounts.open();
  });

  test('FW-1.01 page shows heading, description, wallet tabs, search and filters', { tag: ['@smoke'] }, async ({ fiatAccounts }) => {
    await expect(fiatAccounts.mainWalletTab).toBeVisible();
    await expect(fiatAccounts.jaraWalletTab).toBeVisible();
    await expect(fiatAccounts.rewardsTab).toBeVisible();
    await expect(fiatAccounts.searchInput).toBeVisible();
    await expect(fiatAccounts.filters.openButton).toBeVisible();
    await expect(fiatAccounts.reloadButton).toBeVisible();
  });

  test('FW-1.02 list loads at least one account', { tag: ['@smoke'] }, async ({ fiatAccounts }) => {
    await expect(fiatAccounts.table.rows.first()).toBeVisible();
  });

  test('FW-1.03 switching wallet tabs keeps the list usable', async ({ fiatAccounts }) => {
    for (const tab of [fiatAccounts.jaraWalletTab, fiatAccounts.rewardsTab, fiatAccounts.mainWalletTab]) {
      await tab.click();
      await expect(fiatAccounts.heading).toBeVisible();
      await expect(fiatAccounts.table.table).toBeVisible();
    }
  });

  test('FW-1.04 search by username returns the matching account', { tag: ['@smoke'] }, async ({ fiatAccounts }) => {
    await fiatAccounts.search(env.walletUsername);
    await expect(fiatAccounts.table.rowContaining(`@${env.walletUsername}`).first()).toBeVisible();
    // Retries until the list has re-rendered with the search result -
    // reading rows.all() straight away raced the search (2 Oct 2026).
    await expect(fiatAccounts.table.rows.filter({ hasNotText: env.walletUsername })).toHaveCount(0);
  });

  test('FW-1.05 empty state - search with no match returns zero rows', async ({ fiatAccounts, page }) => {
    await fiatAccounts.search('zz-no-such-account-000');
    await expect(fiatAccounts.table.rows).toHaveCount(0);
    // INFERRED copy - confirm the exact empty-state text against Figma.
    await expect(page.getByText(/no (data|results|accounts?)/i).first()).toBeVisible();
  });

  test('FW-1.06 reload keeps the list populated', async ({ fiatAccounts }) => {
    await fiatAccounts.reloadButton.click();
    await expect(fiatAccounts.table.rows.first()).toBeVisible();
  });

  test('FW-1.07 Select all checks every row, then unchecks them', async ({ fiatAccounts }) => {
    await expect(fiatAccounts.table.rows.first()).toBeVisible();
    await fiatAccounts.table.selectAll.check();
    await expect(fiatAccounts.table.rowCheckbox(1)).toBeChecked();
    await expect(fiatAccounts.table.rowCheckbox(2)).toBeChecked();
    await fiatAccounts.table.selectAll.uncheck();
    await expect(fiatAccounts.table.rowCheckbox(1)).not.toBeChecked();
  });

  test('FW-1.08 selecting single rows toggles only those rows', async ({ fiatAccounts }) => {
    await fiatAccounts.table.rowCheckbox(1).check();
    await fiatAccounts.table.rowCheckbox(2).check();
    await expect(fiatAccounts.table.rowCheckbox(1)).toBeChecked();
    await expect(fiatAccounts.table.rowCheckbox(3)).not.toBeChecked();
    await fiatAccounts.table.rowCheckbox(1).uncheck();
    await expect(fiatAccounts.table.rowCheckbox(1)).not.toBeChecked();
    await expect(fiatAccounts.table.rowCheckbox(2)).toBeChecked();
  });

  test('FW-1.09 page size 10 / 20 / 50 caps the row count', async ({ fiatAccounts }) => {
    for (const size of [10, 20, 50] as const) {
      await fiatAccounts.pagination.setPageSize(size);
      await expect(fiatAccounts.table.rows.first()).toBeVisible();
      expect(await fiatAccounts.table.rows.count()).toBeLessThanOrEqual(size);
    }
  });

  test('FW-1.10 See details opens the account details page', { tag: ['@smoke'] }, async ({ fiatAccounts, fiatAccountDetails }) => {
    await fiatAccounts.openAccount(env.walletUsername);
    await fiatAccountDetails.expectLoaded(env.walletUsername);
  });
});
