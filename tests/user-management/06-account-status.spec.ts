import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, blocked, requireAccountOps, DESIGN } from '../../src/utils/tc';
import type { Page } from '@playwright/test';
import type { UsersListPage } from '../../src/pages/users/UsersListPage';
import type { UserDetailsPage } from '../../src/pages/users/UserDetailsPage';
import type { UserFlowPage } from '../../src/pages/users/UserFlowPage';

/**
 * Plan sections 13-16 - Deactivate / Activate / Freeze / Delete account
 * (Figma 1549:45826, 1667:129603, 1611:46249, 1615:111474).
 * CONFIRMED (13 Oct 2026): "..." options "Deactivate Account" -> /deactivate,
 * "Freeze Account" -> /freeze, "Delete Account" -> /delete (3 steps:
 * /delete -> /<uuid>/reason -> /<uuid>/verify). Review is a draft
 * (/<uuid>/verify); nothing changes until the red confirm button.
 * Read-only cases run on PHX_UM_USERNAME and stop before that button.
 */
const REASON = 'Automation check - not submitted';
const TOTP_COPY = /reset your TOTP setup/i;

type Flow = 'Deactivate' | 'Freeze' | 'Delete';

async function start(l: UsersListPage, d: UserDetailsPage, f: UserFlowPage, flow: Flow, username = env.umUsername) {
  await l.openAccount(username);
  await d.expectLoaded();
  await d.openMenu(d.moreButton);
  await d.chooseOption(`${flow} account`);
  await f.expectOpen();
}

/** Reaches Review of Deactivate / Freeze (2-step flows). */
async function review(l: UsersListPage, d: UserDetailsPage, f: UserFlowPage, flow: 'Deactivate' | 'Freeze', reason = REASON, username?: string) {
  await start(l, d, f, flow, username);
  await f.fillReason(reason);
  await f.toReview();
}

/** Reaches Review of Delete (3-step flow), choosing "This is a test account". */
async function deleteReview(l: UsersListPage, d: UserDetailsPage, f: UserFlowPage, page: Page, username?: string) {
  await start(l, d, f, 'Delete', username);
  await f.primaryButton.click();
  await expect(page).toHaveURL(/\/reason$/);
  await f.main.getByRole('radio', { name: 'This is a test account' }).check();
  await f.toReview();
}

async function openDeactivated(l: UsersListPage, d: UserDetailsPage) {
  const u = await l.openFirstOf(l.deactivatedTab);
  if (!u) unmet('No Deactivated account on testbox');
  await d.expectLoaded();
  return u;
}

/** The Activate entry point: banner "See details" (Figma), else a menu option. */
async function openActivateDetails(d: UserDetailsPage, page: Page) {
  if (await d.seeDetailsButton.count()) {
    await d.seeDetailsButton.first().click();
    return 'See details';
  }
  if (await d.moreButton.count()) {
    await d.moreButton.click();
    const opt = d.menuOptions.filter({ hasText: /activate/i }).filter({ hasNotText: /deactivate/i });
    if (await opt.count()) {
      await opt.first().click();
      return '"..." menu';
    }
    await page.keyboard.press('Escape');
  }
  blocked('Deactivated account has no "See details" on its banner and no Activate option: the Activate flow cannot be reached');
}

