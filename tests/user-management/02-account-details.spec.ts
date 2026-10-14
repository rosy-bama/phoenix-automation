import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, DESIGN } from '../../src/utils/tc';
import { selectedIndex, readClipboard, crashed } from '../../src/utils/ui';
import { boxText } from '../../src/pages/users/UserFlowPage';
import type { UsersListPage } from '../../src/pages/users/UsersListPage';
import type { UserDetailsPage } from '../../src/pages/users/UserDetailsPage';

/** Optional KYC-state accounts; cases are Skipped without them. */
const KYC = {
  unverified: process.env.PHX_UM_KYC_UNVERIFIED_USERNAME,
  pending: process.env.PHX_UM_KYC_PENDING_USERNAME ?? 'datatestclient',
  rejected: process.env.PHX_UM_KYC_REJECTED_USERNAME,
};

async function openKyc(l: UsersListPage, d: UserDetailsPage, which: keyof typeof KYC) {
  const u = KYC[which];
  if (!u) unmet(`Needs an account in KYC state "${which}": set PHX_UM_KYC_${which.toUpperCase()}_USERNAME`);
  await l.openAccount(u);
  await d.expectLoaded();
  return u;
}

/** Plan section 3 - Profile panel, actions and KYC states (Figma 1148:90717, 1498:97956). */
test.describe('User management - 3. Account details', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ usersList, userDetails }) => {
    await usersList.openAccount(env.umUsername);
    await userDetails.expectLoaded();
  });

  test('USR-DET-001 breadcrumb and Back to account list', tc('USR-DET-001'), async ({ userDetails: d, usersList: l, page }) => {
    const crumb = (await d.banner.innerText()).split('\n').map((t) => t.trim()).filter((t) => t.startsWith('/') || t.startsWith('@')).join(' ');
    observe(`Breadcrumb "${crumb}"`);
    expect(crumb).toContain(`@${env.umUsername}`);
    await d.backButton.click();
    await expect(l.heading).toBeVisible();
    observe(`Back -> ${new URL(page.url()).pathname}${new URL(page.url()).search}${(await crashed(page)) ? ' (error page)' : ''}`);
  });

  test('USR-DET-002 tabs and their labels', tc('USR-DET-002'), async ({ userDetails: d }) => {
    const labels = (await d.main.getByRole('button').allTextContents()).map((t) => t.trim()).filter((t) => /^(Products overview|Overview|Payment methods|Security)$/i.test(t));
    observe(`Tabs: ${labels.join(', ')}; selected ${await selectedIndex([d.overviewTab, d.paymentMethodsTab, d.securityTab])}`);
    expect(labels).toEqual(['Products overview', 'Payment methods', 'Security']);
  });

  test('USR-DET-003 profile panel identity block', tc('USR-DET-003'), async ({ userDetails: d }) => {
    const lines = await d.profileLines();
    observe(`Panel top: ${lines.slice(0, 4).join(' | ')}`);
    expect(lines[0]).toMatch(/^[A-Z]{1,2}$/);
    expect((await d.statusWord()).toLowerCase()).toBe('confirmed');
    expect(lines.join(' ')).toContain(env.umUsername);
    await expect(d.copyButtons.first()).toBeVisible();
    // Badge text in Figma is capitalised ("Confirmed").
    expect.soft(lines.join(' '), 'badge capitalised as in Figma').toMatch(/\bConfirmed\b/);
  });

  test('USR-DET-004 Edit details offers Email address and Phone number', tc('USR-DET-004'), async ({ userDetails: d }) => {
    await d.openMenu(d.editDetailsButton);
    const options = await d.menuTexts();
    observe(`Edit details options: ${options.join(', ')}`);
    expect(options).toEqual(['Email address', 'Phone number']);
  });

  test('USR-DET-005 Change user type disabled for CS', tc('USR-DET-005'), async ({ userDetails: d }) => {
    await expect(d.changeUserTypeButton).toBeVisible();
    await expect(d.changeUserTypeButton).toBeDisabled();
    observe('"Change user type" visible and disabled');
  });

  test('USR-DET-006 "..." menu items', tc('USR-DET-006'), async ({ userDetails: d }) => {
    await d.openMenu(d.moreButton);
    const options = await d.menuTexts();
    observe(`"..." options: ${options.join(', ')}`);
    expect(options.map((o) => o.toLowerCase())).toEqual(['deactivate account', 'freeze account', 'delete account']);
    expect.soft(options, 'sentence case as in Figma').toEqual(['Deactivate account', 'Freeze account', 'Delete account']);
  });

  test('USR-DET-007 email and phone with verified checks', tc('USR-DET-007'), async ({ userDetails: d }) => {
    const email = await d.field('Email');
    const phone = await d.field('Phone number');
    const icons = await d.profile.locator('img, svg').count();
    observe(`Email "${email}", phone "${phone}", ${icons} icons in panel`);
    expect(email).toMatch(/@/);
    expect(phone).toMatch(/^\+\d{9,}/);
    // Check badge next to the values (Figma green tick).
    const emailRow = d.profile.locator('div').filter({ hasText: new RegExp(`^Email\\s*${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).last();
    await expect(emailRow.locator('svg, img').first(), 'verified check next to Email').toBeVisible(DESIGN);
  });

  test('USR-DET-008 unverified email shows a warning icon', tc('USR-DET-008'), async ({ usersList: l, userDetails: d }) => {
    await openKyc(l, d, 'unverified');
    const email = await d.field('Email');
    const row = d.profile.locator('div').filter({ hasText: /^Email/ }).last();
    const icon = row.locator('svg, img').first();
    observe(`Email "${email}", icon present: ${await icon.count()}`);
    await expect(icon).toBeVisible(DESIGN);
  });

  test('USR-DET-009 not-verified alert and KYC link', tc('USR-DET-009'), async ({ usersList: l, userDetails: d }) => {
    await openKyc(l, d, 'unverified');
    await expect(d.kycAlertTitle).toHaveText("This user hasn't verified yet!");
    await expect(d.goToKycButton).toBeVisible();
    observe(`Alert "${await d.kycAlertTitle.textContent()}"`);
  });

  test('USR-DET-010 KYC alert can be dismissed', tc('USR-DET-010'), async ({ usersList: l, userDetails: d }) => {
    await openKyc(l, d, 'pending');
    await expect(d.kycAlertTitle).toBeVisible();
    await d.kycAlertClose.click();
    await expect(d.kycAlertTitle).toBeHidden();
    await d.paymentMethodsTab.click();
    observe(`Alert closed; page still usable (${new URL(d.main.page().url()).pathname})`);
    await expect(d.main.page()).toHaveURL(/payment-methods/);
  });

  test('USR-DET-011 personal info fields', tc('USR-DET-011'), async ({ userDetails: d }) => {
    const labels = ['Date of birth', 'Gender', 'Country of citizenship', 'Country of residence', 'Referral code'];
    const values = await Promise.all(labels.map((x) => d.field(x)));
    observe(labels.map((x, i) => `${x}: ${values[i] || '∅'}`).join('; '));
    const lines = await d.profileLines();
    for (const x of labels) expect.soft(lines, x).toContain(x);
    expect(values[4]).toMatch(/\S+-[A-Z]{2}-\S+/);
    await expect(d.copyButtons).toHaveCount(2);
  });

  test('USR-DET-012 company block', tc('USR-DET-012'), async ({ userDetails: d }) => {
    const labels = ['User type', 'Company', 'Created by', 'Created at'];
    const values = await Promise.all(labels.map((x) => d.field(x)));
    observe(labels.map((x, i) => `${x}: ${values[i] || '∅'}`).join('; '));
    for (const v of values) expect(v).not.toBe('');
    expect(values[2]).toMatch(/^@/);
  });

  test('USR-DET-013 profile panel identical on every tab', tc('USR-DET-013'), async ({ userDetails: d }) => {
    const texts: string[] = [];
    for (const tab of ['overview', 'payment-methods', 'security'] as const) {
      await d.openTab(tab);
      texts.push(await d.profile.innerText());
    }
    observe(`Panel length per tab: ${texts.map((t) => t.length).join('/')}`);
    expect(texts[1]).toBe(texts[0]);
    expect(texts[2]).toBe(texts[0]);
  });

  test('USR-DET-014 deep link loads the account', tc('USR-DET-014'), async ({ userDetails: d, page }) => {
    const url = page.url();
    await page.goto('/dashboard');
    await page.goto(url);
    await d.expectLoaded();
    observe(`Direct ${new URL(url).pathname} -> ${await d.fullName()}`);
    expect(await d.profile.innerText()).toContain(env.umUsername);
  });

  test('USR-DET-017 browser title names the account', tc('USR-DET-017'), async ({ page }) => {
    const title = await page.title();
    observe(`Title "${title}"`);
    expect(title).toContain(env.umUsername);
  });

  test('USR-DET-018 sidebar highlights User management', tc('USR-DET-018'), async ({ page }) => {
    const link = page.getByRole('navigation').getByRole('link', { name: 'User management' });
    const state = await link.evaluate((e) => ({ current: e.getAttribute('aria-current'), cls: e.className, bg: getComputedStyle(e).backgroundColor }));
    const other = await page.getByRole('navigation').getByRole('link', { name: 'Dashboard' }).evaluate((e) => getComputedStyle(e).backgroundColor);
    observe(`User management link: aria-current=${state.current}, bg ${state.bg} (Dashboard ${other})`);
    expect(state.current === 'page' || /active/.test(state.cls) || state.bg !== other).toBe(true);
  });

  test('USR-DET-019 layout at 1280 / 1440 / 1920 px', tc('USR-DET-019'), async ({ page, userDetails: d }) => {
    const out: string[] = [];
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const box = await d.profile.boundingBox();
      out.push(`${width}px: h-overflow ${overflow}, panel ${box ? Math.round(box.width) : '?'}px`);
      expect.soft(overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(0);
      expect.soft(box && box.x + box.width <= width, `${width}px panel inside viewport`).toBe(true);
    }
    observe(out.join('; '));
  });

  test('USR-DET-020 username copy', tc('USR-DET-020'), async ({ userDetails: d, page }) => {
    await d.copyButtons.first().click();
    const clip = await readClipboard(page);
    observe(`Clipboard "${clip}"`);
    expect(clip.replace(/^@/, '')).toBe(env.umUsername);
  });

  test('USR-DET-021 referral code copy', tc('USR-DET-021'), async ({ userDetails: d, page }) => {
    const code = await d.field('Referral code');
    await d.copyButtons.last().click();
    const clip = await readClipboard(page);
    observe(`Referral "${code}", clipboard "${clip}"`);
    expect(clip).toBe(code);
  });

  test('USR-DET-022 KYC pending alert', tc('USR-DET-022'), async ({ usersList: l, userDetails: d }) => {
    const u = await openKyc(l, d, 'pending');
    observe(`@${u}: alert "${(await d.kycAlertTitle.allTextContents()).join(' / ')}"`);
    await expect(d.kycAlertTitle).toHaveText('Identity verification is pending!');
    await expect(d.goToKycButton).toBeVisible();
  });

  test('USR-DET-023 KYC rejected alert', tc('USR-DET-023'), async ({ usersList: l, userDetails: d }) => {
    const u = await openKyc(l, d, 'rejected');
    observe(`@${u}: alert "${(await d.kycAlertTitle.allTextContents()).join(' / ')}"`);
    await expect(d.kycAlertTitle).toHaveText('Identity verification has been rejected!');
  });

  test('USR-DET-024 verified account shows no KYC alert', tc('USR-DET-024'), async ({ userDetails: d }) => {
    const titles = await d.kycAlertTitle.allTextContents();
    observe(titles.length ? `@${env.umUsername} shows alert "${titles.join(' / ')}"` : `@${env.umUsername}: no KYC alert`);
    if (titles.some((t) => /verified yet|pending|rejected/i.test(t))) unmet(`PHX_UM_USERNAME (@${env.umUsername}) is not KYC-verified: set a verified account`);
    expect(titles).toEqual([]);
  });

  test('USR-DET-025 KYC alert copy complete and spelled right', tc('USR-DET-025'), async ({ usersList: l, userDetails: d }) => {
    await openKyc(l, d, 'pending');
    const title = ((await d.kycAlertTitle.first().textContent()) ?? '').trim();
    const box = await boxText(d.kycAlertTitle.first());
    const body = box.replace(title, '').replace(/Go to KYC page/, '').trim();
    observe(`Alert body "${body}"`);
    expect(body).toMatch(/^You can reach/);
    expect(body).toMatch(/[.!]$/);
  });

  test('USR-DET-026 Go to KYC page opens Kyc & Comp.', tc('USR-DET-026'), async ({ usersList: l, userDetails: d, page }) => {
    const u = await openKyc(l, d, 'pending');
    await d.goToKycButton.click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    observe(`-> ${page.url()}${(await crashed(page)) ? ' (error page)' : ''}`);
    await expect(page).toHaveURL(/\/kyc\//);
    await expect(page.getByRole('main')).toContainText(u, DESIGN);
  });

  test('USR-DET-027 Change user type visible but disabled', tc('USR-DET-027'), async ({ userDetails: d }) => {
    await expect(d.changeUserTypeButton).toBeDisabled();
    await d.changeUserTypeButton.click({ force: true }).catch(() => {});
    observe(`Disabled; menus open after forced click: ${await d.menuOptions.count()}`);
    await expect(d.menuOptions).toHaveCount(0);
  });

  test('USR-DET-028 Frozen account banner and badge', tc('USR-DET-028'), async ({ usersList: l, userDetails: d }) => {
    const u = await l.openFirstOf(l.frozenTab);
    if (!u) unmet('No Frozen account on testbox');
    await d.expectLoaded();
    const banner = (await d.statusBanner.textContent().catch(() => ''))?.trim();
    const actions = await d.profile.getByRole('button', { name: /Edit details|Change user type|^\.\.\.$/ }).count();
    observe(`@${u}: banner "${banner}", badge "${await d.statusWord()}", See details ${await d.seeDetailsButton.count()}, action buttons ${actions}`);
    expect(banner).toBe('This account has been frozen!');
    expect(await d.statusWord()).toMatch(/^frozen$/i);
    expect.soft(await d.seeDetailsButton.count(), '"See details" on the banner').toBe(1);
    expect.soft(actions, 'no action buttons on a frozen account').toBe(0);
  });

  test('USR-DET-029 Deleted account banner and badge', tc('USR-DET-029'), async ({ usersList: l, userDetails: d }) => {
    const u = await l.openFirstOf(l.deletedTab);
    if (!u) unmet('No Deleted account on testbox');
    await d.expectLoaded();
    const banner = (await d.statusBanner.textContent().catch(() => ''))?.trim();
    const actions = await d.profile.getByRole('button', { name: /Edit details|Change user type|^\.\.\.$/ }).count();
    observe(`@${u}: banner "${banner}", badge "${await d.statusWord()}", See details ${await d.seeDetailsButton.count()}, action buttons ${actions}`);
    expect(banner).toBe('This account has been deleted!');
    expect(await d.statusWord()).toMatch(/^deleted$/i);
    expect.soft(await d.seeDetailsButton.count(), '"See details" on the banner').toBe(1);
    expect.soft(actions, 'no action buttons on a deleted account').toBe(0);
  });
});

/** Plan section 4 - Products overview (Figma 1148:90717). */
test.describe('User management - 4. Products overview', () => {
  test.beforeEach(async ({ usersList, userDetails }) => {
    await usersList.openAccount(env.umUsername);
    await userDetails.expectLoaded();
  });

  const titles = async (d: UserDetailsPage) => (await d.cardHeadings.allTextContents()).map((t) => t.trim());

  test('USR-PRD-001 Products overview selected by default', tc('USR-PRD-001'), async ({ userDetails: d }) => {
    const i = await selectedIndex([d.overviewTab, d.paymentMethodsTab, d.securityTab]);
    observe(`Selected tab index ${i}; cards ${(await titles(d)).join(', ')}`);
    expect(i).toBe(0);
    expect((await titles(d)).length).toBe(4);
  });

  test('USR-PRD-002 Wallet card and View details', tc('USR-PRD-002'), async ({ userDetails: d, page }) => {
    const card = d.card(/^Wallet$/);
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    observe(`Wallet card: ${text}`);
    expect(text).toMatch(/Total Balance [\d,.]+ XAF/i);
    expect(text).toMatch(/Status\s*\w+/);
    await card.getByRole('button', { name: 'View details' }).click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    observe(`View details -> ${page.url()}${(await crashed(page)) ? ' (error page)' : ''}`);
    await expect(page).toHaveURL(/\/fiat\/accounts\/\d+/);
  });

  test('USR-PRD-003 Savings box card', tc('USR-PRD-003'), async ({ userDetails: d }) => {
    const card = d.card(/^Savings? box$/i);
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    observe(`Savings card: ${text}`);
    expect(text).toMatch(/Total Balance [\d,.]+ XAF/i);
    expect(text).toMatch(/Cash bonus:?\s*[\d,.]+ XAF/i);
    expect(text).toMatch(/\d+ free withdrawal/i);
  });

  test('USR-PRD-004 Goal savings card', tc('USR-PRD-004'), async ({ userDetails: d }) => {
    const card = d.card(/^Goal savings$/i);
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    observe(`Goal card: ${text}`);
    expect(text).toMatch(/Total Balance [\d,.]+ XAF/i);
    expect(text).toMatch(/Cash bonus:?\s*[\d,.]+ XAF/i);
    if (/No active goal/i.test(text)) unmet(`@${env.umUsername} has no goal: set PHX_UM_USERNAME to an account with goals`);
    expect(text).toMatch(/Total of \d+ goal\(s\)/);
  });

  test('USR-PRD-005 Bond investment card', tc('USR-PRD-005'), async ({ userDetails: d }) => {
    const card = d.card(/^Bond investment$/i);
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    observe(`Bond card: ${text}`);
    expect(text).toMatch(/Total Balance [\d,.]+ XAF/i);
    expect(text).toMatch(/Total interests:?\s*[\d,.]+ XAF/i);
    expect(text).toMatch(/Total of \d+ bond\(s\)/);
  });

  test('USR-PRD-006 "Total of NN" matches legend rows', tc('USR-PRD-006'), async ({ userDetails: d }) => {
    const out: string[] = [];
    for (const [title, word] of [[/^Goal savings$/i, 'goal'], [/^Bond investment$/i, 'bond']] as const) {
      const text = await d.card(title).innerText();
      if (/No active (goal|bond)/i.test(text)) { out.push(`${word}: empty state`); continue; }
      const n = Number(text.match(new RegExp(`Total of (\\d+) ${word}`))?.[1] ?? NaN);
      const legend = (text.match(/^.+\s[\d,.]+ XAF$/gm) ?? []).filter((l) => !/Total Balance|Cash bonus|interests/i.test(l));
      out.push(`${word}: says ${n}, legend ${legend.length}`);
      expect.soft(legend.length, `${word} legend rows`).toBe(n);
    }
    observe(out.join('; '));
    if (out.every((x) => /empty state/.test(x))) unmet(`@${env.umUsername} has no goals or bonds`);
  });

  for (const [id, title, re] of [['USR-PRD-007', 'Goal savings', /goal/i], ['USR-PRD-008', 'Bond investment', /\/bi\//]] as const) {
    test(`${id} ${title} View details opens that module`, tc(id), async ({ userDetails: d, page }) => {
      const btn = d.card(new RegExp(`^${title}$`, 'i')).getByRole('button', { name: 'View details' });
      if (!(await btn.count())) unmet(`No "View details" on the ${title} card (empty product)`);
      await btn.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      observe(`-> ${page.url()}${(await crashed(page)) ? ' (error page)' : ''}`);
      expect(page.url()).toMatch(re);
      expect(await crashed(page)).toBe(false);
    });
  }

  test('USR-PRD-010 Goal savings empty state', tc('USR-PRD-010'), async ({ userDetails: d, usersList: l }) => {
    let text = await d.card(/^Goal savings$/i).innerText();
    if (!/No active goal/i.test(text)) {
      const u = await l.openFirstOf(l.deletedTab);
      if (!u) unmet('No account without goals found');
      text = await d.card(/^Goal savings$/i).innerText();
    }
    observe(`Goal card: ${text.replace(/\s+/g, ' ')}`);
    expect(text).toContain('No active goal set!');
  });

  test('USR-PRD-011 zero-balance card still renders', tc('USR-PRD-011'), async ({ userDetails: d }) => {
    const zero: string[] = [];
    for (const t of await titles(d)) {
      const text = await d.card(new RegExp(`^${t}$`)).innerText();
      if (/Total Balance\s*0 XAF/i.test(text)) zero.push(t);
    }
    observe(zero.length ? `Zero-balance cards rendered: ${zero.join(', ')}` : 'No zero-balance card on this account');
    if (!zero.length) unmet(`@${env.umUsername} has no zero-balance product`);
    expect(zero.length).toBeGreaterThan(0);
  });

  test('USR-PRD-012 currency format consistent', tc('USR-PRD-012'), async ({ userDetails: d }) => {
    const amounts = (await d.main.innerText()).match(/[\d.,]+\s?XAF/g) ?? [];
    const bad = amounts.filter((a) => !/^\d{1,3}(,\d{3})*(\.\d+)? XAF$/.test(a));
    observe(`Amounts: ${amounts.slice(0, 8).join(', ')}${bad.length ? `; inconsistent: ${bad.join(', ')}` : ''}`);
    expect(bad).toEqual([]);
  });

  test('USR-PRD-013 Deactivated banner on Products overview', tc('USR-PRD-013'), async ({ usersList: l, userDetails: d }) => {
    const u = await l.openFirstOf(l.deactivatedTab);
    if (!u) unmet('No Deactivated account on testbox');
    await d.expectLoaded();
    const banner = (await d.statusBanner.textContent().catch(() => ''))?.trim();
    observe(`@${u}: banner "${banner}", See details buttons ${await d.seeDetailsButton.count()}`);
    expect(banner).toBe('This account has been deactivated!');
    await expect(d.seeDetailsButton, '"See details" on the banner').toBeVisible(DESIGN);
  });

  test('USR-PRD-014 non-Confirmed accounts hide actions', tc('USR-PRD-014'), async ({ usersList: l, userDetails: d }) => {
    const out: string[] = [];
    for (const tab of [l.deactivatedTab, l.frozenTab, l.deletedTab]) {
      const u = await l.openFirstOf(tab);
      if (!u) continue;
      await d.expectLoaded();
      const names = (await d.profile.getByRole('button').allTextContents()).map((t) => t.trim()).filter((t) => /^(Edit details|Change user type|\.\.\.)$/.test(t));
      out.push(`@${u} (${await d.statusWord()}): ${names.join(', ') || 'no actions'}`);
      expect.soft(names, `@${u} actions`).toEqual([]);
    }
    observe(out.join('; '));
    if (!out.length) unmet('No Deactivated / Frozen / Deleted account on testbox');
  });

  test('USR-PRD-015 card titles', tc('USR-PRD-015'), async ({ userDetails: d }) => {
    const t = await titles(d);
    observe(`Titles: ${t.join(', ')}`);
    expect(t).toEqual(['Wallet', 'Savings box', 'Goal savings', 'Bond investment']);
  });

  test('USR-PRD-016 free-withdrawal spelling', tc('USR-PRD-016'), async ({ userDetails: d }) => {
    const line = (await d.card(/^Savings? box$/i).innerText()).split('\n').find((l) => /free/i.test(l)) ?? '';
    observe(`Line "${line.trim()}"`);
    expect(line).toMatch(/free withdrawals? available/i);
  });

  test('USR-PRD-017 Goal empty-state copy', tc('USR-PRD-017'), async ({ userDetails: d, usersList: l }) => {
    let text = await d.card(/^Goal savings$/i).innerText();
    if (!/No active goal/i.test(text)) {
      const u = await l.openFirstOf(l.deletedTab);
      if (!u) unmet('No account without goals found');
      text = await d.card(/^Goal savings$/i).innerText();
    }
    const explain = text.split('\n').map((x) => x.trim()).find((x) => /setup|set up|goal/i.test(x) && !/No active goal|Goal savings/i.test(x)) ?? '';
    observe(`Explanation "${explain}"`);
    expect(explain).not.toMatch(/haven't setup/i);
  });

  test('USR-PRD-018 "Total of NN" two-digit format', tc('USR-PRD-018'), async ({ userDetails: d }) => {
    const lines = (await d.main.innerText()).match(/Total of \S+ (goal|bond)\(s\)/g) ?? [];
    observe(`Footers: ${lines.join(', ')}`);
    expect(lines.length).toBeGreaterThan(0);
    for (const x of lines) expect(x).toMatch(/Total of \d{2,} (goal|bond)\(s\)/);
  });
});

