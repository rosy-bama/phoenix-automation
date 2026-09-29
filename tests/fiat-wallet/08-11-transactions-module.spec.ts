import { test, expect } from '../../src/fixtures/test-fixtures';
import { knownBug } from '../../src/utils/known-bug';
import { FiatTransactionsPage, TxnTab } from '../../src/pages/fiat/FiatTransactionsPage';

/**
 * Test plan Sections 8-11 - Transactions module (/fiat/transactions).
 * Section 11 (Sales/Purchases details) had 7/8 failures on 11 Aug 2026:
 * missing Client field, Payment method vs Product mapping, missing Reason
 * for manual transactions.
 */
test.describe('Fiat Wallet - 8. Transactions list', () => {
  test.beforeEach(async ({ fiatTransactions }) => {
    await fiatTransactions.open();
  });

  test('FW-8.01 page shows heading, description and four tabs', { tag: ['@smoke'] }, async ({ fiatTransactions: t }) => {
    await expect(t.description).toBeVisible();
    for (const tab of ['Deposits', 'Withdrawals', 'Sales', 'Purchases'] as TxnTab[]) {
      await expect(t.tab(tab)).toBeVisible();
    }
  });

  test('FW-8.02 table has the expected columns, with "Date" (not "Date joined")', async ({ fiatTransactions: t }) => {
    for (const c of FiatTransactionsPage.columns) {
      await expect.soft(t.table.columnHeader(c), c).toBeVisible();
    }
    await expect(t.table.table.getByRole('columnheader', { name: /date joined/i })).toHaveCount(0);
  });

  for (const tab of ['Deposits', 'Withdrawals', 'Sales', 'Purchases'] as TxnTab[]) {
    test(`FW-8.03 ${tab} tab loads without error`, async ({ fiatTransactions: t, page }) => {
      await t.openTab(tab);
      await expect(t.table.table).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Oops!' })).toBeHidden();
    });
  }

  test('FW-8.04 page size 10 / 20 / 50 caps the row count', async ({ fiatTransactions: t }) => {
    for (const size of [10, 20, 50] as const) {
      await t.pagination.setPageSize(size);
      await expect(t.table.rows.first()).toBeVisible();
      expect(await t.table.rows.count()).toBeLessThanOrEqual(size);
    }
  });

  test('FW-8.05 result counter reads "Showing X to Y of Z results"', { tag: ['@known-bug'] }, async ({ fiatTransactions: t }) => {
    knownBug('APP-PAGINATION-COMMA', 'App-wide stray comma: "Showing X to Y of, Z results"');
    await expect(t.pagination.counter).toHaveText(/^Showing \d+ to \d+ of \d+ results$/);
  });
});

test.describe('Fiat Wallet - 9. Transactions filters', () => {
  test.beforeEach(async ({ fiatTransactions }) => {
    await fiatTransactions.open();
    await fiatTransactions.filters.open();
  });

  test('FW-9.01 filter panel shows Status, Payment method, Amount range, Date range', async ({ fiatTransactions: t }) => {
    await expect(t.filters.select('Status')).toBeVisible();
    await expect(t.filters.select('Payment method')).toBeVisible();
    await expect(t.filters.root.getByText('Amount range', { exact: true })).toBeVisible();
    await expect(t.filters.startDate).toBeVisible();
  });

  test('FW-9.02 subtitle reads "Manage transactions."', async ({ fiatTransactions: t }) => {
    // Convention: transaction-level panels say "Manage transactions." or
    // "Manage users' transactions.". Low priority copy check.
    await expect(t.filters.root.getByText(/^Manage (users' )?transactions\.$/)).toBeVisible();
  });

  test('FW-9.03 Status = Complete shows only Complete rows', async ({ fiatTransactions: t }) => {
    await t.filters.choose('Status', 'Complete');
    await t.filters.apply();
    for (const row of await t.table.rows.all()) await expect(row).toContainText(/complete/i);
  });

  test('FW-9.04 empty state - impossible amount range returns zero rows', async ({ fiatTransactions: t }) => {
    await t.filters.setAmountRange(999_999_999_000, 999_999_999_999);
    await t.filters.apply();
    await expect(t.table.rows).toHaveCount(0);
  });
});

const baseFields = ['Total amount', 'Client', 'Transaction type', 'Amount', 'Fees', 'Status', 'Date', 'Transaction reference'];

test.describe('Fiat Wallet - 10. Txn details - Deposits / Withdrawals', () => {
  for (const tab of ['Deposits', 'Withdrawals'] as TxnTab[]) {
    test(`FW-10.01 ${tab}: details panel shows core fields and payment method`, async ({ fiatTransactions: t }) => {
      await t.open();
      await t.openTab(tab);
      test.skip((await t.table.rows.count()) === 0, `No ${tab} on testbox`);
      await t.table.openFirstRowDetails();
      await t.txnDetails.expectOpen();
      for (const f of [...baseFields, 'Payment method']) await expect.soft(t.txnDetails.label(f), f).toBeVisible();
    });
  }

  test('FW-10.02 Deposit: Transaction type is cash_in', async ({ fiatTransactions: t }) => {
    await t.open();
    await t.openTab('Deposits');
    await t.table.openFirstRowDetails();
    expect(await t.txnDetails.value('Transaction type')).toMatch(/cash_in/i);
  });
});

test.describe('Fiat Wallet - 11. Txn details - Sales / Purchases', () => {
  for (const tab of ['Sales', 'Purchases'] as TxnTab[]) {
    test(`FW-11.01 ${tab}: details panel shows the Client field`, { tag: ['@known-bug'] }, async ({ fiatTransactions: t }) => {
      knownBug('FW-11.01', 'Client field missing on Sales/Purchases details (TSR 11 Aug 2026)');
      await t.open();
      await t.openTab(tab);
      await t.table.openFirstRowDetails();
      await t.txnDetails.expectOpen();
      await expect(t.txnDetails.label('Client')).toBeVisible({ timeout: 5_000 });
    });

    test(`FW-11.02 ${tab}: shows Product instead of Payment method`, { tag: ['@known-bug'] }, async ({ fiatTransactions: t }) => {
      knownBug('FW-11.02', 'Payment method shown where Product is expected (TSR 11 Aug 2026)');
      await t.open();
      await t.openTab(tab);
      await t.table.openFirstRowDetails();
      await t.txnDetails.expectOpen();
      await expect(t.txnDetails.label('Product')).toBeVisible({ timeout: 5_000 });
    });
  }

  test('FW-11.03 Sales: no "Complete transaction" action (by design)', async ({ fiatTransactions: t, page }) => {
    // Rose confirmed: Complete-transaction does not exist for Sales/Purchases.
    await t.open();
    await t.openTab('Sales');
    await t.table.openFirstRowDetails();
    await t.txnDetails.expectOpen();
    await expect(page.getByRole('button', { name: /complete transaction/i })).toHaveCount(0);
  });
});
