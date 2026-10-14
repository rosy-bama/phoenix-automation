import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, requireAccountOps, DESIGN } from '../../src/utils/tc';
import type { UsersListPage } from '../../src/pages/users/UsersListPage';
import type { UserDetailsPage } from '../../src/pages/users/UserDetailsPage';
import type { UserFlowPage } from '../../src/pages/users/UserFlowPage';

const REASON = 'Automation check - not submitted';

/** Plan section 8 - Security tab (Figma 1519:114374). Read-only. */
test.describe('User management - 8. Security tab', () => {
  test.beforeEach(async ({ usersList, userDetails }) => {
    await usersList.openAccount(env.umUsername);
    await userDetails.expectLoaded();
    await userDetails.openTab('security');
  });

  test('USR-SEC-001 MFA heading', tc('USR-SEC-001'), async ({ userDetails: d }) => {
    await expect(d.mfaHeading).toBeVisible();
    observe(`Heading "${await d.mfaHeading.textContent()}"`);
  });

  test('USR-SEC-003 three methods listed', tc('USR-SEC-003'), async ({ userDetails: d }) => {
    const text = await d.main.innerText();
    const labels = ['Email', 'Authenticator app', 'SMS'].map((l) => ({ l, ok: new RegExp(`^${l}$`, 'im').test(text) }));
    observe(`Rows: ${labels.map((x) => `${x.l}${x.ok ? '' : ' (not found)'}`).join(', ')}; switches ${await d.switches.count()}`);
    await expect(d.switches).toHaveCount(3);
    for (const l of ['Email', 'SMS']) expect(text).toMatch(new RegExp(`^${l}$`, 'm'));
    expect(text).toMatch(/^Authenticator app$/im);
  });

  test('USR-SEC-004 switches reflect each method state', tc('USR-SEC-004'), async ({ userDetails: d }) => {
    const states = await d.mfaStates();
    observe(`States: ${states.map((s) => `${s.label}=${s.on ? 'on' : 'off'}`).join(', ')}`);
    expect(states).toHaveLength(3);
    for (const s of states) expect(typeof s.on).toBe('boolean');
  });

  test('USR-SEC-006 Deactivate all button', tc('USR-SEC-006'), async ({ userDetails: d }) => {
    const states = await d.mfaStates();
    const enabled = await d.deactivateAllButton.isEnabled();
    observe(`"Deactivate all" visible, enabled ${enabled}; active methods ${states.filter((s) => s.on).length}`);
    await expect(d.deactivateAllButton).toBeVisible();
    if (!states.some((s) => s.on)) expect.soft(enabled, 'disabled when no method is active').toBe(false);
  });

  test('USR-SEC-010 Deactivated account: MFA read-only', tc('USR-SEC-010'), async ({ usersList: l, userDetails: d }) => {
    const u = await l.openFirstOf(l.deactivatedTab);
    if (!u) unmet('No Deactivated account on testbox');
    await d.openTab('security');
    const states = await d.mfaStates();
    const notice = await d.main.getByText(/deactivated|unavailable/i).count();
    observe(`@${u}: switches ${states.map((s) => `${s.label}=${s.disabled ? 'disabled' : 'enabled'}`).join(', ')}; notice ${notice}; Deactivate all enabled ${await d.deactivateAllButton.isEnabled().catch(() => false)}`);
    expect(states.every((s) => s.disabled) || notice > 0).toBe(true);
  });

  test('USR-SEC-011 switches reachable by keyboard', tc('USR-SEC-011'), async ({ userDetails: d, page }) => {
    const reached: number[] = [];
    await d.mfaHeading.click();
    for (let i = 0; i < 25 && reached.length < 3; i++) {
      await page.keyboard.press('Tab');
      const idx = await d.switches.evaluateAll((els) => els.findIndex((e) => e === document.activeElement));
      if (idx >= 0 && !reached.includes(idx)) reached.push(idx);
    }
    observe(`Switches reached with Tab: ${reached.join(', ') || 'none'} (Space/Enter not pressed: it would change MFA)`);
    expect(reached.sort()).toEqual([0, 1, 2]);
  });

  test('USR-SEC-013 "Authenticator app" sentence case', tc('USR-SEC-013'), async ({ userDetails: d }) => {
    const line = (await d.main.innerText()).split('\n').find((x) => /^Authenticator app$/i.test(x.trim()))?.trim();
    observe(`Label "${line}"`);
    expect(line).toBe('Authenticator app');
  });

  test('USR-SEC-014 on/off switch colours', tc('USR-SEC-014'), async ({ userDetails: d }) => {
    const states = await d.mfaStates();
    if (!states.some((s) => s.on) || states.every((s) => s.on)) unmet(`@${env.umUsername} needs some (not all) MFA methods on: set PHX_UM_USERNAME accordingly`);
    const colours = await d.switches.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    observe(`Colours: ${states.map((s, i) => `${s.label} ${s.on ? 'on' : 'off'} ${colours[i]}`).join('; ')}`);
    const on = colours.filter((_, i) => states[i].on);
    const off = colours.filter((_, i) => !states[i].on);
    expect(on.every((c) => !off.includes(c))).toBe(true);
  });
});

