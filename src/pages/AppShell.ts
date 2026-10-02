import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { escapeRegex } from '../utils/text';

/**
 * Entry page for every logged-in test. NOT '/': on 2 Oct 2026 opening '/'
 * gave ERR_TOO_MANY_REDIRECTS, while /fiat/transactions loaded.
 */
export const APP_HOME = '/dashboard';

/** Page URLs CONFIRMED by scripts/snapshot.js (2 Oct 2026). */
export const ROUTES = {
  dashboard: '/dashboard',
  fiatAccounts: '/fiat/accounts',
  fiatTransactions: '/fiat/transactions',
  bonds: '/bi/bonds',
  investors: '/bi/investors',
  kycRequests: '/kyc/requests',
  users: '/users',
  // TODO: Savings box and Goal Savings URLs (not captured yet)
} as const;
export type NavGroup = 'Wallet' | 'Bond investment' | 'Savings box' | 'Goal Savings' | 'Kyc & Comp.';

/**
 * Sidebar + top bar. CONFIRMED from codegen: groups are buttons inside the
 * <nav>; pages are links. Dashboard and User management are top-level links.
 * Link names repeat across groups ("Account list", "Transactions"), so a link
 * is always resolved as the first matching link AFTER its group button.
 *
 * INFERRED: whether a group button carries aria-expanded. If it doesn't, we
 * click the group only when its link isn't already visible.
 * TODO (Rose): send the URL of each page - direct goto() is faster and more
 * robust than clicking through the sidebar.
 */
export class AppShell extends BasePage {
  readonly nav: Locator;
  readonly collapseSidebarButton: Locator;
  readonly expandSidebarButton: Locator;
  readonly userMenuButton: Locator;
  readonly logoutMenuItem: Locator;
  readonly confirmLogoutButton: Locator;
  readonly cancelLogoutButton: Locator;
  readonly breadcrumb: Locator;

  constructor(page: Page) {
    super(page);
    this.nav = page.getByRole('navigation');
    this.collapseSidebarButton = page.getByRole('button', { name: 'Collapse sidebar' });
    this.expandSidebarButton = page.getByRole('button', { name: 'Expand sidebar' });
    // CONFIRMED 2 Oct 2026 (DevTools): the user menu trigger is NOT a button.
    // It's an avatar + name + email block with a chevron <svg> (role image,
    // no name, not keyboard-focusable). We click the email text; the click
    // bubbles up to the element that opens the menu.
    this.userMenuButton = page.getByRole('banner').getByText(/\S+@\S+\.\S+/).first();
    this.logoutMenuItem = page
      .getByRole('menuitem', { name: 'Logout' })
      .or(page.getByRole('button', { name: 'Logout' }))
      .or(page.getByText('Logout', { exact: true }))
      .first();
    // The confirm dialog has its own "Logout" button - always the last one on the page.
    this.confirmLogoutButton = page.getByRole('button', { name: 'Logout' }).last();
    this.cancelLogoutButton = page.getByRole('button', { name: 'Cancel' }).last();
    this.breadcrumb = page.getByRole('banner');
  }

  groupButton(group: NavGroup) {
    return this.nav.getByRole('button', { name: group, exact: true });
  }

    /**
   * CONFIRMED (snapshot, 2 Oct 2026): the sidebar is an ACCORDION - only one
   * group's links are shown at a time, and clicking a group button toggles it
   * (and may also navigate to the group's first page). So: if the wanted link
   * isn't visible, click the group; if it's still not visible (we just
   * collapsed an open group), click once more. Then click the visible link.
   */
  async open(group: NavGroup | null, linkName: string) {
    const link = this.nav
      .getByRole('link', { name: new RegExp(`^\\s*${escapeRegex(linkName)}\\s*$`, 'i') })
      .filter({ visible: true });
    if (!group) {
      await link.first().click();
      return;
    }
    const button = this.groupButton(group);
    const appears = (ms: number) =>
      link.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
    // Click once and give the group time to expand (Goal Savings is slow -
    // 500 ms was not enough, 2 Oct 2026). Only if the link still hasn't shown
    // do we assume we collapsed an already-open group and click again.
    await button.click();
    if (!(await appears(5_000))) {
      await button.click();
      await expect(link.first()).toBeVisible();
    }
    await link.first().click();
  }

  async logout() {
    await this.userMenuButton.click();
    await this.logoutMenuItem.click();
    await this.confirmLogoutButton.click();
    await expect(this.page).toHaveURL(/\/auth\/login/);
  }
}
