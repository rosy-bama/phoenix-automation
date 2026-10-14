import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, DESIGN } from '../../src/utils/tc';
import { parseAmount } from '../../src/utils/text';
import { readClipboard, tone } from '../../src/utils/ui';

/** Plan section 3 - Account Details (Figma 288:2628). */
test.describe('Fiat Wallet - 3. Account details', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ fiatAccounts, fiatAccountDetails }) => {
    await fiatAccounts.open();
    await fiatAccounts.openAccount(env.walletUsername);
    await fiatAccountDetails.expectLoaded(env.walletUsername);
    await expect(fiatAccountDetails.table.rows.first()).toBeVisible();
  });

  const typeOf = (r: Record<string, string>) => r['Transaction type'].toLowerCase();
  const done = (r: Record<string, string>) => /^complete(d)?$/i.test(r.Status);
  const amountOf = (r: Record<string, string>) => parseAmount(r['Total amount']);

  test('TC-WALLDET-001 profile card and metadata match the account', tc('TC-WALLDET-001'), async ({ fiatAccounts: l, fiatAccountDetails: d }) => {
    const header = await d.headerText();
    observe(`Header: ${header}`);
    // Values the list showed for this account.
    await d.backToListButton.click();
    await l.search(env.walletUsername);
    const row = l.table.rowContaining(`@${env.walletUsername}`).first();
    const listBalance = (await row.getByRole('cell').nth(2).textContent())?.trim() ?? '';
    const listDate = (await row.getByRole('cell').nth(4).textContent())?.trim() ?? '';
    await l.openAccount(env.walletUsername);
    await d.expectLoaded(env.walletUsername);
    observe(`List row: balance ${listBalance}, registration ${listDate}`);
    expect.soft(header).toContain(`@${env.walletUsername}`);
    expect.soft(header).toMatch(/\+\d{9,}/);
    for (const label of ['Account type', 'Balance', 'Registration date', 'User type']) {
      expect.soft(header.toLowerCase(), label).toContain(label.toLowerCase());
    }
    expect.soft(await d.value('Balance'), 'Balance = list Total balance').toBe(listBalance);
    expect.soft(await d.value('Registration date'), 'Registration date = list Registration date').toBe(listDate);
  });

  test('TC-WALLDET-002 View profile opens the user profile', tc('TC-WALLDET-002'), async ({ fiatAccountDetails: d, page }) => {
    await d.viewProfileLink.click();
    await expect(page).toHaveURL(/\/users\/\d+/);
    await expect(page.getByRole('heading', { name: 'Oops!' })).toBeHidden();
    observe(`Profile URL ${page.url()}`);
    await expect(page.getByRole('main')).toContainText(env.walletUsername, DESIGN);
  });

  test('TC-WALLDET-003 Total amount deposited = sum of completed cash-ins', tc('TC-WALLDET-003', '@data'), async ({ fiatAccountDetails: d }) => {
    const shown = parseAmount(await d.value('Total amount deposited'));
    const rows = (await d.allTransactions()).filter((r) => done(r) && /cash.?in/.test(typeOf(r)));
    const sum = rows.reduce((a, r) => a + amountOf(r), 0);
    observe(`Summary ${shown} XAF; ${rows.length} completed cash-in(s) totalling ${sum} XAF`);
    expect(shown).toBe(sum);
  });

  test('TC-WALLDET-004 Highest deposit = largest completed cash-in', tc('TC-WALLDET-004'), async ({ fiatAccountDetails: d }) => {
    const shown = parseAmount(await d.value('Highest deposit'));
    const amounts = (await d.allTransactions()).filter((r) => done(r) && /cash.?in/.test(typeOf(r))).map(amountOf);
    observe(`Summary ${shown}; cash-ins ${amounts.join(', ')}`);
    expect(shown).toBe(Math.max(...amounts));
  });

  test('TC-WALLDET-005 Lowest deposit = smallest completed cash-in', tc('TC-WALLDET-005'), async ({ fiatAccountDetails: d }) => {
    const shown = parseAmount(await d.value('Lowest deposit'));
    const amounts = (await d.allTransactions()).filter((r) => done(r) && /cash.?in/.test(typeOf(r))).map(amountOf);
    observe(`Summary ${shown}; cash-ins ${amounts.join(', ')}`);
    expect(shown).toBe(Math.min(...amounts));
  });

  test('TC-WALLDET-006 Total amount withdrawn = sum of completed cash-outs', tc('TC-WALLDET-006'), async ({ fiatAccountDetails: d }) => {
    const shown = parseAmount(await d.value('Total amount withdrawn'));
    const rows = (await d.allTransactions()).filter((r) => done(r) && /cash.?out/.test(typeOf(r)));
    const sum = rows.reduce((a, r) => a + amountOf(r), 0);
    observe(`Summary ${shown} XAF; ${rows.length} completed cash-out(s) totalling ${sum} XAF`);
    expect(shown).toBe(sum);
  });

  test('TC-WALLDET-007 Back to account list keeps the search', tc('TC-WALLDET-007'), async ({ fiatAccounts: l, fiatAccountDetails: d }) => {
    await d.backToListButton.click();
    await expect(l.heading).toBeVisible();
    const value = await l.searchInput.inputValue();
    observe(`Search box after Back: "${value}"; ${(await l.pagination.counts()).text}`);
    expect(value).toBe(env.walletUsername);
  });

  test('TC-WALLDET-008 Freeze account starts a confirmation', tc('TC-WALLDET-008'), async ({ fiatAccountDetails: d, page }) => {
    await expect(d.freezeButton).toBeVisible();
    await d.freezeButton.click();
    const dialog = page.getByRole('dialog').or(page.getByText(/are you sure|confirm/i)).filter({ visible: true });
    const contradiction = page.getByText(/^Only suspended accounts can be unfrozen/);
    const said = (await contradiction.isVisible()) ? (await contradiction.textContent())?.trim() : 'no message';
    observe(`After clicking Freeze on an Active account: ${await dialog.count() ? 'confirmation shown' : 'no confirmation'}; message: "${said}"`);
    await expect.soft(contradiction, 'no "unfrozen" message on a Freeze action').toBeHidden();
    await expect(dialog.first()).toBeVisible(DESIGN);
    await page.keyboard.press('Escape');
  });

  test('TC-WALLDET-009 Manual operations offers exactly Cash in and Cash out', tc('TC-WALLDET-009'), async ({ fiatAccountDetails: d }) => {
    await d.manualOpsButton.click();
    await expect(d.manualOpsOptions.first()).toBeVisible();
    const options = (await d.manualOpsOptions.allTextContents()).map((o) => o.trim());
    observe(`Options: ${options.join(', ')}`);
    expect(options).toEqual(['Cash in', 'Cash out']);
  });

  test('TC-WALLDET-010 transaction table has the designed columns', tc('TC-WALLDET-010'), async ({ fiatAccountDetails: d }) => {
    const headers = await d.table.headers();
    observe(`Columns: ${headers.join(', ')}; row checkboxes: ${await d.table.table.getByRole('checkbox').count()}`);
    for (const c of ['Total amount', 'Transaction type', 'Payment method', 'Source/destination', 'Status', 'Date']) {
      expect.soft(headers.map((h) => h.toLowerCase()), c).toContain(c.toLowerCase());
    }
    await expect(d.table.table.getByRole('checkbox').first(), 'row checkbox (Figma)').toBeVisible(DESIGN);
  });

  test('TC-WALLDET-011 By transaction type narrows to that type', tc('TC-WALLDET-011'), async ({ fiatAccountDetails: d }) => {
    await d.transactionTypeSelect.selectOption({ label: 'Cash in' });
    await d.table.settle();
    await expect.poll(() => d.table.rows.filter({ hasNotText: /cash in/i }).count(), { message: 'only Cash in rows' }).toBe(0)
      .finally(async () => observe(`Types after "Cash in": ${[...new Set(await d.table.column('Transaction type'))].join(', ') || '(none)'}`));
  });

  test('TC-WALLDET-012 transaction type badges and colours', tc('TC-WALLDET-012'), async ({ fiatAccountDetails: d }) => {
    const index = (await d.table.headers()).findIndex((h) => /transaction type/i.test(h));
    const seen: string[] = [];
    for (const row of await d.table.rows.all()) {
      const cellEl = row.getByRole('cell').nth(index);
      const label = (await cellEl.textContent())?.trim() ?? '';
      const badge = (await cellEl.locator('*').count()) ? cellEl.locator('*').last() : cellEl;
      const colour = await tone(badge);
      seen.push(`${label}=${colour}`);
      expect.soft(['cash in', 'cash out', 'transfer from', 'transfer to'], label).toContain(label.toLowerCase());
      expect.soft(colour, `${label} colour`).toBe(/cash in|transfer from/i.test(label) ? 'green' : 'red');
    }
    observe(seen.join(', '));
  });

  test('TC-WALLDET-013 status badges read Completed / Failed', tc('TC-WALLDET-013'), async ({ fiatAccountDetails: d }) => {
    const statuses = [...new Set(await d.table.column('Status'))];
    observe(`Statuses: ${statuses.join(', ')}`);
    for (const s of statuses) expect(['Completed', 'Failed']).toContain(s);
  });

  test('TC-WALLDET-014 See details opens the clicked transaction', tc('TC-WALLDET-014'), async ({ fiatAccountDetails: d }) => {
    const row = d.table.rows.nth(0);
    const cells = (await row.getByRole('cell').allTextContents()).map((c) => c.trim());
    await row.getByRole('button', { name: 'See details' }).click();
    await d.txnDetails.expectOpen();
    const total = await d.txnDetails.value('Total amount');
    const date = await d.txnDetails.value('Date');
    observe(`Row: ${cells.slice(0, 6).join(' | ')} — panel: total ${total}, date ${date}`);
    expect.soft(total, 'Total amount').toBe(cells[0]);
    expect(date, 'Date').toBe(cells[5]);
  });

  test('TC-WALLDET-015 Export button is present', tc('TC-WALLDET-015'), async ({ fiatAccountDetails: d }) => {
    await expect(d.exportButton).toBeVisible();
  });

  test('TC-WALLDET-016 breadcrumb reads Account list / @username', tc('TC-WALLDET-016'), async ({ fiatAccountDetails: d }) => {
    const text = (await d.breadcrumb.innerText()).replace(/\s+/g, ' ');
    observe(`Breadcrumb: "${text.split(/\S+@\S+/)[0].trim()}"`);
    expect(text).toContain('Account list');
    expect(text).toContain(`@${env.walletUsername}`);
  });

  test('TC-WALLDET-017 username copy icon copies the username', tc('TC-WALLDET-017'), async ({ fiatAccountDetails: d, page }) => {
    await d.copyButton.click();
    const copied = await readClipboard(page);
    observe(`Clipboard: "${copied}"`);
    expect(copied.replace(/^@/, '')).toBe(env.walletUsername);
  });

  test('TC-WALLDET-018 metadata uses display labels', tc('TC-WALLDET-018'), async ({ fiatAccountDetails: d }) => {
    const accountType = await d.value('Account Type').catch(() => '');
    const userType = await d.value('User type');
    const header = await d.headerText();
    const status = header.match(/\b(active|frozen|closed|suspended|deactivated)\b/i)?.[0] ?? '';
    observe(`Account type "${accountType}", User type "${userType}", status "${status}"`);
    for (const v of [accountType, userType, status]) expect.soft(v, v).toMatch(/^[A-Z]/);
  });

  test('TC-WALLDET-019 balance equals the net of completed transactions', tc('TC-WALLDET-019'), async ({ fiatAccountDetails: d }) => {
    const balance = parseAmount(await d.value('Balance'));
    const rows = (await d.allTransactions()).filter(done);
    const net = rows.reduce((a, r) => a + (/cash.?in|transfer.?from/.test(typeOf(r)) ? 1 : -1) * amountOf(r), 0);
    observe(`Balance ${balance} XAF; net of ${rows.length} completed transactions ${net} XAF`);
    expect(net).toBe(balance);
  });

  test('TC-WALLDET-020 transaction pagination and count', tc('TC-WALLDET-020'), async ({ fiatAccountDetails: d }) => {
    const c = await d.pagination.counts();
    observe(`${c.text}; rows ${await d.table.rows.count()}`);
    expect(c.to - c.from + 1).toBe(await d.table.rows.count());
    await d.pagination.setPageSize(10);
    await expect.poll(() => d.table.rows.count()).toBeLessThanOrEqual(10);
  });

  test('TC-WALLDET-021 refresh reloads the same transactions', tc('TC-WALLDET-021'), async ({ fiatAccountDetails: d }) => {
    const before = await d.table.rows.count();
    await d.reloadButton.click();
    await d.table.settle();
    await expect(d.table.rows).toHaveCount(before);
  });

  test('TC-WALLDET-022 By transaction type lists all four types', tc('TC-WALLDET-022'), async ({ fiatAccountDetails: d }) => {
    const options = (await d.transactionTypeSelect.locator('option').allTextContents()).map((o) => o.trim());
    observe(`Options: ${options.join(', ')}`);
    for (const t of ['Cash in', 'Cash out', 'Transfer from', 'Transfer to']) {
      expect.soft(options.map((o) => o.toLowerCase()), t).toContain(t.toLowerCase());
    }
  });
});
