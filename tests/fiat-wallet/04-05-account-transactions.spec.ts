import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';

/**
 * Test plan Sections 4 (Transaction Filters, account level) and 5
 * (Transaction Details, account level). Options CONFIRMED from codegen.
 */
test.describe('Fiat Wallet - 4. Account transaction filters', () => {
  test.beforeEach(async ({ fiatAccounts, fiatAccountDetails }) => {
    await fiatAccounts.open();
    await fiatAccounts.openAccount(env.walletUsername);
    await fiatAccountDetails.expectLoaded(env.walletUsername);
    await fiatAccountDetails.filters.open();
  });

  test('FW-4.01 Status options: Pending, Complete, Failed, Payout Failed, Rejected', async ({ fiatAccountDetails: d }) => {
    await d.filters.select('Status').click();
    for (const o of ['Pending', 'Complete', 'Failed', 'Payout Failed', 'Rejected']) {
      await expect(d.filters.dropdownOptions().filter({ hasText: new RegExp(`^${o}$`) })).toBeVisible();
    }
  });

  test('FW-4.02 Payment method options include Bank Transfer, Mobile Money, Card, Wallet, Gimac Pay', async ({ fiatAccountDetails: d }) => {
    await d.filters.select('Payment method').click();
    for (const o of ['Bank Transfer', 'Mobile Money', 'Card', 'Wallet', 'Gimac Pay']) {
      await expect(d.filters.dropdownOptions().filter({ hasText: new RegExp(`^${o}$`) })).toBeVisible();
    }
  });

  test('FW-4.03 transaction-level range is labelled "Amount range" (not "Balance")', async ({ fiatAccountDetails: d }) => {
    await expect(d.filters.root.getByText('Amount range', { exact: true })).toBeVisible();
    await expect(d.filters.root.getByText(/balance range/i)).toBeHidden();
  });

  test('FW-4.04 Status = Complete shows only Complete transactions', async ({ fiatAccountDetails: d }) => {
    await d.filters.choose('Status', 'Complete');
    await d.filters.apply();
    for (const row of await d.table.rows.all()) {
      await expect(row).toContainText(/complete/i);
    }
  });

  test('FW-4.05 × closes the panel without applying', async ({ fiatAccountDetails: d }) => {
    const before = await d.table.rows.count();
    await d.filters.choose('Status', 'Rejected');
    await d.filters.close();
    expect(await d.table.rows.count()).toBe(before);
  });
});

test.describe('Fiat Wallet - 5. Account transaction details', () => {
  test.beforeEach(async ({ fiatAccounts, fiatAccountDetails }) => {
    await fiatAccounts.open();
    await fiatAccounts.openAccount(env.walletUsername);
    await fiatAccountDetails.expectLoaded(env.walletUsername);
    await fiatAccountDetails.table.openFirstRowDetails();
    await fiatAccountDetails.txnDetails.expectOpen();
  });

  const fields = [
    'Total amount', 'Client', 'Transaction type', 'Amount', 'Fees', 'Payment method',
    'Source', 'Status', 'Date', 'Transaction reference', 'Transaction mode',
    'Initiated by', 'Internal reference', 'Payment provider',
  ];

  test('FW-5.01 details panel shows every field', { tag: ['@smoke'] }, async ({ fiatAccountDetails: d }) => {
    for (const f of fields) await expect.soft(d.txnDetails.label(f), f).toBeVisible();
  });

  test('FW-5.02 Client matches the account being viewed', async ({ fiatAccountDetails: d }) => {
    expect(await d.txnDetails.value('Client')).toContain(env.walletUsername);
  });

  // INFERRED business rule - confirm for withdrawals (may be Amount - Fees).
  test('FW-5.03 Total amount = Amount + Fees', async ({ fiatAccountDetails: d }) => {
    const n = async (f: string) => Number((await d.txnDetails.value(f)).replace(/[^\d.]/g, '') || 0);
    expect(await n('Total amount')).toBeCloseTo((await n('Amount')) + (await n('Fees')), 2);
  });

  test('FW-5.04 Date uses DD/MM/YYYY HH:mm', async ({ fiatAccountDetails: d }) => {
    expect(await d.txnDetails.value('Date')).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });

  test('FW-5.05 Transaction reference has a Copy action', async ({ fiatAccountDetails: d }) => {
    await expect(d.txnDetails.root.getByLabel('Copy', { exact: true }).first()).toBeVisible();
  });

  test('FW-5.06 × closes the panel', async ({ fiatAccountDetails: d }) => {
    await d.txnDetails.close();
  });
});
