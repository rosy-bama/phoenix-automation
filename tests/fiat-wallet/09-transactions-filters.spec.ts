import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { observe, blocked, DESIGN } from '../../src/utils/tc';
import { parseAmount } from '../../src/utils/text';
import { parseDmy, crashed } from '../../src/utils/ui';
import type { TxnTab } from '../../src/pages/fiat/FiatTransactionsPage';
import type { FiatTransactionsPage } from '../../src/pages/fiat/FiatTransactionsPage';

/** Plan section 9 - Transactions module filters (Figma 473:12982, 511:20561, 514:21573, 518:23679). */
const TABS: TxnTab[] = ['Deposits', 'Withdrawals', 'Sales', 'Purchases'];

async function openFilters(t: FiatTransactionsPage, tab: TxnTab) {
  await t.open();
  await t.openTab(tab);
  await expect(t.table.rows.first()).toBeVisible();
  await t.filters.open();
}

/** Applies and fails clearly if the page crashes. */
async function apply(t: FiatTransactionsPage, what: string) {
  await t.filters.apply();
  await t.table.table.or(t.oops).first().waitFor();
  if (await crashed(t.oops.page())) throw new Error(`"Oops! An unexpected error occurred." after applying ${what}`);
  await t.table.settle();
}

test.describe('Fiat Wallet - 9. Transactions filters', () => {
  const fieldCases: [string, TxnTab, string][] = [
    ['TC-TXNMODFLT-001', 'Deposits', 'Payment method'],
    ['TC-TXNMODFLT-002', 'Withdrawals', 'Payment method'],
    ['TC-TXNMODFLT-003', 'Sales', 'Product'],
    ['TC-TXNMODFLT-004', 'Purchases', 'Product'],
  ];
  for (const [id, tab, typeField] of fieldCases) {
    test(`${id} ${tab} panel has status, ${typeField}, amount range and date`, tc(id), async ({ fiatTransactions: t }) => {
      await openFilters(t, tab);
      const f = t.filters;
      observe(`Panel: ${(await f.root.innerText()).replace(/\s+/g, ' ')}`);
      await expect(f.select('Transaction status')).toBeVisible();
      await expect(f.minAmount).toBeVisible();
      await expect(f.maxAmount).toBeVisible();
      await expect(f.startDate).toBeVisible();
      await expect(f.label(/source\s*\/\s*destination/i)).toHaveCount(0);
      await expect(f.label(typeField), `${typeField} field`).toBeVisible(DESIGN);
      if (typeField === 'Product') await expect(f.label('Payment method')).toHaveCount(0);
    });
  }

  test('TC-TXNMODFLT-005 status filter returns only that status', tc('TC-TXNMODFLT-005'), async ({ fiatTransactions: t }) => {
    const notes: string[] = [];
    for (const [tab, status] of [['Deposits', 'Failed'], ['Withdrawals', 'Failed'], ['Deposits', 'Complete']] as [TxnTab, string][]) {
      await openFilters(t, tab);
      await t.filters.choose('Transaction status', status);
      try {
        await apply(t, `status ${status} on ${tab}`);
        const statuses = [...new Set(await t.table.column('Status'))];
        notes.push(`${tab}/${status}: ${statuses.join(', ') || '0 rows'}`);
        expect.soft(statuses.every((s) => s.toLowerCase().startsWith(status.toLowerCase())), `${tab}/${status}`).toBe(true);
      } catch (e) {
        notes.push(`${tab}/${status}: ${(e as Error).message}`);
        expect.soft(false, `${tab}/${status}: ${(e as Error).message}`).toBe(true);
      }
    }
    observe(notes.join(' | '));
  });

  test('TC-TXNMODFLT-006 payment method filter', tc('TC-TXNMODFLT-006'), async ({ fiatTransactions: t }) => {
    await openFilters(t, 'Deposits');
    await t.filters.choose('Payment method', 'Mobile Money');
    await apply(t, 'payment method Mobile Money');
    const methods = [...new Set(await t.table.column('Payment method'))];
    observe(`Mobile Money -> ${methods.join(', ') || '0 rows'}`);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => /mobile money|momo/i.test(m))).toBe(true);
  });

  test('TC-TXNMODFLT-007 product filter on Sales / Purchases', tc('TC-TXNMODFLT-007'), async ({ fiatTransactions: t }) => {
    await openFilters(t, 'Sales');
    if (!(await t.filters.label('Product').isVisible())) blocked('No Product field on the Sales/Purchases filter panel (it shows Payment method) - see TC-TXNMODFLT-003');
    const [first] = await t.filters.options('Product');
    await t.filters.choose('Product', first);
    await apply(t, `product ${first}`);
    const products = [...new Set(await t.table.column('Product'))];
    expect(products).toEqual([first]);
  });

  test('TC-TXNMODFLT-008 amount range on every tab', tc('TC-TXNMODFLT-008'), async ({ fiatTransactions: t }) => {
    const notes: string[] = [];
    for (const tab of TABS) {
      await openFilters(t, tab);
      await t.filters.setAmountRange(1000, 5000);
      await apply(t, `amount 1000..5000 on ${tab}`);
      const amounts = (await t.table.column('Total amount')).map(parseAmount);
      const out = amounts.filter((a) => a < 1000 || a > 5000);
      notes.push(`${tab}: ${amounts.length} rows, ${out.length} outside (${out.slice(0, 3).join(', ')})`);
      expect.soft(out, tab).toEqual([]);
    }
    observe(notes.join(' | '));
  });

  test('TC-TXNMODFLT-009 creation date range on every tab', tc('TC-TXNMODFLT-009'), async ({ fiatTransactions: t }) => {
    const notes: string[] = [];
    for (const tab of TABS) {
      await openFilters(t, tab);
      await t.filters.startDate.click();
      await t.filters.quickRange('Last 90 days').click();
      await apply(t, `Last 90 days on ${tab}`);
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - 90);
      const dates = (await t.table.column('Date')).map(parseDmy);
      const out = dates.filter((d) => d < from);
      notes.push(`${tab}: ${dates.length} rows, ${out.length} older than 90 days`);
      expect.soft(out.length, tab).toBe(0);
    }
    observe(notes.join(' | '));
  });

  test('TC-TXNMODFLT-010 status + method + amount combine with AND', tc('TC-TXNMODFLT-010'), async ({ fiatTransactions: t }) => {
    await openFilters(t, 'Deposits');
    await t.filters.choose('Transaction status', 'Complete');
    await t.filters.choose('Payment method', 'Mobile Money');
    await t.filters.setAmountRange(1000, 50000);
    await apply(t, 'status + payment method + amount');
    const statuses = await t.table.column('Status');
    const methods = await t.table.column('Payment method');
    const amounts = (await t.table.column('Total amount')).map(parseAmount);
    observe(`${statuses.length} rows: methods ${[...new Set(methods)].join(', ')}; amounts ${Math.min(...amounts)}..${Math.max(...amounts)}`);
    statuses.forEach((s) => expect(s).toMatch(/^complete/i));
    methods.forEach((m) => expect(m).toMatch(/mobile money|momo/i));
    amounts.forEach((a) => expect(a >= 1000 && a <= 50000).toBe(true));
  });

  test('TC-TXNMODFLT-011 Reset clears values and keeps the panel open', tc('TC-TXNMODFLT-011'), async ({ fiatTransactions: t }) => {
    await openFilters(t, 'Deposits');
    const f = t.filters;
    const defaults = [await f.minAmount.inputValue(), await f.maxAmount.inputValue()];
    await f.choose('Transaction status', 'Complete');
    await f.setAmountRange(1000, 5000);
    await f.resetButton.click();
    await expect(f.heading).toBeVisible();
    observe(`After Reset: min "${await f.minAmount.inputValue()}", max "${await f.maxAmount.inputValue()}", status "${(await f.select('Transaction status').innerText()).trim()}"`);
    expect([await f.minAmount.inputValue(), await f.maxAmount.inputValue()]).toEqual(defaults);
    await expect(f.select('Transaction status')).not.toContainText('Complete');
  });

  test('TC-TXNMODFLT-012 Apply is disabled until a value is set', tc('TC-TXNMODFLT-012'), async ({ fiatTransactions: t }) => {
    await openFilters(t, 'Deposits');
    await expect(t.filters.applyButton).toBeDisabled();
  });

  test('TC-TXNMODFLT-014 subtitle and labels match the design', tc('TC-TXNMODFLT-014'), async ({ fiatTransactions: t }) => {
    await openFilters(t, 'Sales');
    const f = t.filters;
    const subtitle = (await f.subtitle.textContent())?.trim();
    observe(`Subtitle "${subtitle}"; panel: ${(await f.root.innerText()).replace(/\s+/g, ' ')}`);
    expect.soft(subtitle).toBe('Manage users transactions.');
    for (const label of ['Balance range', 'Start amount', 'End amount', 'Creation date']) {
      await expect.soft(f.label(label), label).toBeVisible(DESIGN);
    }
  });

  test('TC-TXNMODFLT-015 amount fields start empty', tc('TC-TXNMODFLT-015'), async ({ fiatTransactions: t }) => {
    await openFilters(t, 'Deposits');
    const min = await t.filters.minAmount.inputValue();
    const max = await t.filters.maxAmount.inputValue();
    observe(`Defaults: start "${min}", end "${max}"`);
    expect(min).toBe('');
    expect(max).toBe('');
  });
});
