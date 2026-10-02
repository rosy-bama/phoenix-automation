import { test, expect } from '../../src/fixtures/test-fixtures';
import { knownBug } from '../../src/utils/known-bug';

/**
 * Test plan Section 2 - Account List Filters (14.3% pass rate on 11 Aug 2026).
 * Known issues from the Test Summary Report: multi-select status, quick date
 * ranges, and Reset/Apply logic broken against Figma.
 * TODO (Rose): swap the knownBug ids for the real ticket ids.
 */
test.describe('Fiat Wallet - 2. Account list filters', () => {
  test.beforeEach(async ({ fiatAccounts }) => {
    await fiatAccounts.open();
    await fiatAccounts.filters.open();
  });

  test('FW-2.01 filter panel shows Status, currency, balance range and date range', async ({ fiatAccounts }) => {
    const f = fiatAccounts.filters;
    await expect(f.select('Status')).toBeVisible();
    await expect(f.minAmount).toBeVisible();
    await expect(f.maxAmount).toBeVisible();
    await expect(f.startDate).toBeVisible();
    await expect(f.endDate).toBeVisible();
    await expect(f.resetButton).toBeVisible();
    await expect(f.applyButton).toBeVisible();
  });

  test('FW-2.02 × closes the panel', async ({ fiatAccounts }) => {
    await fiatAccounts.filters.close();
  });

  test('FW-2.03 Status options include Frozen and Closed', async ({ fiatAccounts }) => {
    const f = fiatAccounts.filters;
    await f.select('Status').click();
    await expect(f.dropdownOptions().filter({ hasText: /^Frozen$/ })).toBeVisible();
    await expect(f.dropdownOptions().filter({ hasText: /^Closed$/ })).toBeVisible();
  });

  test('FW-2.04 Status = Frozen shows only frozen accounts (or the empty state)', async ({ fiatAccounts }) => {
    const f = fiatAccounts.filters;
    await f.choose('Status', 'Frozen');
    await f.apply();
    await expect(fiatAccounts.table.rows.filter({ hasNotText: /frozen/i })).toHaveCount(0);
  });

  test('FW-2.05 Status allows selecting several values', { tag: ['@known-bug'] }, async ({ fiatAccounts }) => {
    knownBug('FW-2.05', 'Status filter is single-select; Figma expects multi-select (TSR 11 Aug 2026)');
    const f = fiatAccounts.filters;
    await f.choose('Status', 'Frozen');
    await f.choose('Status', 'Closed');
    await expect(f.select('Status')).toContainText('Frozen');
    await expect(f.select('Status')).toContainText('Closed');
  });

  test('FW-2.06 date range offers quick ranges', { tag: ['@known-bug'] }, async ({ fiatAccounts, page }) => {
    knownBug('FW-2.06', 'Quick date ranges missing from date picker (TSR 11 Aug 2026)');
    await fiatAccounts.filters.startDate.click();
    // INFERRED labels - align with Figma.
    await expect(page.getByText(/last 7 days|this month|today/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('FW-2.07 Reset clears every filter field', { tag: ['@known-bug'] }, async ({ fiatAccounts }) => {
    knownBug('FW-2.07', 'Reset does not clear all fields (TSR 11 Aug 2026)');
    const f = fiatAccounts.filters;
    await f.choose('Status', 'Frozen');
    await f.setAmountRange(100, 5000);
    await f.resetButton.click();
    await expect(f.minAmount).toHaveValue('');
    await expect(f.maxAmount).toHaveValue('');
    await expect(f.select('Status')).not.toContainText('Frozen');
  });

  test('FW-2.08 balance range keeps only accounts within the range', { tag: ['@known-bug'] }, async ({ fiatAccounts }) => {
    knownBug('FW-2.08', 'Apply filters logic broken against Figma (TSR 11 Aug 2026) - confirm exact symptom');
    const f = fiatAccounts.filters;
    await f.setAmountRange(1000, 10000);
    await f.apply();
    await expect(f.heading).toBeHidden(); // panel closes on apply
    // INFERRED: balance shows in the row as "FCFA x,xxx"
    for (const row of await fiatAccounts.table.rows.all()) {
      const m = ((await row.textContent()) ?? '').match(/([\d,]+(?:\.\d+)?)\s*XAF/);
      if (m) {
        const v = Number(m[1].replace(/,/g, ''));
        expect(v).toBeGreaterThanOrEqual(1000);
        expect(v).toBeLessThanOrEqual(10000);
      }
    }
  });

  test('FW-2.09 empty state - impossible balance range returns zero rows', async ({ fiatAccounts }) => {
    const f = fiatAccounts.filters;
    await f.setAmountRange(999_999_999_000, 999_999_999_999);
    await f.apply();
    await expect(fiatAccounts.table.rows).toHaveCount(0);
  });
});
