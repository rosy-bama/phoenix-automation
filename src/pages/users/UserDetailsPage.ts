import { Page, Locator, expect } from '@playwright/test';
import { escapeRegex } from '../../utils/text';

/**
 * User management > Account details (/users/<id>, /payment-methods,
 * /security). CONFIRMED from snapshots (13 Oct 2026):
 * - main: "Back to account list", tab buttons "Overview" / "Payment Methods" /
 *   "Security" (Figma: "Products overview" / "Payment methods" / "Security"),
 *   product cards with level-3 headings, status banner paragraph
 *   ("This account has been deactivated!" / "frozen!" / "deleted!").
 * - profile panel = the <aside> (complementary) INSIDE main: initials, name,
 *   status word + username, "Copy", "Edit details" (opens a listbox with
 *   options "Email address" / "Phone number"), "Change user type" [disabled],
 *   "..." (listbox: "Deactivate Account" / "Freeze Account" / "Delete Account"),
 *   KYC alert (level-3 heading, "Close", "Go to KYC page"), then label/value
 *   pairs (Email, Phone number, ..., Created at).
 * - Payment methods rows: power icon = link to .../<id>/deactivate,
 *   pencil = link to .../<id>/edit. Security: three ant-switch elements.
 */
export class UserDetailsPage {
  readonly main: Locator;
  readonly banner: Locator;
  readonly profile: Locator;
  readonly backButton: Locator;
  readonly overviewTab: Locator;
  readonly paymentMethodsTab: Locator;
  readonly securityTab: Locator;
  readonly editDetailsButton: Locator;
  readonly changeUserTypeButton: Locator;
  readonly moreButton: Locator;
  readonly menuOptions: Locator;
  readonly kycAlertTitle: Locator;
  readonly kycAlertClose: Locator;
  readonly goToKycButton: Locator;
  readonly statusBanner: Locator;
  readonly seeDetailsButton: Locator;
  readonly copyButtons: Locator;
  readonly cardHeadings: Locator;
  // Payment methods tab
  readonly pmHeading: Locator;
  readonly addMethodButton: Locator;
  readonly exportButton: Locator;
  readonly reloadButton: Locator;
  readonly filtersButton: Locator;
  readonly pmTable: Locator;
  readonly pmRows: Locator;
  // Security tab
  readonly mfaHeading: Locator;
  readonly deactivateAllButton: Locator;
  readonly switches: Locator;

  constructor(private readonly page: Page) {
    this.main = page.getByRole('main');
    this.banner = page.getByRole('banner');
    this.profile = this.main.getByRole('complementary');
    this.backButton = this.main.getByRole('button', { name: 'Back to account list' });
    this.overviewTab = this.main.getByRole('button', { name: /^(Products overview|Overview)$/i });
    this.paymentMethodsTab = this.main.getByRole('button', { name: /^Payment methods$/i });
    this.securityTab = this.main.getByRole('button', { name: /^Security$/ });
    this.editDetailsButton = this.profile.getByRole('button', { name: 'Edit details' });
    this.changeUserTypeButton = this.profile.getByRole('button', { name: 'Change user type' });
    this.moreButton = this.profile.getByRole('button', { name: /^(\.\.\.|⋯|More)$/ });
    this.menuOptions = page.getByRole('listbox').filter({ visible: true }).getByRole('option');
    this.kycAlertTitle = this.profile.getByRole('heading', { level: 3 });
    this.kycAlertClose = this.profile.getByRole('button', { name: 'Close' });
    this.goToKycButton = this.profile.getByRole('button', { name: 'Go to KYC page' }).or(this.profile.getByRole('link', { name: 'Go to KYC page' }));
    this.statusBanner = this.main.getByText(/^This account has been \w+!$/);
    this.seeDetailsButton = this.main.getByRole('button', { name: 'See details' });
    this.copyButtons = this.profile.getByRole('button', { name: 'Copy' });
    // Product card titles: level-3 headings outside the profile panel.
    this.cardHeadings = page.locator('main h3:not(aside h3)');
    this.pmHeading = this.main.getByRole('heading', { name: 'Payment methods', level: 1 });
    this.addMethodButton = this.main.getByRole('button', { name: /Add method/ });
    this.exportButton = this.main.getByRole('button', { name: 'Export' });
    this.reloadButton = this.main.getByRole('button', { name: 'reload' });
    this.filtersButton = this.main.getByRole('button', { name: 'Filters' });
    this.pmTable = this.main.getByRole('table');
    this.pmRows = this.pmTable.getByRole('row').filter({ has: page.getByRole('link') });
    this.mfaHeading = this.main.getByRole('heading', { name: 'Multi-Factor Authentication (MFA)' });
    this.deactivateAllButton = this.main.getByRole('button', { name: 'Deactivate all' });
    this.switches = this.main.getByRole('switch');
  }

