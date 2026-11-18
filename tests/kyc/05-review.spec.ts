import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { observe, requireKycOps, DESIGN } from '../../src/utils/tc';
import { startReview, goToQuestion } from '../../src/pages/kyc/review-flow';

/**
 * Plan sections 6-10 - review wizard, ID card, selfie, additional documents,
 * review details and approval (Figma 1946:78501 … 2251:182662). Every test
 * starts from "Review request"; while the review page answers HTTP 500 they
 * are all reported as Blocked by startReview().
 */

test.describe('KYC - 6. Review wizard layout and navigation', () => {
  test('KYC-REV-001 review page layout', tc('KYC-REV-001'), async ({ kycRequests: k, kycReview: r, page }) => {
    const user = await startReview(k, r, page);
    await expect(page.getByText(user)).toBeVisible();
    await expect(page.getByText('Verification request review').first()).toBeVisible();
    await expect(r.help).toBeVisible();
    for (const step of ['Required documents', 'Additional documents', 'Review details']) await expect(page.getByText(step).first()).toBeVisible(DESIGN);
    await expect(page.getByText('Ensure the documents are clear and easy to understand.')).toBeVisible();
    await expect(r.counter).toHaveText('1/9');
    await expect(page.getByText('ID Card checking details')).toBeVisible();
    await expect(page.getByText('Verified info appears here!')).toBeVisible();
  });

  test('KYC-REV-002 document viewer controls', tc('KYC-REV-002'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await expect(r.front).toBeVisible();
    await r.backSide.first().click();
    const zoom = page.getByRole('button', { name: /zoom/i });
    const rotate = page.getByRole('button', { name: /rotate/i });
    observe(`Zoom buttons ${await zoom.count()}, rotate buttons ${await rotate.count()}`);
    expect(await zoom.count()).toBeGreaterThanOrEqual(2);
    expect(await rotate.count()).toBeGreaterThanOrEqual(2);
  });

  test('KYC-REV-003 counter and checking details advance', tc('KYC-REV-003'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(3);
    await expect(r.counter).toHaveText('4/9');
    for (const label of ['Document type', 'Image', 'First name']) await expect(page.getByText(label, { exact: true }).last()).toBeVisible();
  });

  test('KYC-REV-004 footer buttons per question', tc('KYC-REV-004'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await expect(r.cancel).toBeVisible();
    await expect(r.nextDocument).toBeHidden();
    await r.answerYes(1);
    await expect(r.back.last()).toBeVisible();
    await expect(r.nextDocument).toBeDisabled();
  });

  test('KYC-REV-005 Back keeps earlier answers', tc('KYC-REV-005'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(3);
    await r.back.last().click();
    await r.back.last().click();
    await expect(r.counter).toHaveText('2/9');
    await expect(page.getByText('Document type', { exact: true }).last()).toBeVisible();
  });

  test('KYC-REV-006 Cancel leaves without a decision', tc('KYC-REV-006'), async ({ kycRequests: k, kycReview: r, page }) => {
    const user = await startReview(k, r, page);
    await r.answerYes(2);
    await r.cancel.click();
    await page.getByRole('button', { name: /^(Yes|Leave|Confirm)/ }).click({ timeout: 3_000 }).catch(() => {});
    await expect(page).toHaveURL(/\/kyc\/requests/);
    await k.open('pending');
    await expect(k.row(user)).toHaveCount(1);
  });

  test('KYC-REV-007 "Do you need help?"', tc('KYC-REV-007'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    const url = page.url();
    await r.help.click();
    await page.waitForTimeout(1_000);
    observe(`Help -> ${page.url() === url ? 'same page' : page.url()}`);
    expect(page.url()).toContain('/process');
  });

  test('KYC-REV-008 stepper reflects progress', tc('KYC-REV-008'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(9);
    await r.nextDocument.click();
    await expect(page.getByText('Selfie checking details').or(page.getByText('ID Card checking details'))).toBeVisible();
    await r.answerYes(3);
    await r.continueButton.click();
    await expect(r.title).toHaveText(/Additional documents|Review details/);
  });

  test('KYC-REV-009 reload and browser back during review', tc('KYC-REV-009'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(2);
    await page.reload();
    expect(await r.crashed()).toBe(false);
    await r.expectLoaded();
    await page.goBack();
    expect(await r.crashed()).toBe(false);
  });
});

const ID_QUESTIONS: [string, number, RegExp, string][] = [
  ['KYC-IDC-001', 1, /^Is the submitted document the original\?$/, 'Document type'],
  ['KYC-IDC-002', 2, /^Is (the image visible|the document still valid)\?$/, '(Image|Validity)'],
  ['KYC-IDC-003', 3, /^Is it the right first name\?$/, 'First name'],
  ['KYC-IDC-004', 4, /^Is it the right last name\?$/, 'Last name'],
  ['KYC-IDC-005', 5, /^Is it the right date of birth\?$/, 'Date of birth'],
  ['KYC-IDC-006', 6, /^Is it the right gender\?$/, 'Gender'],
  ['KYC-IDC-007', 7, /^Is it the right citizenship\?$/, 'Country of citizenship'],
];

