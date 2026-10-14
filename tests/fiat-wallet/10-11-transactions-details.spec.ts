import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, blocked, DESIGN } from '../../src/utils/tc';
import { readClipboard } from '../../src/utils/ui';
import { listRows, openRow, findManualDeposit, isFailed, isComplete } from '../../src/fiat/test-data';
import type { TxnTab, FiatTransactionsPage } from '../../src/pages/fiat/FiatTransactionsPage';

/**
 * Plan sections 10 (Deposits / Withdrawals details, Figma 473:13085,
 * 484:19812, 487:20422) and 11 (Sales / Purchases details, Figma 487:24818,
 * 487:26042).
 */
const coreFields = ['Total amount', 'Client', 'Transaction type', 'Amount', 'Status', 'Date', 'Transaction reference'];

/** Opens the n-th row of a tab and returns its cells. */
async function openNth(t: FiatTransactionsPage, tab: TxnTab, n = 0) {
  await t.open();
  await t.openTab(tab);
  await expect(t.table.rows.first()).toBeVisible();
  const row = t.table.rows.nth(n);
  const cells = (await row.getByRole('cell').allTextContents()).map((c) => c.trim());
  await row.getByRole('button', { name: 'See details' }).click();
  await t.txnDetails.expectOpen();
  return cells;
}

/** A failed deposit, found by walking the Deposits list (the status filter crashes). */
async function failedDeposit(t: FiatTransactionsPage) {
  const rows = await listRows(t, 'Deposits');
  const row = rows.find(isFailed);
  if (!row) unmet(`No failed deposit among the ${rows.length} deposits on testbox (filtering by status Failed crashes the page, so the whole list was scanned)`);
  return row;
}

