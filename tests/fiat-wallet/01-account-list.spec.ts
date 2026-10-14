import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, DESIGN } from '../../src/utils/tc';
import { selectedIndex, parseDmy, isDescending } from '../../src/utils/ui';

/** Plan section 1 - Wallet Account List (Figma 190:2151, 230:8643). */
test.describe('Fiat Wallet - 1. Account list', () => {
  test.beforeEach(async ({ fiatAccounts }) => {
    await fiatAccounts.open();
    await expect(fiatAccounts.table.rows.first()).toBeVisible();
  });

  const designColumns = ['Full name', 'Username', 'Total balance', 'Status', 'Registration date'];

  test('TC-WALLIST-001 list shows the designed columns', tc('TC-WALLIST-001'), async ({ fiatAccounts: l }) => {
    const headers = await l.table.headers();
    observe(`Columns: ${headers.join(', ')}`);
    await expect(l.table.selectAll).toBeVisible();
    const lower = headers.map((h) => h.toLowerCase());
    const missing = designColumns.filter((c) => !lower.includes(c.toLowerCase()));
    expect(missing, `Missing columns: ${missing.join(', ')}`).toEqual([]);
  });

  test('TC-WALLIST-002 Main wallet is selected by default', tc('TC-WALLIST-002'), async ({ fiatAccounts: l }) => {
    const i = await selectedIndex(l.tabs());
    observe(`Selected tab index: ${i} (0 = Main wallet)`);
    expect(i).toBe(0);
  });

  for (const [id, name] of [['TC-WALLIST-003', 'Jara wallet'], ['TC-WALLIST-004', 'Rewards']] as const) {
    test(`${id} ${name} tab loads its accounts with the same columns`, tc(id), async ({ fiatAccounts: l }) => {
      const mainHeaders = await l.table.headers();
      const mainCount = await l.pagination.counts();
      await (name === 'Rewards' ? l.rewardsTab : l.jaraWalletTab).click();
      await l.table.settle();
      await expect.poll(async () => (await l.pagination.counts()).total).not.toBe(mainCount.total);
      const counts = await l.pagination.counts();
      observe(`${name}: ${counts.text}; Main wallet: ${mainCount.text}`);
      expect(await l.table.headers()).toEqual(mainHeaders);
      expect(await selectedIndex(l.tabs())).toBe(name === 'Rewards' ? 2 : 1);
      if (counts.total === 0) unmet(`No account has a ${name} on testbox - cannot check its rows`);
      await expect(l.table.rows.first()).toBeVisible();
    });
  }

  test('TC-WALLIST-005 search by full name', tc('TC-WALLIST-005'), async ({ fiatAccounts: l }) => {
    const fullName = process.env.PHX_WALLET_FULLNAME;
    if (!fullName) unmet('Set PHX_WALLET_FULLNAME to the full name of a test account (the list shows no Full name column to read it from)');
    await l.search(fullName);
    await expect(l.table.rows.first()).toBeVisible();
    await expect(l.table.rows.filter({ hasNotText: new RegExp(fullName, 'i') })).toHaveCount(0);
  });

  test('TC-WALLIST-006 search by username returns only that account', tc('TC-WALLIST-006'), async ({ fiatAccounts: l }) => {
    await l.search(env.walletUsername);
    await expect(l.table.rowContaining(`@${env.walletUsername}`).first()).toBeVisible();
    await expect(l.table.rows.filter({ hasNotText: env.walletUsername })).toHaveCount(0);
    observe(`${await l.table.rows.count()} row(s) for "${env.walletUsername}"`);
  });

  test('TC-WALLIST-007 no-match search shows the empty state', tc('TC-WALLIST-007'), async ({ fiatAccounts: l }) => {
    await l.search('zz-no-such-account-000');
    await expect(l.table.rows).toHaveCount(0);
    await expect(l.table.table.getByRole('img').filter({ visible: true }).first()).toBeVisible();
  });

  test('TC-WALLIST-008 empty-state copy refers to accounts', tc('TC-WALLIST-008'), async ({ fiatAccounts: l }) => {
    await l.search('zz-no-such-account-000');
    await expect(l.table.rows).toHaveCount(0);
    const text = (await l.table.table.innerText()).replace(/\s+/g, ' ');
    const copy = text.split('See details').pop()!.trim();
    observe(`Empty state copy: "${copy}"`);
    expect(copy).not.toMatch(/vendor/i);
    expect(copy).toMatch(/account/i);
  });

  test('TC-WALLIST-009 Per page changes the number of rows', tc('TC-WALLIST-009'), async ({ fiatAccounts: l }) => {
    const seen: string[] = [];
    for (const size of [10, 50, 20] as const) {
      await l.pagination.setPageSize(size);
      const { total } = await l.pagination.counts();
      await expect.poll(() => l.table.rows.count()).toBe(Math.min(size, total));
      const c = await l.pagination.counts();
      seen.push(`${size} -> ${await l.table.rows.count()} rows, counter "${c.text}"`);
      observe(seen.join(' | '));
      expect(c.to, `counter after Per page ${size}`).toBe(Math.min(size, total));
    }
  });

  test('TC-WALLIST-010 page number shows the matching page', tc('TC-WALLIST-010'), async ({ fiatAccounts: l }) => {
    const first = await l.table.rows.first().textContent();
    const { to, total } = await l.pagination.counts();
    if (total <= to) unmet('Only one page of accounts');
    await l.pagination.pageButton(2).click();
    await l.pagination.waitForFrom(to + 1);
    observe(`${(await l.pagination.counts()).text}; first row page 1: ${first}`);
    await expect.poll(() => l.table.rows.first().textContent(), { message: 'page 2 shows different rows' }).not.toBe(first);
  });

  test('TC-WALLIST-011 next/previous move one page and disable at the ends', tc('TC-WALLIST-011'), async ({ fiatAccounts: l }) => {
    await expect(l.pagination.prevButton).toBeDisabled();
    const { to, total } = await l.pagination.counts();
    await l.pagination.nextButton.click();
    await l.pagination.waitForFrom(to + 1);
    await l.pagination.prevButton.click();
    await l.pagination.waitForFrom(1);
    const lastPage = Math.ceil(total / to);
    await l.pagination.pageButton(lastPage).click();
    await l.pagination.waitForFrom((lastPage - 1) * to + 1);
    await expect(l.pagination.nextButton).toBeDisabled();
    observe(`Last page ${lastPage}: ${(await l.pagination.counts()).text}`);
  });

  test('TC-WALLIST-012 result count follows page and tab', tc('TC-WALLIST-012'), async ({ fiatAccounts: l }) => {
    const check = async (where: string) => {
      const c = await l.pagination.counts();
      expect(c.to - c.from + 1, `${where}: ${c.text}`).toBe(await l.table.rows.count());
      return c.text;
    };
    const notes = [await check('Main p1')];
    await l.pagination.pageButton(2).click();
    await l.pagination.waitForFrom(21);
    notes.push(await check('Main p2'));
    await l.jaraWalletTab.click();
    await l.pagination.waitForFrom(1);
    notes.push(await check('Jara p1'));
    observe(notes.join(' | '));
  });

  test('TC-WALLIST-013 refresh keeps tab and search', tc('TC-WALLIST-013'), async ({ fiatAccounts: l }) => {
    await l.jaraWalletTab.click();
    await l.table.settle();
    const before = (await l.pagination.counts()).text;
    await l.reloadButton.click();
    await l.table.settle();
    const after = (await l.pagination.counts()).text;
    const tab = await selectedIndex(l.tabs());
    observe(`Before refresh (Jara): ${before}; after: ${after}; selected tab index ${tab}`);
    expect(tab, 'Jara wallet still selected').toBe(1);
    expect(after).toBe(before);
  });

  test('TC-WALLIST-014 See details opens that account', tc('TC-WALLIST-014'), async ({ fiatAccounts: l, fiatAccountDetails: d, page }) => {
    await l.openAccount(env.walletUsername);
    await d.expectLoaded(env.walletUsername);
    await expect(page).toHaveURL(/\/fiat\/accounts\/\d+$/);
  });

  test('TC-WALLIST-015 balances use the XAF format', tc('TC-WALLIST-015'), async ({ fiatAccounts: l }) => {
    const balances = await l.table.column('Total balance');
    observe(`Sample: ${balances.slice(0, 5).join(', ')}`);
    for (const b of balances) expect(b).toMatch(/^\d{1,3}(,\d{3})*(\.\d{2})? XAF$/);
  });

  test('TC-WALLIST-016 status shows a capitalised badge', tc('TC-WALLIST-016'), async ({ fiatAccounts: l }) => {
    const statuses = [...new Set(await l.table.column('Status'))];
    observe(`Statuses on page 1: ${statuses.join(', ')}`);
    for (const s of statuses) expect(s).toMatch(/^[A-Z][a-z]+$/);
  });

  test('TC-WALLIST-017 header title, description and breadcrumb', tc('TC-WALLIST-017'), async ({ fiatAccounts: l, page }) => {
    await expect(l.heading).toBeVisible();
    await expect(page.getByText('The list should show every user who has a Wallet.', { exact: true })).toBeVisible(DESIGN);
    await expect(l.breadcrumb).toContainText('Account list', DESIGN);
  });

  test('TC-WALLIST-018 select all selects and clears every row', tc('TC-WALLIST-018'), async ({ fiatAccounts: l }) => {
    await l.table.selectAll.check();
    await expect(l.table.rowCheckbox(1)).toBeChecked();
    await expect(l.table.rowCheckbox(2)).toBeChecked();
    await l.table.selectAll.uncheck();
    await expect(l.table.rowCheckbox(1)).not.toBeChecked();
  });

  test('TC-WALLIST-019 single row checkbox toggles only that row', tc('TC-WALLIST-019'), async ({ fiatAccounts: l }) => {
    await l.table.rowCheckbox(1).check();
    await l.table.rowCheckbox(2).check();
    await expect(l.table.rowCheckbox(3)).not.toBeChecked();
    await l.table.rowCheckbox(1).uncheck();
    await expect(l.table.rowCheckbox(1)).not.toBeChecked();
    await expect(l.table.rowCheckbox(2)).toBeChecked();
  });

  test('TC-WALLIST-020 Export button is present', tc('TC-WALLIST-020'), async ({ fiatAccounts: l }) => {
    await expect(l.exportButton).toBeVisible();
  });

  test('TC-WALLIST-021 most recent accounts first', tc('TC-WALLIST-021'), async ({ fiatAccounts: l }) => {
    const header = (await l.table.headers()).find((h) => /registration/i.test(h))!;
    const raw = await l.table.column(header);
    const dates = raw.map(parseDmy);
    const breakAt = dates.findIndex((d, i) => i > 0 && dates[i - 1].getTime() < d.getTime());
    observe(breakAt < 0 ? `Descending: ${raw.slice(0, 3).join(', ')}…` : `Order breaks at row ${breakAt + 1}: ${raw[breakAt - 1]} then ${raw[breakAt]}`);
    expect(isDescending(dates)).toBe(true);
  });

  test('TC-WALLIST-022 empty state count reads zero', tc('TC-WALLIST-022'), async ({ fiatAccounts: l }) => {
    await l.search('zz-no-such-account-000');
    await expect(l.table.rows).toHaveCount(0);
    const text = (await l.pagination.counts()).text;
    observe(`Counter: "${text}"`);
    expect(text).toMatch(/^Showing 0 to 0 of 0 results$/);
  });

  test('TC-WALLIST-023 clearing the search restores the list', tc('TC-WALLIST-023'), async ({ fiatAccounts: l }) => {
    const before = (await l.pagination.counts()).total;
    await l.search(env.walletUsername);
    await expect.poll(async () => (await l.pagination.counts()).total).toBeLessThan(before);
    await l.clearSearchButton.click();
    await expect.poll(async () => (await l.pagination.counts()).total).toBe(before);
    observe(`Total back to ${before}`);
  });
});