test.describe('KYC - 7. Review, ID card', () => {
  for (const [id, n, question, label] of ID_QUESTIONS) {
    test(`${id} question ${n}/9`, tc(id), async ({ kycRequests: k, kycReview: r, page }) => {
      await startReview(k, r, page);
      await goToQuestion(r, n);
      await expect(page.getByText(question)).toBeVisible();
      await expect(r.yes).toBeVisible();
      await expect(r.no).toBeVisible();
      await r.yes.click();
      await expect(page.getByText(new RegExp(`^${label}$`)).last()).toBeVisible();
    });
  }

  test('KYC-IDC-008 ID Reference entry', tc('KYC-IDC-008'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await goToQuestion(r, 8);
    await expect(page.getByText("What's the ID Reference?")).toBeVisible();
    await expect(r.saveIt).toBeDisabled();
    await r.idReference.fill('LT052ICJ5JAUJKBT95W0');
    await r.saveIt.click();
    await expect(page.getByText('ID reference', { exact: true }).last()).toBeVisible();
  });

  test('KYC-IDC-009 ID Reference validation', tc('KYC-IDC-009'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await goToQuestion(r, 8);
    await r.idReference.fill('   ');
    await expect(r.saveIt).toBeDisabled();
    await r.idReference.fill('X'.repeat(200));
    observe(`200-char value kept as ${(await r.idReference.inputValue()).length} chars`);
    expect((await r.idReference.inputValue()).length).toBeLessThan(200);
  });

  test('KYC-IDC-010 ID expiration date entry', tc('KYC-IDC-010'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await goToQuestion(r, 8);
    await r.idReference.fill('LT052ICJ5JAUJKBT95W0');
    await r.saveIt.click();
    await expect(page.getByText('ID expiration date')).toBeVisible();
    await expect(r.saveIt).toBeDisabled();
    await r.issuedDate.fill('01/10/2024');
    await r.issuedDate.press('Enter');
    await r.expiredDate.fill('01/10/2034');
    await r.expiredDate.press('Enter');
    await r.saveIt.click();
    await expect(page.getByText('ID expired date').last()).toBeVisible();
  });

  test('KYC-IDC-011 issued/expired date validation', tc('KYC-IDC-011'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await goToQuestion(r, 8);
    await r.idReference.fill('LT052ICJ5JAUJKBT95W0');
    await r.saveIt.click();
    await r.issuedDate.fill('01/10/2034');
    await r.issuedDate.press('Enter');
    await r.expiredDate.fill('01/10/2030');
    await r.expiredDate.press('Enter');
    observe(`Future issue date + expiry before issue: Save it ${(await r.saveIt.isEnabled()) ? 'enabled' : 'disabled'}`);
    await expect(r.saveIt).toBeDisabled();
  });

  test('KYC-IDC-012 all ID questions answered', tc('KYC-IDC-012'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(7);
    await r.idReference.fill('LT052ICJ5JAUJKBT95W0');
    await r.saveIt.click();
    await r.issuedDate.fill('01/10/2024');
    await r.issuedDate.press('Enter');
    await r.expiredDate.fill('01/10/2034');
    await r.expiredDate.press('Enter');
    await r.saveIt.click();
    await expect(r.everythingGood).toBeVisible();
    await expect(r.nextDocument).toBeEnabled();
  });

  test('KYC-IDC-013 question values come from the submission', tc('KYC-IDC-013'), async ({ kycRequests: k, kycReview: r, page }) => {
    await k.open('pending');
    const i = Math.max(0, (await k.column('Submission type')).indexOf('New'));
    await k.openRow(i);
    const first = await k.preview.value('First name');
    const last = await k.preview.value('Last name');
    await page.goBack().catch(() => {});
    await startReview(k, r, page);
    await goToQuestion(r, 3);
    await expect(page.getByText(first ?? '', { exact: true })).toBeVisible();
    await r.yes.click();
    await expect(page.getByText(last ?? '', { exact: true }).first()).toBeVisible();
  });
});

const SELFIE: [string, number, RegExp, string][] = [
  ['KYC-SLF-002', 1, /^Is the submitted selfie the original\?$/, 'Document type'],
  ['KYC-SLF-003', 2, /^Is the selfie compliant\?$/, 'Compliance'],
  ['KYC-SLF-004', 3, /^Does the selfie match the photo on the ID\?$/, 'Match ID photo'],
];

test.describe('KYC - 8. Review, selfie', () => {
  test('KYC-SLF-001 selfie step layout', tc('KYC-SLF-001'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(9);
    await r.nextDocument.click();
    await expect(r.counter).toHaveText('1/3');
    await expect(page.getByText('Selfie checking details')).toBeVisible();
    await expect(r.front).toBeHidden();
  });

  for (const [id, n, question, label] of SELFIE) {
    test(`${id} selfie question ${n}/3`, tc(id), async ({ kycRequests: k, kycReview: r, page }) => {
      await startReview(k, r, page);
      await r.answerYes(9);
      await r.nextDocument.click();
      await goToQuestion(r, n);
      await expect(page.getByText(question)).toBeVisible();
      await r.yes.click();
      await expect(page.getByText(new RegExp(`^${label}$`)).last()).toBeVisible();
      if (n === 3) await expect(r.continueButton).toBeEnabled();
    });
  }
});

