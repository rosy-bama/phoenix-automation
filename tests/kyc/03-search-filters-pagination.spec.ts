import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, DESIGN } from '../../src/utils/tc';
import { crashed } from '../../src/utils/ui';

/** Plan section 4 - Requests list toolbar and pagination (Figma 2167:153310). */
test.describe('KYC - 4. Search, filters, refresh, export, pagination', () => {
  test.beforeEach(async ({ kycRequests }) => {
    await kycRequests.open('pending');
  });

  test('KYC-REQ-030 toolbar elements', tc('KYC-REQ-030'), async ({ kycRequests: k }) => {
    const placeholder = await k.searchInput.getAttribute('placeholder');
    observe(`Search placeholder "${placeholder}"; reload, Filters, Export present`);
    await expect(k.reloadButton).toBeVisible();
    await expect(k.filters.openButton).toBeVisible();
    await expect(k.exportButton).toBeVisible();
    expect(placeholder, 'Figma placeholder').toBe('Search account...');
  });

  test('KYC-REQ-031 search by exact username', tc('KYC-REQ-031'), async ({ kycRequests: k }) => {
    const target = (await k.column('Username'))[0].replace(/^@/, '');
    await k.search(target);
    const users = await k.column('Username');
    observe(`Search "${target}": ${users.length} rows (${users.slice(0, 4).join(', ')})`);
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) expect(u.toLowerCase()).toContain(target.toLowerCase());
  });

  test('KYC-REQ-032 search is case-insensitive and accepts @', tc('KYC-REQ-032'), async ({ kycRequests: k }) => {
    const target = (await k.column('Username'))[0].replace(/^@/, '');
    await k.search(target);
    const base = await k.column('Username');
    await k.search(target.toUpperCase());
    const upper = await k.column('Username');
    await k.search(`@${target}`);
    const at = await k.column('Username');
    observe(`"${target}": ${base.length} rows, UPPER: ${upper.length}, "@${target}": ${at.length}`);
    expect(upper).toEqual(base);
    expect(at).toEqual(base);
  });

  test('KYC-REQ-033 search with no match', tc('KYC-REQ-033'), async ({ kycRequests: k }) => {
    const before = (await k.pagination.counts()).total;
    await k.search('zzzz-no-such-user');
    await expect(k.emptyState).toBeVisible();
    const empty = await k.pagination.counts();
    await k.search('');
    const after = (await k.pagination.counts()).total;
    observe(`No match -> "No data", counter "${empty.text}"; cleared -> ${after} results (before ${before})`);
    expect(empty.total).toBe(0);
    expect.soft(empty.text, 'counter for 0 results').not.toMatch(/Showing 1 to 0/);
    expect(after).toBe(before);
  });

  test('KYC-REQ-034 search on Confirmed and Rejected', tc('KYC-REQ-034'), async ({ kycRequests: k, page }) => {
    const notes: string[] = [];
    for (const tab of ['confirmed', 'rejected'] as const) {
      await k.open(tab);
      const target = (await k.column('Username'))[0]?.replace(/^@/, '');
      if (!target) continue;
      await k.search(target);
      const users = await k.column('Username');
      notes.push(`${tab} "${target}": ${users.length} rows`);
      expect(users.length).toBeGreaterThan(0);
      for (const u of users) expect(u.toLowerCase()).toContain(target.toLowerCase());
      expect(page.url()).toContain(`status=${tab}`);
    }
    observe(notes.join('; '));
  });

  test('KYC-REQ-035 search input robustness', tc('KYC-REQ-035'), async ({ kycRequests: k, page }) => {
    const notes: string[] = [];
    for (const term of ['   ', 'x'.repeat(120), `' " % _ ; --`, '<script>alert(1)</script>']) {
      await k.searchInput.fill(term);
      await k.searchInput.press('Enter');
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
      const oops = await crashed(page);
      notes.push(`${JSON.stringify(term.slice(0, 20))}: ${oops ? 'CRASH' : `${await k.rows.count()} rows`}`);
      expect(oops, `no crash for ${JSON.stringify(term.slice(0, 20))}`).toBe(false);
      await k.open('pending');
    }
    observe(notes.join('; '));
  });

  test('KYC-REQ-036 Filters panel fields', tc('KYC-REQ-036'), async ({ kycRequests: k }) => {
    await k.filters.openButton.click();
    await expect(k.filters.heading).toBeVisible();
    const text = (await k.filters.root.innerText()).replace(/\s*\n+\s*/g, ' | ');
    observe(`Filter panel: ${text}`);
    for (const field of ['Submission type', 'Country']) expect.soft(text, `field "${field}"`).toContain(field);
    expect(text).toMatch(/Requested date|Date/i);
  });

  test('KYC-REQ-037 filter by Submission type', tc('KYC-REQ-037'), async ({ kycRequests: k, page }) => {
    await k.filters.openButton.click();
    await expect(k.filters.heading).toBeVisible();
    const has = await k.filters.label('Submission type').isVisible();
    observe(`"Submission type" filter ${has ? 'present' : 'missing (panel only has Username)'}`);
    expect(has).toBe(true);
    await k.filters.select('Submission type').click();
    await page.getByText('Resubmission', { exact: true }).last().click();
    await k.filters.applyButton.click();
    await k.settle();
    for (const t of await k.column('Submission type')) expect(t).toBe('Resubmission');
  });

  test('KYC-REQ-038 filter by Country and date range', tc('KYC-REQ-038'), async ({ kycRequests: k, page }) => {
    await k.filters.openButton.click();
    await expect(k.filters.heading).toBeVisible();
    const has = await k.filters.label('Country').isVisible();
    observe(`"Country" filter ${has ? 'present' : 'missing (panel only has Username)'}`);
    expect(has).toBe(true);
    await k.filters.select('Country').click();
    await page.getByText('Cameroon', { exact: true }).last().click();
    await k.filters.applyButton.click();
    await k.settle();
    for (const c of await k.column('Country')) expect(c).toBe('Cameroon');
  });

  test('KYC-REQ-039 refresh keeps tab and search', tc('KYC-REQ-039'), async ({ kycRequests: k, page }) => {
    const target = (await k.column('Username'))[0].replace(/^@/, '');
    await k.search(target);
    const url = page.url();
    await k.reloadButton.click();
    await k.settle();
    observe(`Before ${new URL(url).search}, after refresh ${new URL(page.url()).search}; search box "${await k.searchInput.inputValue()}"`);
    expect(page.url()).toBe(url);
    await expect(k.searchInput).toHaveValue(target);
  });

  test('KYC-REQ-041 pagination footer', tc('KYC-REQ-041'), async ({ kycRequests: k }) => {
    const c = await k.pagination.counts();
    const size = (await k.pagination.pageSizeSelect.locator('xpath=ancestor::*[contains(@class,"ant-select")][1]').innerText().catch(() => '')).trim();
    observe(`Footer: Per page "${size || '?'}", "${c.text}"`);
    await expect(k.pagination.pageSizeSelect).toBeVisible();
    await expect(k.pagination.prevButton).toBeVisible(DESIGN);
    await expect(k.pagination.nextButton).toBeVisible(DESIGN);
    expect(c.text).toMatch(/^Showing \d+ to \d+ of \d+ results$/);
    expect.soft(c.to - c.from + 1, 'Figma default page size 8').toBe(Math.min(8, c.total));
  });

  test('KYC-REQ-042 next, numbered and previous navigation', tc('KYC-REQ-042'), async ({ kycRequests: k }) => {
    const first = await k.pagination.counts();
    if (first.total <= first.to) unmet('Pending has a single page on testbox');
    await expect(k.pagination.prevButton).toBeDisabled();
    const p1 = await k.column('Username');
    await k.pagination.nextButton.click();
    await k.settle();
    const second = await k.pagination.counts();
    const p2 = await k.column('Username');
    await k.pagination.prevButton.click();
    await k.settle();
    const back = await k.pagination.counts();
    observe(`Page 1 "${first.text}", next -> "${second.text}", previous -> "${back.text}"`);
    expect(second.from).toBe(first.to + 1);
    expect(p2).not.toEqual(p1);
    expect(back.from).toBe(1);
  });

  test('KYC-REQ-043 change rows per page', tc('KYC-REQ-043'), async ({ kycRequests: k, page }) => {
    await k.pagination.pageSizeSelect.click({ force: true });
    const options = (await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').allInnerTexts()).map((o) => o.trim());
    const shown = await k.rows.count();
    const pick = options.find((o) => Number(o) > shown) ?? options[options.length - 1];
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: new RegExp(`^${pick}$`) }).click();
    await k.settle();
    const c = await k.pagination.counts();
    observe(`Per page options ${options.join('/')}; picked ${pick}: "${c.text}", ${await k.rows.count()} rows`);
    expect(c.from).toBe(1);
    expect(await k.rows.count()).toBe(Math.min(Number(pick), c.total));
  });

  test('KYC-REQ-044 last page upper bound equals total', tc('KYC-REQ-044'), async ({ kycRequests: k }) => {
    const c = await k.pagination.counts();
    let last = c;
    for (let i = 0; i < 30 && (await k.pagination.nextButton.isEnabled()); i++) {
      await k.pagination.nextButton.click();
      await k.settle();
      last = await k.pagination.counts();
    }
    observe(`First "${c.text}", last "${last.text}", rows on last page ${await k.rows.count()}`);
    expect(last.to).toBe(c.total);
    expect(await k.rows.count()).toBe(last.to - last.from + 1);
  });
});
