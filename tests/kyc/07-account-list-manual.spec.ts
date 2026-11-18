import { test, expect } from '../../src/fixtures/test-fixtures';
import type { Page } from '@playwright/test';
import { tc } from '../../src/test-plan/tags';
import { blocked, observe, requireKycOps } from '../../src/utils/tc';
import type { KycRequestsPage } from '../../src/pages/kyc/KycRequestsPage';

/**
 * Plan sections 13-14 - Account list and Manual verification (Figma
 * 2996:136116, 2996:161614, 2996:134861 … 3065:174462). On 14 Oct 2026 the
 * Kyc & Comp. sidebar group only had "KYC Requests": these tests open the
 * Account list from the sidebar and are Blocked while it does not exist.
 */
async function openAccountList(k: KycRequestsPage, page: Page) {
  await k.open('pending');
  const nav = page.getByRole('navigation');
  const link = nav.getByRole('link', { name: 'Account list' });
  if (!(await link.count())) {
    const kycLinks = (await nav.getByRole('link').allTextContents()).map((t) => t.trim()).filter((t) => /kyc|request|account/i.test(t));
    blocked(`Account list not implemented: Kyc & Comp. only has ${kycLinks.map((l) => `"${l}"`).join(', ')}`);
  }
  await link.last().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
}

async function openManual(k: KycRequestsPage, page: Page) {
  await openAccountList(k, page);
  await page.getByRole('button', { name: 'Manual verification' }).click();
  await expect(page.getByText('Check user').first()).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });

test.describe('KYC - 13. Account list', () => {
  test('KYC-ACC-001 tabs Required only and Fully completed', tc('KYC-ACC-001'), async ({ kycRequests: k, page }) => {
    await openAccountList(k, page);
    await expect(tab(page, 'Required only')).toBeVisible();
    await expect(tab(page, 'Fully completed')).toBeVisible();
  });

  test('KYC-ACC-002 table columns', tc('KYC-ACC-002'), async ({ kycRequests: k, page }) => {
    await openAccountList(k, page);
    expect((await k.headers()).filter((h) => h !== 'Select all').map((h) => h.toLowerCase())).toEqual(['username', 'country', 'requested by', 'reviewed by', 'reviewed date']);
  });

  for (const [id, name] of [['KYC-ACC-003', 'Required only'], ['KYC-ACC-004', 'Fully completed']] as const) {
    test(`${id} ${name} tab content`, tc(id), async ({ kycRequests: k, page }) => {
      await openAccountList(k, page);
      await tab(page, name).click();
      await k.settle();
      await page.getByRole('button', { name: 'See details' }).first().click();
      await expect(page.getByText(name).first()).toBeVisible();
    });
  }

  test('KYC-ACC-005 See details opens the account', tc('KYC-ACC-005'), async ({ kycRequests: k, page }) => {
    await openAccountList(k, page);
    const user = (await k.column('Username'))[0];
    await page.getByRole('button', { name: 'See details' }).first().click();
    await expect(page.getByText(user).first()).toBeVisible();
  });

  test('KYC-ACC-006 toolbar and pagination', tc('KYC-ACC-006'), async ({ kycRequests: k, page }) => {
    await openAccountList(k, page);
    await expect(k.searchInput).toBeVisible();
    await expect(k.filters.openButton).toBeVisible();
    await expect(k.exportButton).toBeVisible();
    await expect(k.pagination.counter).toBeVisible();
  });

  test('KYC-ACC-007 approved user appears in Account list', tc('KYC-ACC-007'), async ({ kycRequests: k, page }) => {
    await openAccountList(k, page);
    requireKycOps('approve a request and find the user in Account list');
  });

  test('KYC-ACC-008 pending/rejected users are not listed', tc('KYC-ACC-008'), async ({ kycRequests: k, page }) => {
    await k.open('rejected');
    const user = (await k.column('Username'))[0];
    await openAccountList(k, page);
    await k.search(user.replace(/^@/, ''));
    await expect(k.row(user)).toHaveCount(0);
  });

  test('KYC-ACC-009 heading copy', tc('KYC-ACC-009'), async ({ kycRequests: k, page }) => {
    await openAccountList(k, page);
    const h = (await page.getByRole('heading', { level: 1 }).textContent())?.trim();
    observe(`Heading "${h}"`);
    expect(h).toMatch(/^All verified accounts?$/);
  });
});

test.describe('KYC - 14. Manual verification', () => {
  test('KYC-MAN-001 wizard layout and stepper', tc('KYC-MAN-001'), async ({ kycRequests: k, page }) => {
    await openManual(k, page);
    for (const s of ['Check user', 'Personal information', 'ID document', 'Selfie', 'Localization plan', 'IUN', 'Review details']) await expect(page.getByText(s).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  test('KYC-MAN-002 username autocomplete', tc('KYC-MAN-002'), async ({ kycRequests: k, page }) => {
    await openManual(k, page);
    await page.getByPlaceholder('ex: marshall').pressSequentially('ma', { delay: 100 });
    await expect(page.getByRole('option').first()).toBeVisible();
  });

  test('KYC-MAN-003 selecting a user shows a summary', tc('KYC-MAN-003'), async ({ kycRequests: k, page }) => {
    await openManual(k, page);
    await page.getByPlaceholder('ex: marshall').pressSequentially('ma', { delay: 100 });
    await page.getByRole('option').first().click();
    for (const s of ['First name', 'Last name', 'Country of residence', 'Current KYC status']) await expect(page.getByText(s).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('KYC-MAN-004 unknown username', tc('KYC-MAN-004'), async ({ kycRequests: k, page }) => {
    await openManual(k, page);
    await page.getByPlaceholder('ex: marshall').fill('zz-no-such-user-000');
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  for (const id of ['KYC-MAN-006', 'KYC-MAN-007', 'KYC-MAN-008', 'KYC-MAN-009', 'KYC-MAN-010', 'KYC-MAN-019'] as const) {
    test(`${id} manual verification step`, tc(id), async ({ kycRequests: k, page }) => {
      await openManual(k, page);
      await page.getByPlaceholder('ex: marshall').pressSequentially('ma', { delay: 100 });
      await page.getByRole('option').first().click();
      if (id === 'KYC-MAN-019') {
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByRole('button', { name: 'Manual verification' })).toBeVisible();
        return;
      }
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Just double-check the info before you confirm it!')).toBeVisible();
    });
  }
});
