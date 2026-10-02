import { test, expect } from '../../src/fixtures/test-fixtures';
import { APP_HOME, type NavGroup } from '../../src/pages/AppShell';

/**
 * Every module page opens from the sidebar and renders its heading.
 * Pages and headings CONFIRMED from codegen (29 Sep 2026).
 */
// viaGroup: the page opens by clicking the group button itself - there is
// no sidebar link with that name (Goal Savings > Account list, per codegen).
const pages: { group: NavGroup | null; link: string; heading: string; description?: RegExp }[] = [
  { group: 'Wallet', link: 'Account list', heading: 'Account list', description: /^The list should show every/ },
  { group: 'Wallet', link: 'Transactions', heading: 'Transactions', description: /^The transaction list covers/ },
  { group: 'Bond investment', link: 'Bonds list', heading: 'Bonds list', description: /^Allow admins and agents to/ },
  { group: 'Bond investment', link: 'Investors', heading: 'Investors list', description: /^Full picture of all/ },
  { group: 'Savings box', link: 'Account list', heading: 'Account list', description: /^Locate the right account/ },
  { group: 'Savings box', link: 'Transactions', heading: 'Transactions', description: /^The transaction list covers/ },
  { group: 'Goal Savings', link: 'Accounts list', heading: 'Goal Savings Accounts', description: /^View the list of goal savings accounts/ },
  { group: 'Goal Savings', link: 'Goals list', heading: 'Goals list', description: /^Let agents locate the right/ },
  { group: null, link: 'User management', heading: 'Accounts', description: /^Let agents locate the right/ },
];

test.describe('Smoke - navigation', { tag: ['@smoke'] }, () => {
  for (const p of pages) {
    test(`NAV ${p.group ?? 'Main'} > ${p.link}`, async ({ shell, page }) => {
      await page.goto(APP_HOME);
      await shell.open(p.group, p.link);
      // Dashboard has no page heading; the breadcrumb in the top bar shows it.
      if (p.link === 'Dashboard') {
        await expect(shell.breadcrumb.getByText('Dashboard')).toBeVisible();
        return;
      }
      await expect(page.getByRole('heading', { name: p.heading, exact: true })).toBeVisible();
      if (p.description) await expect(page.getByText(p.description).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Oops!' })).toBeHidden();
    });
  }

  // Was a known bug ("Oops!" error page, 29 Sep 2026) - FIXED, confirmed 2 Oct 2026.
  test('NAV Kyc & Comp. > KYC Requests', async ({ shell, page }) => {
    await page.goto(APP_HOME);
    await shell.open('Kyc & Comp.', 'KYC Requests');
    await expect(page.getByRole('heading', { name: 'Oops!' })).toBeHidden();
    await expect(page.getByRole('heading', { name: /KYC Requests/i })).toBeVisible();
  });

  test('NAV sidebar collapses and expands', async ({ shell, page }) => {
    await page.goto(APP_HOME);
    await shell.collapseSidebarButton.click();
    await expect(shell.expandSidebarButton).toBeVisible();
    await shell.expandSidebarButton.click();
    await expect(shell.collapseSidebarButton).toBeVisible();
  });
});
