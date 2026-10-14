import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { knownBug } from '../../src/utils/known-bug';
import { observe, blocked, DESIGN } from '../../src/utils/tc';
import { parseAmount } from '../../src/utils/text';
import { parseDmy, ymd } from '../../src/utils/ui';

/** Plan section 2 - Account List Filters (Figma 291:5818). */
test.describe('Fiat Wallet - 2. Account list filters', () => {
  test.beforeEach(async ({ fiatAccounts }) => {
    await fiatAccounts.open();
    await expect(fiatAccounts.table.rows.first()).toBeVisible();
    await fiatAccounts.filters.open();
  });

  const regDates = async (l: { table: { headers(): Promise<string[]>; column(n: string): Promise<string[]> } }) => {
    const header = (await l.table.headers()).find((h) => /registration/i.test(h))!;
    return (await l.table.column(header)).map(parseDmy);
  };

  test('TC-WALLFLT-001 panel shows Account status, Balance range and Creation date', tc('TC-WALLFLT-001'), async ({ fiatAccounts: l }) => {
    const f = l.filters;
    observe(`Panel: ${(await f.root.innerText()).replace(/\s+/g, ' ')}`);
    await expect(f.select('Account status')).toBeVisible();
    await expect(f.label('Balance range')).toBeVisible();
    await expect(f.label('Creation date')).toBeVisible();
    await expect(f.startDate).toBeVisible();
    await expect(f.endDate).toBeVisible();
    await expect(f.resetButton).toBeVisible();
    await expect(f.applyButton).toBeVisible();
    await expect.soft(f.label('Start amount'), 'Figma label "Start amount"').toBeVisible(DESIGN);
    await expect.soft(f.label('End amount'), 'Figma label "End amount"').toBeVisible(DESIGN);
  });

  test('TC-WALLFLT-002 a single status returns only matching accounts', tc('TC-WALLFLT-002'), async ({ fiatAccounts: l }) => {
    await l.filters.choose('Account status', 'Active');
    await l.filters.apply();
    await l.table.settle();
    const statuses = [...new Set(await l.table.column('Status'))];
    observe(`Statuses after filter: ${statuses.join(', ') || '(none)'}; ${(await l.pagination.counts()).text}`);
    expect(statuses.every((s) => /^active$/i.test(s))).toBe(true);
  });

  test('TC-WALLFLT-003 several statuses can be selected (OR)', tc('TC-WALLFLT-003', '@known-bug'), async ({ fiatAccounts: l }) => {
    knownBug('FW-2.05', 'Status filter is single-select; Figma expects multi-select chips (TSR 11 Aug 2026)');
    const f = l.filters;
    const [a, b] = ['Active', 'Frozen'];
    await f.choose('Account status', a);
    await f.choose('Account status', b);
    await expect(f.select('Account status')).toContainText(a, DESIGN);
    await expect(f.select('Account status')).toContainText(b, DESIGN);
  });

  test('TC-WALLFLT-004 removing a status chip drops it from the filter', tc('TC-WALLFLT-004'), async ({ fiatAccounts: l }) => {
    const f = l.filters;
    const [a, b] = ['Active', 'Frozen'];
    await f.choose('Account status', a);
    await f.choose('Account status', b);
    const both = (await f.select('Account status').innerText()).includes(a);
    if (!both) blocked('Account status is single-select, so there is no chip to remove (see TC-WALLFLT-003)');
    await f.select('Account status').locator('.ant-select-selection-item-remove').first().click();
    await expect(f.select('Account status')).not.toContainText(a);
  });

  test('TC-WALLFLT-005 balance range keeps only accounts within it', tc('TC-WALLFLT-005', '@known-bug'), async ({ fiatAccounts: l }) => {
    knownBug('FW-2.08', 'Apply filters logic broken against Figma (TSR 11 Aug 2026)');
    await l.filters.setAmountRange(1000, 10000);
    await l.filters.apply();
    await l.table.settle();
    const values = (await l.table.column('Total balance')).map(parseAmount);
    observe(`Balances: ${values.slice(0, 8).join(', ')}`);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v >= 1000 && v <= 10000, `${v} in 1000..10000`).toBe(true);
  });

  test('TC-WALLFLT-006 start amount above end amount is explained', tc('TC-WALLFLT-006'), async ({ fiatAccounts: l, page }) => {
    await l.filters.setAmountRange(10000, 1000);
    await l.filters.label('Balance range').click();
    const swapped = (await l.filters.minAmount.inputValue()).replace(/\D/g, '') === '1000';
    const message = page.getByText(/must be (greater|less|higher|lower)|invalid range|cannot be (greater|less)/i).filter({ visible: true });
    const disabled = await l.filters.applyButton.isDisabled();
    if (!disabled) await l.filters.apply();
    const shown = await message.first().isVisible().catch(() => false);
    observe(`Apply ${disabled ? 'disabled' : 'clicked'}; validation message ${shown ? 'shown' : 'not shown'}; auto-corrected: ${swapped}; rows: ${await l.table.rows.count()}`);
    expect(shown || swapped, 'validation message or auto-corrected range').toBe(true);
  });

  test('TC-WALLFLT-007 creation date range keeps accounts registered in it', tc('TC-WALLFLT-007'), async ({ fiatAccounts: l }) => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    await l.filters.pickDateRange(ymd(start), ymd(end));
    await l.filters.apply();
    await l.table.settle();
    const dates = await regDates(l);
    observe(`${ymd(start)}..${ymd(end)}: ${dates.length} row(s)`);
    for (const d of dates) expect(d >= start && d <= new Date(end.getTime() + 86_400_000), d.toISOString()).toBe(true);
  });

  test('TC-WALLFLT-008 quick date ranges apply the right window', tc('TC-WALLFLT-008'), async ({ fiatAccounts: l }) => {
    const ranges: [string, number][] = [['Today', 0], ['Yesterday', 1], ['Last 7 days', 7], ['Last 30 days', 30], ['Last 60 days', 60], ['Last 90 days', 90]];
    const notes: string[] = [];
    for (const [name, days] of ranges) {
      if (!(await l.filters.heading.isVisible())) await l.filters.open();
      await l.filters.startDate.click();
      await l.filters.quickRange(name).click();
      const start = await l.filters.startDate.inputValue();
      const end = await l.filters.endDate.inputValue();
      notes.push(`${name}: ${start} → ${end}`);
      expect(start, `${name} sets a start date`).not.toBe('');
      await l.filters.apply();
      await l.table.settle();
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - days);
      for (const d of await regDates(l)) expect(d >= from, `${name}: ${d.toISOString()}`).toBe(true);
    }
    observe(notes.join(' | '));
  });

  test('TC-WALLFLT-009 status + balance + date combine with AND', tc('TC-WALLFLT-009'), async ({ fiatAccounts: l }) => {
    await l.filters.choose('Account status', 'Active');
    await l.filters.setAmountRange(0, 1_000_000);
    await l.filters.startDate.click();
    await l.filters.quickRange('Last 90 days').click();
    await l.filters.apply();
    await l.table.settle();
    const from = new Date(); from.setDate(from.getDate() - 91);
    const statuses = await l.table.column('Status');
    const balances = (await l.table.column('Total balance')).map(parseAmount);
    observe(`${statuses.length} row(s)`);
    statuses.forEach((s) => expect(s).toMatch(/^active$/i));
    balances.forEach((b) => expect(b).toBeLessThanOrEqual(1_000_000));
    for (const d of await regDates(l)) expect(d >= from).toBe(true);
  });

  test('TC-WALLFLT-010 Apply is disabled until a value is set', tc('TC-WALLFLT-010'), async ({ fiatAccounts: l }) => {
    await expect(l.filters.applyButton).toBeDisabled();
    await l.filters.choose('Account status', 'Active');
    await expect(l.filters.applyButton).toBeEnabled();
  });

  test('TC-WALLFLT-011 Reset clears every field and keeps the panel open', tc('TC-WALLFLT-011', '@known-bug'), async ({ fiatAccounts: l }) => {
    knownBug('FW-2.07', 'Reset does not clear all fields (TSR 11 Aug 2026)');
    const f = l.filters;
    await f.choose('Account status', 'Active');
    await f.setAmountRange(100, 5000);
    await f.resetButton.click();
    await expect(f.heading).toBeVisible();
    await expect(f.minAmount).toHaveValue('', DESIGN);
    await expect(f.maxAmount).toHaveValue('', DESIGN);
    await expect(f.select('Account status')).not.toContainText('Active', DESIGN);
  });

  test('TC-WALLFLT-012 Filters button shows the active-filter count', tc('TC-WALLFLT-012'), async ({ fiatAccounts: l }) => {
    await l.filters.choose('Account status', 'Active');
    await l.filters.setAmountRange(0, 500_000);
    await l.filters.apply();
    await l.table.settle();
    const label = (await l.filters.openButton.innerText()).replace(/\s+/g, ' ').trim();
    observe(`2 criteria applied (status + balance range); Filters button reads "${label}"`);
    expect(label).toMatch(/\b2\b/);
  });

  test('TC-WALLFLT-013 closing without Apply discards the change', tc('TC-WALLFLT-013'), async ({ fiatAccounts: l }) => {
    const before = (await l.pagination.counts()).text;
    await l.filters.choose('Account status', 'Frozen');
    await l.filters.close();
    expect((await l.pagination.counts()).text).toBe(before);
    await l.filters.open();
    await expect(l.filters.select('Account status')).not.toContainText('Frozen');
  });

  test('TC-WALLFLT-015 subtitle describes account filtering', tc('TC-WALLFLT-015'), async ({ fiatAccounts: l }) => {
    const text = (await l.filters.subtitle.textContent())?.trim() ?? '';
    observe(`Subtitle: "${text}"`);
    expect(text).not.toMatch(/team members|permission/i);
    expect(text).toMatch(/filter|account/i);
  });

  test('TC-WALLFLT-016 status options are Active, Suspended, Deactivated', tc('TC-WALLFLT-016'), async ({ fiatAccounts: l }) => {
    const options = await l.filters.options('Account status');
    observe(`Options: ${options.join(', ')}`);
    expect(options).toEqual(expect.arrayContaining(['Active', 'Suspended']));
    expect(options.some((o) => /^deactivat/i.test(o))).toBe(true);
  });

  test('TC-WALLFLT-017 balance fields start empty', tc('TC-WALLFLT-017'), async ({ fiatAccounts: l }) => {
    const min = await l.filters.minAmount.inputValue();
    const max = await l.filters.maxAmount.inputValue();
    observe(`Defaults: start "${min}", end "${max}"`);
    expect(min).toBe('');
    expect(max).toBe('');
  });

  test('TC-WALLFLT-018 active filters show as chips above the table', tc('TC-WALLFLT-018'), async ({ fiatAccounts: l, page }) => {
    await l.filters.choose('Account status', 'Active');
    await l.filters.apply();
    await l.table.settle();
    const chip = page.getByRole('main').locator('.ant-tag, [class*="chip" i], [class*="tag" i]').filter({ hasText: /active/i });
    observe(`Chips above table: ${await chip.count()}`);
    await expect(chip.first()).toBeVisible(DESIGN);
  });
});
