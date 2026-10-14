import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, unmet, requireAccountOps, DESIGN } from '../../src/utils/tc';
import { tone } from '../../src/utils/ui';
import type { UserDetailsPage } from '../../src/pages/users/UserDetailsPage';

/** Payment methods of PHX_UM_USERNAME, or Skipped when it has none. */
async function methods(d: UserDetailsPage, min = 1) {
  const list = await d.paymentMethods();
  if (list.length < min) unmet(`@${env.umUsername} has ${list.length} payment method(s), ${min} needed: set PHX_UM_USERNAME to an account with ${min}+`);
  return list;
}

/** Plan section 5 - Payment methods tab (Figma 1667:147125). */
test.describe('User management - 5. Payment methods tab', () => {
  test.beforeEach(async ({ usersList, userDetails }) => {
    await usersList.openAccount(env.umUsername);
    await userDetails.expectLoaded();
    await userDetails.openTab('payment-methods');
    await expect(userDetails.pmTable).toBeVisible();
  });

  test('USR-PAY-001 table columns', tc('USR-PAY-001'), async ({ userDetails: d }) => {
    const headers = (await d.pmTable.getByRole('columnheader').allTextContents()).map((h) => h.trim()).filter(Boolean);
    observe(`Columns: ${headers.join(', ')}`);
    expect(headers.slice(0, 4)).toEqual(['Operator', 'Phone number', 'Status', 'Date created']);
  });

  test('USR-PAY-002 status badges', tc('USR-PAY-002'), async ({ userDetails: d }) => {
    const list = await methods(d);
    observe(`Statuses: ${list.map((m) => `${m.operator}=${m.status}`).join(', ')}`);
    for (const m of list) {
      expect(m.status).toMatch(/^(Active|Inactive)$/);
      expect.soft(await tone(m.row.getByRole('cell').nth(2).locator('*').first()), `${m.operator} badge colour`).toBe(m.status === 'Active' ? 'green' : 'red');
    }
  });

  test('USR-PAY-003 power and edit icons per row', tc('USR-PAY-003'), async ({ userDetails: d }) => {
    const list = await methods(d);
    const out: string[] = [];
    for (const m of list) {
      const hrefs = await m.row.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
      out.push(`${m.operator} (${m.status}): ${hrefs.map((h) => h.split('/').pop()).join(', ')}`);
      expect(hrefs.some((h) => /\/(deactivate|activate|enable)$/.test(h))).toBe(true);
      expect(hrefs.some((h) => /\/edit$/.test(h))).toBe(true);
    }
    observe(out.join('; '));
  });

  test('USR-PAY-004 Add method disabled when every operator is registered', tc('USR-PAY-004'), async ({ userDetails: d }) => {
    const list = await methods(d);
    const operators = new Set(list.filter((m) => /active/i.test(m.status)).map((m) => m.operator));
    const enabled = await d.addMethodButton.isEnabled();
    observe(`Active operators: ${[...operators].join(', ')}; Add method enabled: ${enabled}`);
    if (operators.size < 2) unmet('Needs an account with an active method for every operator of its country (Orange Money + MTN Mobile Money in Cameroon)');
    expect(enabled).toBe(false);
  });

  test('USR-PAY-005 Add method enabled when an operator is missing', tc('USR-PAY-005'), async ({ userDetails: d }) => {
    const list = await d.paymentMethods();
    const operators = new Set(list.map((m) => m.operator));
    const enabled = await d.addMethodButton.isEnabled();
    observe(`Operators: ${[...operators].join(', ') || 'none'}; Add method enabled: ${enabled}`);
    if (operators.size >= 2) unmet('Needs an account missing at least one operator');
    expect(enabled).toBe(true);
  });

  test('USR-PAY-006 Filters button on the tab', tc('USR-PAY-006'), async ({ userDetails: d }) => {
    observe(`Filters buttons on Payment methods: ${await d.filtersButton.count()}`);
    await expect(d.filtersButton).toBeVisible(DESIGN);
  });

  test('USR-PAY-007 refresh reloads the list', tc('USR-PAY-007'), async ({ userDetails: d }) => {
    const before = (await d.paymentMethods()).length;
    await d.reloadButton.click();
    await d.main.page().waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const after = (await d.paymentMethods()).length;
    observe(`Rows before/after refresh: ${before}/${after}`);
    expect(after).toBe(before);
  });

  test('USR-PAY-008 Export button present', tc('USR-PAY-008'), async ({ userDetails: d }) => {
    await expect(d.exportButton).toBeVisible();
    observe('Export visible (export file deferred)');
  });

  test('USR-PAY-009 pagination controls', tc('USR-PAY-009'), async ({ userDetails: d }) => {
    const counter = ((await d.main.getByText(/^Showing/).first().textContent()) ?? '').trim();
    const perPage = await d.main.getByRole('combobox', { name: 'Per page' }).count();
    observe(`Counter "${counter}", Per page selector ${perPage}`);
    expect(perPage).toBe(1);
    const m = counter.replace(/,/g, '').match(/Showing (\d+) to (\d+) of (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![2])).toBe((await d.paymentMethods()).length);
  });

  test('USR-PAY-010 empty state for an account without methods', tc('USR-PAY-010'), async ({ usersList: l, userDetails: d }) => {
    let found = '';
    for (const tab of [l.deletedTab, l.deactivatedTab]) {
      const u = await l.openFirstOf(tab);
      if (!u) continue;
      await d.openTab('payment-methods');
      if (!(await d.paymentMethods()).length) { found = u; break; }
    }
    if (!found) unmet('No account without payment methods found');
    const counter = ((await d.main.getByText(/^Showing/).first().textContent()) ?? '').trim();
    const empty = d.pmTable.getByRole('row', { name: /No data/ });
    observe(`@${found}: empty-state row ${await empty.count()}; counter "${counter}"`);
    await expect(empty).toBeVisible();
    expect(counter).toBe('Showing 0 to 0 of 0 results');
  });

  test('USR-PAY-011 edit icon opens a pre-filled form', tc('USR-PAY-011'), async ({ userDetails: d, userFlow: f }) => {
    const [m] = await methods(d);
    await m.editLink.click();
    await f.expectOpen();
    const phone = await f.main.getByRole('textbox', { name: /phone number/i }).inputValue();
    const name = await f.main.getByRole('textbox', { name: /full name/i }).inputValue();
    const invalid = await f.main.getByRole('textbox', { name: /phone number/i }).getAttribute('aria-invalid');
    const errors = (await f.main.innerText()).split('\n').filter((x) => /must|invalid|required/i.test(x));
    observe(`Edit ${m.operator}: name "${name}", phone "${phone}" (row ${m.phone}), aria-invalid ${invalid}; messages: ${errors.join(' | ') || 'none'}`);
    expect(phone.replace(/\D/g, '')).toContain(m.phone.replace(/\D/g, '').slice(-9));
    expect.soft(errors, 'pre-filled form shows no validation error').toEqual([]);
    await f.cancelButton.click();
  });

  test('USR-PAY-013 row checkboxes', tc('USR-PAY-013'), async ({ userDetails: d }) => {
    const n = await d.pmTable.getByRole('checkbox').count();
    observe(`Checkboxes in the table: ${n} (Figma: header + one per row)`);
    expect(n).toBe((await d.paymentMethods()).length + 1);
  });

  test('USR-PAY-014 toolbar controls', tc('USR-PAY-014'), async ({ userDetails: d }) => {
    const have = { refresh: await d.reloadButton.count(), filters: await d.filtersButton.count(), add: await d.addMethodButton.count(), export: await d.exportButton.count() };
    observe(`Toolbar: ${JSON.stringify(have)}`);
    expect(have).toEqual({ refresh: 1, filters: 1, add: 1, export: 1 });
  });

  test('USR-PAY-015 Date created format', tc('USR-PAY-015'), async ({ userDetails: d }) => {
    const list = await methods(d);
    observe(`Dates: ${list.map((m) => m.date).join(', ')}`);
    for (const m of list) expect(m.date).toMatch(/^[A-Z][a-z]{2} \d{2}, \d{4} \d{1,2}:\d{2} (AM|PM)$/);
  });
});

