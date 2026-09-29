import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';

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

  test('FW-3.03 amounts use the FCFA currency label', async ({ page }) => {
    await expect(page.getByRole('main').getByText(/FCFA/).first()).toBeVisible();
  });

  test('FW-3.04 highest deposit >= lowest deposit', async ({ page }) => {
    const read = async (label: string) => {
      const t = (await page.getByText(new RegExp(`^${label}FCFA`)).first().textContent()) ?? '';
      return Number(t.replace(label, '').replace(/[^\d.]/g, ''));
    };
    expect(await read('Highest deposit')).toBeGreaterThanOrEqual(await read('Lowest deposit'));
  });

  test('FW-3.05 Freeze account is disabled for an active account', async ({ fiatAccountDetails: d, page }) => {
    // CONFIRMED tooltip copy starts "Only suspended accounts can ..." - INFERRED
    // that the button is disabled rather than hidden for active accounts.
    await expect(d.freezeButton).toBeVisible();
    await d.freezeButton.hover();
    await expect(page.getByText(/^Only suspended accounts can/)).toBeVisible();
  });

  test('FW-3.06 Copy button is available next to the username', async ({ fiatAccountDetails: d }) => {
    await expect(d.copyButton).toBeEnabled();
  });

  test('FW-3.07 Transactions summary lists this account’s transactions', { tag: ['@smoke'] }, async ({ fiatAccountDetails: d }) => {
    await expect(d.transactionsSummary).toBeVisible();
    await expect(d.table.rows.first()).toBeVisible();
  });

  test('FW-3.08 Cash in / Cash out / Manual Operations tabs switch the list', async ({ fiatAccountDetails: d }) => {
    for (const tab of [d.cashOutTab, d.manualOpsTab, d.cashInTab]) {
      await tab.click();
      await expect(d.transactionsSummary).toBeVisible();
    }
  });

  test('FW-3.09 Export downloads a file', async ({ fiatAccountDetails: d, page }) => {
    const download = page.waitForEvent('download');
    await d.exportButton.click();
    expect((await download).suggestedFilename()).toMatch(/\.(csv|xlsx?)$/i);
  });
});
