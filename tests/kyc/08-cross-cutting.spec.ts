import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { observe } from '../../src/utils/tc';
import { crashed } from '../../src/utils/ui';

/** Plan section 15 - cross-cutting checks on every KYC screen. */
test.describe('KYC - 15. Cross-cutting', () => {
  test('KYC-XC-001 no error page on KYC screens', tc('KYC-XC-001'), async ({ kycRequests: k, page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 80)));
    const results: string[] = [];
    for (const status of ['pending', 'confirmed', 'rejected'] as const) {
      await k.goto(`/kyc/requests?status=${status}`);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      results.push(`${status}: ${(await crashed(page)) ? 'CRASH' : 'ok'}`);
    }
    await k.open('pending');
    await k.openRow(0);
    results.push('preview: ok');
    await k.preview.reviewButton.click();
    await page.waitForURL(/\/process/, { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    results.push(`review ${new URL(page.url()).pathname}: ${(await crashed(page)) ? 'CRASH' : 'ok'}`);
    observe(`${results.join('; ')}${errors.length ? `; page errors: ${[...new Set(errors)].join(' | ')}` : ''}`);
    for (const r of results) expect(r).not.toContain('CRASH');
  });

  test('KYC-XC-002 list load time', tc('KYC-XC-002'), async ({ kycRequests: k, page }) => {
    await k.goto('/dashboard');
    const t0 = Date.now();
    await page.goto('/kyc/requests?status=pending');
    await k.rows.first().waitFor({ timeout: 30_000 });
    const ms = Date.now() - t0;
    observe(`First KYC request row after ${ms} ms`);
    expect(ms).toBeLessThan(3_000);
  });

  test('KYC-XC-004 lists do not expose ID numbers or document images', tc('KYC-XC-004'), async ({ kycRequests: k }) => {
    await k.open('pending');
    const imgs = await k.table.getByRole('img').evaluateAll((e) => e.map((i) => i.getAttribute('alt') ?? '').filter((a) => a && a !== 'No data'));
    const text = await k.table.innerText();
    observe(`Images in list: ${imgs.length}; ID-like values: ${(text.match(/\b[A-Z0-9]{12,}\b/g) ?? []).length}`);
    expect(imgs).toEqual([]);
    expect(text).not.toMatch(/\b[A-Z0-9]{12,}\b/);
  });

  test('KYC-XC-006 copy and typos', tc('KYC-XC-006'), async ({ kycRequests: k }) => {
    await k.open('pending');
    await k.openRow(0);
    const text = await k.preview.text();
    const typos = ['Personal informations', 'Date of of birth', 'Invalid date', 'recipe'].filter((t) => text.includes(t));
    observe(`Preview copy issues: ${typos.join(', ') || 'none'}; KYC status "${await k.preview.value('Current KYC status')}"`);
    expect(typos).toEqual([]);
  });

  test('KYC-XC-007 status labels are consistent', tc('KYC-XC-007'), async ({ kycRequests: k }) => {
    await k.open('pending');
    await k.openRow(0);
    const status = await k.preview.value('Current submission');
    const kyc = await k.preview.value('Current KYC status');
    observe(`Submission status "${status}", KYC status "${kyc}"`);
    expect(status).toBe('Pending');
    expect(kyc, 'capitalised like the other badges').toMatch(/^[A-Z]/);
  });

  test('KYC-XC-009 layout at 1280 px', tc('KYC-XC-009'), async ({ kycRequests: k, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await k.open('pending');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    observe(`Horizontal page overflow at 1280 px: ${overflow}px`);
    expect(overflow).toBeLessThanOrEqual(0);
    await k.openRow(0);
    await expect(k.preview.reviewButton).toBeInViewport();
  });
});
