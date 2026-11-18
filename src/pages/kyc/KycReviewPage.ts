import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Verification request review (/kyc/requests/<id>/process, title "Processing
 * the KYC request"). On 14 Oct 2026 this route answered HTTP 500 for every
 * pending request ("Oops! An unexpected error occurred."), so every locator
 * below is INFERRED from Figma (7. Review request, 1946:78501 onwards) and
 * needs one live check once the page loads.
 */
export class KycReviewPage extends BasePage {
  readonly title: Locator;
  readonly counter: Locator;
  readonly question: Locator;
  readonly yes: Locator;
  readonly no: Locator;
  readonly notReadable: Locator;
  readonly saveIt: Locator;
  readonly idReference: Locator;
  readonly issuedDate: Locator;
  readonly expiredDate: Locator;
  readonly problemTitle: Locator;
  readonly checkingDetails: Locator;
  readonly everythingGood: Locator;
  readonly failedCallout: Locator;
  readonly cancel: Locator;
  readonly back: Locator;
  readonly nextDocument: Locator;
  readonly continueButton: Locator;
  readonly confirm: Locator;
  readonly reject: Locator;
  readonly help: Locator;
  readonly front: Locator;
  readonly backSide: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.getByRole('heading', { name: /^(Required documents|Additional documents|Review details)$/ });
    this.counter = page.getByText(/^\d+\/\d+$/).first();
    this.question = page.getByText(/\?$/).first();
    this.yes = page.getByRole('button', { name: /^Yes, it is/ });
    this.no = page.getByRole('button', { name: /^No, (it's not|unreadable|it's expired)/ });
    this.notReadable = page.getByRole('button', { name: /^It's not readable/ });
    this.saveIt = page.getByRole('button', { name: /^Save it/ });
    this.idReference = page.getByPlaceholder(/^ex: /);
    this.issuedDate = page.getByPlaceholder('Choose the ID issued date');
    this.expiredDate = page.getByPlaceholder('Choose the ID expired date');
    this.problemTitle = page.getByText("What's the problem?");
    this.checkingDetails = page.getByText(/checking details$/).first();
    this.everythingGood = page.getByText('Everything is good!');
    this.failedCallout = page.getByText('Verification request failed!');
    this.cancel = page.getByRole('button', { name: 'Cancel', exact: true });
    this.back = page.getByRole('button', { name: 'Back', exact: true });
    this.nextDocument = page.getByRole('button', { name: 'Next document' });
    this.continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    this.confirm = page.getByRole('button', { name: 'Confirm', exact: true });
    this.reject = page.getByRole('button', { name: 'Reject request' });
    this.help = page.getByText('Do you need help?');
    this.front = page.getByRole('button', { name: 'Front', exact: true });
    this.backSide = page.getByRole('button', { name: 'Back', exact: true });
  }

  /** True when the review page shows the app's error page instead of the wizard. */
  async crashed(): Promise<boolean> {
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    return this.page.getByRole('heading', { name: 'Oops!' }).isVisible();
  }

  async expectLoaded() {
    await expect(this.title).toBeVisible({ timeout: 20_000 });
  }

  /** Answers "Yes, it is" n times, waiting for the counter to move each time. */
  async answerYes(n: number) {
    for (let i = 0; i < n; i++) {
      const before = await this.counter.textContent().catch(() => '');
      await this.yes.click();
      await expect.poll(() => this.counter.textContent().catch(() => ''), { timeout: 10_000 }).not.toBe(before);
    }
  }
}
