import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, requireAccountOps } from '../../src/utils/tc';
import { fillOtp } from '../../src/utils/otp';
import type { Page } from '@playwright/test';
import type { UsersListPage } from '../../src/pages/users/UsersListPage';
import type { UserDetailsPage } from '../../src/pages/users/UserDetailsPage';
import type { UserFlowPage } from '../../src/pages/users/UserFlowPage';

/**
 * Plan sections 11-12 - Update email / phone (Figma 1525:119258, 1536:125635).
 * CONFIRMED (13 Oct 2026): Edit details > "Email address" -> /users/<id>/update/email,
 * "Phone number" -> /update/phone; fields "* New email address" /
 * "* New phone number", "* Reason of the operation"; footer Cancel + "Send code".
 * Steps up to Contact details are read-only. "Send code" texts the customer, so
 * everything after it needs PHX_ALLOW_ACCOUNT_OPS + PHX_UM_CONTACT_USERNAME, and
 * finishing needs the customer code (PHX_UM_CUSTOMER_OTP).
 */
const REASON = 'Automation check - not submitted';

for (const kind of ['email', 'phone'] as const) {
  const P = kind === 'email' ? 'EML' : 'PHN';
  const option = kind === 'email' ? 'Email address' : 'Phone number';
  const ids = kind === 'email'
    ? { open: 1, fields: 2, format: 3, reason: 5, cancel: 6, code: 7, callout: 9, timer: 10, resend: 11, review: 14, success: 16 }
    : { open: 1, fields: 0, format: 2, reason: 5, cancel: 6, code: 7, callout: 8, timer: 9, resend: 10, review: 12, success: 13 };
  const id = (n: number) => `USR-${P}-${String(n).padStart(3, '0')}`;
  const valid = kind === 'email' ? `automation+${Date.now()}@ejara.io` : process.env.PHX_UM_NEW_PHONE ?? '690000002';
  const invalid = kind === 'email' ? 'not-an-email' : '12';

  async function start(l: UsersListPage, d: UserDetailsPage, f: UserFlowPage, username = env.umUsername) {
    await l.openAccount(username);
    await d.expectLoaded();
    await d.openMenu(d.editDetailsButton);
    await d.chooseOption(option);
    await f.expectOpen();
  }
  const input = (f: UserFlowPage) => f.main.getByRole('textbox', { name: kind === 'email' ? /email/i : /phone number/i });

  async function toCode(l: UsersListPage, d: UserDetailsPage, f: UserFlowPage) {
    const u = requireAccountOps('PHX_UM_CONTACT_USERNAME', `send an update code to the customer's ${kind}`);
    await start(l, d, f, u);
    await input(f).fill(valid);
    await f.fillReason('Automation: contact update on test account');
    await f.primaryButton.click();
    await expect(f.heading).toHaveText(/Confirmation code/, { timeout: 30_000 });
  }

  async function toReview(l: UsersListPage, d: UserDetailsPage, f: UserFlowPage, page: Page) {
    const otp = process.env.PHX_UM_CUSTOMER_OTP;
    if (!otp) unmet('Needs the customer code: set PHX_UM_CUSTOMER_OTP (testbox fixed code)');
    await toCode(l, d, f);
    await fillOtp(page, otp);
    if (await f.primaryButton.isEnabled()) await f.primaryButton.click();
    await expect(f.heading).toHaveText(/Review/i, { timeout: 30_000 });
  }

  test.describe(`User management - ${kind === 'email' ? '11. Update email' : '12. Update phone'}`, () => {
    test(`${id(ids.open)} Edit details > ${option} opens the flow`, tc(id(ids.open)), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
      await start(l, d, f);
      const steps = await f.stepperText();
      observe(`URL ${new URL(page.url()).pathname}; heading "${await f.heading.textContent()}"; stepper "${steps}"; breadcrumb "${await f.breadcrumb()}"`);
      await expect(page).toHaveURL(new RegExp(`/update/${kind}$`));
      expect(steps).toMatch(/Contact Informations.*Confirmation code.*Review details/);
    });

    if (ids.fields) test(`${id(ids.fields)} Contact step fields`, tc(id(ids.fields)), async ({ usersList: l, userDetails: d, userFlow: f }) => {
      await start(l, d, f);
      const text = (await f.main.innerText()).replace(/\s+/g, ' ');
      observe(`Fields: ${text.slice(0, 250)}`);
      await expect(input(f)).toBeVisible();
      await expect(f.reason).toBeVisible();
    });

    test(`${id(ids.format)} ${kind} format validated`, tc(id(ids.format)), async ({ usersList: l, userDetails: d, userFlow: f }) => {
      await start(l, d, f);
      await input(f).fill(invalid);
      await f.fillReason(REASON);
      await input(f).blur();
      const msgs = (await f.main.innerText()).split('\n').filter((x) => /valid|must|provide|format|digits/i.test(x));
      observe(`"${invalid}": ${msgs.join(' | ') || 'no message'}; Send code enabled ${await f.primaryButton.isEnabled()}`);
      await expect(f.primaryButton).toBeDisabled();
    });

    test(`${id(ids.reason)} reason required`, tc(id(ids.reason)), async ({ usersList: l, userDetails: d, userFlow: f }) => {
      await start(l, d, f);
      await input(f).fill(valid);
      const without = await f.primaryButton.isEnabled();
      await f.fillReason(REASON);
      const withReason = await f.primaryButton.isEnabled();
      observe(`"${(await f.primaryButton.textContent())?.trim()}" enabled without/with reason: ${without}/${withReason}`);
      expect(without).toBe(false);
      expect(withReason).toBe(true);
    });

    test(`${id(ids.cancel)} Cancel returns unchanged`, tc(id(ids.cancel)), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
      await start(l, d, f);
      await f.cancelButton.click();
      await d.expectLoaded();
      const value = await d.field(kind === 'email' ? 'Email' : 'Phone number');
      observe(`Cancel -> ${new URL(page.url()).pathname}; ${kind} still "${value}"`);
      expect(page.url()).not.toMatch(/\/update\//);
      expect(value).not.toBe(valid);
    });

    if (kind === 'phone') {
      test('USR-PHN-003 receiver card / info box for a valid number', tc('USR-PHN-003'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
        await start(l, d, f);
        await input(f).fill(valid);
        const text = (await f.main.innerText()).replace(/\s+/g, ' ');
        observe(`After a valid number: ${text.slice(-200)}`);
        expect(text).toMatch(/A code will be sent to this phone number!/);
      });
    } else {
      test('USR-EML-019 Escape closes the Edit details menu', tc('USR-EML-019'), async ({ usersList: l, userDetails: d, page }) => {
        await l.openAccount(env.umUsername);
        await d.openMenu(d.editDetailsButton);
        await page.keyboard.press('Escape');
        observe(`Options visible after Escape: ${await d.menuOptions.count()}; URL ${new URL(page.url()).pathname}`);
        await expect(d.menuOptions).toHaveCount(0);
        expect(page.url()).not.toMatch(/\/update\//);
      });
    }

    // ---- From here the customer receives a code (account-changing gate). ----
    test(`${id(ids.code)} Confirmation code step follows Contact info`, tc(id(ids.code)), async ({ usersList: l, userDetails: d, userFlow: f }) => {
      await toCode(l, d, f);
      const text = (await f.main.innerText()).replace(/\s+/g, ' ');
      observe(text.slice(0, 250));
      expect(text).toMatch(/A 6-digit code was sent to/);
    });

    if (kind === 'email') {
      test('USR-EML-008 code is the customer\'s, not the admin TOTP', tc('USR-EML-008'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
        await toCode(l, d, f);
        const text = (await f.main.innerText()).replace(/\s+/g, ' ');
        observe(text.slice(0, 250));
        expect(text).toContain(valid);
        expect(text).not.toMatch(/authenticator|TOTP/i);
      });
    }

    test(`${id(ids.callout)} callout: get the code from the customer`, tc(id(ids.callout)), async ({ usersList: l, userDetails: d, userFlow: f }) => {
      await toCode(l, d, f);
      const info = await f.infoText();
      observe(`Callout "${info}"`);
      expect(info).toMatch(/Grab the code from the user!/);
    });

    test(`${id(ids.timer)} expiry countdown from 2:00`, tc(id(ids.timer)), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
      await toCode(l, d, f);
      const read = async () => (await f.main.innerText()).match(/expire in (\d+):(\d{2})/);
      const a = await read();
      await page.waitForTimeout(3_000);
      const b = await read();
      observe(`Timer ${a?.[0]} -> ${b?.[0]}`);
      expect(Number(a![1]) * 60 + Number(a![2])).toBeLessThanOrEqual(120);
      expect(Number(b![1]) * 60 + Number(b![2])).toBeLessThan(Number(a![1]) * 60 + Number(a![2]));
    });

    test(`${id(ids.resend)} Resend code available`, tc(id(ids.resend)), async ({ usersList: l, userDetails: d, userFlow: f }) => {
      await toCode(l, d, f);
      const resend = f.main.getByText(/Resend code/);
      observe(`Resend: ${await resend.count()}`);
      await expect(resend.first()).toBeVisible();
    });

    test(`${id(ids.review)} valid code -> Review with the new value and reason`, tc(id(ids.review)), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
      await toReview(l, d, f, page);
      const text = (await f.main.innerText()).replace(/\s+/g, ' ');
      observe(`Review: ${text.slice(0, 250)}`);
      expect(text).toContain(kind === 'email' ? valid : valid.slice(-6));
      expect(text).toContain('Automation: contact update on test account');
    });

    if (kind === 'email') {
      test('USR-EML-015 Review needs an explicit confirm', tc('USR-EML-015'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
        await toReview(l, d, f, page);
        const buttons = await f.footerButtons();
        observe(`Review buttons: ${buttons.join(', ')}`);
        expect(buttons.length).toBe(2);
        expect(buttons[1]).toMatch(/confirm|update|save/i);
      });
    }

    test(`${id(ids.success)} success shows the new ${kind} in the panel`, tc(id(ids.success)), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
      await toReview(l, d, f, page);
      await f.primaryButton.click();
      await d.expectLoaded();
      const value = await d.field(kind === 'email' ? 'Email' : 'Phone number');
      observe(`Panel ${kind} "${value}"`);
      if (kind === 'email') expect(value).toBe(valid);
      else expect(value.replace(/\D/g, '')).toContain(valid.replace(/\D/g, ''));
    });
  });
}
