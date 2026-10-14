/**
 * Read-only tour of User Management (/users) to align selectors with the
 * live build: list tabs, filters, account details tabs, the "..." menu and
 * the Edit details / Add method panels (opened, then cancelled).
 * Never clicks MFA toggles, power icons or a final confirm button.
 * Run:  npm run snapshot:users   (prints to the console, no passwords)
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
  await page.goto(BASE + '/users', { waitUntil: 'domcontentloaded', timeout: 60000 });
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

  title('Accounts list (/users)');
  await page.goto(BASE + '/users', { waitUntil: 'domcontentloaded' });
  await settle(page);
  await aria(page, 'list');
  log('title:', await page.title());

  for (const tab of ['Frozen', 'Deactivated', 'Deleted', 'Active']) {
    await tryStep(`tab ${tab}`, async () => {
      await page.getByRole('main').getByRole('button', { name: new RegExp(`^${tab}`) }).or(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).first().click();
      await settle(page, 2000);
      log(`tab ${tab}: url=${page.url()} rows=${await page.getByRole('button', { name: 'See details' }).count()} counter=${await page.getByText(/^Showing \d+/).first().textContent().catch(() => '-')}`);
      log('first rows:', JSON.stringify((await page.getByRole('row').allInnerTexts()).slice(0, 4)));
    });
  }

  title('Filters');
  await tryStep('filters', async () => {
    await page.getByRole('button', { name: 'Filters' }).click();
    await settle(page, 1500);
    await overlays(page, 'filter panel');
    const panel = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Filter by' }) }).filter({ has: page.getByRole('button', { name: 'Apply filters' }) }).last();
    for (const [i, box] of (await panel.getByRole('combobox').all()).entries()) {
      await box.click({ force: true });
      await page.waitForTimeout(1200);
      log(`combobox ${i} options:`, JSON.stringify(await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').allInnerTexts()));
      await page.keyboard.press('Escape');
    }
    log('Apply enabled:', await page.getByRole('button', { name: 'Apply filters' }).isEnabled());
    await panel.getByRole('button', { name: '×' }).click();
  });

  title('Search');
  await tryStep('search', async () => {
    const box = page.getByRole('main').getByRole('textbox').first();
    log('search placeholder:', await box.getAttribute('placeholder'));
    await box.fill('zz-no-such-account-000');
    await box.press('Enter');
    await settle(page, 2500);
    await aria(page, 'empty search');
    await box.fill(USER);
    await box.press('Enter');
    await settle(page, 2500);
    log('rows for', USER, JSON.stringify(await page.getByRole('row').allInnerTexts()));
  });

  title(`Account details (@${USER})`);
  await page.getByRole('button', { name: 'See details' }).first().click();
  await settle(page);
  log('URL:', page.url(), 'title:', await page.title());
  await aria(page, 'details - default tab');
  await aria(page, 'banner', page.getByRole('banner'));

  for (const tab of ['Payment methods', 'Security', 'Products overview']) {
    await tryStep(`details tab ${tab}`, async () => {
      await page.getByRole('main').getByRole('button', { name: tab }).or(page.getByRole('tab', { name: tab })).first().click();
      await settle(page, 2000);
      await aria(page, `details tab ${tab}`);
    });
  }

  title('"..." menu');
  await tryStep('more menu', async () => {
    const more = page.getByRole('main').getByRole('button', { name: /more|\.\.\.|⋯|options/i });
    log('more buttons:', await more.count());
    const buttons = await page.getByRole('main').getByRole('button').evaluateAll((els) =>
      els.map((e) => `${e.getAttribute('aria-label') || ''}|${e.textContent.trim().slice(0, 30)}|${e.disabled}`));
    log('all buttons in main:', JSON.stringify(buttons));
  });

  title('Edit details panel (cancelled)');
  await tryStep('edit details', async () => {
    await page.getByRole('button', { name: 'Edit details' }).click();
    await settle(page, 1500);
    await overlays(page, 'edit details');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Cancel' }).last().click({ timeout: 3000 }).catch(() => {});
    await settle(page, 1000);
  });

  title('Add method panel (cancelled)');
  await tryStep('add method', async () => {
    await page.getByRole('main').getByRole('button', { name: 'Payment methods' }).first().click();
    await settle(page, 2000);
    const add = page.getByRole('button', { name: /Add method/ });
    log('Add method enabled:', await add.isEnabled());
    if (await add.isEnabled()) {
      await add.click();
      await settle(page, 1500);
      await overlays(page, 'add method');
      await page.getByRole('button', { name: 'Cancel' }).last().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
    }
  });

  title('Deactivated account details');
  await tryStep('deactivated', async () => {
    await page.goto(BASE + '/users', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('main').getByRole('button', { name: /^Deactivated/ }).or(page.getByRole('tab', { name: /^Deactivated/ })).first().click();
    await settle(page, 2000);
    if (await page.getByRole('button', { name: 'See details' }).count()) {
      await page.getByRole('button', { name: 'See details' }).first().click();
      await settle(page);
      await aria(page, 'deactivated details');
    } else log('no deactivated accounts');
  });

  title('Frozen account details');
  await tryStep('frozen', async () => {
    await page.goto(BASE + '/users', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('main').getByRole('button', { name: /^Frozen/ }).or(page.getByRole('tab', { name: /^Frozen/ })).first().click();
    await settle(page, 2000);
    if (await page.getByRole('button', { name: 'See details' }).count()) {
      await page.getByRole('button', { name: 'See details' }).first().click();
      await settle(page);
      await aria(page, 'frozen details');
    } else log('no frozen accounts');
  });

  await browser.close();
  log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
