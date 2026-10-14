import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, blocked } from '../../src/utils/tc';
import { parseAmount } from '../../src/utils/text';
import { parseDmy, ymd } from '../../src/utils/ui';

/** Plan section 4 - Transaction Filters, account level (Figma 306:7816). */
test.describe('Fiat Wallet - 4. Account transaction filters', () => {
  test.beforeEach(async ({ fiatAccounts, fiatAccountDetails }) => {
    await fiatAccounts.open();
    await fiatAccounts.openAccount(env.walletUsername);
    await fiatAccountDetails.expectLoaded(env.walletUsername);
    await expect(fiatAccountDetails.table.rows.first()).toBeVisible();
    await fiatAccountDetails.filters.open();
  });

  /** Picks the app's option for a designed label ("Completed" -> "Complete"). */
  const statusOption = async (options: string[], wanted: RegExp) => options.find((o) => wanted.test(o)) ?? '';

  test('TC-TXNFLT-001 panel shows status, payment method, source/destination, range and date', tc('TC-TXNFLT-001'), async ({ fiatAccountDetails: d }) => {
    const f = d.filters;
    observe(`Panel: ${(await f.root.innerText()).replace(/\s+/g, ' ')}`);
    await expect(f.select('Transaction status')).toBeVisible();
    await expect(f.select('Payment method')).toBeVisible();
    await expect(f.minAmount).toBeVisible();
    await expect(f.startDate).toBeVisible();
    await expect(f.label(/source\s*\/\s*destination/i), 'Source/Destination field').toBeVisible({ timeout: 5_000 });
  });

  test('TC-TXNFLT-002 Completed returns only completed transactions', tc('TC-TXNFLT-002'), async ({ fiatAccountDetails: d }) => {
    const option = await statusOption(await d.filters.options('Transaction status'), /^complete(d)?$/i);
    await d.filters.choose('Transaction status', option);
    await d.filters.apply();
    await d.table.settle();
    const statuses = [...new Set(await d.table.column('Status'))];
    observe(`Option "${option}" -> statuses ${statuses.join(', ') || '(none)'}`);
    // The test account has completed transactions: an empty result is a failure.
    expect(statuses.length, 'completed transactions listed').toBeGreaterThan(0);
    expect(statuses.every((s) => /^complete(d)?$/i.test(s))).toBe(true);
  });

  test('TC-TXNFLT-003 Failed returns only failed transactions', tc('TC-TXNFLT-003'), async ({ fiatAccountDetails: d }) => {
    await d.filters.choose('Transaction status', 'Failed');
    await d.filters.apply();
    await d.table.settle();
    const statuses = await d.table.column('Status');
    observe(`${statuses.length} row(s) after Failed`);
    expect(statuses.every((s) => /^failed$/i.test(s))).toBe(true);
  });

  test('TC-TXNFLT-004 payment method returns only that method', tc('TC-TXNFLT-004'), async ({ fiatAccountDetails: d }) => {
    await d.filters.choose('Payment method', 'Mobile Money');
    await d.filters.apply();
    await d.table.settle();
    const methods = [...new Set(await d.table.column('Payment method'))];
    observe(`Mobile Money -> ${methods.join(', ') || '(none)'}`);
    expect(methods.length, 'the account has a Mobile Money (Momo) cash-in').toBeGreaterThan(0);
    expect(methods.every((m) => /mobile money|momo/i.test(m))).toBe(true);
  });

  test('TC-TXNFLT-005 source/destination filter', tc('TC-TXNFLT-005'), async ({ fiatAccountDetails: d }) => {
    if (!(await d.filters.label(/source\s*\/\s*destination/i).isVisible())) {
      blocked('No Source/Destination field in the account-level filter panel (missing implementation)');
    }
  });

  test('TC-TXNFLT-006 amount range returns transactions within it', tc('TC-TXNFLT-006'), async ({ fiatAccountDetails: d }) => {
    await d.filters.setAmountRange(1000, 3000);
    await d.filters.apply();
    await d.table.settle();
    const amounts = (await d.table.column('Total amount')).map(parseAmount);
    observe(`1000..3000 -> ${amounts.join(', ') || '(none)'}`);
    expect(amounts.length, 'the account has 2,000 XAF transactions').toBeGreaterThan(0);
    for (const a of amounts) expect(a >= 1000 && a <= 3000, `${a}`).toBe(true);
  });

  test('TC-TXNFLT-007 date range returns transactions within it', tc('TC-TXNFLT-007'), async ({ fiatAccountDetails: d }) => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    await d.filters.pickDateRange(ymd(start), ymd(end));
    await d.filters.apply();
    await d.table.settle();
    const dates = (await d.table.column('Date')).map(parseDmy);
    observe(`${ymd(start)}..${ymd(end)} -> ${dates.length} row(s)`);
    for (const x of dates) expect(x >= start, x.toISOString()).toBe(true);
  });

  test('TC-TXNFLT-008 status + method + range combine with AND', tc('TC-TXNFLT-008'), async ({ fiatAccountDetails: d }) => {
    const option = await statusOption(await d.filters.options('Transaction status'), /^complete(d)?$/i);
    await d.filters.choose('Transaction status', option);
    await d.filters.choose('Payment method', 'Mobile Money');
    await d.filters.setAmountRange(1000, 10000);
    await d.filters.apply();
    await d.table.settle();
    const rows = await d.allTransactions();
    observe(`${rows.length} row(s): ${rows.map((r) => `${r['Total amount']} ${r['Payment method']} ${r.Status}`).join('; ')}`);
    for (const r of rows) {
      expect(r.Status).toMatch(/^complete(d)?$/i);
      expect(r['Payment method']).toMatch(/mobile money|momo/i);
      const a = parseAmount(r['Total amount']);
      expect(a >= 1000 && a <= 10000).toBe(true);
    }
  });

  test('TC-TXNFLT-009 Reset restores the full list', tc('TC-TXNFLT-009'), async ({ fiatAccountDetails: d }) => {
    await d.filters.close();
    const full = (await d.pagination.counts()).total;
    await d.filters.open();
    await d.filters.choose('Transaction status', 'Failed');
    await d.filters.apply();
    await d.table.settle();
    await d.filters.open();
    await d.filters.resetButton.click();
    if (await d.filters.applyButton.isEnabled()) await d.filters.apply();
    else await d.filters.close();
    await d.table.settle();
    const after = (await d.pagination.counts()).total;
    observe(`Full ${full}, after Reset ${after}`);
    expect(after).toBe(full);
  });

  test('TC-TXNFLT-010 status options use the badge labels', tc('TC-TXNFLT-010'), async ({ fiatAccountDetails: d }) => {
    const options = await d.filters.options('Transaction status');
    observe(`Options: ${options.join(', ')}`);
    expect(options).toEqual(expect.arrayContaining(['Completed', 'Failed']));
  });

  test('TC-TXNFLT-011 Apply is disabled until a value is set', tc('TC-TXNFLT-011'), async ({ fiatAccountDetails: d }) => {
    await expect(d.filters.applyButton).toBeDisabled();
  });

  test('TC-TXNFLT-012 × discards unapplied changes', tc('TC-TXNFLT-012'), async ({ fiatAccountDetails: d }) => {
    const before = await d.table.rows.count();
    await d.filters.choose('Transaction status', 'Rejected');
    await d.filters.close();
    expect(await d.table.rows.count()).toBe(before);
  });
});
