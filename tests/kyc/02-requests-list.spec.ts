import { test, expect } from '../../src/fixtures/test-fixtures';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, requireKycOps } from '../../src/utils/tc';
import { selectedIndex, parseDmy } from '../../src/utils/ui';

const FIGMA_DATE = /^[A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} (AM|PM)$/;
const dateOf = (s: string) => (FIGMA_DATE.test(s) ? new Date(s) : parseDmy(s));

/** Plan sections 2-3 - Requests list, Pending / Confirmed / Rejected (Figma 2167:153310, 2167:157645, 2174:158092). */
test.describe('KYC - 2. Requests list, Pending tab', () => {
  test.beforeEach(async ({ kycRequests }) => {
    await kycRequests.open('pending');
  });

  test('KYC-REQ-001 three status tabs, Pending selected', tc('KYC-REQ-001'), async ({ kycRequests: k }) => {
    const labels = (await k.main.getByRole('button').allTextContents()).map((t) => t.trim()).filter((t) => /^(Pending|Confirmed|Rejected)$/.test(t));
    const sel = await selectedIndex(k.tabs());
    observe(`Tabs: ${labels.join(', ')}; selected index ${sel}`);
    expect(labels).toEqual(['Pending', 'Confirmed', 'Rejected']);
    expect(sel).toBe(0);
  });

  test('KYC-REQ-002 Pending columns in order', tc('KYC-REQ-002'), async ({ kycRequests: k }) => {
    const headers = (await k.headers()).filter((h) => h !== 'Select all');
    observe(`Columns: ${headers.join(', ')}; "View request" buttons: ${await k.main.getByRole('button', { name: 'View request' }).count()}`);
    await expect(k.selectAll).toBeVisible();
    expect.soft(headers.map((h) => h.toLowerCase())).toEqual(['username', 'submission type', 'country', 'requested by', 'requested date']);
    expect(await k.main.getByRole('button', { name: 'View request' }).count(), '"View request" action on every row').toBe(await k.rows.count());
  });

  test('KYC-REQ-003 Submission type is New or Resubmission', tc('KYC-REQ-003'), async ({ kycRequests: k }) => {
    const types = await k.column('Submission type');
    const counts = types.reduce<Record<string, number>>((a, t) => ((a[t || '(empty)'] = (a[t || '(empty)'] ?? 0) + 1), a), {});
    observe(`Submission types on page 1: ${JSON.stringify(counts)}`);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(['New', 'Resubmission']).toContain(t);
  });

  test('KYC-REQ-004 Pending tab lists pending requests only', tc('KYC-REQ-004'), async ({ kycRequests: k }) => {
    const n = await k.rows.count();
    if (!n) unmet('No pending KYC request on testbox');
    const seen: string[] = [];
    for (const i of [0, n - 1]) {
      const user = await k.openRow(i);
      seen.push(`${user}: ${(await k.preview.value('Current submission')) ?? '-'}`);
      await k.preview.closeButton.click();
    }
    observe(`Preview status of first/last row: ${seen.join('; ')}`);
    for (const s of seen) expect(s).toMatch(/: Pending$/);
  });

  test('KYC-REQ-005 Username with @, Requested by shows the submitter', tc('KYC-REQ-005'), async ({ kycRequests: k }) => {
    const users = await k.column('Username');
    const headers = await k.headers();
    observe(`Usernames: ${users.slice(0, 4).join(', ')}…; "Requested by" column: ${headers.includes('Requested by') ? 'present' : 'missing'}`);
    for (const u of users) expect(u).toMatch(/^@\S+$/);
    expect(headers, 'Figma "Requested by" column').toContain('Requested by');
  });

  test('KYC-REQ-006 Requested date format', tc('KYC-REQ-006'), async ({ kycRequests: k }) => {
    const header = (await k.headers()).find((h) => /^requested date$/i.test(h)) ?? 'Requested Date';
    const dates = await k.column(header);
    observe(`Requested dates: ${dates.slice(0, 3).join(', ')} (Figma: "Mar 25, 2025 2:00 AM")`);
    for (const d of dates) expect(d).toMatch(FIGMA_DATE);
  });

  test('KYC-REQ-007 Country matches Country of Residence in the preview', tc('KYC-REQ-007'), async ({ kycRequests: k }) => {
    const countries = await k.column('Country');
    for (const c of countries) expect(c).toMatch(/^[A-Z][A-Za-z' .-]+$/);
    await k.openRow(0);
    const residence = await k.preview.value('Country of Residence');
    observe(`Row 1 country "${countries[0]}", preview Country of Residence "${residence}"`);
    expect(residence).toBe(countries[0]);
  });

  test('KYC-REQ-008 queue order is oldest request first', tc('KYC-REQ-008'), async ({ kycRequests: k }) => {
    const header = (await k.headers()).find((h) => /^requested date$/i.test(h)) ?? 'Requested Date';
    const dates = (await k.column(header)).map(dateOf);
    const ascending = dates.every((d, i) => i === 0 || dates[i - 1].getTime() <= d.getTime());
    observe(`Requested dates on page 1: ${(await k.column(header)).slice(0, 6).join(', ')}… (${ascending ? 'ascending' : 'not sorted ascending'})`);
    expect(ascending).toBe(true);
  });

  test('KYC-REQ-009 row checkbox and select-all', tc('KYC-REQ-009'), async ({ kycRequests: k, page }) => {
    const first = k.rows.first().getByRole('checkbox');
    await first.check();
    await expect(first).toBeChecked();
    await expect(k.preview.heading, 'ticking a row does not open the preview').toBeHidden();
    await k.selectAll.check();
    const checked = await k.rows.getByRole('checkbox').evaluateAll((e) => e.filter((c) => (c as HTMLInputElement).checked).length);
    observe(`Select-all ticked ${checked} of ${await k.rows.count()} rows`);
    expect(checked).toBe(await k.rows.count());
    await k.selectAll.uncheck();
    expect(await k.rows.getByRole('checkbox').evaluateAll((e) => e.filter((c) => (c as HTMLInputElement).checked).length)).toBe(0);
    await page.keyboard.press('Escape');
  });

  test('KYC-REQ-010 opening a request shows the Request preview drawer', tc('KYC-REQ-010'), async ({ kycRequests: k, page }) => {
    const user = await k.openRow(0);
    observe(`Row click on ${user} -> "Request preview" at ${new URL(page.url()).pathname} (no "View request" button in this build)`);
    await expect(k.preview.heading).toBeVisible();
    expect(await k.preview.value('Requested by')).toBeTruthy();
  });
});

test.describe('KYC - 3. Requests list, Confirmed and Rejected tabs', () => {
  for (const [id, tab] of [['KYC-REQ-020', 'Confirmed'], ['KYC-REQ-021', 'Rejected']] as const) {
    test(`${id} ${tab} tab columns and content`, tc(id), async ({ kycRequests: k, page }) => {
      await k.open();
      await k.tab(tab).click();
      await k.settle();
      await expect(page).toHaveURL(new RegExp(`status=${tab.toLowerCase()}`));
      const headers = (await k.headers()).filter((h) => h !== 'Select all');
      const sel = await selectedIndex(k.tabs());
      observe(`${tab}: columns ${headers.join(', ')}; selected tab ${sel}; ${(await k.pagination.counts()).text}`);
      expect(sel).toBe(tab === 'Confirmed' ? 1 : 2);
      expect(headers.map((h) => h.toLowerCase())).toEqual(['username', 'requested date', 'country', 'reviewed by', 'reviewed date']);
      if (!(await k.rows.count())) unmet(`No ${tab.toLowerCase()} request on testbox`);
      await k.openRow(0);
      const status = await k.preview.value('Current submission');
      observe(`Preview of row 1: status "${status ?? 'none (empty preview)'}"`);
      expect(status).toBe(tab);
    });
  }

  test('KYC-REQ-022 Reviewed by shows the deciding agent', tc('KYC-REQ-022'), async ({ kycRequests: k }) => {
    const empty: string[] = [];
    for (const tab of ['confirmed', 'rejected'] as const) {
      await k.open(tab);
      const users = await k.column('Username');
      (await k.column('Reviewed By')).forEach((r, i) => { if (!/^@\S+/.test(r)) empty.push(`${tab} ${users[i]} "${r}"`); });
    }
    observe(empty.length ? `Rows without a reviewer: ${empty.join(', ')}` : 'Every Confirmed/Rejected row on page 1 has a reviewer');
    expect(empty).toEqual([]);
  });

  test('KYC-REQ-023 Reviewed date is not before Requested date', tc('KYC-REQ-023'), async ({ kycRequests: k }) => {
    const bad: string[] = [];
    for (const tab of ['confirmed', 'rejected'] as const) {
      await k.open(tab);
      const users = await k.column('Username');
      const req = await k.column('Requested Date');
      const rev = await k.column('Reviewed Date');
      rev.forEach((r, i) => {
        if (!/\d/.test(r)) return;
        if (dateOf(r).getTime() < dateOf(req[i]).getTime()) bad.push(`${tab} ${users[i]}: requested ${req[i]}, reviewed ${r}`);
      });
    }
    observe(bad.length ? `Reviewed before requested: ${bad.join('; ')}` : 'All reviewed dates are on/after the requested date');
    expect(bad).toEqual([]);
  });

  test('KYC-REQ-024 switching tab returns to page 1', tc('KYC-REQ-024'), async ({ kycRequests: k }) => {
    await k.open('confirmed');
    if (!(await k.pagination.pageButton(2).count())) unmet('Confirmed has a single page on testbox');
    await k.pagination.pageButton(2).click();
    await k.settle();
    await k.tab('Rejected').click();
    await k.settle();
    await k.tab('Confirmed').click();
    await k.settle();
    const c = await k.pagination.counts();
    observe(`After page 2 -> Rejected -> Confirmed: ${c.text}`);
    expect(c.from).toBe(1);
  });

  for (const [id, decision] of [['KYC-REQ-025', 'approve'], ['KYC-REQ-026', 'reject']] as const) {
    test(`${id} ${decision}d request moves out of Pending`, tc(id), async () => {
      requireKycOps(`${decision} a pending request and check it moves tabs`);
      // Decision itself is covered by sections 10-11; this test re-checks the lists afterwards.
      unmet('Needs a disposable pending request id in PHX_KYC_REQUEST_ID');
    });
  }
});