/**
 * Plan sections 8-10 that switch MFA: they open the deactivation flow from a
 * switch, so they use a disposable account with MFA on (PHX_UM_MFA_USERNAME)
 * and PHX_ALLOW_ACCOUNT_OPS=true. Cases that stop before the final button
 * leave MFA unchanged.
 */
test.describe('User management - 9/10. Deactivate MFA', () => {
  async function openSecurity(l: UsersListPage, d: UserDetailsPage) {
    const u = requireAccountOps('PHX_UM_MFA_USERNAME', 'open the MFA deactivation flow');
    await l.openAccount(u);
    await d.openTab('security');
    const states = await d.mfaStates();
    const i = states.findIndex((s) => s.on);
    if (i < 0) unmet(`@${u} has no active MFA method`);
    return { u, states, i };
  }

  async function startOne(l: UsersListPage, d: UserDetailsPage, f: UserFlowPage) {
    const ctx = await openSecurity(l, d);
    await d.switches.nth(ctx.i).click();
    await f.expectOpen();
    return ctx;
  }

  test('USR-SEC-005 one switch opens that method\'s flow only', tc('USR-SEC-005'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    const { states, i } = await startOne(l, d, f);
    const crumb = await f.breadcrumb();
    observe(`Switched ${states[i].label} -> "${crumb}"`);
    expect(crumb.toLowerCase()).toContain(states[i].label.toLowerCase().split(' ')[0]);
    await f.cancelButton.click();
    expect((await d.mfaStates()).map((s) => s.on)).toEqual(states.map((s) => s.on));
  });

  test('USR-DMFA-001 Details step opens', tc('USR-DMFA-001'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await startOne(l, d, f);
    const crumb = await f.breadcrumb();
    const steps = await f.stepperText();
    observe(`Breadcrumb "${crumb}"; stepper "${steps}"`);
    expect(crumb).toMatch(/Deactivate \w+ 2FA$/i);
    expect(steps).toMatch(/Details.*Review details/);
    await f.cancelButton.click();
  });

  test('USR-DMFA-002 reason required + info box', tc('USR-DMFA-002'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await startOne(l, d, f);
    await expect(f.primaryButton).toBeDisabled();
    await f.fillReason(REASON);
    await expect(f.primaryButton).toBeEnabled();
    const info = await f.infoText();
    observe(`Info "${info}"`);
    expect(info).toContain('Please note before you deactivate this verification!');
    await f.cancelButton.click();
  });

  test('USR-DMFA-003 Cancel keeps the switch on', tc('USR-DMFA-003'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    const { states, i } = await startOne(l, d, f);
    await f.fillReason(REASON);
    await f.cancelButton.click();
    const after = await d.mfaStates();
    observe(`${states[i].label} after Cancel: ${after[i]?.on ? 'on' : 'off'}`);
    expect(after[i].on).toBe(true);
  });

  test('USR-DMFA-004 Review names the method', tc('USR-DMFA-004'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    const { states, i } = await startOne(l, d, f);
    await f.fillReason(REASON);
    await f.toReview();
    const action = await f.value('Action');
    const buttons = await f.footerButtons();
    observe(`Action "${action}"; buttons ${buttons.join(', ')}`);
    expect(action.toLowerCase()).toContain(states[i].label.toLowerCase().split(' ')[0]);
    expect(buttons[buttons.length - 1]).toMatch(/Deactivate 2FA/i);
    await f.backButton.click();
    await f.cancelButton.click();
  });

  test('USR-DMFA-005 Back keeps the reason', tc('USR-DMFA-005'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await startOne(l, d, f);
    await f.fillReason(REASON);
    await f.toReview();
    await f.backButton.click();
    const kept = await f.reason.first().inputValue();
    observe(`Reason after Back "${kept}"`);
    expect(kept).toBe(REASON);
    await f.cancelButton.click();
  });

  test('USR-DMFA-006 no OTP step after Review', tc('USR-DMFA-006'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await startOne(l, d, f);
    await f.fillReason(REASON);
    await f.toReview();
    const steps = await f.stepperText();
    observe(`Stepper on Review "${steps}"; OTP inputs ${await f.main.getByRole('textbox', { name: /OTP/ }).count()}`);
    expect(steps).not.toMatch(/OTP|verification code|Confirmation code/i);
    await f.backButton.click();
    await f.cancelButton.click();
  });

  test('USR-DMFA-013 info box copy', tc('USR-DMFA-013'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await startOne(l, d, f);
    const info = await f.infoText();
    observe(`Info "${info}"`);
    expect(info).toMatch(/User can log in without using \w+ 2FA/i);
    expect(info).toMatch(/erase the old settings/i);
    await f.cancelButton.click();
  });

  test('USR-DMFA-014 flow name follows the method', tc('USR-DMFA-014'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    const { states } = await openSecurity(l, d);
    const out: string[] = [];
    for (let i = 0; i < states.length; i++) {
      if (!states[i].on) continue;
      await d.switches.nth(i).click();
      await f.expectOpen();
      out.push(`${states[i].label}: "${await f.breadcrumb()}"`);
      expect.soft(await f.breadcrumb(), states[i].label).toMatch(new RegExp(states[i].label.split(' ')[0], 'i'));
      await f.cancelButton.click();
      await expect(page).toHaveURL(/\/security$/);
    }
    observe(out.join('; '));
  });

  test('USR-DMFA-009 confirming switches the method off', tc('USR-DMFA-009'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    const { states, i } = await startOne(l, d, f);
    await f.fillReason('Automation: deactivate MFA on test account');
    await f.toReview();
    await f.primaryButton.click();
    await expect(page).toHaveURL(/\/security$/, { timeout: 30_000 });
    const after = await d.mfaStates();
    observe(`${states[i].label}: on -> ${after[i].on ? 'on' : 'off'}; others ${after.filter((_, j) => j !== i).map((s) => `${s.label}=${s.on ? 'on' : 'off'}`).join(', ')}`);
    expect(after[i].on).toBe(false);
  });

  test('USR-DMFA-011 other methods unchanged', tc('USR-DMFA-011'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    const { states, i } = await startOne(l, d, f);
    await f.fillReason('Automation: deactivate MFA on test account');
    await f.toReview();
    await f.primaryButton.click();
    await expect(page).toHaveURL(/\/security$/, { timeout: 30_000 });
    const after = await d.mfaStates();
    observe(`Before ${states.map((s) => s.on).join('/')}, after ${after.map((s) => s.on).join('/')}`);
    expect(after.filter((_, j) => j !== i).map((s) => s.on)).toEqual(states.filter((_, j) => j !== i).map((s) => s.on));
  });

  test('USR-SEC-009 switch updates without reload', tc('USR-SEC-009'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    const { i } = await startOne(l, d, f);
    await f.fillReason('Automation: deactivate MFA on test account');
    await f.toReview();
    await f.primaryButton.click();
    await expect(page).toHaveURL(/\/security$/, { timeout: 30_000 });
    await expect.poll(async () => (await d.mfaStates())[i].on, { timeout: 10_000 }).toBe(false);
    observe('Switch off right after the flow, no manual reload');
  });

  test('USR-SEC-007 last active method can be deactivated', tc('USR-SEC-007'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    const { states } = await openSecurity(l, d);
    if (states.filter((s) => s.on).length !== 1) unmet('Needs exactly one active MFA method left (run after the other MFA cases)');
    const i = states.findIndex((s) => s.on);
    await d.switches.nth(i).click();
    await f.fillReason('Automation: deactivate last MFA method');
    await f.toReview();
    await f.primaryButton.click();
    await expect(page).toHaveURL(/\/security$/, { timeout: 30_000 });
    const after = await d.mfaStates();
    observe(`Active methods after: ${after.filter((s) => s.on).length}`);
    expect(after.every((s) => !s.on)).toBe(true);
  });

  test('USR-DAMFA-001 Deactivate all opens a flow', tc('USR-DAMFA-001'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await openSecurity(l, d);
    await d.deactivateAllButton.click();
    await f.heading.waitFor({ timeout: 10_000 }).catch(() => {});
    observe(`After "Deactivate all": ${new URL(page.url()).pathname}; heading "${await f.heading.textContent().catch(() => '')}"`);
    await expect(page).not.toHaveURL(/\/security$/);
    await expect(f.footer).toBeVisible(DESIGN);
    await f.cancelButton.click().catch(() => {});
  });

  test('USR-DAMFA-002 reason required', tc('USR-DAMFA-002'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await openSecurity(l, d);
    await d.deactivateAllButton.click();
    await f.expectOpen();
    await expect(f.primaryButton).toBeDisabled();
    await f.fillReason(REASON);
    await expect(f.primaryButton).toBeEnabled();
    observe('Review disabled until a reason is typed');
    await f.cancelButton.click();
  });

  test('USR-DAMFA-003 Review lists the active methods', tc('USR-DAMFA-003'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    const { states } = await openSecurity(l, d);
    await d.deactivateAllButton.click();
    await f.expectOpen();
    await f.fillReason(REASON);
    await f.toReview();
    const text = (await f.main.innerText()).replace(/\s+/g, ' ');
    observe(`Review: ${text.slice(0, 250)}`);
    for (const s of states.filter((x) => x.on)) expect.soft(text.toLowerCase(), s.label).toContain(s.label.toLowerCase().split(' ')[0]);
    await f.backButton.click();
    await f.cancelButton.click();
  });

  test('USR-DAMFA-004 Cancel keeps every method', tc('USR-DAMFA-004'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    const { states } = await openSecurity(l, d);
    await d.deactivateAllButton.click();
    await f.expectOpen();
    await f.cancelButton.click();
    const after = await d.mfaStates();
    observe(`Before ${states.map((s) => s.on).join('/')}, after ${after.map((s) => s.on).join('/')}`);
    expect(after.map((s) => s.on)).toEqual(states.map((s) => s.on));
  });

  test('USR-DAMFA-006 confirming switches every method off', tc('USR-DAMFA-006'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    await openSecurity(l, d);
    await d.deactivateAllButton.click();
    await f.expectOpen();
    await f.fillReason('Automation: deactivate all MFA on test account');
    await f.toReview();
    await f.primaryButton.click();
    await expect(page).toHaveURL(/\/security$/, { timeout: 30_000 });
    const after = await d.mfaStates();
    observe(`After: ${after.map((s) => `${s.label}=${s.on ? 'on' : 'off'}`).join(', ')}`);
    expect(after.every((s) => !s.on)).toBe(true);
  });
});