// ---------------------------------------------------------------- 13. Deactivate
test.describe('User management - 13. Deactivate account', () => {
  test('USR-DEACT-001 "..." offers Deactivate account', tc('USR-DEACT-001'), async ({ usersList: l, userDetails: d }) => {
    await l.openAccount(env.umUsername);
    await d.openMenu(d.moreButton);
    const options = await d.menuTexts();
    observe(`Options: ${options.join(', ')}`);
    expect(options.map((o) => o.toLowerCase())).toContain('deactivate account');
  });

  test('USR-DEACT-002 Details step', tc('USR-DEACT-002'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Deactivate');
    const crumb = await f.breadcrumb();
    const steps = await f.stepperText();
    const heading = ((await f.heading.textContent()) ?? '').trim();
    const label = (await f.main.innerText()).split('\n').map((x) => x.trim()).find((x) => /^\*?\s*Reason/i.test(x) && x !== heading);
    const info = await f.infoText();
    observe(`Breadcrumb "${crumb}"; stepper "${steps}"; heading "${await f.heading.textContent()}"; label "${label}"; placeholder "${await f.reason.first().getAttribute('placeholder')}"; warning "${info.slice(0, 80)}…"`);
    expect(crumb).toMatch(/@\S+ \/ Deactivate account$/i);
    expect(info).toContain('Please note before you deactivate this account!');
    expect.soft(crumb, 'breadcrumb case (Figma "Deactivate account")').toMatch(/Deactivate account$/);
    expect.soft(steps, 'Figma stepper').toMatch(/^Details.*Review details$/);
    expect.soft(await f.heading.textContent(), 'Figma heading').toBe('Details');
    expect.soft(await f.reason.first().getAttribute('placeholder'), 'Figma placeholder').toBe('Why are you doing this...');
  });

  test('USR-DEACT-003 Review disabled until a reason', tc('USR-DEACT-003'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Deactivate');
    await expect(f.primaryButton).toBeDisabled();
    await f.fillReason(REASON);
    await expect(f.primaryButton).toBeEnabled();
    observe(`"${(await f.primaryButton.textContent())?.trim()}" disabled empty, enabled with a reason`);
  });

  for (const id of ['USR-DEACT-004', 'USR-DEACT-015'] as const) {
    test(`${id} Cancel leaves the account Confirmed`, tc(id), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
      await start(l, d, f, 'Deactivate');
      if (id === 'USR-DEACT-004') await f.fillReason(REASON);
      await f.cancelButton.click();
      await d.expectLoaded();
      observe(`Cancel -> ${new URL(page.url()).pathname}; status "${await d.statusWord()}"`);
      expect(page.url()).not.toMatch(/\/deactivate/);
      expect((await d.statusWord()).toLowerCase()).toBe('confirmed');
    });
  }

  test('USR-DEACT-005 Review lists Action, Client, Date, Reason', tc('USR-DEACT-005'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await review(l, d, f, 'Deactivate');
    const v = { action: await f.value('Action'), client: await f.value('Client'), date: await f.value('Date'), reason: await f.value('Reason') };
    observe(`Review: ${JSON.stringify(v)}`);
    expect(v.action).toMatch(/^Deactivate account$/i);
    expect(v.client).toBe(`@${env.umUsername}`);
    expect(v.date).not.toBe('');
    expect(v.reason).toContain(REASON.slice(0, 15));
    expect.soft(v.action, 'Figma "Deactivate account"').toBe('Deactivate account');
    expect.soft(v.date, 'Figma date format "Jul 02, 2026 - 12:00 AM"').toMatch(/^[A-Z][a-z]{2} \d{2}, \d{4} - \d{1,2}:\d{2} (AM|PM)$/);
  });

  test('USR-DEACT-006 Review callout is about the deactivation', tc('USR-DEACT-006'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await review(l, d, f, 'Deactivate');
    const info = await f.infoText();
    observe(`Callout "${info}"`);
    expect(info).not.toMatch(TOTP_COPY);
  });

  test('USR-DEACT-007 Back keeps the reason', tc('USR-DEACT-007'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await review(l, d, f, 'Deactivate');
    await f.backButton.click();
    const kept = await f.reason.first().inputValue();
    observe(`Reason after Back "${kept}"`);
    expect(kept).toBe(REASON);
  });

  test('USR-DEACT-008 red "Deactivate account" button', tc('USR-DEACT-008'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await review(l, d, f, 'Deactivate');
    const buttons = await f.footerButtons();
    const bg = await f.primaryButton.evaluate((e) => getComputedStyle(e).backgroundColor);
    observe(`Buttons ${buttons.join(', ')}; primary background ${bg}`);
    expect(buttons).toEqual(['Back', 'Deactivate account']);
    const [r, g, b] = (bg.match(/\d+/g) ?? []).map(Number);
    expect(r > g + 60 && r > b + 40, 'destructive (red) style').toBe(true);
  });

  test('USR-DEACT-011 Deactivated banner, badge, See details', tc('USR-DEACT-011'), async ({ usersList: l, userDetails: d }) => {
    const u = await openDeactivated(l, d);
    const banner = (await d.statusBanner.textContent().catch(() => ''))?.trim();
    observe(`@${u}: banner "${banner}", badge "${await d.statusWord()}", See details ${await d.seeDetailsButton.count()}`);
    expect(banner).toBe('This account has been deactivated!');
    expect((await d.statusWord()).toLowerCase()).toBe('deactivated');
    await expect(d.seeDetailsButton).toBeVisible(DESIGN);
  });

  test('USR-DEACT-012 no actions on a Deactivated account', tc('USR-DEACT-012'), async ({ usersList: l, userDetails: d }) => {
    const u = await openDeactivated(l, d);
    const names = (await d.profile.getByRole('button').allTextContents()).map((t) => t.trim()).filter((t) => /^(Edit details|Change user type|\.\.\.)$/.test(t));
    observe(`@${u}: ${names.join(', ') || 'no actions'}`);
    expect(names.filter((n) => n === 'Edit details')).toEqual([]);
    expect.soft(names, 'Figma hides all actions').toEqual([]);
  });

  test('USR-DEACT-014 Deactivated account found on its tab', tc('USR-DEACT-014'), async ({ usersList: l, userDetails: d }) => {
    await l.open('/users?status=deactivated');
    const users = await l.column('Username');
    if (!users.length) unmet('No Deactivated account on testbox');
    const u = users[0].replace(/^@/, '');
    await l.search(u);
    const found = await l.row(u).count();
    observe(`Search "${u}" on Deactivated: ${found} row(s)`);
    expect(found).toBe(1);
    await l.row(u).getByRole('button', { name: 'See details' }).click();
    await d.expectLoaded();
  });

  test('USR-DEACT-016 header: help and close', tc('USR-DEACT-016'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await start(l, d, f, 'Deactivate');
    await expect(f.helpButton).toBeVisible();
    await f.closeButton.click();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    observe(`Close (X) -> ${new URL(page.url()).pathname}`);
    expect(page.url()).not.toMatch(/\/deactivate/);
  });
});

