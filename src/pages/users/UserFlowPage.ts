import { Page, Locator, expect } from '@playwright/test';

/**
 * Full-page manual operations of User management (Deactivate / Freeze /
 * Delete / Activate account, Update email / phone, Add / Edit / Deactivate
 * payment method, Deactivate 2FA). CONFIRMED from snapshots (13 Oct 2026):
 * - banner: "/ @<username> / <Flow name>", "Do you need help?", close (X).
 * - stepper: the <aside> with text, e.g. "Reason for deactivation — Review & verify".
 * - main: level-1 heading, a subtitle paragraph, "* Reason" textbox,
 *   level-3 info/warning heading + paragraph.
 * - footer (contentinfo): Cancel / Review details, then Back / <confirm>.
 * - Review URL: .../<flow>/<uuid>/verify (a draft; nothing is applied until
 *   the confirm button).
 */
export class UserFlowPage {
  readonly banner: Locator;
  readonly main: Locator;
  readonly stepper: Locator;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly reason: Locator;
  readonly infoTitle: Locator;
  readonly footer: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;
  readonly primaryButton: Locator;
  readonly helpButton: Locator;
  readonly closeButton: Locator;
  readonly radios: Locator;
  readonly switches: Locator;

  constructor(private readonly page: Page) {
    this.banner = page.getByRole('banner');
    this.main = page.getByRole('main');
    this.stepper = page.getByRole('complementary').filter({ hasText: /\S/ }).first();
    this.heading = this.main.getByRole('heading', { level: 1 });
    this.subtitle = this.main.getByRole('paragraph').first();
    this.reason = this.main.getByRole('textbox', { name: /reason/i });
    this.infoTitle = this.main.getByRole('heading', { level: 3 });
    this.footer = page.getByRole('contentinfo');
    this.cancelButton = this.footer.getByRole('button', { name: 'Cancel' });
    this.backButton = this.footer.getByRole('button', { name: 'Back' });
    this.primaryButton = this.footer.getByRole('button').last();
    this.helpButton = this.banner.getByRole('button', { name: 'Do you need help?' });
    this.closeButton = this.banner.getByRole('button').last();
    this.radios = this.main.getByRole('radio');
    this.switches = this.main.getByRole('switch');
  }

  async expectOpen() {
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    await expect(this.footer).toBeVisible();
  }

  /** Breadcrumb text, e.g. "/ @rosetestbox / Deactivate Account". */
  async breadcrumb() {
    return (await this.banner.innerText()).replace(/\s+/g, ' ').replace(/Do you need help\?/, '').trim();
  }

  async stepperText() {
    return (await this.stepper.innerText()).replace(/\s+/g, ' ').trim();
  }

  async footerButtons(): Promise<string[]> {
    return (await this.footer.getByRole('button').allTextContents()).map((t) => t.trim());
  }

  /** Title + body of the info/warning box (parent of the level-3 heading). */
  async infoText() {
    const box = this.infoTitle.first().locator('xpath=..');
    return (await box.innerText({ timeout: 10_000 })).replace(/\s+/g, ' ').trim();
  }

  /** Main text lines (Review step label/value pairs come out as lines). */
  async lines(): Promise<string[]> {
    return (await this.main.innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
  }

  /** Review value next to a label ("Action" -> "Deactivate Account"). */
  async value(label: string): Promise<string> {
    const lines = await this.lines();
    const i = lines.findIndex((l) => l.toLowerCase() === label.toLowerCase());
    if (i >= 0) return lines[i + 1] ?? '';
    const inline = lines.find((l) => l.toLowerCase().startsWith(label.toLowerCase() + ' ') || l.toLowerCase().startsWith(label.toLowerCase() + '\t'));
    return inline ? inline.slice(label.length).trim() : '';
  }

  async fillReason(text: string) {
    await this.reason.first().fill(text);
  }

  /** Clicks the primary button and waits for the Review step. */
  async toReview() {
    await this.primaryButton.click();
    await expect(this.page).toHaveURL(/\/verify|\/review/, { timeout: 30_000 });
    await expect(this.heading).toHaveText(/review/i);
  }
}