/** Plan section 6 - Add payment method (Figma 1667:154404). */
test.describe('User management - 6. Add payment method', () => {
  test.beforeEach(async ({ usersList, userDetails, userFlow }) => {
    await usersList.openAccount(env.umUsername);
    await userDetails.expectLoaded();
    await userDetails.openTab('payment-methods');
    if (!(await userDetails.addMethodButton.isEnabled())) unmet(`"Add method" is disabled for @${env.umUsername}: use an account missing an operator`);
    await userDetails.addMethodButton.click();
    await userFlow.expectOpen();
  });

  const field = (f: { main: import('@playwright/test').Locator }, name: RegExp) => f.main.getByRole('textbox', { name }).or(f.main.getByRole('combobox', { name }));

  test('USR-ADDM-001 flow opens with breadcrumb and 3-step stepper', tc('USR-ADDM-001'), async ({ userFlow: f, page }) => {
    const crumb = await f.breadcrumb();
    const steps = await f.stepperText();
    observe(`URL ${new URL(page.url()).pathname}; breadcrumb "${crumb}"; stepper "${steps}"; heading "${await f.heading.textContent()}"`);
    expect(crumb).toMatch(/Add payment method/i);
    expect(steps).toMatch(/Details.*Confirmation code.*Review details/);
  });

  test('USR-ADDM-002 Details fields', tc('USR-ADDM-002'), async ({ userFlow: f }) => {
    const text = (await f.main.innerText()).replace(/\s+/g, ' ');
    observe(`Details: ${text.slice(0, 300)}`);
    for (const label of ['Full name', 'Payment type', 'Payment mode', 'New phone number']) expect.soft(text, label).toContain(label);
    expect.soft(text).toContain('Verify with WhatsApp');
    expect(text).toContain('A code will be sent to this phone number!');
  });

  test('USR-ADDM-003 phone number validated', tc('USR-ADDM-003'), async ({ userFlow: f }) => {
    const phone = field(f, /phone number/i);
    await phone.fill('12');
    await phone.blur();
    const msgs = (await f.main.innerText()).split('\n').filter((x) => /phone/i.test(x) && /valid|must|provide|digits/i.test(x));
    observe(`After "12": ${msgs.join(' | ') || 'no message'}; Review enabled ${await f.primaryButton.isEnabled()}`);
    expect(await f.primaryButton.isEnabled()).toBe(false);
  });

  test('USR-ADDM-005 primary button disabled until valid', tc('USR-ADDM-005'), async ({ userFlow: f }) => {
    const label = (await f.primaryButton.textContent())?.trim();
    observe(`Primary "${label}" enabled on an empty form: ${await f.primaryButton.isEnabled()}`);
    await expect(f.primaryButton).toBeDisabled();
  });

  test('USR-ADDM-006 Cancel discards the new method', tc('USR-ADDM-006'), async ({ userFlow: f, userDetails: d, page }) => {
    const before = (await d.main.page().url());
    await field(f, /phone number/i).fill('690000000');
    await f.cancelButton.click();
    await expect(page).toHaveURL(/\/payment-methods$/);
    observe(`Cancel -> ${new URL(page.url()).pathname} (from ${new URL(before).pathname}); rows ${(await d.paymentMethods()).length}`);
  });

  test('USR-ADDM-013 Full name pre-filled', tc('USR-ADDM-013'), async ({ userFlow: f }) => {
    const name = await field(f, /full name/i).inputValue();
    observe(`Full name "${name}"`);
    expect(name.length).toBeGreaterThan(1);
  });

  test('USR-ADDM-014 Payment mode depends on Payment type', tc('USR-ADDM-014'), async ({ userFlow: f, page }) => {
    const mode = f.main.getByRole('combobox', { name: /payment mode/i });
    const before = await mode.isDisabled();
    await f.main.getByRole('combobox', { name: /payment type/i }).click({ force: true });
    const options = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option');
    const types = (await options.allInnerTexts()).map((t) => t.trim());
    await options.first().click();
    const after = await mode.isDisabled();
    await mode.click({ force: true });
    const modes = (await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').allInnerTexts()).map((t) => t.trim());
    observe(`Payment types ${types.join(', ')}; mode disabled before/after ${before}/${after}; modes for "${types[0]}": ${modes.join(', ')}`);
    expect(before).toBe(true);
    expect(after).toBe(false);
    expect(modes.length).toBeGreaterThan(0);
  });

  test('USR-ADDM-015 country code prefix', tc('USR-ADDM-015'), async ({ userFlow: f }) => {
    const text = await f.main.innerText();
    const prefix = text.match(/New phone number\s*\+(\d{3})/)?.[1];
    observe(`Prefix +${prefix}`);
    expect(prefix).toBe('237');
  });

  test('USR-ADDM-016 WhatsApp switch present and off', tc('USR-ADDM-016'), async ({ userFlow: f }) => {
    const text = await f.main.innerText();
    const sw = f.switches.first();
    observe(`WhatsApp text: ${/Verify with WhatsApp/.test(text) ? '"Verify with WhatsApp"' : /WhatsApp/.test(text) ? text.split('\n').find((x) => /WhatsApp/.test(x)) : 'none'}; switch on ${await sw.getAttribute('aria-checked')}`);
    expect(text).toContain('Verify with WhatsApp');
    expect(await sw.getAttribute('aria-checked')).toBe('false');
  });

  test('USR-ADDM-017 info box copy', tc('USR-ADDM-017'), async ({ userFlow: f }) => {
    const info = await f.infoText();
    observe(`Info "${info}"`);
    expect(info).toContain('A code will be sent to this phone number!');
    expect(info).toContain("We'll send a code to the client's new phone number to confirm it's the right one.");
  });

  test('USR-ADDM-018 no unrelated subtitle', tc('USR-ADDM-018'), async ({ userFlow: f }) => {
    const sub = ((await f.subtitle.textContent()) ?? '').trim();
    observe(`Subtitle "${sub}"`);
    expect(sub).not.toMatch(/documents are clear/i);
  });

  test('USR-ADDM-019 breadcrumb names the flow', tc('USR-ADDM-019'), async ({ userFlow: f }) => {
    const crumb = await f.breadcrumb();
    observe(`Breadcrumb "${crumb}"`);
    expect(crumb).toMatch(/Add payment method$/i);
  });
});

/** Plan section 7 - Deactivate payment method (Figma 1667:152939). */
test.describe('User management - 7. Deactivate payment method', () => {
  test.beforeEach(async ({ usersList, userDetails, userFlow }) => {
    await usersList.openAccount(env.umUsername);
    await userDetails.expectLoaded();
    await userDetails.openTab('payment-methods');
    const active = (await userDetails.paymentMethods()).find((m) => /^active$/i.test(m.status));
    if (!active) unmet(`@${env.umUsername} has no Active payment method`);
    await active.deactivateLink.click();
    await userFlow.expectOpen();
  });

  test('USR-DEAM-001 power icon opens the flow', tc('USR-DEAM-001'), async ({ userFlow: f, page }) => {
    observe(`URL ${new URL(page.url()).pathname}; stepper "${await f.stepperText()}"; heading "${await f.heading.textContent()}"`);
    await expect(page).toHaveURL(/\/payment-methods\/\d+\/deactivate$/);
    expect(await f.stepperText()).toMatch(/Details.*Review details/);
  });

  test('USR-DEAM-002 reason required', tc('USR-DEAM-002'), async ({ userFlow: f }) => {
    await expect(f.primaryButton).toBeDisabled();
    await f.fillReason('Automation check - not submitted');
    await expect(f.primaryButton).toBeEnabled();
    const label = (await f.main.innerText()).split('\n').find((x) => /reason/i.test(x))?.trim();
    observe(`Label "${label}"; disabled empty, enabled after typing`);
    expect.soft(label, 'Figma label').toBe('Reason for deactivation');
  });

  test('USR-DEAM-003 Cancel leaves the method Active', tc('USR-DEAM-003'), async ({ userFlow: f, userDetails: d, page }) => {
    await f.fillReason('Automation check - not submitted');
    await f.cancelButton.click();
    await expect(page).toHaveURL(/\/payment-methods$/);
    const list = await d.paymentMethods();
    observe(`After Cancel: ${list.map((m) => `${m.operator}=${m.status}`).join(', ')}`);
    expect(list.some((m) => /^active$/i.test(m.status))).toBe(true);
  });

  test('USR-DEAM-004 Review identifies the method and reason', tc('USR-DEAM-004'), async ({ userFlow: f }) => {
    const details = (await f.main.innerText()).replace(/\s+/g, ' ');
    await f.fillReason('Automation check - not submitted');
    await f.toReview();
    const review = (await f.main.innerText()).replace(/\s+/g, ' ');
    observe(`Details: ${details.slice(0, 120)} | Review: ${review.slice(0, 250)}`);
    expect(review).toMatch(/Action\s+Deactivate/i);
    expect(review).toContain('Automation check - not submitted');
    expect.soft(review, 'operator shown on Review').toMatch(/Orange Money|MTN/);
    await f.backButton.click();
  });

  test('USR-DEAM-005 Back keeps the reason', tc('USR-DEAM-005'), async ({ userFlow: f }) => {
    await f.fillReason('Automation check - not submitted');
    await f.toReview();
    await f.backButton.click();
    const kept = await f.reason.first().inputValue();
    observe(`Reason after Back "${kept}"`);
    expect(kept).toBe('Automation check - not submitted');
  });

  test('USR-DEAM-007 Review is the last step (no OTP)', tc('USR-DEAM-007'), async ({ userFlow: f }) => {
    await f.fillReason('Automation check - not submitted');
    await f.toReview();
    const buttons = await f.footerButtons();
    observe(`Review footer: ${buttons.join(', ')}; stepper "${await f.stepperText()}"`);
    expect(buttons[buttons.length - 1]).toMatch(/deactivate/i);
    expect(await f.main.getByRole('textbox', { name: /OTP/ }).count()).toBe(0);
    await f.backButton.click();
  });

  test('USR-DEAM-011 warning is about the payment method', tc('USR-DEAM-011'), async ({ userFlow: f }) => {
    const info = await f.infoText();
    observe(`Warning "${info}"`);
    expect(info).toMatch(/payment method/i);
    expect(info).not.toMatch(/deactivate this account/i);
  });

  test('USR-DEAM-013 breadcrumb', tc('USR-DEAM-013'), async ({ userFlow: f }) => {
    const crumb = await f.breadcrumb();
    observe(`Breadcrumb "${crumb}"`);
    expect(crumb).toMatch(/@\S+ \/ Deactivate payment method$/);
  });
});

/**
 * State-changing payment-method cases. They use a disposable account
 * (PHX_UM_PM_USERNAME) and only run with PHX_ALLOW_ACCOUNT_OPS=true.
 * Adding a method also needs the customer code (PHX_UM_CUSTOMER_OTP).
 */
test.describe('User management - 6/7. Payment methods (account-changing)', () => {
  const NEW_PHONE = process.env.PHX_UM_PM_NEW_PHONE ?? '690000001';

  async function openAdd(usersList: import('../../src/pages/users/UsersListPage').UsersListPage, d: UserDetailsPage, f: import('../../src/pages/users/UserFlowPage').UserFlowPage, page: import('@playwright/test').Page) {
    const u = requireAccountOps('PHX_UM_PM_USERNAME', 'add a payment method (sends a code to the customer)');
    await usersList.openAccount(u);
    await d.openTab('payment-methods');
    if (!(await d.addMethodButton.isEnabled())) unmet(`"Add method" is disabled for @${u}`);
    await d.addMethodButton.click();
    await f.expectOpen();
    await f.main.getByRole('combobox', { name: /payment type/i }).click({ force: true });
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first().click();
    await f.main.getByRole('combobox', { name: /payment mode/i }).click({ force: true });
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first().click();
    await f.main.getByRole('textbox', { name: /phone number/i }).fill(NEW_PHONE);
    await f.primaryButton.click();
    await expect(f.heading).toHaveText(/Confirmation code/, { timeout: 30_000 });
  }

  test('USR-ADDM-007 Confirmation code step', tc('USR-ADDM-007'), async ({ usersList, userDetails: d, userFlow: f, page }) => {
    await openAdd(usersList, d, f, page);
    const text = (await f.main.innerText()).replace(/\s+/g, ' ');
    observe(text.slice(0, 300));
    expect(text).toMatch(/A 6-digit code was sent to/);
    expect(text).toMatch(/OTP code will expire in [12]:\d{2}/);
    expect(text).toMatch(/Resend code/);
    expect(text).toMatch(/Grab the code from the user!/);
  });

  test('USR-ADDM-012 Back from Confirmation code keeps Details values', tc('USR-ADDM-012'), async ({ usersList, userDetails: d, userFlow: f, page }) => {
    await openAdd(usersList, d, f, page);
    await f.backButton.click();
    const phone = await f.main.getByRole('textbox', { name: /phone number/i }).inputValue();
    observe(`Phone after Back "${phone}"`);
    expect(phone.replace(/\D/g, '')).toContain(NEW_PHONE.replace(/\D/g, ''));
  });

  test('USR-ADDM-009 confirming adds an Active method', tc('USR-ADDM-009'), async ({ usersList, userDetails: d, userFlow: f, page }) => {
    const otp = process.env.PHX_UM_CUSTOMER_OTP;
    if (!otp) unmet('Needs the customer code: set PHX_UM_CUSTOMER_OTP (testbox fixed code)');
    await openAdd(usersList, d, f, page);
    const { fillOtp } = await import('../../src/utils/otp');
    await fillOtp(page, otp);
    await f.primaryButton.click();
    await expect(f.heading).toHaveText(/Review/i);
    await f.primaryButton.click();
    await expect(page).toHaveURL(/\/payment-methods$/, { timeout: 30_000 });
    const list = await d.paymentMethods();
    const added = list.find((m) => m.phone.replace(/\D/g, '').endsWith(NEW_PHONE.replace(/\D/g, '')));
    observe(`After confirm: ${list.map((m) => `${m.operator} ${m.phone} ${m.status} ${m.date}`).join('; ')}`);
    expect(added?.status).toMatch(/^active$/i);
  });

  test('USR-DEAM-006 confirming deactivates the method', tc('USR-DEAM-006'), async ({ usersList, userDetails: d, userFlow: f, page }) => {
    const u = requireAccountOps('PHX_UM_PM_USERNAME', 'deactivate a payment method');
    await usersList.openAccount(u);
    await d.openTab('payment-methods');
    const active = (await d.paymentMethods()).find((m) => /^active$/i.test(m.status));
    if (!active) unmet(`@${u} has no Active payment method`);
    const phone = active.phone;
    await active.deactivateLink.click();
    await f.fillReason('Automation: deactivate test method');
    await f.toReview();
    await f.primaryButton.click();
    await expect(page).toHaveURL(/\/payment-methods$/, { timeout: 30_000 });
    const row = (await d.paymentMethods()).find((m) => m.phone === phone);
    observe(`After confirm: ${row ? `${row.operator} ${row.phone} ${row.status}` : 'row gone'}`);
    expect(row?.status).toMatch(/^inactive$/i);
  });
});