// ---------------------------------------------------------------- 14. Activate
test.describe('User management - 14. Activate account', () => {
  test('USR-ACT-001 See details panel with Activate account', tc('USR-ACT-001'), async ({ usersList: l, userDetails: d, page }) => {
    const u = await openDeactivated(l, d);
    const via = await openActivateDetails(d, page);
    const panel = page.getByRole('dialog').filter({ visible: true });
    const text = (await panel.innerText().catch(async () => d.main.innerText())).replace(/\s+/g, ' ');
    observe(`@${u} via ${via}: ${text.slice(0, 300)}`);
    for (const label of ['Action', 'Client', 'Updated at', 'Updated by', 'Reason']) expect.soft(text, label).toContain(label);
    await expect(page.getByRole('button', { name: /^Activate account$/i })).toBeVisible();
  });

  async function activateFlow(l: UsersListPage, d: UserDetailsPage, f: UserFlowPage, page: Page) {
    const u = await openDeactivated(l, d);
    await openActivateDetails(d, page);
    const btn = page.getByRole('button', { name: /^Activate account$/i });
    if (await btn.count()) await btn.first().click();
    await f.expectOpen();
    return u;
  }

  test('USR-ACT-002 Activate starts Details -> Review', tc('USR-ACT-002'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await activateFlow(l, d, f, page);
    const crumb = await f.breadcrumb();
    const steps = await f.stepperText();
    observe(`Breadcrumb "${crumb}"; stepper "${steps}"`);
    expect(crumb).toMatch(/Activate account$/i);
    expect(steps).toMatch(/Details.*Review details/);
    await expect(f.reason.first()).toBeVisible();
    await f.cancelButton.click();
  });

  test('USR-ACT-003 Review shows Activate account', tc('USR-ACT-003'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await activateFlow(l, d, f, page);
    await f.fillReason(REASON);
    await f.toReview();
    const action = await f.value('Action');
    const buttons = await f.footerButtons();
    observe(`Action "${action}"; buttons ${buttons.join(', ')}`);
    expect(action).toMatch(/^Activate account$/i);
    expect(buttons[buttons.length - 1]).toMatch(/^Activate account$/i);
    await f.backButton.click();
    await f.cancelButton.click();
  });

  test('USR-ACT-009 Details panel closes with X', tc('USR-ACT-009'), async ({ usersList: l, userDetails: d, page }) => {
    await openDeactivated(l, d);
    await openActivateDetails(d, page);
    const panel = page.getByRole('dialog').filter({ visible: true });
    await panel.getByRole('button').first().click();
    await expect(panel).toHaveCount(0);
    observe(`Panel closed; status "${await d.statusWord()}"`);
    expect((await d.statusWord()).toLowerCase()).toBe('deactivated');
  });

  test('USR-ACT-010 reason label fits the activate action', tc('USR-ACT-010'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await activateFlow(l, d, f, page);
    const label = (await f.main.innerText()).split('\n').find((x) => /reason/i.test(x))?.trim() ?? '';
    observe(`Label "${label}"`);
    expect(label).not.toMatch(/deactivation/i);
    await f.cancelButton.click();
  });

  test('USR-ACT-012 activation requires a reason', tc('USR-ACT-012'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await activateFlow(l, d, f, page);
    await expect(f.primaryButton).toBeDisabled();
    await f.fillReason(REASON);
    await expect(f.primaryButton).toBeEnabled();
    observe('Review disabled until a reason is typed');
    await f.cancelButton.click();
  });
});

