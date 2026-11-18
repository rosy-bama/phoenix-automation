/**
 * Read-only tour of KYC & Comp. (/kyc/...) to align selectors with the live
 * build: Requests tabs, filters, Request preview, the first review question
 * (then Cancel), Account list tabs and the Manual verification first step.
 * Never answers a review question, never clicks Confirm / Reject / Continue
 * past Check user.
 * Run:  npm run snapshot:kyc   (prints to the console, no passwords)
 */
const { chromium } = require('@playwright/test');
require('dotenv').config();

const BASE = (process.env.PHX_BASE_URL || 'https://phoenix-testbox.ejaraapis.xyz').replace(/\/$/, '');
const USER = process.env.PHX_UM_USERNAME || process.env.PHX_WALLET_USERNAME || 'rosetestbox';
const log = (...a) => console.log(...a);
const title = (t) => log(`\n==================== ${t}`);

async function settle(page, ms = 3000) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function aria(page, label, locator = page.getByRole('main')) {
  try {
    log(`--- ${label} (${page.url()})\n` + (await locator.first().ariaSnapshot()).slice(0, 12000));
  } catch (e) {
    log(`!! ${label}: ${e.message.split('\n')[0]}`);
  }
}

/** Visible dialogs / drawers / popovers after an action. */
async function overlays(page, label) {
  const o = page.locator('[role=dialog], [role=menu], .ant-drawer-open, .ant-modal-wrap, .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden)')
    .filter({ visible: true });
  const n = await o.count();
  log(`--- ${label}: ${n} overlay(s)`);
  for (let i = 0; i < n; i++) log((await o.nth(i).ariaSnapshot()).slice(0, 6000));
  if (!n) await aria(page, `${label} (no overlay, main)`);
}

async function tryStep(name, fn) {
  try { await fn(); } catch (e) { log(`!! ${name}: ${e.message.split('\n')[0]}`); }
}

