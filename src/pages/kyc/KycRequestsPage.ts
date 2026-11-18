import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FilterPanel } from '../components/FilterPanel';
import { Pagination } from '../components/Pagination';
import { escapeRegex } from '../../utils/text';

/**
 * Kyc & Comp. > KYC Requests (/kyc/requests). CONFIRMED from
 * scripts/snapshot-kyc.js (14 Oct 2026):
 * - heading "KYC Requests", paragraph "View the list of KYC requests"
 *   (Figma: "All verification requests" + the "Let agents locate…" subtitle);
 * - status buttons Pending / Confirmed / Rejected -> ?status=pending|confirmed|rejected;
 * - "reload", textbox "Search KYC requests...", "Filters" (panel with one
 *   "Username" field), "Export";
 * - rows have no "View request" button: the whole row is clickable and opens
 *   the "Request preview" drawer at /kyc/requests/<id>;
 * - "Per page" defaults to 20 (Figma: 8), dates are DD/MM/YYYY HH:mm.
 */
export const KYC_HOME = '/kyc/requests?status=pending';
export type KycStatus = 'Pending' | 'Confirmed' | 'Rejected';

export class KycRequestsPage extends BasePage {
  readonly main: Locator;
  readonly heading: Locator;
  readonly description: Locator;
  readonly table: Locator;
  readonly rows: Locator;
  readonly selectAll: Locator;
  readonly reloadButton: Locator;
  readonly searchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly exportButton: Locator;
  readonly emptyState: Locator;
  readonly filters: FilterPanel;
  readonly pagination: Pagination;
  readonly preview: RequestPreview;

  constructor(page: Page) {
    super(page);
    this.main = page.getByRole('main');
    this.heading = this.main.getByRole('heading', { level: 1 });
    this.description = this.main.getByRole('paragraph').first();
    this.table = this.main.getByRole('table').first();
    // Data rows = rows with a "Select row N" checkbox (no action button on KYC rows).
    this.rows = this.table.getByRole('row').filter({ has: page.getByRole('checkbox', { name: /^(Select row|Row) \d+/ }) });
    this.selectAll = this.table.getByRole('checkbox', { name: 'Select all' });
    this.reloadButton = this.main.getByRole('button', { name: 'reload' });
    this.searchInput = this.main.getByRole('textbox', { name: /^Search/ }).first();
    this.clearSearchButton = this.main.getByRole('button', { name: 'close-circle' });
    this.exportButton = this.main.getByRole('button', { name: 'Export' });
    this.emptyState = this.table.getByText('No data', { exact: true }).last();
    this.filters = new FilterPanel(page);
    this.pagination = new Pagination(page);
    this.preview = new RequestPreview(page);
  }

  tab(name: KycStatus) {
    return this.main.getByRole('button', { name, exact: true });
  }

  tabs() {
    return (['Pending', 'Confirmed', 'Rejected'] as const).map((t) => this.tab(t));
  }

  async open(status: Lowercase<KycStatus> = 'pending') {
    await this.goto(`/kyc/requests?status=${status}`);
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    await this.settle();
  }

  /** Waits for the list to re-render; reports the app error page plainly. */
  async settle() {
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await this.page.waitForTimeout(1_500);
    if (await this.page.getByRole('heading', { name: 'Oops!' }).isVisible()) {
      throw new Error('App crashed: "Oops! An unexpected error occurred." page shown instead of the KYC list');
    }
    await this.table.waitFor({ state: 'visible' });
  }

  async headers(): Promise<string[]> {
    return (await this.table.getByRole('columnheader').allTextContents()).map((h) => h.trim()).filter(Boolean);
  }

  /** Text of one column for every data row. */
  async column(name: string): Promise<string[]> {
    const headers = (await this.table.getByRole('columnheader').allTextContents()).map((h) => h.trim().toLowerCase());
    const index = headers.indexOf(name.toLowerCase());
    if (index < 0) throw new Error(`No column "${name}" (columns: ${headers.join(', ')})`);
    const values: string[] = [];
    for (const row of await this.rows.all()) values.push(((await row.getByRole('cell').nth(index).textContent()) ?? '').trim());
    return values;
  }

  async search(term: string) {
    await this.searchInput.fill(term);
    await this.searchInput.press('Enter');
    await this.settle();
  }

  row(username: string) {
    return this.rows.filter({ has: this.page.getByRole('cell', { name: `@${username.replace(/^@/, '')}`, exact: true }) });
  }

  /** Opens the Request preview of the n-th data row (0-based) and returns its username. */
  async openRow(n = 0): Promise<string> {
    const row = this.rows.nth(n);
    const username = ((await row.getByRole('cell').nth(1).textContent()) ?? '').trim();
    await row.getByRole('cell').nth(1).click();
    await this.preview.waitOpen();
    return username;
  }
}

/**
 * "Request preview" drawer. CONFIRMED 14 Oct 2026 for Pending requests:
 * Current submission + status, Submission date, Requested by, Current KYC
 * status, Reviewed by/date (resubmissions), "Personal informations" (First
 * name … Citizenship, ID Reference, ID issue date, ID expired date), document
 * images named "<Doc> front"/"<Doc> back" (UIN, Selfie, National Identity
 * Card, Proof of residence) with the earlier rejection message under a
 * rejected document, and "Review request". Confirmed/Rejected previews were
 * empty (heading and × only).
 */
export class RequestPreview {
  readonly heading: Locator;
  readonly root: Locator;
  readonly closeButton: Locator;
  readonly reviewButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Request preview' });
    this.root = page.locator('div').filter({ has: this.heading }).filter({ has: page.getByRole('button', { name: '×' }) }).last();
    this.closeButton = this.root.getByRole('button', { name: '×' });
    this.reviewButton = page.getByRole('button', { name: 'Review request' });
  }

  async waitOpen() {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await this.page.waitForTimeout(1_000);
  }

  async text(): Promise<string> {
    return ((await this.root.innerText()) ?? '').replace(/\s*\n+\s*/g, '\n');
  }

  /** Value printed after a label ("Submission date" -> "30/09/2026 16:42"), or null. */
  async value(label: string): Promise<string | null> {
    const lines = (await this.text()).split('\n');
    const i = lines.findIndex((l) => l.trim() === label);
    return i >= 0 && i + 1 < lines.length ? lines[i + 1].trim() : null;
  }

  image(name: string | RegExp) {
    return this.root.getByRole('img', { name: typeof name === 'string' ? new RegExp(`^${escapeRegex(name)}`) : name });
  }

  async imageNames(): Promise<string[]> {
    return this.root.getByRole('img').evaluateAll((els) => els.map((e) => e.getAttribute('alt') ?? '').filter(Boolean));
  }
}