test.describe('Fiat Wallet - 10. Txn details - Deposits / Withdrawals', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  for (const [id, tab, type] of [['TC-TXNMODDET-001', 'Deposits', /cash.?in/i], ['TC-TXNMODDET-002', 'Withdrawals', /cash.?out/i]] as const) {
    test(`${id} ${tab} details show all designed fields`, tc(id), async ({ fiatTransactions: t }) => {
      const cells = await openNth(t, tab);
      const p = t.txnDetails;
      observe(`Panel: ${await p.text()}`);
      for (const f of [...coreFields, 'Fees', 'Payment method', 'Source']) await expect.soft(p.label(f), f).toBeVisible();
      expect.soft(await p.value('Client'), 'Client = row').toBe(cells[1]);
      expect(await p.value('Transaction type')).toMatch(type);
    });
  }

  test('TC-TXNMODDET-003 manual deposit shows mode, initiator and reason', tc('TC-TXNMODDET-003'), async ({ fiatTransactions: t }) => {
    const manual = await findManualDeposit(t);
    if (!manual) unmet('No manual deposit found on testbox (no "Cash" deposit with Transaction mode = manual)');
    await openRow(t, 'Deposits', manual);
    const p = t.txnDetails;
    observe(`${manual.Username} ${manual.Date}: ${await p.text()}`);
    expect.soft(await p.value('Transaction mode')).toMatch(/^manual$/i);
    expect.soft((await p.value('Initiated by')).replace(/^@/, '')).not.toBe(manual.Username.replace(/^@/, ''));
    await expect(p.label('Reason')).toBeVisible(DESIGN);
  });

  test('TC-TXNMODDET-004 automatic deposit hides Reason', tc('TC-TXNMODDET-004'), async ({ fiatTransactions: t }) => {
    const cells = await openNth(t, 'Deposits');
    const p = t.txnDetails;
    const mode = await p.value('Transaction mode');
    if (!/automatic/i.test(mode)) unmet(`First deposit is "${mode}"`);
    observe(`Mode "${mode}", Reason shown ${await p.has('Reason')}, Initiated by "${await p.value('Initiated by')}" (row ${cells[1]})`);
    expect(await p.has('Reason')).toBe(false);
    expect((await p.value('Initiated by')).replace(/^@/, '')).toBe(cells[1].replace(/^@/, ''));
  });

  test('TC-TXNMODDET-005 Internal payment reference and Payment provider', tc('TC-TXNMODDET-005'), async ({ fiatTransactions: t }) => {
    await openNth(t, 'Withdrawals');
    const p = t.txnDetails;
    observe(`Provider "${await p.value('Payment provider')}"; "Internal payment reference" label ${await p.has('Internal payment reference')}, "Internal reference" ${await p.has('Internal reference')}`);
    expect.soft(await p.value('Payment provider')).not.toBe('');
    await expect(p.label('Internal payment reference')).toBeVisible(DESIGN);
  });

  test('TC-TXNMODDET-007 failed deposit offers Complete transaction', tc('TC-TXNMODDET-007'), async ({ fiatTransactions: t }) => {
    const row = await failedDeposit(t);
    await openRow(t, 'Deposits', row);
    observe(`${row.Username} ${row['Total amount']} ${row.Date}`);
    await expect(t.txnDetails.completeButton).toBeVisible();
  });

  test('TC-TXNMODDET-008 completed deposit has no Complete transaction', tc('TC-TXNMODDET-008'), async ({ fiatTransactions: t }) => {
    const row = (await listRows(t, 'Deposits')).find(isComplete);
    if (!row) unmet('No completed deposit');
    await openRow(t, 'Deposits', row);
    await expect(t.txnDetails.completeButton).toHaveCount(0);
  });

  test('TC-TXNMODDET-009 Complete transaction opens the completion flow', tc('TC-TXNMODDET-009'), async ({ fiatTransactions: t, fiatManualOp: m, page }) => {
    const row = await failedDeposit(t);
    await openRow(t, 'Deposits', row);
    if (!(await t.txnDetails.completeButton.isVisible())) blocked('"Complete transaction" is not shown on a failed deposit (TC-TXNMODDET-007)');
    await t.txnDetails.completeButton.click();
    await m.expectPaymentInformation();
    observe(`Opened ${page.url()}`);
  });

  test('TC-TXNMODDET-010 completion appears in the audit trail', tc('TC-TXNMODDET-010'), async () => {
    blocked('No audit-trail screen exists in Phoenix (Figma "Missing": audit log view)');
  });

  test('TC-TXNMODDET-012 closing the panel keeps the page', tc('TC-TXNMODDET-012'), async ({ fiatTransactions: t }) => {
    await t.open();
    await expect(t.table.rows.first()).toBeVisible();
    await t.pagination.pageButton(2).click();
    await t.pagination.waitForFrom(21);
    await t.table.openFirstRowDetails();
    await t.txnDetails.close();
    expect((await t.pagination.counts()).from).toBe(21);
  });

  test('TC-TXNMODDET-013 copy icons copy the full values', tc('TC-TXNMODDET-013'), async ({ fiatTransactions: t, page }) => {
    await openNth(t, 'Deposits');
    const p = t.txnDetails;
    const ref = await p.value('Transaction reference');
    const internalLabel = (await p.has('Internal payment reference')) ? 'Internal payment reference' : 'Internal reference';
    const internal = await p.value(internalLabel);
    await p.copyButtons.nth(0).click();
    const c1 = await readClipboard(page);
    await p.copyButtons.nth(1).click();
    const c2 = await readClipboard(page);
    observe(`Reference shown "${ref}" copied "${c1}"; internal shown "${internal}" copied "${c2}"`);
    expect(c1.startsWith(ref.replace(/(…|\.\.\.)$/, ''))).toBe(true);
    expect(c2.startsWith(internal.replace(/(…|\.\.\.)$/, ''))).toBe(true);
  });

  test('TC-TXNMODDET-014 Client and Source match the row', tc('TC-TXNMODDET-014'), async ({ fiatTransactions: t }) => {
    const cells = await openNth(t, 'Deposits');
    const client = await t.txnDetails.value('Client');
    const source = await t.txnDetails.value('Source');
    observe(`Row: user ${cells[1]}, source ${cells[4]} — panel: Client ${client}, Source ${source}`);
    expect.soft(client).toBe(cells[1]);
    expect(source).toBe(cells[4]);
  });
});

