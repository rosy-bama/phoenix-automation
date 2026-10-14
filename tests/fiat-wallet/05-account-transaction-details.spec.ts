import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, DESIGN } from '../../src/utils/tc';
import { parseAmount } from '../../src/utils/text';
import { readClipboard } from '../../src/utils/ui';
import { findManualDeposit, listRows } from '../../src/fiat/test-data';
import type { FiatAccountListPage } from '../../src/pages/fiat/FiatAccountListPage';
import type { FiatAccountDetailsPage } from '../../src/pages/fiat/FiatAccountDetailsPage';

/** Plan section 5 - Transaction Details, account level (Figma 306:9318). */

const fields = ['Total amount', 'Client', 'Transaction type', 'Amount', 'Fees', 'Payment method', 'Source', 'Status', 'Date', 'Transaction reference'];

/** Opens `username`'s account and the row matching `match` (first row by default). */
async function openAccountRow(l: FiatAccountListPage, d: FiatAccountDetailsPage, username: string, match?: RegExp | string) {
  await l.open();
  await l.openAccount(username);
  await d.expectLoaded(username);
  await expect(d.table.rows.first()).toBeVisible();
  if (match && (await d.pagination.counts()).total > (await d.table.rows.count())) await d.pagination.setPageSize(50);
  const row = match ? d.table.rows.filter({ hasText: match }).first() : d.table.rows.first();
  const cells = (await row.getByRole('cell').allTextContents()).map((c) => c.trim());
  await row.getByRole('button', { name: 'See details' }).click();
  await d.txnDetails.expectOpen();
  return cells;
}

