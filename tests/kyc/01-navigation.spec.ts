import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { observe, DESIGN } from '../../src/utils/tc';
import { crashed, selectedIndex } from '../../src/utils/ui';

const SUBTITLE = 'Let agents locate the right user quickly, with enough summary information to triage before opening the full account detail.';

/** Plan section 1 - Navigation and access (Figma 2167:153309, 2996:136116). */
test.describe('KYC - 1. Navigation and access', () => {
  test('KYC-NAV-001 sidebar group Kyc & Comp. with Requests and Account list', tc('KYC-NAV-001'), async ({ kycRequests: k, page }) => {
    await k.open();
    const nav = page.getByRole('navigation');
    const group = nav.getByRole('button', { name: 'Kyc & Comp.' });
    await expect(group).toBeVisible();
    if (!(await nav.getByRole('link', { name: /Requests$/ }).isVisible())) await group.click();
    const links = (await nav.getByRole('link').allTextContents()).map((t) => t.trim()).filter(Boolean);
    const after = links.slice(links.findIndex((l) => /Requests$/.test(l)));
    observe(`Sidebar links: ${links.join(', ')}`);
    expect(links, 'a "Requests" link under Kyc & Comp.').toContain('Requests');
    expect(after, '"Account list" under Kyc & Comp.').toContain('Account list');
  });

  test('KYC-NAV-002 Requests page heading, subtitle, default tab, breadcrumb', tc('KYC-NAV-002'), async ({ kycRequests: k, page }) => {
    await k.goto('/kyc/requests');
    await expect(k.heading).toBeVisible({ timeout: 30_000 });
    await k.settle();
    const heading = (await k.heading.textContent())?.trim();
    const subtitle = (await k.description.textContent())?.trim();
    const crumb = (await page.getByRole('banner').innerText()).split('\n')[0];
    const selected = await selectedIndex(k.tabs());
    observe(`Heading "${heading}", subtitle "${subtitle}", breadcrumb "${crumb}", selected tab index ${selected}, URL ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
    expect.soft(heading, 'Figma heading').toBe('All verification requests');
    expect.soft(subtitle, 'Figma subtitle').toBe(SUBTITLE);
    expect.soft(crumb, 'breadcrumb ends with Requests').toMatch(/Requests$/);
    expect(selected, 'Pending selected by default').toBe(0);
  });

  test('KYC-NAV-003 Account list page', tc('KYC-NAV-003'), async ({ kycRequests: k, page }) => {
    await k.open();
    const nav = page.getByRole('navigation');
    const link = nav.getByRole('link', { name: 'Account list' }).last();
    const links = (await nav.getByRole('link').allTextContents()).map((t) => t.trim()).filter(Boolean);
    observe(`Kyc & Comp. links: ${links.filter((l) => !['Dashboard', 'User management', 'Settings', 'Support'].includes(l)).join(', ') || 'none'}`);
    await expect(link, 'Kyc & Comp. > Account list exists').toBeVisible(DESIGN);
    await link.click();
    await expect(page.getByRole('heading', { name: 'All verified account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manual verification' })).toBeVisible();
  });

  test('KYC-NAV-004 reload and new tab keep the page and tab', tc('KYC-NAV-004'), async ({ kycRequests: k, page, context }) => {
    await k.open('rejected');
    const url = page.url();
    await page.reload();
    await k.settle();
    expect(page.url()).toBe(url);
    const second = await context.newPage();
    await second.goto(url);
    await second.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const ok = !(await crashed(second)) && (await second.getByRole('heading', { level: 1 }).isVisible());
    observe(`After reload: ${new URL(page.url()).search}; new tab: ${ok ? 'same page' : 'error or redirect'} (${new URL(second.url()).pathname})`);
    expect(ok).toBe(true);
    expect(new URL(second.url()).search).toContain('status=rejected');
    await second.close();
  });

  test('KYC-NAV-006 logged-out visitor is sent to login', tc('KYC-NAV-006'), async ({ browser, baseURL }) => {
    // A fresh context (no saved session) instead of logging out: logging out ends the shared session.
    const ctx = await browser.newContext({ baseURL });
    const p = await ctx.newPage();
    const seen: string[] = [];
    for (const path of ['/kyc/requests', '/kyc/requests?status=confirmed']) {
      await p.goto(path);
      await p.waitForURL(/\/auth\//, { timeout: 20_000 }).catch(() => {});
      seen.push(`${path} -> ${new URL(p.url()).pathname}`);
    }
    observe(seen.join('; '));
    await ctx.close();
    for (const s of seen) expect(s).toMatch(/-> \/auth\//);
  });
});
