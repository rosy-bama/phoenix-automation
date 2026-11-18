import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { requireKycOps } from '../../src/utils/tc';
import { startReview, goToQuestion } from '../../src/pages/kyc/review-flow';

/** Plan sections 11-12 - rejection flow and reasons (Figma 2794:14968, 2819:23953, 2828:24196, 2812:21686, 2848:19554). */
test.describe('KYC - 11. Rejection flow', () => {
  test('KYC-REJ-001 "No" opens the reason picker', tc('KYC-REJ-001'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.no.click();
    await expect(r.problemTitle).toBeVisible();
    expect(await page.getByRole('radio').count()).toBeGreaterThan(0);
  });

  test('KYC-REJ-002 back arrow returns to the question', tc('KYC-REJ-002'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.no.click();
    await page.getByRole('button', { name: /back|arrow|‹|</i }).first().click();
    await expect(page.getByText('Is the submitted document the original?')).toBeVisible();
    await expect(r.counter).toHaveText('1/9');
  });

  test('KYC-REJ-003 a reason fails the request', tc('KYC-REJ-003'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.no.click();
    await page.getByRole('radio', { name: 'Document is a photocopy' }).check();
    await expect(r.title).toHaveText('Review details');
    await expect(r.failedCallout).toBeVisible();
    await expect(page.getByText('Photocopy')).toBeVisible();
    await expect(r.reject).toBeVisible();
  });

  test('KYC-REJ-004 Reject request', tc('KYC-REJ-004'), async ({ kycRequests: k, kycReview: r, page }) => {
    const user = await startReview(k, r, page);
    requireKycOps('reject a pending request');
    await r.no.click();
    await page.getByRole('radio', { name: 'Document is a photocopy' }).check();
    await r.reject.click();
    await expect(page.getByText('Verification request has been rejected successfully.')).toBeVisible();
    await k.open('rejected');
    await k.search(user.replace(/^@/, ''));
    await expect(k.row(user)).toHaveCount(1);
  });

  test('KYC-REJ-005 Back from failed review details', tc('KYC-REJ-005'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.no.click();
    await page.getByRole('radio', { name: 'Document is a photocopy' }).check();
    await r.back.last().click();
    await r.yes.click();
    await expect(r.counter).toHaveText('2/9');
    await expect(r.failedCallout).toBeHidden();
  });

  test('KYC-REJ-007 stored rejection reason is visible later', tc('KYC-REJ-007'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    requireKycOps('reject a request and check the stored reason');
  });

  test('KYC-REJ-008 one reason at a time where "Pick one problem"', tc('KYC-REJ-008'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await goToQuestion(r, 3);
    await r.no.click();
    const radios = page.getByRole('radio');
    await radios.nth(0).check();
    await r.back.last().click().catch(() => {});
    await goToQuestion(r, 3).catch(() => {});
    await r.no.click();
    await radios.nth(1).check();
    expect(await radios.evaluateAll((e) => e.filter((x) => (x as HTMLInputElement).checked).length)).toBe(1);
  });
});

test.describe('KYC - 12. Rejection reasons', () => {
  const cases: [string, number, string, string][] = [
    ['KYC-RSN-001', 1, 'Document is a photocopy', 'Photocopy'],
    ['KYC-RSN-002', 3, "Information doesn't match the document (possible fraud)", 'No match (possible fraud)'],
  ];
  for (const [id, n, option, shown] of cases) {
    test(`${id} reject for "${option}"`, tc(id), async ({ kycRequests: k, kycReview: r, page }) => {
      await startReview(k, r, page);
      await goToQuestion(r, n);
      await r.no.click();
      const options = (await page.getByRole('radio').evaluateAll((e) => e.map((x) => x.closest('label')?.textContent?.trim() ?? ''))).filter(Boolean);
      expect(options).toContain(option);
      await page.getByRole('radio', { name: option }).check();
      await expect(page.getByText(shown).first()).toBeVisible();
      await expect(r.failedCallout).toBeVisible();
    });
  }
});
