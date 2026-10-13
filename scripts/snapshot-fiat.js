/**
 * Inspects the Fiat Wallet parts the 2 Oct 2026 run could not match:
 * filter dropdowns, page-size control, Export, Freeze message, empty state.
 * Run:  npm run snapshot:fiat   (prints to the console, no passwords)
 */
const { chromium } = require('@playwright/test');
require('dotenv').config();

const BASE = (process.env.PHX_BASE_URL || 'https://phoenix-testbox.ejaraapis.xyz').replace(/\/$/, '');
const USER = process.env.PHX_WALLET_USERNAME || 'rosetestbox';
const log = (...a) => console.log(...a);
const title = (t) => log(`\n==================== ${t}`);

async function settle(page, ms = 4000) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/** Tag, class and options of the "Per page" control. */
async function perPage(page) {
  const el = page.getByRole('combobox', { name: 'Per page' }).first();
  if (!(await el.count())) return log('!! no combobox "Per page"');
  log('Per page:', JSON.stringify(await el.evaluate((e) => ({
    tag: e.tagName, cls: e.className, value: e.value,
    options: [...(e.options || [])].map((o) => o.value + '=' + o.textContent.trim()),
  }))));
}

/** Opens the filter panel and lists each select's options and DOM shape. */
async function filterSelects(page) {
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('heading', { name: 'Filter by' }).waitFor();
  const panel = page.locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Filter by' }) })
    .filter({ has: page.getByRole('button', { name: 'Apply filters' }) }).last();
  const boxes = await panel.getByRole('combobox').all();
  log(`${boxes.length} combobox(es) in panel`);
  for (const [i, box] of boxes.entries()) {
    log(`-- combobox ${i}:`, JSON.stringify(await box.evaluate((e) => ({
      tag: e.tagName, id: e.id, cls: e.className,
      wrapper: e.closest('[class*="select"]')?.className,
      ariaControls: e.getAttribute('aria-controls'),
    }))));
    await box.click({ force: true });
    await page.waitForTimeout(1200);
    const dd = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    log('   ant dropdown visible:', await dd.count());
    log('   role=option:', JSON.stringify(await page.getByRole('option').filter({ visible: true }).allInnerTexts()));
    log('   .ant-select-item-option:', JSON.stringify(await dd.locator('.ant-select-item-option').allInnerTexts()));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  log('Date fields:', JSON.stringify(await panel.getByRole('textbox').evaluateAll((els) =>
    els.map((e) => ({ placeholder: e.placeholder, aria: e.getAttribute('aria-label'), cls: e.className })))));
  await panel.getByRole('button', { name: '×' }).click();
}

async function clickAndWatch(page, name, locator) {
  const downloads = [];
  const popups = [];
  const requests = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  page.context().on('page', (p) => popups.push(p.url()));
  const onReq = (r) => { if (!/\.(js|css|png|svg|woff2?)(\?|$)/.test(r.url())) requests.push(`${r.method()} ${r.url()}`); };
  page.on('request', onReq);
  const before = await page.locator('body').innerText();
  await locator.click();
  await page.waitForTimeout(6000);
  page.off('request', onReq);
  const after = await page.locator('body').innerText();
  const added = after.split('\n').filter((l) => l.trim() && !before.includes(l)).slice(0, 25);
  log(`${name}: downloads=${JSON.stringify(downloads)} popups=${JSON.stringify(popups)}`);
  log(`${name}: requests=${JSON.stringify(requests.slice(0, 15), null, 1)}`);
  log(`${name}: new text on page=${JSON.stringify(added, null, 1)}`);
  const dialog = page.getByRole('dialog').filter({ visible: true });
  if (await dialog.count()) log(`${name}: dialog=\n` + (await dialog.first().ariaSnapshot()));
  const tip = page.locator('[role=tooltip], .ant-tooltip:not(.ant-tooltip-hidden), .ant-popover:not(.ant-popover-hidden), .ant-message, .ant-notification')
    .filter({ visible: true });
  if (await tip.count()) log(`${name}: tooltip/message=${JSON.stringify(await tip.allInnerTexts())}`);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(BASE + '/auth/login');
  await page.getByRole('textbox', { name: 'ex: johndoe21' }).fill(process.env.PHX_USERNAME);
  await page.getByRole('textbox', { name: 'Enter your password...' }).fill(process.env.PHX_PASSWORD);
  await page.getByRole('button', { name: 'Login to your account' }).click();
  const otp = process.env.PHX_OTP || '123456';
  for (let i = 0; i < 6; i++) await page.getByRole('textbox', { name: `OTP Input ${i + 1}` }).fill(otp[i]);
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  title('Account list (/fiat/accounts)');
  await page.goto(BASE + '/fiat/accounts');
  await settle(page);
  await perPage(page);
  await filterSelects(page).catch((e) => log('!! filters:', e.message));

  title('Account list - empty state');
  await page.getByRole('textbox', { name: 'Search account...' }).fill('zz-no-such-account-000');
  await page.getByRole('textbox', { name: 'Search account...' }).press('Enter');
  await settle(page, 3000);
  const nodata = page.getByText('No data', { exact: true });
  log('"No data" matches:', JSON.stringify(await nodata.evaluateAll((els) =>
    els.map((e) => ({ tag: e.tagName, cls: e.className, visible: !!e.offsetParent })))));

  title('Account list - page size');
  await page.goto(BASE + '/fiat/accounts');
  await settle(page);
  try {
    await page.getByRole('combobox', { name: 'Per page' }).selectOption('10');
    await settle(page, 2000);
    log('after selectOption(10): rows =', await page.getByRole('button', { name: 'See details' }).count());
  } catch (e) { log('!! selectOption:', e.message.split('\n')[0]); }

  title(`Account details (@${USER})`);
  await page.goto(BASE + '/fiat/accounts');
  await settle(page);
  await page.getByRole('textbox', { name: 'Search account...' }).fill(USER);
  await page.getByRole('textbox', { name: 'Search account...' }).press('Enter');
  await settle(page, 3000);
  await page.getByRole('row').filter({ hasText: `@${USER}` }).first().getByRole('button', { name: 'See details' }).click();
  await page.getByText('Transactions summary', { exact: true }).waitFor();
  await settle(page);
  log('URL:', page.url());
  await perPage(page);
  const typeSelect = page.getByRole('main').locator('select').first();
  if (await typeSelect.count()) {
    log('Type <select>:', JSON.stringify(await typeSelect.evaluate((e) =>
      [...e.options].map((o) => o.value + '=' + o.textContent.trim()))));
  }
  await filterSelects(page).catch((e) => log('!! filters:', e.message));
  await clickAndWatch(page, 'FREEZE', page.getByRole('button', { name: 'Freeze account' }));
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await settle(page, 1000);
  await clickAndWatch(page, 'EXPORT (details)', page.getByRole('button', { name: 'Export' }));
  await page.keyboard.press('Escape');

  title('Transactions (/fiat/transactions)');
  await page.goto(BASE + '/fiat/transactions');
  await settle(page);
  await perPage(page);
  await filterSelects(page).catch((e) => log('!! filters:', e.message));

  await browser.close();
  log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