// ---------------------------------------------------------------- 15. Freeze
test.describe('User management - 15. Freeze account', () => {
  test('USR-FRZ-001 "..." > Freeze account opens the flow', tc('USR-FRZ-001'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await start(l, d, f, 'Freeze');
    const crumb = await f.breadcrumb();
    observe(`URL ${new URL(page.url()).pathname}; breadcrumb "${crumb}"; stepper "${await f.stepperText()}"`);
    await expect(page).toHaveURL(/\/freeze$/);
    expect(crumb).toMatch(/Freeze account$/i);
    expect.soft(await f.stepperText(), 'Figma stepper').toMatch(/^Details.*Review details$/);
  });

  test('USR-FRZ-002 reason field and freeze warning', tc('USR-FRZ-002'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Freeze');
    const label = (await f.main.innerText()).split('\n').find((x) => /reason/i.test(x))?.replace(/^\*\s*/, '').trim();
    const info = await f.infoText();
    observe(`Label "${label}"; warning "${info}"`);
    expect(info).toContain('Please note before you freeze this account!');
    expect(info).toMatch(/still log in/i);
    expect.soft(label, 'Figma label').toBe('Reason of the operation');
  });

  test('USR-FRZ-003 Review disabled until a reason', tc('USR-FRZ-003'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Freeze');
    await expect(f.primaryButton).toBeDisabled();
    await f.fillReason(REASON);
    await expect(f.primaryButton).toBeEnabled();
    observe('Disabled empty, enabled with a reason');
  });

  test('USR-FRZ-004 Cancel keeps the account Confirmed', tc('USR-FRZ-004'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await start(l, d, f, 'Freeze');
    await f.fillReason(REASON);
    await f.cancelButton.click();
    await d.expectLoaded();
    observe(`Cancel -> ${new URL(page.url()).pathname}; status "${await d.statusWord()}"`);
    expect((await d.statusWord()).toLowerCase()).toBe('confirmed');
  });

  test('USR-FRZ-005 Review content and red button', tc('USR-FRZ-005'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await review(l, d, f, 'Freeze');
    const v = { action: await f.value('Action'), client: await f.value('Client'), date: await f.value('Date'), reason: await f.value('Reason') };
    const buttons = await f.footerButtons();
    observe(`Review ${JSON.stringify(v)}; buttons ${buttons.join(', ')}`);
    expect(v.action).toMatch(/^Freeze account$/i);
    expect(v.client).toBe(`@${env.umUsername}`);
    expect(v.reason).toContain(REASON.slice(0, 15));
    expect(buttons).toEqual(['Back', 'Freeze account']);
    expect.soft(v.action, 'Figma case').toBe('Freeze account');
  });

  test('USR-FRZ-006 Back keeps the reason', tc('USR-FRZ-006'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await review(l, d, f, 'Freeze');
    await f.backButton.click();
    const kept = await f.reason.first().inputValue();
    observe(`Reason after Back "${kept}"`);
    expect(kept).toBe(REASON);
  });

  test('USR-FRZ-008 frozen account listed on the Frozen tab', tc('USR-FRZ-008'), async ({ usersList: l, userDetails: d }) => {
    const u = process.env.PHX_UM_FREEZE_USERNAME ?? (await l.open('/users?status=frozen'), (await l.column('Username'))[0]?.replace(/^@/, ''));
    if (!u) unmet('No Frozen account on testbox');
    await l.open('/users?status=frozen');
    const listed = (await l.column('Username')).includes(`@${u}`);
    observe(`@${u} on Frozen tab page 1: ${listed}`);
    expect(listed).toBe(true);
    await l.row(u).getByRole('button', { name: 'See details' }).click();
    await d.expectLoaded();
  });

  test('USR-FRZ-009 frozen banner See details', tc('USR-FRZ-009'), async ({ usersList: l, userDetails: d, page }) => {
    const u = await l.openFirstOf(l.frozenTab);
    if (!u) unmet('No Frozen account on testbox');
    if (!(await d.seeDetailsButton.count())) blocked('Frozen banner has no "See details" button');
    await d.seeDetailsButton.first().click();
    const text = (await page.getByRole('dialog').filter({ visible: true }).innerText()).replace(/\s+/g, ' ');
    observe(`@${u}: ${text.slice(0, 250)}`);
    expect(text).toMatch(/Freeze account/i);
    for (const label of ['Updated at', 'Updated by', 'Reason']) expect.soft(text, label).toContain(label);
  });

  test('USR-FRZ-010 Unfreeze offered on a frozen account', tc('USR-FRZ-010'), async ({ usersList: l, userDetails: d, page }) => {
    const u = await l.openFirstOf(l.frozenTab);
    if (!u) unmet('No Frozen account on testbox');
    let where = '';
    if (await page.getByText(/Unfreeze/i).count()) where = 'page';
    if (!where && (await d.seeDetailsButton.count())) {
      await d.seeDetailsButton.first().click();
      if (await page.getByRole('button', { name: /Unfreeze/i }).count()) where = 'See details panel';
      await page.keyboard.press('Escape');
    }
    if (!where && (await d.moreButton.count())) {
      await d.moreButton.click();
      const opts = await d.menuTexts().catch(() => []);
      if (opts.some((o) => /unfreeze/i.test(o))) where = `"..." menu (${opts.join(', ')})`;
      else where = '';
      observe(`"..." options on @${u}: ${opts.join(', ')}`);
    }
    observe(`Unfreeze action: ${where || 'none found'}`);
    expect(where).not.toBe('');
  });
});

