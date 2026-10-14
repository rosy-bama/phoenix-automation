import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe } from '../../src/utils/tc';
import { crashed } from '../../src/utils/ui';

/** Plan section 13 - CS issue paths (Figma 1093:66980 "Wallet Issue Flows"). */
test.describe('Fiat Wallet - 13. Wallet issue resolution', () => {
  test('TC-WALISS-001 deposit not reflected: trace a deposit from the account', tc('TC-WALISS-001'), async ({ fiatAccounts: l, fiatAccountDetails: d, page }) => {
    const steps: string[] = [];
    await l.open();
    await l.openAccount(env.walletUsername);
    await d.expectLoaded(env.walletUsername);
    steps.push('account found');
    for (const status of ['Pending', 'Failed']) {
      await d.filters.open();
      await d.filters.choose('Transaction status', status);
      await d.filters.apply();
      await d.table.table.or(page.getByRole('heading', { name: 'Oops!' })).first().waitFor();
      expect(await crashed(page), `${status} filter`).toBe(false);
      steps.push(`${status}: ${await d.table.rows.count()} row(s)`);
      await d.filters.open();
      await d.filters.resetButton.click();
      await d.filters.close();
    }
    await d.transactionTypeSelect.selectOption({ label: 'Cash in' });
    await d.table.openFirstRowDetails();
    for (const f of ['Transaction reference', 'Source', 'Status']) {
      expect(await d.txnDetails.value(f), f).not.toBe('');
    }
    steps.push(`deposit: ${await d.txnDetails.value('Status')}, ref ${await d.txnDetails.value('Transaction reference')}`);
    observe(steps.join(' → '));
  });

  test('TC-WALISS-002 withdrawal failed: find a withdrawal by transaction ID', tc('TC-WALISS-002'), async ({ fiatTransactions: t }) => {
    await t.open();
    await t.openTab('Withdrawals');
    await expect(t.table.rows.first()).toBeVisible();
    await t.table.openFirstRowDetails();
    const ref = await t.txnDetails.value('Transaction reference');
    const client = await t.txnDetails.value('Client');
    await t.txnDetails.close();
    await t.search(ref);
    const users = await t.table.column('Username');
    observe(`Searched ${ref} (${client}) on Withdrawals -> ${users.length} row(s)`);
    expect(users).toEqual([client]);
    await t.table.openFirstRowDetails();
    for (const f of ['Status', 'Payment method', 'Payment provider']) expect(await t.txnDetails.value(f), f).not.toBe('');
  });
});
