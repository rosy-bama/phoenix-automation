import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet } from '../../src/utils/tc';
import type { KycRequestsPage } from '../../src/pages/kyc/KycRequestsPage';

/** Plan section 5 - Request preview (Figma 1831:1669, 2174:159745, 2174:160313, 2174:160991). */

/** Opens the first Pending row whose Submission type is `type` (any when omitted). */
async function openPending(k: KycRequestsPage, type?: 'New' | 'Resubmission') {
  await k.open('pending');
  const types = await k.column('Submission type');
  const i = type ? types.indexOf(type) : 0;
  if (i < 0) unmet(`No pending "${type}" request on page 1 of testbox`);
  return k.openRow(i);
}

test.describe('KYC - 5. Request preview', () => {
  test('KYC-PRV-001 header and current submission block', tc('KYC-PRV-001'), async ({ kycRequests: k }) => {
    const user = await openPending(k);
    const v = {
      status: await k.preview.value('Current submission'),
      date: await k.preview.value('Submission date'),
      by: await k.preview.value('Requested by'),
      kyc: await k.preview.value('Current KYC status'),
    };
    observe(`${user}: ${JSON.stringify(v)}`);
    await expect(k.preview.closeButton).toBeVisible();
    expect(v.status).toBe('Pending');
    expect(v.date).toMatch(/\d/);
    expect(v.by).toMatch(/^@\S+/);
    expect(v.kyc, 'Figma KYC status badge (Unverified / Required only)').toMatch(/^(Unverified|Required only)$/);
  });

  test('KYC-PRV-002 personal information, ID card and selfie', tc('KYC-PRV-002'), async ({ kycRequests: k }) => {
    const user = await openPending(k, 'New');
    const text = await k.preview.text();
    const fields = ['First name', 'Last name', 'Gender', 'Date of Birth', 'Country of Residence', 'Citizenship'];
    const values = Object.fromEntries(await Promise.all(fields.map(async (f) => [f, await k.preview.value(f)])));
    const images = await k.preview.imageNames();
    observe(`${user}: ${JSON.stringify(values)}; ID fields: ${['ID Reference', 'ID issue date', 'ID expired date'].map((f) => text.split('\n')[text.split('\n').indexOf(f) + 1] ?? '-').join(' / ')}; images: ${images.join(', ')}`);
    for (const f of fields) {
      expect.soft(values[f], `${f} has a value`).toBeTruthy();
      expect.soft(values[f], `${f} is not a label`).not.toMatch(/^(Last name|Gender|Date of Birth|Country of Residence|Citizenship|ID Reference)$/);
    }
    expect.soft(values['Date of Birth'], 'DOB like "October 22, 1995"').toMatch(/^[A-Z][a-z]+ \d{2}, \d{4}$/);
    expect.soft(text, 'no "Invalid date" in the preview').not.toContain('Invalid date');
    expect(images.some((i) => /front/i.test(i)), 'ID card front image').toBe(true);
    expect(images.some((i) => /^Selfie/i.test(i)), 'Selfie image').toBe(true);
  });

  test('KYC-PRV-003 Current KYC status badge values', tc('KYC-PRV-003'), async ({ kycRequests: k }) => {
    await k.open('pending');
    const seen = new Set<string>();
    const n = Math.min(await k.rows.count(), 5);
    for (let i = 0; i < n; i++) {
      await k.openRow(i);
      seen.add((await k.preview.value('Current KYC status')) ?? '(none)');
      await k.preview.closeButton.click();
    }
    observe(`Current KYC status values on ${n} pending requests: ${[...seen].join(', ')}`);
    for (const s of seen) expect(['Unverified', 'Required only']).toContain(s);
  });

  test('KYC-PRV-004 completion request shows Proof of residence and IUN', tc('KYC-PRV-004'), async ({ kycRequests: k }) => {
    await openPending(k, 'Resubmission');
    const images = await k.preview.imageNames();
    observe(`Images: ${images.join(', ')}`);
    expect(images.some((i) => /^Proof of residence/.test(i))).toBe(true);
    expect(images.some((i) => /^(IUN|UIN)/.test(i))).toBe(true);
    expect.soft(images.some((i) => /^IUN/.test(i)), 'label "IUN" (build shows "UIN")').toBe(true);
  });

  test('KYC-PRV-005 submission history of a resubmission', tc('KYC-PRV-005'), async ({ kycRequests: k }) => {
    await openPending(k, 'Resubmission');
    const text = await k.preview.text();
    const history = text.match(/Submission of [^\n]+/g) ?? [];
    observe(history.length ? `History rows: ${history.join(', ')}` : `No "Submission of <date>" history; previous review shown inline: Reviewed by ${await k.preview.value('Reviewed by')}, ${await k.preview.value('Reviewed date')}`);
    expect(history.length, 'earlier submissions listed as "Submission of <date>"').toBeGreaterThan(0);
  });

  test('KYC-PRV-006 thumbnail opens a larger view', tc('KYC-PRV-006'), async ({ kycRequests: k, page }) => {
    await openPending(k);
    const img = k.preview.root.getByRole('img', { name: /front$/ }).first();
    const box = await img.boundingBox();
    await img.click();
    await page.waitForTimeout(1_000);
    const big = page.locator('.ant-image-preview-img, [class*=preview] img, [role=dialog] img').filter({ visible: true });
    const opened = (await big.count()) > 0;
    observe(`Thumbnail ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)}; click -> ${opened ? 'larger view' : 'nothing'}`);
    expect(opened).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('KYC-PRV-007 "Review request" starts the review', tc('KYC-PRV-007'), async ({ kycRequests: k, kycReview: r, page }) => {
    const user = await openPending(k);
    await k.preview.reviewButton.click();
    await page.waitForURL(/\/process/, { timeout: 15_000 }).catch(() => {});
    const crash = await r.crashed();
    observe(`Review request for ${user} -> ${new URL(page.url()).pathname}: ${crash ? '"Oops! An unexpected error occurred." (GET …/process = 500)' : 'review page'}`);
    expect(crash, 'review page loads').toBe(false);
    await expect(page.getByText(user)).toBeVisible();
    await expect(r.title).toHaveText('Required documents');
  });

  test('KYC-PRV-008 close the preview', tc('KYC-PRV-008'), async ({ kycRequests: k, page }) => {
    await k.open('pending');
    await k.pagination.nextButton.click().catch(() => {});
    await k.settle();
    const listUrl = new URL(page.url()).search;
    const ways: string[] = [];
    for (const how of ['×', 'Escape', 'outside'] as const) {
      await k.openRow(0);
      if (how === '×') await k.preview.closeButton.click();
      else if (how === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(200, 400);
      const closed = await k.preview.heading.waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false);
      ways.push(`${how}: ${closed ? 'closed' : 'still open'}`);
      if (!closed) await k.preview.closeButton.click();
    }
    observe(`${ways.join(', ')}; list query after close ${new URL(page.url()).search} (before ${listUrl})`);
    for (const w of ways) expect(w).toMatch(/closed$/);
  });

  test('KYC-PRV-009 preview matches the list row', tc('KYC-PRV-009'), async ({ kycRequests: k }) => {
    await k.open('pending');
    const user = (await k.column('Username'))[0];
    const date = (await k.column('Requested Date'))[0];
    await k.openRow(0);
    const v = { by: await k.preview.value('Requested by'), date: await k.preview.value('Submission date') };
    observe(`Row ${user} ${date}; preview Requested by ${v.by}, Submission date ${v.date}`);
    expect(v.date).toBe(date);
    expect.soft(v.by, 'Requested by = the user for self-submitted KYC').toBe(user);
  });

  for (const [id, tab] of [['KYC-PRV-010', 'Confirmed'], ['KYC-PRV-011', 'Rejected']] as const) {
    test(`${id} preview of a ${tab.toLowerCase()} request`, tc(id), async ({ kycRequests: k }) => {
      await k.open(tab.toLowerCase() as 'confirmed' | 'rejected');
      if (!(await k.rows.count())) unmet(`No ${tab.toLowerCase()} request on testbox`);
      const user = await k.openRow(0);
      const text = await k.preview.text();
      observe(`${user}: preview text "${text.replace(/\n/g, ' | ').slice(0, 300)}"`);
      expect(await k.preview.value('Current submission'), 'status in the preview').toBe(tab);
      await expect(k.preview.reviewButton).toBeHidden();
      if (tab === 'Rejected') expect(text, 'rejection reason shown').toMatch(/reason|invalid|does not match|not/i);
      else expect(await k.preview.value('Reviewed by')).toMatch(/^@/);
    });
  }
});