// ---------------------------------------------------------------- 16. Delete
test.describe('User management - 16. Delete account', () => {
  test('USR-DEL-001 "..." > Delete account opens a 3-step flow', tc('USR-DEL-001'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await l.openAccount(env.umUsername);
    await d.openMenu(d.moreButton);
    const del = d.menuOptions.filter({ hasText: /^Delete account$/i });
    const color = await del.evaluate((e) => getComputedStyle(e).color);
    await del.click();
    await f.expectOpen();
    const steps = await f.stepperText();
    observe(`Menu colour ${color}; URL ${new URL(page.url()).pathname}; breadcrumb "${await f.breadcrumb()}"; stepper "${steps}"`);
    expect(steps).toMatch(/Account details.*Reason for deletion.*Review details/);
    const [r, g, b] = (color.match(/\d+/g) ?? []).map(Number);
    expect.soft(r > g + 60 && r > b + 40, '"Delete account" option in red').toBe(true);
  });

  test('USR-DEL-002 three options, snapshot on by default', tc('USR-DEL-002'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Delete');
    const text = await f.main.innerText();
    const states = await f.switches.evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')));
    observe(`Switches ${states.join('/')}; ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
    for (const l2 of ["Send account snapshot to user's email", 'Keep username', 'Free KYC identification']) expect(text).toContain(l2);
    expect(states).toEqual(['true', 'false', 'false']);
  });

  test('USR-DEL-003 option descriptions', tc('USR-DEL-003'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Delete');
    const descs = (await f.main.innerText()).split('\n').filter((x) => /Add the agent username/.test(x));
    observe(`Placeholder descriptions: ${descs.length}`);
    expect(descs).toEqual([]);
  });

  test('USR-DEL-004 red warning names the account', tc('USR-DEL-004'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Delete');
    const info = await f.infoText();
    observe(`Warning "${info}"`);
    expect(info).toContain(`Are you sure you want to delete @${env.umUsername}?`);
    expect(info).toMatch(/permanently/i);
  });

  test('USR-DEL-005 seven reasons + Other reason', tc('USR-DEL-005'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await start(l, d, f, 'Delete');
    await f.primaryButton.click();
    await expect(page).toHaveURL(/\/reason$/);
    const radios = (await f.radios.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? (e as HTMLInputElement).value ?? ''))).filter(Boolean);
    const names = radios.length ? radios : (await f.main.getByRole('radiogroup').innerText()).split('\n').map((x) => x.trim()).filter(Boolean);
    observe(`Reasons: ${names.join(' | ')}`);
    expect(await f.radios.count()).toBe(7);
    await expect(f.main.getByRole('textbox', { name: 'Other reason?' })).toBeVisible();
    for (const r of ['The user forgot their keys', 'The user wants to leave the app', 'The user wants a new account for personal reasons', 'This is a test account', 'Dissatisfied with customer service', 'Regulatory/legal request (right to erasure)']) {
      await expect.soft(f.main.getByRole('radio', { name: r })).toHaveCount(1);
    }
    await expect.soft(f.main.getByRole('radio', { name: /Confirmed fraud ?\/ ?compliance closure/ })).toHaveCount(1);
  });

  test('USR-DEL-006 single choice', tc('USR-DEL-006'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Delete');
    await f.primaryButton.click();
    await f.radios.nth(0).check();
    await f.radios.nth(3).check();
    const checked = await f.main.getByRole('radio', { checked: true }).count();
    observe(`Checked after two picks: ${checked}`);
    expect(checked).toBe(1);
    await expect(f.radios.nth(3)).toBeChecked();
  });

  test('USR-DEL-007 Review disabled until a reason', tc('USR-DEL-007'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await start(l, d, f, 'Delete');
    await f.primaryButton.click();
    const before = await f.primaryButton.isEnabled();
    await f.main.getByRole('textbox', { name: 'Other reason?' }).fill(REASON);
    const withText = await f.primaryButton.isEnabled();
    await f.main.getByRole('textbox', { name: 'Other reason?' }).fill('');
    await f.radios.first().check();
    const withRadio = await f.primaryButton.isEnabled();
    observe(`Enabled: empty ${before}, other-text ${withText}, radio ${withRadio}`);
    expect(before).toBe(false);
    expect(withText).toBe(true);
    expect(withRadio).toBe(true);
  });

  test('USR-DEL-008 Cancel leaves the account untouched', tc('USR-DEL-008'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await start(l, d, f, 'Delete');
    await f.cancelButton.click();
    await d.expectLoaded();
    observe(`Cancel -> ${new URL(page.url()).pathname}; status "${await d.statusWord()}"`);
    expect((await d.statusWord()).toLowerCase()).toBe('confirmed');
  });

  test('USR-DEL-009 Review lists options and reason', tc('USR-DEL-009'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await deleteReview(l, d, f, page);
    const v = {
      action: await f.value('Action'), client: await f.value('Client'),
      snapshot: await f.value('Email snapshot to user'), keep: await f.value('Keep username'), kyc: await f.value('Free KYC'),
      date: await f.value('Date'), reason: await f.value('Reason'),
    };
    const buttons = await f.footerButtons();
    observe(`Review ${JSON.stringify(v)}; buttons ${buttons.join(', ')}`);
    expect(v.action).toMatch(/^Delete account$/i);
    expect(v.client).toBe(`@${env.umUsername}`);
    expect([v.snapshot, v.keep, v.kyc]).toEqual(['Yes', 'No', 'No']);
    expect(v.reason).toBe('This is a test account');
    expect(buttons).toEqual(['Back', 'Delete account']);
  });

  test('USR-DEL-010 Back keeps options and reason', tc('USR-DEL-010'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await deleteReview(l, d, f, page);
    await f.backButton.click();
    await expect(page).toHaveURL(/\/reason$/);
    const reasonKept = await f.main.getByRole('radio', { name: 'This is a test account' }).isChecked();
    await f.backButton.click();
    const switches = await f.switches.evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')));
    observe(`Reason kept ${reasonKept}; switches ${switches.join('/')}`);
    expect(reasonKept).toBe(true);
    expect(switches).toEqual(['true', 'false', 'false']);
  });

  test('USR-DEL-014 deleted account offers no reactivation', tc('USR-DEL-014'), async ({ usersList: l, userDetails: d, page }) => {
    const u = await l.openFirstOf(l.deletedTab);
    if (!u) unmet('No Deleted account on testbox');
    const activate = await page.getByRole('button', { name: /^(Activate|Unfreeze|Restore)/i }).count();
    let menu: string[] = [];
    if (await d.moreButton.count()) {
      await d.moreButton.click();
      menu = await d.menuTexts().catch(() => []);
      await page.keyboard.press('Escape');
    }
    observe(`@${u}: reactivation buttons ${activate}; "..." menu ${menu.join(', ') || 'none'}`);
    expect(activate).toBe(0);
    expect.soft(menu, 'no account actions on a deleted account').toEqual([]);
  });
});

// ------------------------------------------------- account-changing (gated)
/**
 * These change account status. Each uses its own disposable account and runs
 * only with PHX_ALLOW_ACCOUNT_OPS=true:
 * - PHX_UM_TARGET_USERNAME: deactivated, then re-activated (serial).
 * - PHX_UM_FREEZE_USERNAME: frozen (no unfreeze flow is designed yet).
 * - PHX_UM_DELETE_USERNAME: deleted (irreversible).
 */
test.describe.serial('User management - 13/14. Deactivate then activate (account-changing)', () => {
  test('USR-DEACT-010 confirming moves the account to Deactivated', tc('USR-DEACT-010'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    const u = requireAccountOps('PHX_UM_TARGET_USERNAME', 'deactivate and re-activate an account');
    await review(l, d, f, 'Deactivate', 'Automation: deactivate test account', u);
    await f.primaryButton.click();
    await d.expectLoaded();
    observe(`@${u}: status "${await d.statusWord()}", banner "${(await d.statusBanner.textContent().catch(() => ''))?.trim()}"`);
    expect((await d.statusWord()).toLowerCase()).toBe('deactivated');
    await l.open('/users?status=deactivated');
    await l.search(u);
    expect(await l.row(u).count()).toBe(1);
  });

  test('USR-ACT-004 activating returns the account to the first tab', tc('USR-ACT-004'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    const u = requireAccountOps('PHX_UM_TARGET_USERNAME', 'deactivate and re-activate an account');
    await l.openAccount(u);
    if ((await d.statusWord()).toLowerCase() !== 'deactivated') unmet(`@${u} is not Deactivated (USR-DEACT-010 must pass first)`);
    await openActivateDetails(d, page);
    await page.getByRole('button', { name: /^Activate account$/i }).first().click();
    await f.fillReason('Automation: re-activate test account');
    await f.toReview();
    await f.primaryButton.click();
    await d.expectLoaded();
    observe(`@${u}: status "${await d.statusWord()}"`);
    expect((await d.statusWord()).toLowerCase()).toBe('confirmed');
  });

  test('USR-ACT-005 banner gone after activation', tc('USR-ACT-005'), async ({ usersList: l, userDetails: d }) => {
    const u = requireAccountOps('PHX_UM_TARGET_USERNAME', 'deactivate and re-activate an account');
    await l.openAccount(u);
    observe(`@${u}: banners ${await d.statusBanner.count()}`);
    await expect(d.statusBanner).toHaveCount(0);
  });

  test('USR-ACT-006 actions back after activation', tc('USR-ACT-006'), async ({ usersList: l, userDetails: d }) => {
    const u = requireAccountOps('PHX_UM_TARGET_USERNAME', 'deactivate and re-activate an account');
    await l.openAccount(u);
    await expect(d.editDetailsButton).toBeVisible();
    await expect(d.changeUserTypeButton).toBeDisabled();
    await expect(d.moreButton).toBeVisible();
    observe('Edit details, Change user type (disabled) and "..." shown');
  });
});

test.describe('User management - 15/16. Freeze and delete (account-changing)', () => {
  test('USR-FRZ-007 confirming freezes the account', tc('USR-FRZ-007'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    const u = requireAccountOps('PHX_UM_FREEZE_USERNAME', 'freeze an account (no unfreeze flow yet)');
    await review(l, d, f, 'Freeze', 'Automation: freeze test account', u);
    await f.primaryButton.click();
    await d.expectLoaded();
    const banner = (await d.statusBanner.textContent().catch(() => ''))?.trim();
    observe(`@${u}: status "${await d.statusWord()}", banner "${banner}"`);
    expect((await d.statusWord()).toLowerCase()).toBe('frozen');
    expect(banner).toBe('This account has been frozen!');
  });

  test('USR-DEL-011 confirming deletes the account', tc('USR-DEL-011'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    const u = requireAccountOps('PHX_UM_DELETE_USERNAME', 'delete an account (irreversible)');
    await deleteReview(l, d, f, page, u);
    await f.primaryButton.click();
    await d.expectLoaded();
    observe(`@${u}: status "${await d.statusWord()}", banner "${(await d.statusBanner.textContent().catch(() => ''))?.trim()}"`);
    expect((await d.statusWord()).toLowerCase()).toBe('deleted');
  });

  test('USR-DEL-012 deleted username gets freed', tc('USR-DEL-012'), async ({ usersList: l }) => {
    const u = requireAccountOps('PHX_UM_DELETE_USERNAME', 'delete an account (irreversible)');
    await l.open('/users?status=deleted');
    const names = await l.column('Username');
    const mine = names.find((n) => n.startsWith(`@${u}_`));
    observe(`Deleted tab entry: ${mine ?? 'not on page 1'}`);
    expect(mine).toMatch(new RegExp(`^@${u}_\\d+_deleted$`));
  });
});
