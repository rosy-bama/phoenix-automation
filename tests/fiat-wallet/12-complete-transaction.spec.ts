import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, blocked, requireMoneyOps } from '../../src/utils/tc';
import { listRows, openRow, isFailed, type TxnRow } from '../../src/fiat/test-data';

/**
 * Plan section 12 - Complete transaction on a failed deposit
 * (Figma 2098:143942: details "Failed" -> Payment information -> Review).
 * Needs a failed deposit on testbox. Confirming credits the wallet: only
 * with PHX_ALLOW_MONEY_OPS=true.
 */
const REASON = 'QA automation - complete failed deposit';

test.describe('Fiat Wallet - 12. Complete transaction', () => {
  let row: TxnRow;
  let internalRef = '';

  test.beforeEach(async ({ fiatTransactions: t, fiatManualOp: m }) => {
    const rows = await listRows(t, 'Deposits');
    const failed = rows.find(isFailed);
    if (!failed) unmet(`No failed deposit among the ${rows.length} deposits on testbox (status filter crashes, whole list scanned)`);
    row = failed;
    await openRow(t, 'Deposits', row);
    const label = (await t.txnDetails.has('Internal payment reference')) ? 'Internal payment reference' : 'Internal reference';
    internalRef = await t.txnDetails.value(label);
    if (!(await t.txnDetails.completeButton.isVisible())) blocked('"Complete transaction" is missing on a failed deposit (TC-TXNMODDET-007)');
    await t.txnDetails.completeButton.click();
    await m.expectPaymentInformation();
  });

  test('TC-COMPTX-001 opens on Payment information with the right breadcrumb', tc('TC-COMPTX-001'), async ({ fiatManualOp: m }) => {
    const crumb = (await m.bannerText()).split('Do you need help?')[0].trim();
    observe(`Breadcrumb "${crumb}"`);
    await expect(m.stepper).toContainText(/Payment information.*Review details/s);
    expect(crumb).toMatch(/Account list.*Complete transaction/i);
  });

  test('TC-COMPTX-002 internal payment reference is pre-filled and read-only', tc('TC-COMPTX-002'), async ({ fiatManualOp: m }) => {
    const field = m.main.getByRole('textbox').first();
    observe(`Field "${await field.inputValue()}", details showed "${internalRef}", editable ${await field.isEditable()}`);
    expect(await field.inputValue()).toBe(internalRef.replace(/(…|\.\.\.)$/, ''));
    await expect(field).not.toBeEditable();
  });

  test('TC-COMPTX-003 reason is required', tc('TC-COMPTX-003'), async ({ fiatManualOp: m }) => {
    await expect(m.reviewButton).toBeDisabled();
    await m.reason.fill(REASON);
    await expect(m.reviewButton).toBeEnabled();
  });

  test('TC-COMPTX-004 Review summarises the completion', tc('TC-COMPTX-004'), async ({ fiatManualOp: m }) => {
    await m.reason.fill(REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    observe(`Review: ${await m.mainText()}`);
    expect.soft(await m.reviewValue('Client')).toBe(row.Username);
    expect.soft(await m.reviewValue('Wallet type')).toMatch(/main/i);
    expect.soft(await m.reviewValue('Amount')).not.toBe('');
    expect.soft(await m.reviewValue('Reason')).toBe(REASON);
    expect(await m.reviewValue('Transaction type')).toMatch(/complete cash in/i);
  });

  test('TC-COMPTX-005 Review labels belong to Complete transaction', tc('TC-COMPTX-005'), async ({ fiatManualOp: m }) => {
    await m.reason.fill(REASON);
    await m.reviewButton.click();
    await expect(m.confirmButton).toBeVisible();
    const crumb = (await m.bannerText()).split('Do you need help?')[0].trim();
    const button = (await m.confirmButton.textContent())?.trim();
    observe(`Breadcrumb "${crumb}", button "${button}"`);
    expect.soft(crumb).toMatch(/complete transaction/i);
    expect(button).not.toMatch(/deposit/i);
  });

  test('TC-COMPTX-006 info box copy relates to completing', tc('TC-COMPTX-006'), async ({ fiatManualOp: m }) => {
    await m.reason.fill(REASON);
    await m.reviewButton.click();
    const text = (await m.infoBox.innerText()).replace(/\s+/g, ' ');
    observe(`Info box "${text}"`);
    expect(text).not.toMatch(/TOTP/i);
  });

  test('TC-COMPTX-007 Back keeps the reason', tc('TC-COMPTX-007'), async ({ fiatManualOp: m }) => {
    await m.reason.fill(REASON);
    await m.reviewButton.click();
    await m.backButton.click();
    await m.expectPaymentInformation();
    await expect(m.reason).toHaveValue(REASON);
  });

  test('TC-COMPTX-008 Cancel leaves the deposit Failed', tc('TC-COMPTX-008'), async ({ fiatManualOp: m, fiatTransactions: t }) => {
    await m.cancelButton.click();
    await openRow(t, 'Deposits', row);
    expect(await t.txnDetails.value('Status')).toMatch(/failed/i);
  });

  test('TC-COMPTX-009 TC-COMPTX-010 TC-COMPTX-011 confirming completes and credits once', tc('TC-COMPTX-009', '@money'), async ({ fiatManualOp: m, fiatTransactions: t, page }) => {
    requireMoneyOps();
    await m.reason.fill(REASON);
    await m.reviewButton.click();
    await m.confirm(env.otp);
    await expect(page.getByText(/success/i).first()).toBeVisible();
    await openRow(t, 'Deposits', { ...row, Status: '' });
    const p = t.txnDetails;
    observe(`After completion: ${await p.text()}`);
    expect(await p.value('Status')).toMatch(/complete/i);
    await expect(p.completeButton, 'TC-COMPTX-010 no second completion').toHaveCount(0);
    expect.soft(await p.value('Transaction mode'), 'TC-COMPTX-011').toMatch(/manual/i);
    expect.soft(await p.value('Reason'), 'TC-COMPTX-011').toBe(REASON);
  });
});