const ADDITIONAL: [string, number, RegExp][] = [
  ['KYC-ADD-001', 1, /^Is the submitted localization plan valid\?$/],
  ['KYC-ADD-002', 2, /^Is the house clearly marked on the map\?$/],
  ['KYC-ADD-003', 3, /^Is the submitted document the original\?$/],
  ['KYC-ADD-004', 4, /^Is the submitted IUN number valid\?$/],
  ['KYC-ADD-005', 5, /^Is it the right full name\?$/],
  ['KYC-ADD-006', 6, /^Is it the right date of birth\?$/],
];

/** Gets an extended (completion) review to the first Additional documents question. */
async function toAdditional(r: import('../../src/pages/kyc/KycReviewPage').KycReviewPage) {
  await r.answerYes(9);
  await r.nextDocument.click();
  await r.answerYes(3);
  await r.continueButton.click();
  await expect(r.title).toHaveText('Additional documents');
}

test.describe('KYC - 9. Review, additional documents', () => {
  for (const [id, n, question] of ADDITIONAL) {
    test(`${id} additional question ${n}/6`, tc(id), async ({ kycRequests: k, kycReview: r, page }) => {
      await startReview(k, r, page, true);
      await toAdditional(r);
      await goToQuestion(r, n);
      await expect(page.getByText(question)).toBeVisible();
      await r.yes.click();
    });
  }

  test('KYC-ADD-008 IUN Preview link', tc('KYC-ADD-008'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page, true);
    await toAdditional(r);
    await goToQuestion(r, 3);
    await page.getByRole('button', { name: 'Preview' }).or(page.getByText('Preview', { exact: true })).first().click();
    await expect(page.locator('[role=dialog] img, .ant-image-preview-img').first()).toBeVisible();
  });
});

test.describe('KYC - 10. Review details and approval', () => {
  test('KYC-APR-001 review details, required level', tc('KYC-APR-001'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(9);
    await r.nextDocument.click();
    await r.answerYes(3);
    await r.continueButton.click();
    await expect(r.title).toHaveText('Review details');
    for (const s of ['ID card', 'Selfie', 'Compliance', 'Match ID photo']) await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
    await expect(r.confirm).toBeVisible();
    await expect(r.cancel).toBeVisible();
  });

  test('KYC-APR-002 review details, extended level', tc('KYC-APR-002'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page, true);
    await toAdditional(r);
    await r.answerYes(6);
    await r.continueButton.click();
    for (const s of ['Localization plan', 'IUN']) await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
  });

  test('KYC-APR-003 summary equals the answers', tc('KYC-APR-003'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(7);
    await r.idReference.fill('QA-REF-12345');
    await r.saveIt.click();
    await r.issuedDate.fill('01/10/2024');
    await r.issuedDate.press('Enter');
    await r.expiredDate.fill('01/10/2034');
    await r.expiredDate.press('Enter');
    await r.saveIt.click();
    await r.nextDocument.click();
    await r.answerYes(3);
    await r.continueButton.click();
    await expect(page.getByText(/^QA-REF-12345/)).toBeVisible();
  });

  test('KYC-APR-004 Confirm approves the request', tc('KYC-APR-004'), async ({ kycRequests: k, kycReview: r, page }) => {
    const user = await startReview(k, r, page);
    requireKycOps('approve a pending request');
    await r.answerYes(9);
    await r.nextDocument.click();
    await r.answerYes(3);
    await r.continueButton.click();
    await r.confirm.click();
    await expect(page.getByText(/approved successfully/i)).toBeVisible();
    await k.open('confirmed');
    await k.search(user.replace(/^@/, ''));
    await expect(k.row(user)).toHaveCount(1);
  });

  test('KYC-APR-005 user KYC level updated after approval', tc('KYC-APR-005'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    requireKycOps('approve a request and check the user KYC level');
  });

  test('KYC-APR-007 double-click on Confirm', tc('KYC-APR-007'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    requireKycOps('double-click Confirm on a disposable request');
  });

  test('KYC-APR-008 Cancel from Review details', tc('KYC-APR-008'), async ({ kycRequests: k, kycReview: r, page }) => {
    const user = await startReview(k, r, page);
    await r.answerYes(9);
    await r.nextDocument.click();
    await r.answerYes(3);
    await r.continueButton.click();
    await r.cancel.click();
    await page.getByRole('button', { name: /^(Yes|Leave|Confirm)/ }).click({ timeout: 3_000 }).catch(() => {});
    await k.open('pending');
    await expect(k.row(user)).toHaveCount(1);
  });

  test('KYC-APR-009 cannot skip a question', tc('KYC-APR-009'), async ({ kycRequests: k, kycReview: r, page }) => {
    await startReview(k, r, page);
    await r.answerYes(1);
    await expect(r.nextDocument).toBeDisabled();
    await expect(r.confirm).toBeHidden();
  });
});
