import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';

/**
 * Savings Box manual deposit - flow CONFIRMED from codegen (29 Sep 2026).
 * Moves money on testbox, so only runs with PHX_ALLOW_MONEY_OPS=true.
 * Non-destructive checks (cancel, review, OTP prompt) always run.
 * Not automatable on testbox: "invalid OTP blocks the action" - testbox
 * accepts any code. Keep that case manual until prod/staging has a fixed OTP.
 */
test.describe('Savings Box - Manual deposit', () => {
  test.beforeEach(async ({ savingsAccounts }) => {
    await savingsAccounts.open();
    await savingsAccounts.openAccount(env.savingsUsername);
  });

  test('SB-MO.01 Cancel closes the deposit form without a deposit', async ({ manualOps }) => {
    await manualOps.startDeposit();
    await expect(manualOps.walletBalance).toBeVisible();
    await manualOps.cancelButton.click();
    await expect(manualOps.amountInput).toBeHidden();
  });

  test('SB-MO.02 Review step shows client, amount, date, payment reference and reason', async ({ manualOps, page }) => {
    await manualOps.startDeposit();
    await manualOps.fillDeposit(1000, 'QA automation review check');
    await expect(page.getByText(`Client@${env.savingsUsername}`)).toBeVisible();
    await expect(page.getByText(/^AmountFCFA/)).toBeVisible();
    await expect(page.getByText(/^Payment reference/)).toBeVisible();
    await expect(page.getByText('ReasonQA automation review check')).toBeVisible();
    await expect(manualOps.confirmDepositButton).toBeVisible();
    await manualOps.backButton.click();
    await expect(manualOps.amountInput).toBeVisible();
  });

  test('SB-MO.03 required fields block Review details', async ({ manualOps }) => {
    await manualOps.startDeposit();
    await manualOps.reviewButton.click();
    await expect(manualOps.confirmDepositButton).toBeHidden();
  });

  test('SB-MO.04 Confirm deposit asks for OTP, then succeeds', { tag: ['@money'] }, async ({ manualOps }) => {
    test.skip(!env.allowMoneyOps, 'Set PHX_ALLOW_MONEY_OPS=true to run deposits on testbox');
    await manualOps.startDeposit();
    await manualOps.fillDeposit(1000, 'QA automation deposit');
    await manualOps.confirmWithOtp(env.otp);
    await expect(manualOps.successMessage).toBeVisible();
  });
});
