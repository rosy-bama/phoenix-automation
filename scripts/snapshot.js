/**
 * Prints what Playwright "sees" on key Phoenix pages: URL, headings, and the
 * accessibility tree of the sidebar and main area. Run:  npm run snapshot
 * Paste the whole output back to Claude. Contains testbox usernames, no passwords.
 */
const { chromium } = require('@playwright/test');
require('dotenv').config();

const BASE = (process.env.PHX_BASE_URL || 'https://phoenix-testbox.ejaraapis.xyz').replace(/\/$/, '');
const cut = (s, n) => s.split('\n').slice(0, n).join('\n');

async function report(page, label) {
  await page.waitForTimeout(6000);
  console.log(`\n==================== ${label}`);
  console.log('URL:', page.url());
  const headings = await page.locator('h1,h2,h3,h4,[role=heading]').evaluateAll((els) =>
    els.map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? '[role=' + e.getAttribute('role') + ']' : ''}: ${e.textContent.trim().slice(0, 60)}`)
  );
  console.log('Heading tags:', JSON.stringify(headings));
  const main = page.getByRole('main');
  const target = (await main.count()) ? main.first() : page.locator('body');
  console.log('--- main (first 45 lines)');
  console.log(cut(await target.ariaSnapshot().catch((e) => 'ERR ' + e.message), 45));
}

async function openFromSidebar(page, group, link) {
  await page.goto(BASE + '/dashboard');
  await page.waitForTimeout(3000);
  const nav = page.getByRole('navigation');
  const linkLoc = nav.getByRole('link', { name: link, exact: true });
  if (!(await linkLoc.first().isVisible())) {
    await nav.getByRole('button', { name: group, exact: true }).click();
  }
  // Pick the visible link right after the group button.
  const candidates = await linkLoc.all();
  for (const c of candidates) {
    if (await c.isVisible()) { await c.click(); return; }
  }
  console.log(`!! no visible link "${link}" after opening "${group}"`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + '/auth/login');
  await page.getByRole('textbox', { name: 'ex: johndoe21' }).fill(process.env.PHX_USERNAME);
  await page.getByRole('textbox', { name: 'Enter your password...' }).fill(process.env.PHX_PASSWORD);
  await page.getByRole('button', { name: 'Login to your account' }).click();
  const otp = process.env.PHX_OTP || '123456';
  for (let i = 0; i < 6; i++) await page.getByRole('textbox', { name: `OTP Input ${i + 1}` }).fill(otp[i]);
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  // Sidebar with every group expanded
  for (const g of ['Wallet', 'Bond investment', 'Savings box', 'Goal Savings', 'Kyc & Comp.']) {
    const b = page.getByRole('navigation').getByRole('button', { name: g, exact: true });
    if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click().catch(() => {});
  }
  await page.waitForTimeout(1000);
  console.log('==================== SIDEBAR (all groups clicked once)');
  console.log(await page.getByRole('navigation').ariaSnapshot());

  await page.goto(BASE + '/fiat/transactions');
  await report(page, 'Direct: /fiat/transactions (FW-8.01)');

  await openFromSidebar(page, 'Wallet', 'Account list');
  await report(page, 'Sidebar: Wallet > Account list');

  await openFromSidebar(page, 'Bond investment', 'Bonds list');
  await report(page, 'Sidebar: Bond investment > Bonds list (FAILS)');

  await openFromSidebar(page, 'Bond investment', 'Investors');
  await report(page, 'Sidebar: Bond investment > Investors (PASSES - for comparison)');

  await browser.close();
  console.log('\nDone. Paste everything above back to Claude.');
})();