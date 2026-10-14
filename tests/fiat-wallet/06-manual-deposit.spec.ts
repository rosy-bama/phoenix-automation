import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, blocked, requireMoneyOps, DESIGN } from '../../src/utils/tc';
import { parseAmount } from '../../src/utils/text';
import { readClipboard } from '../../src/utils/ui';

/**
 * Plan section 6 - Manual deposit / Cash in (Figma 338:10592).
 * Non-destructive steps always run. Reaching "Review details" creates a
 * draft id on the server (URL .../manual-deposit/<id>/verify) - TC-MANDEP-025
 * checks it does not create a transaction. Confirming moves money: only with
 * PHX_ALLOW_MONEY_OPS=true.
 */
const REASON = 'QA automation - manual deposit check';
const REF = 'PP260706.1217.B19753';

test.describe('Fiat Wallet - 6. Manual deposit (Cash in)', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ fiatAccounts, fiatAccountDetails, fiatManualOp }) => {
    await fiatAccounts.open();
    await fiatAccounts.openAccount(env.walletUsername);
    await fiatAccountDetails.expectLoaded(env.walletUsername);
    await fiatAccountDetails.startCashIn();
    await fiatManualOp.expectPaymentInformation();
  });

  test('TC-MANDEP-001 Cash in opens Manual deposit on Payment information', tc('TC-MANDEP-001'), async ({ fiatManualOp: m, page }) => {
    await expect(page).toHaveURL(/\/manual-deposit$/);
    const crumb = await m.bannerText();
    observe(`Breadcrumb: "${crumb.split('Do you need help?')[0].trim()}"; stepper: "${(await m.stepper.innerText()).replace(/\s+/g, ' ')}"`);
    await expect(m.stepper).toContainText('Payment information');
    await expect(m.stepper).toContainText('Review details');
    expect(crumb).toMatch(/manual deposit/i);
    expect(crumb).toContain('Account list');
  });

  test('TC-MANDEP-002 amount accepts numbers only', tc('TC-MANDEP-002'), async ({ fiatManualOp: m }) => {
    await m.amount.pressSequentially('ab#e');
    const letters = await m.amount.inputValue();
    await m.amount.fill('1500');
    observe(`After typing "ab#e": "${letters}"; after 1500: "${await m.amount.inputValue()}"`);
    expect(letters.replace(/e/i, '')).toBe('');
    await expect(m.amount).toHaveValue(/1,?500/);
  });

  test('TC-MANDEP-003 zero and negative amounts are rejected', tc('TC-MANDEP-003'), async ({ fiatManualOp: m, page }) => {
    await m.choose(m.paymentMethod, 'Cash');
    await m.reason.fill(REASON);
    const notes: string[] = [];
    for (const v of ['0', '-5']) {
      await m.amount.fill(v);
      await m.reason.click();
      const error = page.getByText(/greater than 0|must be positive|invalid amount|minimum/i).filter({ visible: true });
      const shown = await error.first().isVisible();
      const enabled = await m.reviewButton.isEnabled();
      notes.push(`${v}: error ${shown ? 'shown' : 'not shown'}, Review details ${enabled ? 'ENABLED' : 'disabled'}`);
      observe(notes.join(' | '));
      expect.soft(shown, `${v}: validation message`).toBe(true);
      expect(enabled, `${v}: Review details disabled`).toBe(false);
    }
  });

  test('TC-MANDEP-004 Review details is disabled until required fields are set', tc('TC-MANDEP-004'), async ({ fiatManualOp: m }) => {
    await expect(m.reviewButton).toBeDisabled();
    await m.amount.fill('1500');
    await expect(m.reviewButton).toBeDisabled();
    await m.choose(m.paymentMethod, 'Cash');
    await m.reason.fill(REASON);
    await expect(m.reviewButton).toBeEnabled();
  });

  test('TC-MANDEP-005 Mobile Money reveals operator and reference fields', tc('TC-MANDEP-005'), async ({ fiatManualOp: m }) => {
    await expect(m.paymentOperator).toHaveCount(0);
    await m.choose(m.paymentMethod, 'Mobile Money');
    await expect(m.paymentOperator).toBeVisible();
    await expect(m.reference).toBeVisible();
  });

  test('TC-MANDEP-006 operators are labelled with operator and phone', tc('TC-MANDEP-006'), async ({ fiatManualOp: m }) => {
    await m.choose(m.paymentMethod, 'Mobile Money');
    const ops = await m.openOptions(m.paymentOperator);
    observe(`Operators: ${ops.join(' | ')}`);
    for (const o of ops) {
      expect.soft(o, 'phone number').toMatch(/\+\d{9,}/);
      expect(o, 'operator brand (Figma: "Orange Money +237…")').toMatch(/orange|mtn|moov|airtel|wave|momo|mobile money/i);
    }
  });

  test('TC-MANDEP-007 transaction ID reference is kept on Review', tc('TC-MANDEP-007'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    expect(await m.reviewValue('Payment reference')).toBe(REF);
  });

  test('TC-MANDEP-008 reason is required', tc('TC-MANDEP-008'), async ({ fiatManualOp: m }) => {
    await m.amount.fill('1500');
    await m.choose(m.paymentMethod, 'Cash');
    await expect(m.reviewButton).toBeDisabled();
  });

  test('TC-MANDEP-009 Review details summarises what was entered', tc('TC-MANDEP-009'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    observe(`Review: ${await m.mainText()}`);
    const v = (label: string) => m.reviewValue(label);
    expect.soft(await v('Client'), 'Client').toBe(`@${env.walletUsername}`);
    expect.soft(await v('Wallet type'), 'Wallet type').toMatch(/^main$/i);
    expect.soft(await v('Amount'), 'Amount').toBe('1,500 XAF');
    expect.soft(await v('Payment method'), 'Payment method').toMatch(/mobile money/i);
    expect.soft(await v('Source'), 'Source').toMatch(/\+\d{9,}/);
    expect.soft(await v('Date'), 'Date').not.toBe('');
    expect.soft(await v('Payment reference'), 'Payment reference').toBe(REF);
    expect.soft(await v('Reason'), 'Reason').toBe(REASON);
    expect(await v('Transaction type'), 'Transaction type').toMatch(/^cash in$/i);
  });

  test('TC-MANDEP-010 Back keeps the entered values', tc('TC-MANDEP-010'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await m.backButton.click();
    await m.expectPaymentInformation();
    const kept = { amount: await m.amount.inputValue(), reason: await m.reason.inputValue(), ref: (await m.reference.count()) ? await m.reference.inputValue() : '(field hidden)' };
    observe(`After Back: ${JSON.stringify(kept)}`);
    expect(kept).toEqual({ amount: expect.stringMatching(/1,?500/), reason: REASON, ref: REF });
  });

  test('TC-MANDEP-011 payment reference can be copied on Review', tc('TC-MANDEP-011'), async ({ fiatManualOp: m, page }) => {
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const copy = m.main.getByRole('button', { name: /copy/i });
    observe(`Copy buttons on Review: ${await copy.count()}`);
    await copy.first().click({ timeout: 5_000 });
    expect(await readClipboard(page)).toBe(REF);
  });

  test('TC-MANDEP-012 info box copy is about the deposit', tc('TC-MANDEP-012'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const text = (await m.infoBox.innerText()).replace(/\s+/g, ' ');
    observe(`Info box: "${text}"`);
    expect(text).not.toMatch(/TOTP|authenticator/i);
    expect(text).toMatch(/deposit/i);
  });

  test('TC-MANDEP-013 TC-MANDEP-014 TC-MANDEP-015 TC-MANDEP-026 confirming (OTP) credits the wallet and logs a manual Cash in', tc('TC-MANDEP-013', '@money'), async ({ fiatAccounts: l, fiatAccountDetails: d, fiatManualOp: m, page }) => {
    requireMoneyOps();
    await m.cancelButton.click();
    const before = parseAmount(await d.value('Balance'));
    await d.startCashIn();
    await m.fillMobileMoney(1000, REASON, REF);
    await m.reviewButton.click();
    const otpAsked = await m.confirm(env.otp);
    expect.soft(otpAsked, 'TC-MANDEP-026 OTP step').toBe(true);
    await expect(page.getByText(/success/i).first()).toBeVisible();
    await l.open();
    await l.openAccount(env.walletUsername);
    await d.expectLoaded(env.walletUsername);
    const after = parseAmount(await d.value('Balance'));
    observe(`Balance ${before} -> ${after}`);
    expect(after).toBe(before + 1000);
    await d.table.openFirstRowDetails();
    expect(await d.txnDetails.value('Transaction mode')).toMatch(/manual/i);
    expect(await d.txnDetails.value('Reason')).toBe(REASON);
  });

  test('TC-MANDEP-016 deposit appears in the audit trail', tc('TC-MANDEP-016'), async () => {
    blocked('No audit-trail screen exists in Phoenix (Figma "Missing": audit log view)');
  });

  test('TC-MANDEP-017 Cancel discards the deposit', tc('TC-MANDEP-017'), async ({ fiatAccountDetails: d, fiatManualOp: m, page }) => {
    await m.amount.fill('1500');
    await m.cancelButton.click();
    await expect(page).toHaveURL(/\/fiat\/accounts\/\d+$/);
    await d.expectLoaded(env.walletUsername);
  });

  test('TC-MANDEP-018 X closes the flow on either step', tc('TC-MANDEP-018'), async ({ fiatAccountDetails: d, fiatManualOp: m, page }) => {
    await m.closeButton.click();
    await expect(page, 'X on Payment information').toHaveURL(/\/fiat\/accounts\/\d+$/);
    await d.startCashIn();
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    await m.closeButton.click();
    observe(`After X on Review: ${page.url()}`);
    await expect(page, 'X on Review details').toHaveURL(/\/fiat\/accounts\/\d+$/);
  });

  test('TC-MANDEP-019 role without permission cannot open Manual deposit', tc('TC-MANDEP-019'), async () => {
    unmet('Needs a second admin account without manual-operation permission (PHX_LIMITED_USERNAME / PHX_LIMITED_PASSWORD)');
  });

  test('TC-MANDEP-020 payment method options and the Cash path', tc('TC-MANDEP-020'), async ({ fiatManualOp: m, page }) => {
    const options = await m.openOptions(m.paymentMethod);
    observe(`Payment methods: ${options.join(', ')}`);
    await page.keyboard.press('Escape');
    expect(options).toContain('Mobile Money');
    const other = options.find((o) => o !== 'Mobile Money');
    if (!other) unmet('Only Mobile Money is configured');
    await m.choose(m.paymentMethod, other);
    await expect(m.paymentOperator).toHaveCount(0);
    await expect(m.reference).toHaveCount(0);
  });

  test('TC-MANDEP-021 field labels match the design', tc('TC-MANDEP-021'), async ({ fiatManualOp: m }) => {
    await m.choose(m.paymentMethod, 'Mobile Money');
    const labels = (await m.labels()).map((x) => x.toLowerCase());
    observe(`Labels: ${(await m.labels()).join(', ')}`);
    for (const want of ['Deposit amount', 'Payment method', 'Payment operator', 'Transaction ID reference', 'Reason of the operation']) {
      expect.soft(labels, want).toContain(want.toLowerCase());
    }
  });

  test('TC-MANDEP-022 stepper shows both steps on both pages', tc('TC-MANDEP-022'), async ({ fiatManualOp: m }) => {
    await expect(m.stepper).toContainText(/Payment information.*Review details/s);
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    observe(`Stepper on Review: "${(await m.stepper.innerText()).replace(/\s+/g, ' ')}"`);
    await expect(m.stepper).toContainText(/Payment information.*Review details/s);
  });

  test('TC-MANDEP-023 Review heading and breadcrumb', tc('TC-MANDEP-023'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const heading = (await m.heading.textContent())?.trim();
    const crumb = (await m.bannerText()).split('Do you need help?')[0].trim();
    observe(`Heading "${heading}", breadcrumb "${crumb}"`);
    expect.soft(heading).toBe('Review details');
    expect(crumb).toMatch(/manual deposit$/i);
  });

  test('TC-MANDEP-024 subtitle is relevant to a deposit', tc('TC-MANDEP-024'), async ({ fiatManualOp: m }) => {
    const text = (await m.subtitle.textContent())?.trim() ?? '';
    observe(`Subtitle: "${text}"`);
    expect(text).not.toMatch(/documents are clear/i);
  });

  test('TC-MANDEP-025 reaching Review creates no transaction', tc('TC-MANDEP-025'), async ({ fiatAccounts: l, fiatAccountDetails: d, fiatManualOp: m, page }) => {
    await m.cancelButton.click();
    await d.expectLoaded(env.walletUsername);
    const before = (await d.pagination.counts()).total;
    await d.startCashIn();
    await m.fillMobileMoney(1500, REASON, REF);
    await m.reviewButton.click();
    await expect(page).toHaveURL(/\/verify$/);
    await m.closeButton.click();
    await l.open();
    await l.openAccount(env.walletUsername);
    await d.expectLoaded(env.walletUsername);
    const after = (await d.pagination.counts()).total;
    observe(`Transactions before ${before}, after Review + close ${after}`);
    expect(after).toBe(before);
  });

  test('TC-MANDEP-027 header has help and close', tc('TC-MANDEP-027'), async ({ fiatManualOp: m }) => {
    await expect(m.helpButton).toBeVisible();
    await expect(m.closeButton).toBeVisible(DESIGN);
  });
});
