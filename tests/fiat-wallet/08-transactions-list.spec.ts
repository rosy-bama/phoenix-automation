import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, DESIGN } from '../../src/utils/tc';
import { FiatTransactionsPage, TxnTab } from '../../src/pages/fiat/FiatTransactionsPage';
import { selectedIndex, parseDmy, isDescending } from '../../src/utils/ui';
import { listRows } from '../../src/fiat/test-data';

/** Plan section 8 - Transactions module list (Figma 473:12983, 487:20407, 487:22043, 487:26027). */
const TABS: TxnTab[] = ['Deposits', 'Withdrawals', 'Sales', 'Purchases'];

test.describe('Fiat Wallet - 8. Transactions list', () => {
  test.beforeEach(async ({ fiatTransactions: t }) => {
    await t.open();
    await expect(t.table.rows.first()).toBeVisible();
  });

  test('TC-TXNMOD-001 four tabs, Deposits selected by default', tc('TC-TXNMOD-001'), async ({ fiatTransactions: t }) => {
    for (const tab of TABS) await expect(t.tab(tab)).toBeVisible();
    const i = await selectedIndex(TABS.map((x) => t.tab(x)));
    observe(`Selected tab index ${i} (0 = Deposits)`);
    expect(i).toBe(0);
  });

  const columnCases: [string, TxnTab][] = [['TC-TXNMOD-002', 'Deposits'], ['TC-TXNMOD-003', 'Withdrawals'], ['TC-TXNMOD-004', 'Sales'], ['TC-TXNMOD-005', 'Purchases']];
  for (const [id, tab] of columnCases) {
    test(`${id} ${tab} tab has the designed columns`, tc(id), async ({ fiatTransactions: t }) => {
      await t.openTab(tab);
      const headers = await t.table.headers();
      observe(`Columns: ${headers.join(', ')}`);
      const lower = headers.map((h) => h.toLowerCase());
      for (const c of FiatTransactionsPage.columnsFor(tab)) expect.soft(lower, c).toContain(c.toLowerCase());
      if (tab === 'Sales' || tab === 'Purchases') expect(lower).not.toContain('payment method');
    });
  }

  test('TC-TXNMOD-006 switching tab starts at page 1', tc('TC-TXNMOD-006'), async ({ fiatTransactions: t }) => {
    await t.pagination.pageButton(2).click();
    await t.pagination.waitForFrom(21);
    await t.openTab('Withdrawals');
    await t.pagination.waitForFrom(1);
    observe((await t.pagination.counts()).text);
  });

  test('TC-TXNMOD-007 search by username narrows the current tab', tc('TC-TXNMOD-007'), async ({ fiatTransactions: t }) => {
    await t.search(env.walletUsername);
    const users = [...new Set(await t.table.column('Username'))];
    observe(`Search "${env.walletUsername}" -> usernames: ${users.join(', ')}`);
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.includes(env.walletUsername))).toBe(true);
  });

  test('TC-TXNMOD-008 row and select-all checkboxes', tc('TC-TXNMOD-008'), async ({ fiatTransactions: t }) => {
    await t.table.rowCheckbox(1).check();
    await expect(t.table.rowCheckbox(2)).not.toBeChecked();
    await t.table.selectAll.check();
    await expect(t.table.rowCheckbox(2)).toBeChecked();
    await t.table.selectAll.uncheck();
    await expect(t.table.rowCheckbox(1)).not.toBeChecked();
  });

  test('TC-TXNMOD-009 pagination works on every tab', tc('TC-TXNMOD-009'), async ({ fiatTransactions: t }) => {
    const notes: string[] = [];
    for (const tab of TABS) {
      await t.openTab(tab);
      await t.pagination.setPageSize(10);
      await expect.poll(() => t.table.rows.count()).toBeLessThanOrEqual(10);
      const { total } = await t.pagination.counts();
      if (total > 10) {
        await t.pagination.pageButton(2).click();
        await t.pagination.waitForFrom(11);
        await t.pagination.prevButton.click();
        await t.pagination.waitForFrom(1);
        await t.pagination.nextButton.click();
        await t.pagination.waitForFrom(11);
      }
      notes.push(`${tab}: ${(await t.pagination.counts()).text}`);
    }
    observe(notes.join(' | '));
  });

  test('TC-TXNMOD-010 result count reads "Showing X to Y of Z results"', tc('TC-TXNMOD-010'), async ({ fiatTransactions: t }) => {
    const notes: string[] = [];
    let previous = '';
    for (const tab of TABS) {
      await t.openTab(tab);
      // Wait for the counter to change from the previous tab's total.
      await expect.poll(async () => (await t.pagination.counts()).text).not.toBe(previous);
      const c = await t.pagination.counts();
      previous = c.text;
      notes.push(`${tab}: "${c.text}"`);
      await expect(t.pagination.counter).toHaveText(/^Showing \d+ to \d+ of [\d,]+ results$/);
      expect(c.to - c.from + 1).toBe(await t.table.rows.count());
    }
    observe(notes.join(' | '));
  });

  test('TC-TXNMOD-011 refresh reloads the current tab', tc('TC-TXNMOD-011'), async ({ fiatTransactions: t }) => {
    await t.openTab('Withdrawals');
    const before = (await t.pagination.counts()).total;
    await t.reloadButton.click();
    await t.table.settle();
    expect(await selectedIndex(TABS.map((x) => t.tab(x)))).toBe(1);
    expect((await t.pagination.counts()).total).toBe(before);
  });

  test('TC-TXNMOD-012 See details opens the clicked row on every tab', tc('TC-TXNMOD-012'), async ({ fiatTransactions: t }) => {
    const notes: string[] = [];
    for (const tab of TABS) {
      await t.openTab(tab);
      const row = t.table.rows.nth(1);
      const cells = (await row.getByRole('cell').allTextContents()).map((c) => c.trim());
      await row.getByRole('button', { name: 'See details' }).click();
      await t.txnDetails.expectOpen();
      const client = await t.txnDetails.value('Client');
      const total = await t.txnDetails.value('Total amount');
      notes.push(`${tab}: row ${cells[1]} ${cells[2]} -> panel ${client} ${total}`);
      expect.soft(client, `${tab} Client`).toBe(cells[1]);
      expect.soft(total, `${tab} Total amount`).toBe(cells[2]);
      await t.txnDetails.close();
    }
    observe(notes.join(' | '));
  });

  test('TC-TXNMOD-013 status badges read Completed / Failed on every tab', tc('TC-TXNMOD-013'), async ({ fiatTransactions: t }) => {
    const seen = new Set<string>();
    for (const tab of TABS) {
      await t.openTab(tab);
      for (const s of await t.table.column('Status')) seen.add(s);
    }
    observe(`Statuses: ${[...seen].join(', ')}`);
    for (const s of seen) expect(['Completed', 'Failed']).toContain(s);
  });

  test('TC-TXNMOD-014 Export button is present', tc('TC-TXNMOD-014'), async ({ fiatTransactions: t }) => {
    await expect(t.exportButton).toBeVisible();
  });

  test('TC-TXNMOD-015 list covers all accounts', tc('TC-TXNMOD-015'), async ({ fiatTransactions: t }) => {
    const users = new Set(await t.table.column('Username'));
    observe(`${users.size} distinct usernames on page 1`);
    expect(users.size).toBeGreaterThan(1);
  });

  test('TC-TXNMOD-016 title, description and breadcrumb', tc('TC-TXNMOD-016'), async ({ fiatTransactions: t, page }) => {
    const desc = (await t.description.textContent())?.trim();
    const crumb = (await page.getByRole('banner').innerText()).replace(/\s+/g, ' ');
    observe(`Description "${desc}"; banner "${crumb.split(/\S+@\S+/)[0].trim()}"`);
    expect(desc).toBe('The transaction list covers all wallet movements and allows you to isolate a case quickly.');
    await expect(page.getByRole('banner')).toContainText(/transactions list/i, DESIGN);
  });

  test('TC-TXNMOD-017 search by transaction reference', tc('TC-TXNMOD-017'), async ({ fiatTransactions: t }) => {
    await t.table.rows.nth(2).getByRole('button', { name: 'See details' }).click();
    const ref = await t.txnDetails.value('Transaction reference');
    const client = await t.txnDetails.value('Client');
    await t.txnDetails.close();
    await t.search(ref);
    const users = await t.table.column('Username');
    observe(`Reference ${ref} (${client}) -> ${users.length} row(s): ${[...new Set(users)].join(', ')}`);
    expect(users).toEqual([client]);
  });

  test('TC-TXNMOD-018 most recent transactions first', tc('TC-TXNMOD-018'), async ({ fiatTransactions: t }) => {
    const notes: string[] = [];
    for (const tab of TABS) {
      await t.openTab(tab);
      const raw = await t.table.column('Date');
      const ok = isDescending(raw.map(parseDmy));
      notes.push(`${tab}: ${ok ? 'descending' : 'NOT descending'} (${raw.slice(0, 3).join(', ')}…)`);
      expect.soft(ok, tab).toBe(true);
    }
    observe(notes.join(' | '));
  });

  test('TC-TXNMOD-019 Product column shows display names', tc('TC-TXNMOD-019'), async ({ fiatTransactions: t }) => {
    const seen = new Set<string>();
    for (const tab of ['Sales', 'Purchases'] as TxnTab[]) {
      await t.openTab(tab);
      for (const p of await t.table.column('Product')) seen.add(p);
    }
    observe(`Products: ${[...seen].join(', ')}`);
    for (const p of seen) expect(p, p).not.toMatch(/_/);
  });

  test('TC-TXNMOD-020 same deposit has the same total here and on Account Details', tc('TC-TXNMOD-020'), async ({ fiatTransactions: t, fiatAccounts: l, fiatAccountDetails: d }) => {
    const dep = (await listRows(t, 'Deposits')).find((r) => r.Username === `@${env.walletUsername}`);
    if (!dep) unmet(`No deposit for @${env.walletUsername} in the Deposits tab`);
    await l.open();
    await l.openAccount(env.walletUsername);
    await d.expectLoaded(env.walletUsername);
    const row = d.table.rows.filter({ hasText: dep.Date }).first();
    const accountTotal = (await row.getByRole('cell').first().textContent())?.trim();
    observe(`${dep.Date}: Transactions module ${dep['Total amount']}, Account Details ${accountTotal}`);
    expect(accountTotal).toBe(dep['Total amount']);
  });
});