test.describe('Fiat Wallet - 5. Account transaction details', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.describe('on the test account', () => {
    let rowCells: string[] = [];
    test.beforeEach(async ({ fiatAccounts, fiatAccountDetails }) => {
      rowCells = await openAccountRow(fiatAccounts, fiatAccountDetails, env.walletUsername);
    });

    test('TC-TXNDET-001 panel shows the core fields matching the row', tc('TC-TXNDET-001'), async ({ fiatAccountDetails: d }) => {
      const p = d.txnDetails;
      observe(`Panel: ${await p.text()}`);
      for (const f of fields) await expect.soft(p.label(f), f).toBeVisible();
      expect.soft(await p.value('Status'), 'Status = row').toBe(rowCells[4]);
      expect(await p.value('Date'), 'Date = row').toBe(rowCells[5]);
    });

    test('TC-TXNDET-002 transaction reference is shown', tc('TC-TXNDET-002'), async ({ fiatAccountDetails: d }) => {
      const ref = await d.txnDetails.value('Transaction reference');
      observe(`Reference: ${ref}`);
      expect(ref).toMatch(/^[\w-]{8,}/);
    });

    test('TC-TXNDET-003 copying the reference gives the full value', tc('TC-TXNDET-003'), async ({ fiatAccountDetails: d, page }) => {
      const ref = await d.txnDetails.value('Transaction reference');
      await d.txnDetails.copyButtons.first().click();
      const copied = await readClipboard(page);
      observe(`Shown "${ref}", copied "${copied}"`);
      expect(copied.length).toBeGreaterThanOrEqual(ref.replace(/…|\.\.\.$/, '').length);
      expect(copied.startsWith(ref.replace(/…|\.\.\.$/, ''))).toBe(true);
    });

    test('TC-TXNDET-007 automatic transaction: no Reason, Initiated by = client', tc('TC-TXNDET-007'), async ({ fiatAccountDetails: d }) => {
      const p = d.txnDetails;
      const mode = await p.value('Transaction mode');
      if (!/automatic/i.test(mode)) unmet(`First transaction is "${mode}", not automatic`);
      const initiatedBy = await p.value('Initiated by');
      observe(`Mode "${mode}", Initiated by "${initiatedBy}", Reason shown: ${await p.has('Reason')}`);
      expect.soft(await p.has('Reason'), 'Reason hidden').toBe(false);
      expect(initiatedBy.replace(/^@/, '')).toBe(env.walletUsername);
    });

    test('TC-TXNDET-008 field is "Internal payment reference" with full value', tc('TC-TXNDET-008'), async ({ fiatAccountDetails: d }) => {
      const p = d.txnDetails;
      observe(`Labels: Internal payment reference ${await p.has('Internal payment reference')}, Internal reference ${await p.has('Internal reference')}`);
      await expect(p.label('Internal payment reference')).toBeVisible(DESIGN);
    });

    test('TC-TXNDET-009 payment provider is shown', tc('TC-TXNDET-009'), async ({ fiatAccountDetails: d }) => {
      const provider = await d.txnDetails.value('Payment provider');
      observe(`Payment provider: ${provider}`);
      expect(provider).not.toBe('');
    });

    test('TC-TXNDET-010 closing the panel keeps the list state', tc('TC-TXNDET-010'), async ({ fiatAccountDetails: d }) => {
      await d.txnDetails.close();
      await d.transactionTypeSelect.selectOption({ label: 'Cash in' });
      await d.table.settle();
      await expect.poll(() => d.table.rows.filter({ hasNotText: /cash in/i }).count()).toBe(0);
      const before = await d.table.rows.count();
      await d.table.openFirstRowDetails();
      await d.txnDetails.close();
      await expect(d.transactionTypeSelect).toHaveValue('cash_in');
      await expect(d.table.rows).toHaveCount(before);
    });

    test('TC-TXNDET-012 type and mode use display labels', tc('TC-TXNDET-012'), async ({ fiatAccountDetails: d }) => {
      const type = await d.txnDetails.value('Transaction type');
      const mode = await d.txnDetails.value('Transaction mode');
      observe(`Transaction type "${type}", mode "${mode}"`);
      expect.soft(type, 'type').toMatch(/^[A-Z][a-z]+( [a-z]+)*$/);
      expect(mode, 'mode').toMatch(/^(Automatic|Manual)$/);
    });

    test('TC-TXNDET-013 status uses the designed badge label', tc('TC-TXNDET-013'), async ({ fiatAccountDetails: d }) => {
      const status = await d.txnDetails.value('Status');
      observe(`Status "${status}"`);
      expect(['Completed', 'Failed']).toContain(status.replace(/^[✓×✕]\s*/, ''));
    });
  });

  test('TC-TXNDET-004 transaction mode reads Automatic / Manual', tc('TC-TXNDET-004'), async ({ fiatAccounts: l, fiatAccountDetails: d, fiatTransactions: t }) => {
    await openAccountRow(l, d, env.walletUsername);
    const auto = await d.txnDetails.value('Transaction mode');
    const manual = await findManualDeposit(t);
    if (!manual) unmet('No manual deposit found on testbox (no "Cash" deposit with Transaction mode = manual)');
    await openAccountRow(l, d, manual.Username.replace(/^@/, ''), manual.Date);
    const man = await d.txnDetails.value('Transaction mode');
    observe(`System transaction: "${auto}"; manual deposit of ${manual.Username}: "${man}"`);
    expect(auto).toMatch(/^automatic$/i);
    expect(man).toMatch(/^manual$/i);
  });

  for (const id of ['TC-TXNDET-005', 'TC-TXNDET-006'] as const) {
    test(`${id} manual transaction shows ${id.endsWith('5') ? 'the admin in Initiated by' : 'its Reason'}`, tc(id), async ({ fiatAccounts: l, fiatAccountDetails: d, fiatTransactions: t }) => {
      const manual = await findManualDeposit(t);
      if (!manual) unmet('No manual deposit found on testbox (no "Cash" deposit with Transaction mode = manual)');
      const client = manual.Username.replace(/^@/, '');
      await openAccountRow(l, d, client, manual.Date);
      const p = d.txnDetails;
      observe(`${manual.Username} ${manual.Date}: ${await p.text()}`);
      if (id === 'TC-TXNDET-005') {
        const by = await p.value('Initiated by');
        expect(by).not.toBe('');
        expect(by.replace(/^@/, ''), 'initiator is the admin, not the client').not.toBe(client);
      } else {
        await expect(p.label('Reason')).toBeVisible(DESIGN);
        expect(await p.value('Reason')).not.toBe('');
      }
    });
  }

  test('TC-TXNDET-011 Amount + Fees = Total amount', tc('TC-TXNDET-011'), async ({ fiatAccounts: l, fiatAccountDetails: d, fiatTransactions: t }) => {
    // A deposit with a fee: the most recent Mobile Money deposit on testbox.
    const dep = (await listRows(t, 'Deposits')).find((r) => /momo|mobile/i.test(r['Payment method']));
    if (!dep) unmet('No Mobile Money deposit on testbox');
    await openAccountRow(l, d, dep.Username.replace(/^@/, ''), dep.Date);
    const n = async (f: string) => parseAmount(await d.txnDetails.value(f));
    const [total, amount, fees] = [await n('Total amount'), await n('Amount'), await n('Fees')];
    observe(`${dep.Username} ${dep.Date}: Total ${total}, Amount ${amount}, Fees ${fees}`);
    if (fees === 0) unmet('Transaction found has no fee');
    expect(total).toBe(amount + fees);
  });

  test('TC-TXNDET-014 row Total amount = panel Total amount', tc('TC-TXNDET-014'), async ({ fiatAccounts: l, fiatAccountDetails: d }) => {
    const cells = await openAccountRow(l, d, env.walletUsername, /cash in/i);
    const total = await d.txnDetails.value('Total amount');
    const fees = await d.txnDetails.value('Fees');
    observe(`Row "${cells[0]}" vs panel Total "${total}" (Fees ${fees})`);
    expect(total).toBe(cells[0]);
  });
});