  async expectLoaded() {
    await expect(this.backButton).toBeVisible({ timeout: 30_000 });
    await expect(this.profile).toBeVisible();
  }

  /** Account path, e.g. "/users/304" (without the tab suffix). */
  basePath() {
    return new URL(this.page.url()).pathname.match(/^\/users\/\d+/)?.[0] ?? '';
  }

  async openTab(tab: 'overview' | 'payment-methods' | 'security') {
    const button = { overview: this.overviewTab, 'payment-methods': this.paymentMethodsTab, security: this.securityTab }[tab];
    await button.click();
    if (tab !== 'overview') await expect(this.page).toHaveURL(new RegExp(`/${tab}`));
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  }

  /** Profile panel lines (innerText), trimmed and non-empty. */
  async profileLines(): Promise<string[]> {
    return (await this.profile.innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
  }

  /** Value next to a label in the profile panel ("Email" -> "a@b.c"). */
  async field(label: string): Promise<string> {
    const lines = await this.profileLines();
    const i = lines.findIndex((l) => l.toLowerCase() === label.toLowerCase());
    if (i >= 0) return lines[i + 1] ?? '';
    const inline = lines.find((l) => l.toLowerCase().startsWith(label.toLowerCase() + ' '));
    return inline ? inline.slice(label.length).trim() : '';
  }

  /** Status word shown next to the username ("confirmed", "frozen", ...). */
  async statusWord(): Promise<string> {
    const text = await this.profile.innerText();
    return text.match(/\b(confirmed|active|frozen|deactivated|deleted)\b/i)?.[1] ?? '';
  }

  /** Full name shown in the panel (line after the avatar initials). */
  async fullName(): Promise<string> {
    const lines = await this.profileLines();
    return lines[1] ?? '';
  }

  async openMenu(button: Locator) {
    await button.click();
    await expect(this.menuOptions.first()).toBeVisible();
  }

  async menuTexts(): Promise<string[]> {
    return (await this.menuOptions.allTextContents()).map((t) => t.trim());
  }

  /** Picks a "..." or Edit details option, case-insensitive. */
  async chooseOption(name: string) {
    await this.menuOptions.filter({ hasText: new RegExp(`^${escapeRegex(name)}$`, 'i') }).first().click();
  }

  /** The product card (box) containing a level-3 heading. */
  card(title: RegExp) {
    return this.main
      .locator('div')
      .filter({ has: this.page.getByRole('heading', { level: 3, name: title }) })
      .filter({ hasText: /Total Balance/i })
      .last();
  }

  /** Payment method rows as { operator, phone, status, date, deactivate, edit }. */
  async paymentMethods() {
    const rows = await this.pmRows.all();
    const out = [];
    for (const r of rows) {
      // innerText: what the agent sees (CSS text-transform applied).
      const cells = (await r.getByRole('cell').allInnerTexts()).map((c) => c.trim());
      out.push({
        row: r,
        operator: cells[0] ?? '',
        phone: cells[1] ?? '',
        status: cells[2] ?? '',
        date: cells[3] ?? '',
        deactivateLink: r.getByRole('link').first(),
        editLink: r.getByRole('link').last(),
      });
    }
    return out;
  }

  /** MFA rows: label + switch state. */
  async mfaStates() {
    const labels = ['Email', /^Authenticator app$/i, 'SMS'] as const;
    const states: { label: string; on: boolean; disabled: boolean }[] = [];
    const sw = await this.switches.all();
    for (let i = 0; i < sw.length; i++) {
      states.push({
        label: String(labels[i] ?? i),
        on: (await sw[i].getAttribute('aria-checked')) === 'true',
        disabled: await sw[i].isDisabled(),
      });
    }
    return states;
  }
}
