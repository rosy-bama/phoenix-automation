import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe } from '../../src/utils/tc';

/** Plan section 17 - Cross-cutting consistency. */
test.describe('User management - 17. Cross-cutting', () => {
  test('USR-XCT-002 one date format across the module', tc('USR-XCT-002'), async ({ usersList: l, userDetails: d, userFlow: f }) => {
    await l.openAccount(env.umUsername);
    const createdAt = await d.field('Created at');
    await d.openTab('payment-methods');
    const pmDate = (await d.paymentMethods())[0]?.date ?? '';
    await d.openTab('overview');
    await d.openMenu(d.moreButton);
    await d.chooseOption('Freeze account');
    await f.fillReason('Automation check - not submitted');
    await f.toReview();
    const reviewDate = await f.value('Date');
    const shape = (x: string) => x.replace(/[A-Za-z]{3}/, 'Mon').replace(/\d/g, '9');
    observe(`Created at "${createdAt}"; payment method "${pmDate}"; review "${reviewDate}"`);
    const shapes = new Set([createdAt, pmDate, reviewDate].filter(Boolean).map(shape));
    expect(shapes.size, `formats: ${[...shapes].join(' vs ')}`).toBe(1);
  });

  test('USR-XCT-006 User management is a single sidebar link', tc('USR-XCT-006'), async ({ usersList: l, page }) => {
    await l.open();
    const nav = page.getByRole('navigation');
    const link = nav.getByRole('link', { name: 'User management' });
    const isButton = await nav.getByRole('button', { name: 'User management' }).count();
    observe(`Link ${await link.count()}, group button ${isButton}, href ${await link.getAttribute('href')}`);
    await expect(link).toHaveCount(1);
    expect(isButton).toBe(0);
  });

  test('USR-XCT-011 Review callouts are not TOTP copy', tc('USR-XCT-011'), async ({ usersList: l, userDetails: d, userFlow: f, page }) => {
    const out: string[] = [];
    for (const flow of ['Deactivate', 'Freeze', 'Delete'] as const) {
      await l.openAccount(env.umUsername);
      await d.openMenu(d.moreButton);
      await d.chooseOption(`${flow} account`);
      await f.expectOpen();
      if (flow === 'Delete') {
        await f.primaryButton.click();
        await expect(page).toHaveURL(/\/reason$/);
        await f.radios.first().check();
      } else {
        await f.fillReason('Automation check - not submitted');
      }
      await f.toReview();
      const info = await f.infoText();
      out.push(`${flow}: "${info.slice(0, 90)}"`);
      expect.soft(info, flow).not.toMatch(/TOTP/i);
    }
    observe(out.join('; '));
  });

  test('USR-XCT-012 one status word per state', tc('USR-XCT-012'), async ({ usersList: l, userDetails: d }) => {
    await l.open();
    const tab = ((await l.firstTab.textContent()) ?? '').trim();
    await l.openAccount(env.umUsername);
    const badge = await d.statusWord();
    const wallet = ((await d.card(/^Wallet$/).innerText()).match(/Status\s*(\w+)/) ?? [])[1] ?? '';
    observe(`List tab "${tab}", profile badge "${badge}", wallet card status "${wallet}"`);
    expect(tab.toLowerCase()).toBe(badge.toLowerCase());
  });
});
