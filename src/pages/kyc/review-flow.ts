import { expect, type Page } from '@playwright/test';
import { blocked, unmet } from '../../utils/tc';
import type { KycRequestsPage } from './KycRequestsPage';
import type { KycReviewPage } from './KycReviewPage';

/**
 * Opens the review wizard of a pending request: first "Resubmission" request
 * when `extended` (it carries Proof of residence + UIN), otherwise the first
 * "New" one. Stops the test as BLOCKED when the review page shows the app's
 * error page (GET /kyc/requests/<id>/process = 500 on 14 Oct 2026).
 */
export async function startReview(k: KycRequestsPage, r: KycReviewPage, page: Page, extended = false) {
  await k.open('pending');
  const types = await k.column('Submission type');
  let i = types.indexOf(extended ? 'Resubmission' : 'New');
  if (i < 0) i = 0;
  if (!types.length) unmet('No pending KYC request on testbox');
  const user = await k.openRow(i);
  await k.preview.reviewButton.click();
  await page.waitForURL(/\/process/, { timeout: 15_000 }).catch(() => {});
  if (await r.crashed()) blocked(`Review page crashes: "Review request" on ${user} opens ${new URL(page.url()).pathname} = "Oops! An unexpected error occurred." (HTTP 500)`);
  await r.expectLoaded();
  return user;
}

/** Answers "Yes" up to (not including) question `n` of the current document ("3/9" -> n = 3). */
export async function goToQuestion(r: KycReviewPage, n: number) {
  await expect(r.counter).toHaveText(/^1\//);
  await r.answerYes(n - 1);
  await expect(r.counter).toHaveText(new RegExp(`^${n}/`));
}
