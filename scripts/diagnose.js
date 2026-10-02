/**
 * Session diagnostic for Phoenix. Run:  npm run diagnose
 * Prints WHERE the app keeps its login (cookie / localStorage / sessionStorage)
 * and the redirect chain for "/" - names, lengths and URLs only, never token
 * values, so the output is safe to paste back to Claude.
 * Screenshots go to scripts/output/ (gitignored).
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
require('dotenv').config();

const BASE = (process.env.PHX_BASE_URL || 'https://phoenix-testbox.ejaraapis.xyz').replace(/\/$/, '');
const OUT = 'scripts/output';
fs.mkdirSync(OUT, { recursive: true });

function trackNav(page, label) {
  page.on('response', (r) => {
    if (r.request().resourceType() === 'document' && r.request().frame() === page.mainFrame()) {
      const loc = r.headers()['location'];
      console.log(`   [${label}] HTTP ${r.status()} ${r.url()}${loc ? '  ->  ' + loc : ''}`);
    }
  });
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) console.log(`   [${label}] now at ${f.url()}`);
  });
}

async function storageReport(page) {
  return page.evaluate(() => {
    const dump = (s) => Object.keys(s).map((k) => `${k} (${(s.getItem(k) || '').length} chars)`);
    return { localStorage: dump(localStorage), sessionStorage: dump(sessionStorage) };
  });
}

async function probe(browser, label, opts, injectSession) {
  console.log(`\n=== ${label}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  if (injectSession) {
    await ctx.addInitScript((d) => {
      for (const [k, v] of Object.entries(JSON.parse(d))) sessionStorage.setItem(k, v);
    }, injectSession);
  }
  const page = await ctx.newPage();
  trackNav(page, label);
  for (const path of ['/', '/fiat/transactions']) {
    try {
      await page.goto(BASE + path, { timeout: 20000 });
      await page.waitForTimeout(3000);
      const h = await page.getByRole('heading').allInnerTexts().catch(() => []);
      console.log(`   ${path} -> ${page.url()} | headings: ${JSON.stringify(h.slice(0, 3))}`);
    } catch (e) {
      console.log(`   ${path} -> ERROR: ${e.message.split('\n')[0]}`);
    }
  }
  await page.screenshot({ path: `${OUT}/${label.replace(/\W+/g, '-')}.png` });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();

  console.log('=== 1. Fresh login');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  trackNav(page, 'login');
  await page.goto(BASE + '/auth/login');
  await page.getByRole('textbox', { name: 'ex: johndoe21' }).fill(process.env.PHX_USERNAME);
  await page.getByRole('textbox', { name: 'Enter your password...' }).fill(process.env.PHX_PASSWORD);
  await page.getByRole('button', { name: 'Login to your account' }).click();
  const otp = process.env.PHX_OTP || '123456';
  for (let i = 0; i < 6; i++) await page.getByRole('textbox', { name: `OTP Input ${i + 1}` }).fill(otp[i]);
  await page.waitForTimeout(8000);
  console.log(`   Landed on: ${page.url()}`);
  await page.screenshot({ path: `${OUT}/1-after-login.png` });

  const btns = await page.getByRole('button').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50)).filter(Boolean)
  );
  console.log('   Buttons on page:', JSON.stringify(btns));

  const cookies = (await ctx.cookies()).map((c) =>
    `${c.name} domain=${c.domain} path=${c.path} httpOnly=${c.httpOnly} expires=${c.expires === -1 ? 'session' : new Date(c.expires * 1000).toISOString()}`
  );
  console.log('   Cookies:', cookies.length ? '\n     ' + cookies.join('\n     ') : 'none');
  const st = await storageReport(page);
  console.log('   localStorage:', JSON.stringify(st.localStorage));
  console.log('   sessionStorage:', JSON.stringify(st.sessionStorage));

  const state = await ctx.storageState({ indexedDB: true });
  const session = await page.evaluate(() => JSON.stringify(sessionStorage));
  await ctx.close();

  await probe(browser, '2. Reused session (cookies + localStorage only)', { storageState: state });
  await probe(browser, '3. Reused session + sessionStorage', { storageState: state }, session);

  await browser.close();
  console.log('\nDone. Paste everything above back to Claude. Screenshots are in scripts/output/.');
})();