test.describe('Fiat Wallet - 11. Txn details - Sales / Purchases', () => {
  const productFields = ['Total amount', 'Client', 'Transaction type', 'Amount', 'Destination', 'Source', 'Product', 'Status', 'Date', 'Transaction reference'];

  for (const [id, tab, type] of [['TC-TXNMODDET2-001', 'Sales', /transfer.?from/i], ['TC-TXNMODDET2-002', 'Purchases', /transfer.?to/i]] as const) {
    test(`${id} ${tab} details show all designed fields`, tc(id), async ({ fiatTransactions: t }) => {
      await openNth(t, tab);
      const p = t.txnDetails;
      observe(`Panel: ${await p.text()}`);
      const missing: string[] = [];
      for (const f of productFields) if (!(await p.has(f))) missing.push(f);
      expect.soft(await p.value('Transaction type')).toMatch(type);
      expect(missing, `missing fields: ${missing.join(', ')}`).toEqual([]);
    });
  }

  test('TC-TXNMODDET2-003 manual sale/purchase shows mode, initiator and reason', tc('TC-TXNMODDET2-003'), async ({ fiatTransactions: t }) => {
    for (const tab of ['Sales', 'Purchases'] as TxnTab[]) {
      for (const row of (await listRows(t, tab)).slice(0, 5)) {
        await openRow(t, tab, row);
        if (/manual/i.test(await t.txnDetails.value('Transaction mode'))) {
          observe(`${tab} ${row.Username}: ${await t.txnDetails.text()}`);
          await expect(t.txnDetails.label('Reason')).toBeVisible(DESIGN);
          return;
        }
      }
    }
    unmet('No manual Sales/Purchases transaction among the most recent ones on testbox');
  });

  test('TC-TXNMODDET2-004 automatic sale/purchase hides Reason', tc('TC-TXNMODDET2-004'), async ({ fiatTransactions: t }) => {
    await openNth(t, 'Sales');
    const mode = await t.txnDetails.value('Transaction mode');
    if (!/automatic/i.test(mode)) unmet(`First sale is "${mode}"`);
    expect(await t.txnDetails.has('Reason')).toBe(false);
  });

  test('TC-TXNMODDET2-005 Payment operator and Payment provider', tc('TC-TXNMODDET2-005'), async ({ fiatTransactions: t }) => {
    await openNth(t, 'Purchases');
    const p = t.txnDetails;
    observe(`Payment operator ${await p.has('Payment operator')}, Payment provider ${await p.has('Payment provider')}, Internal reference ${await p.has('Internal reference')}`);
    await expect.soft(p.label('Payment provider')).toBeVisible();
    await expect(p.label('Payment operator')).toBeVisible(DESIGN);
  });

  test('TC-TXNMODDET2-006 Product field matches the row product', tc('TC-TXNMODDET2-006'), async ({ fiatTransactions: t }) => {
    const cells = await openNth(t, 'Purchases');
    const product = (await t.txnDetails.has('Product')) ? await t.txnDetails.value('Product') : '(no Product field)';
    observe(`Row product "${cells[4]}", panel "${product}"`);
    expect(product).toBe(cells[4]);
  });

  test('TC-TXNMODDET2-007 Source / Destination follow the direction', tc('TC-TXNMODDET2-007'), async ({ fiatTransactions: t }) => {
    const notes: string[] = [];
    for (const tab of ['Sales', 'Purchases'] as TxnTab[]) {
      await openNth(t, tab);
      const p = t.txnDetails;
      const source = await p.value('Source');
      const dest = (await p.has('Destination')) ? await p.value('Destination') : '(no Destination field)';
      notes.push(`${tab}: Source "${source}", Destination "${dest}"`);
      const wallet = /main wallet/i;
      if (tab === 'Sales') expect.soft(dest, 'Sale destination').toMatch(wallet);
      else expect.soft(source, 'Purchase source').toMatch(wallet);
    }
    observe(notes.join(' | '));
  });

  test('TC-TXNMODDET2-008 no Complete transaction on Sales / Purchases', tc('TC-TXNMODDET2-008'), async ({ fiatTransactions: t }) => {
    const row = (await listRows(t, 'Sales')).find(isFailed);
    if (row) await openRow(t, 'Sales', row);
    else await openNth(t, 'Sales');
    observe(row ? `Failed sale ${row.Username}` : 'No failed sale on testbox - checked a completed one');
    await expect(t.txnDetails.completeButton).toHaveCount(0);
  });

  test('TC-TXNMODDET2-009 closing the panel keeps the page', tc('TC-TXNMODDET2-009'), async ({ fiatTransactions: t }) => {
    await t.open();
    await t.openTab('Sales');
    await expect(t.table.rows.first()).toBeVisible();
    const { total } = await t.pagination.counts();
    if (total <= 20) unmet('Only one page of sales');
    await t.pagination.pageButton(2).click();
    await t.pagination.waitForFrom(21);
    await t.table.openFirstRowDetails();
    await t.txnDetails.close();
    expect((await t.pagination.counts()).from).toBe(21);
  });
});
