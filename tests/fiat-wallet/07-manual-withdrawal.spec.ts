import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, blocked, requireMoneyOps } from '../../src/utils/tc';
import { parseAmount } from '../../src/utils/text';
import { readClipboard } from '../../src/utils/ui';

/**
 * Plan section 7 - Manual withdrawal / Cash out (Figma 441:12847).
 * Needs a positive balance on PHX_WALLET_USERNAME. Confirming moves money:
 * only with PHX_ALLOW_MONEY_OPS=true. Full withdrawal (TC-MANWD-017) stays
 * manual because it empties the shared test account.
 */
const REASON = 'QA automation - manual withdrawal check';

test.describe('Fiat Wallet - 7. Manual withdrawal (Cash out)', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
  let balance = 0;

  test.beforeEach(async ({ fiatAccounts, fiatAccountDetails, fiatManualOp }) => {
    await fiatAccounts.open();
    await fiatAccounts.openAccount(env.walletUsername);
    await fiatAccountDetails.expectLoaded(env.walletUsername);
    balance = parseAmount(await fiatAccountDetails.value('Balance'));
    if (balance <= 0) unmet(`${env.walletUsername} has a 0 XAF balance - a withdrawal cannot be prepared`);
    await fiatAccountDetails.startCashOut();
    await fiatManualOp.expectPaymentInformation();
  });

  const partial = () => Math.max(1, Math.min(1000, Math.floor(balance / 2)));

  test('TC-MANWD-001 Cash out opens Manual withdrawal on Payment information', tc('TC-MANWD-001'), async ({ fiatManualOp: m, page }) => {
    await expect(page).toHaveURL(/\/manual-withdrawal$/);
    const crumb = (await m.bannerText()).split('Do you need help?')[0].trim();
    observe(`Breadcrumb: "${crumb}"`);
    await expect(m.stepper).toContainText('Payment information');
    expect(crumb).toMatch(/manual withdrawal/i);
    expect(crumb).toContain('Account list');
  });

  test('TC-MANWD-002 amount accepts numbers only', tc('TC-MANWD-002'), async ({ fiatManualOp: m }) => {
    await m.amount.pressSequentially('ab#');
    expect(await m.amount.inputValue()).toBe('');
    await m.amount.fill(String(partial()));
    await expect(m.amount).toHaveValue(new RegExp(String(partial()).replace(/\B(?=(\d{3})+$)/g, ',?')));
  });

  test('TC-MANWD-003 amount above the balance is rejected', tc('TC-MANWD-003'), async ({ fiatManualOp: m, page }) => {
    await m.fillMobileMoney(balance + 1000, REASON);
    const error = page.getByText(/must not exceed|insufficient|exceeds/i).filter({ visible: true });
    observe(`Balance ${balance}; error: "${(await error.first().textContent().catch(() => '')) ?? ''}"; Review ${await m.reviewButton.isEnabled() ? 'enabled' : 'disabled'}`);
    await expect(error.first()).toBeVisible();
    await expect(m.reviewButton).toBeDisabled();
  });

  test('TC-MANWD-004 Empty entire account locks the amount to the balance', tc('TC-MANWD-004'), async ({ fiatManualOp: m }) => {
    await m.emptyAccountSwitch.click();
    await expect(m.emptyAccountSwitch).toBeChecked();
    observe(`Amount "${await m.amount.inputValue()}", editable ${await m.amount.isEditable()}`);
    expect(parseAmount(await m.amount.inputValue())).toBe(balance);
    await expect(m.amount).not.toBeEditable();
  });

  test('TC-MANWD-005 toggle replaces a typed partial amount', tc('TC-MANWD-005'), async ({ fiatManualOp: m }) => {
    await m.amount.fill(String(partial()));
    await m.emptyAccountSwitch.click();
    observe(`Typed ${partial()}, after toggle "${await m.amount.inputValue()}"`);
    expect(parseAmount(await m.amount.inputValue())).toBe(balance);
    await expect(m.amount).not.toBeEditable();
  });

  test('TC-MANWD-006 toggling off re-enables the amount', tc('TC-MANWD-006'), async ({ fiatManualOp: m }) => {
    await m.emptyAccountSwitch.click();
    await m.emptyAccountSwitch.click();
    await expect(m.emptyAccountSwitch).not.toBeChecked();
    await expect(m.amount).toBeEditable();
  });

  test('TC-MANWD-007 Mobile Money reveals the operator field', tc('TC-MANWD-007'), async ({ fiatManualOp: m }) => {
    await expect(m.paymentOperator).toHaveCount(0);
    await m.choose(m.paymentMethod, 'Mobile Money');
    await expect(m.paymentOperator).toBeVisible();
  });

  test('TC-MANWD-008 reason is required', tc('TC-MANWD-008'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(partial(), REASON);
    await m.reason.fill('');
    await expect(m.reviewButton).toBeDisabled();
  });

  test('TC-MANWD-009 Review details is disabled until required fields are set', tc('TC-MANWD-009'), async ({ fiatManualOp: m }) => {
    await expect(m.reviewButton).toBeDisabled();
    await m.fillMobileMoney(partial(), REASON);
    await expect(m.reviewButton).toBeEnabled();
  });

  test('TC-MANWD-010 Review shows a correct partial withdrawal', tc('TC-MANWD-010'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(partial(), REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    observe(`Review: ${await m.mainText()}`);
    const v = (label: string) => m.reviewValue(label);
    expect.soft(await v('Client')).toBe(`@${env.walletUsername}`);
    expect.soft(await v('Wallet type')).toMatch(/^main$/i);
    expect.soft(await v('Transaction type')).toMatch(/^cash out$/i);
    expect.soft(await v('Withdrawal type')).toMatch(/^partial withdrawal$/i);
    expect.soft(parseAmount(await v('Amount'))).toBe(partial());
    expect.soft(await v('Destination')).toMatch(/\+\d{9,}/);
    expect.soft(await v('Date')).not.toBe('');
    expect.soft(await v('Payment reference')).not.toBe('');
    expect.soft(await v('Reason')).toBe(REASON);
    expect(await v('Payment method'), 'Payment method = chosen method (Mobile Money / operator brand)').toMatch(/mobile money|orange|mtn|moov|airtel|wave|momo/i);
  });

  test('TC-MANWD-011 Review shows a full withdrawal of the whole balance', tc('TC-MANWD-011'), async ({ fiatManualOp: m }) => {
    await m.emptyAccountSwitch.click();
    await m.fillMobileMoney(null, REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const type = await m.reviewValue('Withdrawal type');
    const amount = await m.reviewValue('Amount');
    observe(`Withdrawal type "${type}", Amount "${amount}", balance ${balance}`);
    expect.soft(type).toMatch(/full|entire|total/i);
    expect(parseAmount(amount)).toBe(balance);
  });

  test('TC-MANWD-012 Back keeps values and toggle state', tc('TC-MANWD-012'), async ({ fiatManualOp: m }) => {
    await m.emptyAccountSwitch.click();
    await m.fillMobileMoney(null, REASON);
    await m.reviewButton.click();
    await m.backButton.click();
    await m.expectPaymentInformation();
    const kept = { toggle: await m.emptyAccountSwitch.isChecked(), amount: await m.amount.inputValue(), reason: await m.reason.inputValue() };
    observe(`After Back: ${JSON.stringify(kept)}`);
    expect(kept.toggle).toBe(true);
    expect(kept.reason).toBe(REASON);
    expect(parseAmount(kept.amount || '0')).toBe(balance);
  });

  test('TC-MANWD-013 payment reference can be copied on Review', tc('TC-MANWD-013'), async ({ fiatManualOp: m, page }) => {
    await m.fillMobileMoney(partial(), REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const ref = await m.reviewValue('Payment reference');
    const copy = m.main.getByRole('button', { name: /copy/i });
    observe(`Payment reference "${ref}"; copy buttons: ${await copy.count()}`);
    await copy.first().click({ timeout: 5_000 });
    expect(await readClipboard(page)).toBe(ref);
  });

  test('TC-MANWD-014 info box copy is about the withdrawal', tc('TC-MANWD-014'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(partial(), REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const text = (await m.infoBox.innerText()).replace(/\s+/g, ' ');
    observe(`Info box: "${text}"`);
    expect(text).not.toMatch(/TOTP|authenticator/i);
    expect(text).toMatch(/withdraw/i);
  });

  test('TC-MANWD-015 TC-MANWD-016 TC-MANWD-018 TC-MANWD-027 confirming (OTP) debits the wallet and logs a manual Cash out', tc('TC-MANWD-015', '@money'), async ({ fiatAccounts: l, fiatAccountDetails: d, fiatManualOp: m, page }) => {
    requireMoneyOps();
    const amount = partial();
    await m.fillMobileMoney(amount, REASON);
    await m.reviewButton.click();
    const otpAsked = await m.confirm(env.otp);
    expect.soft(otpAsked, 'TC-MANWD-027 OTP step').toBe(true);
    await expect(page.getByText(/success/i).first()).toBeVisible();
    await l.open();
    await l.openAccount(env.walletUsername);
    await d.expectLoaded(env.walletUsername);
    const after = parseAmount(await d.value('Balance'));
    await d.table.openFirstRowDetails();
    const fees = parseAmount(await d.txnDetails.value('Fees'));
    observe(`Balance ${balance} -> ${after} (amount ${amount}, fees ${fees})`);
    expect(after).toBe(balance - amount - fees);
    expect(await d.txnDetails.value('Transaction type')).toMatch(/cash.?out/i);
    expect(await d.txnDetails.value('Transaction mode')).toMatch(/manual/i);
    expect(await d.txnDetails.value('Reason')).toBe(REASON);
  });

  test('TC-MANWD-019 withdrawal appears in the audit trail', tc('TC-MANWD-019'), async () => {
    blocked('No audit-trail screen exists in Phoenix (Figma "Missing": audit log view)');
  });

  test('TC-MANWD-020 Cancel discards the withdrawal', tc('TC-MANWD-020'), async ({ fiatAccountDetails: d, fiatManualOp: m, page }) => {
    await m.amount.fill(String(partial()));
    await m.cancelButton.click();
    await expect(page).toHaveURL(/\/fiat\/accounts\/\d+$/);
    expect(parseAmount(await d.value('Balance'))).toBe(balance);
  });

  test('TC-MANWD-021 X closes the flow on either step', tc('TC-MANWD-021'), async ({ fiatAccountDetails: d, fiatManualOp: m, page }) => {
    await m.closeButton.click();
    await expect(page, 'X on Payment information').toHaveURL(/\/fiat\/accounts\/\d+$/);
    await d.startCashOut();
    await m.fillMobileMoney(partial(), REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    await m.closeButton.click();
    observe(`After X on Review: ${page.url()}`);
    await expect(page, 'X on Review details').toHaveURL(/\/fiat\/accounts\/\d+$/);
  });

  test('TC-MANWD-022 role without permission cannot open Manual withdrawal', tc('TC-MANWD-022'), async () => {
    unmet('Needs a second admin account without manual-operation permission (PHX_LIMITED_USERNAME / PHX_LIMITED_PASSWORD)');
  });

  test('TC-MANWD-023 zero and negative amounts are rejected', tc('TC-MANWD-023'), async ({ fiatManualOp: m, page }) => {
    await m.fillMobileMoney(null, REASON);
    const notes: string[] = [];
    for (const v of ['-5', '0']) {
      await m.amount.fill(v);
      await m.reason.click();
      const shown = await page.getByText(/greater than 0/i).filter({ visible: true }).first().isVisible();
      const enabled = await m.reviewButton.isEnabled();
      notes.push(`${v}: error ${shown ? 'shown' : 'not shown'}, Review ${enabled ? 'ENABLED' : 'disabled'}`);
      observe(notes.join(' | '));
      expect(enabled, `${v}: Review details disabled`).toBe(false);
    }
  });

  test('TC-MANWD-024 Review separates Payment method and Destination', tc('TC-MANWD-024'), async ({ fiatManualOp: m }) => {
    await m.fillMobileMoney(partial(), REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const method = await m.reviewValue('Payment method');
    const dest = await m.reviewValue('Destination');
    observe(`Payment method "${method}", Destination "${dest}"`);
    expect.soft(dest).toMatch(/\+\d{9,}/);
    expect(method, 'method is not the account holder name').toMatch(/mobile money|orange|mtn|moov|airtel|wave|momo/i);
  });

  test('TC-MANWD-025 fee toggles (not in Figma) appear on Review', tc('TC-MANWD-025'), async ({ fiatManualOp: m, page }) => {
    const toggles = await page.getByRole('main').getByText(/automatic fees calculation|charge subscription fees/i).count();
    await m.fillMobileMoney(partial(), REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const fees = await m.reviewValue('Automatic fees calculation');
    const sub = await m.reviewValue('Charge subscription fees');
    observe(`Fee toggles on form: ${toggles} (not in Figma 441:12933 - product to confirm); on Review: automatic fees "${fees}", subscription fees "${sub}"`);
    if (toggles) {
      expect(fees).not.toBe('');
      expect(sub).not.toBe('');
    }
  });

  test('TC-MANWD-026 reaching Review creates no transaction', tc('TC-MANWD-026'), async ({ fiatAccounts: l, fiatAccountDetails: d, fiatManualOp: m, page }) => {
    await m.cancelButton.click();
    const before = (await d.pagination.counts()).total;
    await d.startCashOut();
    await m.fillMobileMoney(partial(), REASON);
    await m.reviewButton.click();
    await expect(page).toHaveURL(/\/verify$/);
    await m.closeButton.click();
    await l.open();
    await l.openAccount(env.walletUsername);
    await d.expectLoaded(env.walletUsername);
    const after = (await d.pagination.counts()).total;
    observe(`Transactions before ${before}, after Review + close ${after}; balance ${await d.value('Balance')}`);
    expect(after).toBe(before);
  });

  test('TC-MANWD-028 labels and subtitle match the design', tc('TC-MANWD-028'), async ({ fiatManualOp: m }) => {
    await m.choose(m.paymentMethod, 'Mobile Money');
    const labels = (await m.labels()).map((x) => x.toLowerCase());
    const subtitle = (await m.subtitle.textContent())?.trim() ?? '';
    observe(`Labels: ${(await m.labels()).join(', ')}; subtitle "${subtitle}"`);
    for (const want of ['Withdrawal amount', 'Payment method', 'Payment operator', 'Reason of the operation']) {
      expect.soft(labels, want).toContain(want.toLowerCase());
    }
    expect(subtitle).not.toMatch(/documents are clear/i);
  });
});
