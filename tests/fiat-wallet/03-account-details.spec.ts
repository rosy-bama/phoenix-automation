import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { knownBug } from '../../src/utils/known-bug';
import { parseAmount } from '../../src/utils/text';

/** Test plan Section 3 - Account Details. */
test.describe('Fiat Wallet - 3. Account details', () => {
  test.beforeEach(async ({ fiatAccounts, fiatAccountDetails }) => {
    await fiatAccounts.open();
    await fiatAccounts.openAccount(env.walletUsername);
    await fiatAccountDetails.expectLoaded(env.walletUsername);
  });

  test('FW-3.01 header shows username, status, account type, balance, registration date, user type', { tag: ['@smoke'] }, async ({ fiatAccountDetails: d }) => {
    for (const label of ['Account Type', 'Registration date', 'User type']) {
      await expect(d.field(label)).toBeVisible();
    }
    await expect(d.field('active').or(d.field('Active'))).toBeVisible();
  });

  test('FW-3.02 stat cards: total deposited, highest / lowest deposit, total withdrawn', async ({ fiatAccountDetails: d }) => {
    for (const label of ['Total amount deposited', 'Highest deposit', 'Lowest deposit', 'Total amount withdrawn']) {
      await expect(d.field(label)).toBeVisible();
    }
  });

  test('FW-3.03 amounts use the XAF currency label', async ({ fiatAccountDetails: d }) => {
    // The app shows XAF everywhere (snapshot 13 Oct 2026). Phase 2: Figma may say FCFA.
    for (const label of ['Balance', 'Total amount deposited', 'Highest deposit', 'Lowest deposit', 'Total amount withdrawn']) {
      expect(await d.value(label), label).toMatch(/^[\d,.]+ XAF$/);
    }
  });

  test('FW-3.04 highest deposit >= lowest deposit', async ({ fiatAccountDetails: d }) => {
    const highest = parseAmount(await d.value('Highest deposit'));
    const lowest = parseAmount(await d.value('Lowest deposit'));
    expect(highest).toBeGreaterThanOrEqual(lowest);
  });

  test('FW-3.05 Freeze account on an active account explains only suspended accounts qualify', async ({ fiatAccountDetails: d, page }) => {
    // The message appears on CLICK, not hover (snapshot 13 Oct 2026). Full copy
    // is "Only suspended accounts can be unfrozen." on a FREEZE button -
    // wording to check against Figma in phase 2.
    await d.freezeButton.click();
    await expect(page.getByText(/^Only suspended accounts can/)).toBeVisible();
  });

  test('FW-3.06 Copy button is available next to the username', async ({ fiatAccountDetails: d }) => {
    await expect(d.copyButton).toBeEnabled();
  });

  test('FW-3.07 Transactions summary lists this account’s transactions', { tag: ['@smoke'] }, async ({ fiatAccountDetails: d }) => {
    await expect(d.transactionsSummary).toBeVisible();
    await expect(d.table.rows.first()).toBeVisible();
  });

  test('FW-3.08 transaction type select and Manual Operations switch the list', async ({ fiatAccountDetails: d }) => {
    // Cash in / Cash out live in a native <select>, Manual Operations is a button.
    for (const type of ['cash_out', 'cash_in', 'all']) {
      await d.transactionTypeSelect.selectOption(type);
      await expect(d.transactionTypeSelect).toHaveValue(type);
      await expect(d.table.table).toBeVisible();
    }
    await d.manualOpsButton.click();
    await expect(d.transactionsSummary).toBeVisible();
  });

  test('FW-3.09 Export downloads a file', { tag: ['@known-bug'] }, async ({ fiatAccountDetails: d, page }) => {
    knownBug('FW-3.09', 'Export on account details does nothing: no request, no download, no message (snapshot 13 Oct 2026)');
    const download = page.waitForEvent('download', { timeout: 15_000 });
    await d.exportButton.click();
    expect((await download).suggestedFilename()).toMatch(/\.(csv|xlsx?)$/i);
  });
});
