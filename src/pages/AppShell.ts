import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

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
  readonly breadcrumb: Locator;

  constructor(page: Page) {
    super(page);
    this.nav = page.getByRole('navigation');
    this.collapseSidebarButton = page.getByRole('button', { name: 'Collapse sidebar' });
    this.expandSidebarButton = page.getByRole('button', { name: 'Expand sidebar' });
    // Button's accessible name = initials + full name + email ("RB Rose Bama rose.bama@ejara...").
    this.userMenuButton = page.getByRole('button', { name: /@ejara/ });
    this.breadcrumb = page.getByRole('banner');
  }

  groupButton(group: NavGroup) {
    return this.nav.getByRole('button', { name: group, exact: true });
  }

  async open(group: NavGroup | null, linkName: string) {
    if (!group) {
      await this.nav.getByRole('link', { name: linkName, exact: true }).click();
      return;
    }
    const button = this.groupButton(group);
    const link = button.locator(
      `xpath=following::a[normalize-space(.)=${JSON.stringify(linkName)}][1]`
    );
    const expanded = await button.getAttribute('aria-expanded');
    if (expanded === 'false' || (expanded === null && !(await link.isVisible()))) {
      await button.click();
    }
    await link.click();
  }

  async logout() {
    await this.userMenuButton.click();
    await this.page.getByRole('button', { name: 'Logout' }).click(); // menu item
    await this.page.getByRole('button', { name: 'Logout' }).click(); // confirm dialog
    await expect(this.page).toHaveURL(/\/auth\/login/);
  }
}