(async () => {
  const browser = await chromium.launch();
  // Reuse the session saved by tests/auth.setup.ts when it is still valid.
  const fs = require('fs');
  const saved = fs.existsSync('.auth/state.json');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(saved ? { storageState: '.auth/state.json' } : {}) });
  const page = await context.newPage();
  await page.goto(BASE + '/kyc/requests', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);
  if (/\/auth\//.test(page.url())) {
    log('Saved session expired: logging in.');
    await page.getByRole('textbox', { name: 'ex: johndoe21' }).fill(process.env.PHX_USERNAME, { timeout: 60000 });
    await page.getByRole('textbox', { name: 'Enter your password...' }).fill(process.env.PHX_PASSWORD);
    await page.getByRole('button', { name: 'Login to your account' }).click();
    const otp = process.env.PHX_OTP || '123456';
    await page.getByRole('textbox', { name: 'OTP Input 1' }).waitFor({ timeout: 90000 });
    for (let i = 0; i < 6; i++) await page.getByRole('textbox', { name: `OTP Input ${i + 1}` }).fill(otp[i]);
    await page.waitForURL(/dashboard/, { timeout: 60000 });
  }


  const main = () => page.getByRole('main');
  const tab = (name) => main().getByRole('button', { name: new RegExp(`^${name}$`) }).or(page.getByRole('tab', { name: new RegExp(`^${name}$`) })).first();

  title('Sidebar');
  await tryStep('sidebar', async () => {
    log(JSON.stringify(await page.getByRole('navigation').getByRole('link').allInnerTexts()));
    log(JSON.stringify(await page.getByRole('navigation').getByRole('button').allInnerTexts()));
  });

  title('Requests (/kyc/requests)');
  await page.goto(BASE + '/kyc/requests', { waitUntil: 'domcontentloaded' });
  await settle(page);
  log('URL:', page.url(), 'title:', await page.title());
  await aria(page, 'requests');

  for (const t of ['Confirmed', 'Rejected', 'Pending']) {
    await tryStep(`tab ${t}`, async () => {
      await tab(t).click();
      await settle(page, 2000);
      log(`tab ${t}: url=${page.url()} counter=${await page.getByText(/^Showing \d+/).first().textContent().catch(() => '-')}`);
      log('headers:', JSON.stringify(await page.getByRole('columnheader').allInnerTexts()));
      log('first rows:', JSON.stringify((await page.getByRole('row').allInnerTexts()).slice(0, 4)));
      log('row buttons:', JSON.stringify((await main().getByRole('row').getByRole('button').allInnerTexts()).slice(0, 4)));
    });
  }

  title('Filters');
  await tryStep('filters', async () => {
    await page.getByRole('button', { name: 'Filters' }).click();
    await settle(page, 1500);
    await overlays(page, 'filter panel');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '×' }).last().click({ timeout: 2000 }).catch(() => {});
  });

  title('Search');
  await tryStep('search', async () => {
    const box = main().getByRole('textbox').first();
    log('search placeholder:', await box.getAttribute('placeholder'));
    await box.fill('zz-no-such-account-000');
    await box.press('Enter');
    await settle(page, 2500);
    await aria(page, 'empty search');
    await box.fill('');
    await box.press('Enter');
    await settle(page, 2500);
  });

  title('Request preview (Pending)');
  await tryStep('preview', async () => {
    await tab('Pending').click();
    await settle(page, 2000);
    const view = main().getByRole('button', { name: /View request/ }).or(main().getByRole('link', { name: /View request/ })).first();
    await view.click();
    await settle(page, 2000);
    log('URL after View request:', page.url());
    await overlays(page, 'preview');
  });

  title('Review (first question only, then Cancel)');
  await tryStep('review', async () => {
    const review = page.getByRole('button', { name: /Review request/ });
    log('Review request buttons:', await review.count());
    if (await review.count()) {
      await review.first().click();
      await settle(page, 3000);
      log('URL:', page.url());
      await aria(page, 'review', page.locator('body'));
      log('buttons:', JSON.stringify(await page.getByRole('button').allInnerTexts()));
      await page.getByRole('button', { name: 'Cancel' }).last().click({ timeout: 3000 }).catch((e) => log('no Cancel:', e.message.split('\n')[0]));
      await settle(page, 2000);
      log('after Cancel URL:', page.url());
      await overlays(page, 'after cancel');
    }
  });

  title('Preview (Confirmed / Rejected)');
  for (const t of ['Confirmed', 'Rejected']) {
    await tryStep(`preview ${t}`, async () => {
      await page.goto(BASE + '/kyc/requests', { waitUntil: 'domcontentloaded' });
      await settle(page);
      await tab(t).click();
      await settle(page, 2000);
      await main().getByRole('button', { name: /View request/ }).or(main().getByRole('link', { name: /View request/ })).first().click();
      await settle(page, 2000);
      await overlays(page, `preview ${t}`);
      await page.keyboard.press('Escape');
    });
  }

  title('Account list');
  await tryStep('account list', async () => {
    await page.getByRole('navigation').getByRole('link', { name: 'Account list' }).last().click().catch(() => {});
    await settle(page);
    log('URL:', page.url());
    await aria(page, 'account list');
    for (const t of ['Fully completed', 'Required only']) {
      await tryStep(`acc tab ${t}`, async () => {
        await tab(t).click();
        await settle(page, 2000);
        log(`tab ${t}: url=${page.url()} counter=${await page.getByText(/^Showing \d+/).first().textContent().catch(() => '-')}`);
        log('headers:', JSON.stringify(await page.getByRole('columnheader').allInnerTexts()));
        log('first rows:', JSON.stringify((await page.getByRole('row').allInnerTexts()).slice(0, 3)));
      });
    }
  });

  title('Manual verification (Check user only)');
  await tryStep('manual', async () => {
    await page.getByRole('button', { name: /Manual verification/ }).click();
    await settle(page, 2000);
    log('URL:', page.url());
    await aria(page, 'manual', page.locator('body'));
    const box = page.getByRole('combobox').or(page.getByRole('textbox')).first();
    await box.click();
    await box.pressSequentially('ma', { delay: 150 });
    await settle(page, 2500);
    await overlays(page, 'autocomplete');
    log('buttons:', JSON.stringify(await page.getByRole('button').allInnerTexts()));
    await page.getByRole('button', { name: 'Cancel' }).last().click({ timeout: 3000 }).catch(() => {});
  });

  await browser.close();
  log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
