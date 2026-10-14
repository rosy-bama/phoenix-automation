import { test, expect } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { tc } from '../../src/test-plan/tags';
import { observe, blocked, unmet, DESIGN } from '../../src/utils/tc';
import { selectedIndex, crashed } from '../../src/utils/ui';

/** Plan sections 1-2 - Accounts list and filters (Figma 1148:90703). */
test.describe('User management - 1. Accounts list', () => {
  test.beforeEach(async ({ usersList }) => {
    await usersList.open();
  });

  test('USR-LST-001 heading, subtitle and sidebar route', tc('USR-LST-001'), async ({ usersList: l, page }) => {
    await expect(l.heading).toBeVisible();
    await expect(l.description).toHaveText('Let agents locate the right user quickly, with enough summary information to triage before opening the full account detail.');
    // Sidebar link = bare /users.
    await page.getByRole('navigation').getByRole('link', { name: 'User management' }).click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const oops = await crashed(page);
    observe(`Sidebar "User management" -> ${new URL(page.url()).pathname}${new URL(page.url()).search}: ${oops ? '"Oops! An unexpected error occurred." (GET /users = 500)' : 'Accounts list'}`);
    expect(oops, 'sidebar link opens the list, not the error page').toBe(false);
    await expect(l.heading).toBeVisible(DESIGN);
  });

  test('USR-LST-003 four status tabs, first selected by default', tc('USR-LST-003'), async ({ usersList: l }) => {
    const labels = (await l.main.getByRole('button').allTextContents()).map((t) => t.trim()).filter((t) => /^(Active|Confirmed|Frozen|Deactivated|Deleted)$/.test(t));
    observe(`Tabs: ${labels.join(', ')}; selected index ${await selectedIndex(l.tabs())}`);
    expect(labels.slice(1)).toEqual(['Frozen', 'Deactivated', 'Deleted']);
    expect(await selectedIndex(l.tabs())).toBe(0);
    expect.soft(labels[0], 'first tab label (Figma "Active")').toBe('Active');
  });

  test('USR-LST-004 table columns in order', tc('USR-LST-004'), async ({ usersList: l }) => {
    const headers = await l.table.headers();
    observe(`Columns: ${headers.join(', ')}`);
    expect(headers.map((h) => h.toLowerCase())).toEqual(['username', 'full name', 'email address', 'phone number', 'country', 'action']);
    await expect(l.table.selectAll, 'select-all checkbox in the first column').toBeVisible();
  });

  test('USR-LST-005 every row has See details', tc('USR-LST-005'), async ({ usersList: l }) => {
    const rows = await l.table.table.getByRole('row').count();
    const withAction = await l.table.rows.count();
    observe(`${withAction} of ${rows - 1} data rows have "See details"`);
    expect(withAction).toBeGreaterThan(0);
    expect(withAction).toBe(rows - 1);
  });

  for (const [id, name] of [['USR-LST-006', 'Frozen'], ['USR-LST-007', 'Deactivated'], ['USR-LST-007', 'Deleted']] as const) {
    test(`${id} ${name} tab shows only ${name.toLowerCase()} accounts`, tc(id), async ({ usersList: l, userDetails: d, page }) => {
      await l.tabNamed(name).click();
      await expect(page).toHaveURL(new RegExp(`status=${name.toLowerCase()}`));
      await l.table.settle();
      const n = await l.table.rows.count();
      if (!n) unmet(`No ${name} account on testbox`);
      // The list has no Status column: check the first and last rows' badges.
      const statuses: string[] = [];
      for (const i of [0, n - 1]) {
        await l.tabNamed(name).click();
        await l.table.settle();
        await l.table.rows.nth(i).getByRole('button', { name: 'See details' }).click();
        await d.expectLoaded();
        statuses.push(await d.statusWord());
        await page.goBack();
      }
      observe(`${name} tab: ${n} rows, URL ${new URL(page.url()).search}; badges of first/last row: ${statuses.join(', ')}`);
      for (const s of statuses) expect(s.toLowerCase()).toBe(name.toLowerCase());
    });
  }

  test('USR-LST-008 search by username', tc('USR-LST-008'), async ({ usersList: l }) => {
    await l.search(env.umUsername);
    const usernames = await l.column('Username');
    observe(`Search "${env.umUsername}": ${usernames.length} rows (${usernames.slice(0, 5).join(', ')}${usernames.length > 5 ? ', …' : ''})`);
    expect(usernames.length).toBeGreaterThan(0);
    for (const u of usernames) expect(u.toLowerCase()).toContain(env.umUsername.toLowerCase());
  });

  test('USR-LST-009 search by full name, email and phone', tc('USR-LST-009'), async ({ usersList: l }) => {
    const row = l.row(env.umUsername);
    if (!(await row.count())) unmet(`@${env.umUsername} is not on page 1 of the Confirmed tab`);
    const cells = (await row.first().getByRole('cell').allTextContents()).map((c) => c.trim());
    const [name, email, phone] = [cells[2], cells[3], cells[4]];
    const found: string[] = [];
    for (const term of [name, email, phone]) {
      await l.search(term);
      const usernames = await l.column('Username');
      found.push(`"${term}" -> ${usernames.length} rows${usernames.length <= 3 ? ` (${usernames.join(', ')})` : ''}`);
      expect.soft(usernames, `search "${term}"`).toContain(`@${env.umUsername}`);
      expect.soft(usernames.length, `search "${term}" narrows the list`).toBeLessThan(5);
    }
    observe(found.join('; '));
  });

  test('USR-LST-010 no-match search shows the empty state', tc('USR-LST-010'), async ({ usersList: l }) => {
    await l.search('zz-no-such-account-000');
    const rows = await l.table.rows.count();
    const counter = await l.pagination.counter.textContent().catch(() => '');
    observe(`${rows} rows; empty-state text: ${(await l.main.getByRole('table').innerText()).replace(/\s+/g, ' ').slice(-80)}; counter "${counter?.trim()}"`);
    expect(rows).toBe(0);
    await expect(l.emptyState.or(l.main.getByRole('row', { name: /No data/ })).filter({ visible: true }).first()).toBeVisible(DESIGN);
  });

  test('USR-LST-011 refresh reloads the list on the same tab', tc('USR-LST-011'), async ({ usersList: l, page }) => {
    await l.frozenTab.click();
    await l.table.settle();
    const before = await l.table.rows.count();
    await l.reloadButton.click();
    await l.table.settle();
    observe(`Frozen tab rows before/after refresh: ${before}/${await l.table.rows.count()}; URL ${new URL(page.url()).search}`);
    await expect(page).toHaveURL(/status=frozen/);
    expect(await l.table.rows.count()).toBe(before);
  });

  test('USR-LST-012 Filters opens the "Filter by" panel', tc('USR-LST-012'), async ({ usersList: l }) => {
    await l.filters.openButton.click();
    const opened = await l.filters.heading.waitFor({ timeout: 8_000 }).then(() => true, () => false);
    observe(`"Filter by" panel after clicking Filters: ${opened ? 'opened' : 'nothing opened'}`);
    expect(opened).toBe(true);
  });

  test('USR-LST-013 Export button is present', tc('USR-LST-013'), async ({ usersList: l }) => {
    await expect(l.exportButton).toBeVisible();
    observe('Export button visible (export file deferred)');
  });

  test('USR-LST-014 pagination: page size, arrows and counter', tc('USR-LST-014'), async ({ usersList: l }) => {
    await expect(l.pagination.prevButton).toBeDisabled();
    const first = await l.pagination.counts();
    await l.pagination.setPageSize(10);
    await l.table.settle();
    const rows10 = await l.table.rows.count();
    const after = await l.pagination.counts().catch(() => null);
    observe(`Counter "${first.text}"; after Per page 10: ${rows10} rows, counter "${after?.text ?? '?'}"`);
    expect(rows10).toBe(10);
    expect(first.from).toBe(1);
    expect(after?.from).toBe(1);
    expect(after?.to).toBe(10);
  });

  test('USR-LST-015 See details opens the matching account', tc('USR-LST-015'), async ({ usersList: l, userDetails: d, page }) => {
    const row = l.table.rows.first();
    const cells = (await row.getByRole('cell').allTextContents()).map((c) => c.trim());
    await row.getByRole('button', { name: 'See details' }).click();
    await d.expectLoaded();
    const panel = await d.profile.innerText();
    observe(`Row ${cells[1]} / ${cells[3]} -> ${page.url()}`);
    expect(panel).toContain(cells[1].replace(/^@/, ''));
    expect(await d.field('Email')).toBe(cells[3]);
    expect(await d.field('Phone number')).toBe(cells[4]);
    await expect(d.overviewTab).toBeVisible();
  });

  test('USR-LST-016 header and row checkboxes', tc('USR-LST-016'), async ({ usersList: l }) => {
    await l.table.selectAll.check();
    const n = await l.table.rows.count();
    const checked = await l.table.table.getByRole('checkbox', { checked: true }).count();
    await l.table.selectAll.uncheck();
    const cleared = await l.table.table.getByRole('checkbox', { checked: true }).count();
    await l.table.rowCheckbox(1).check();
    const single = await l.table.table.getByRole('checkbox', { checked: true }).count();
    observe(`Select all -> ${checked} checked of ${n + 1}; after unticking select all -> ${cleared}; then ticking row 1 -> ${single} checked`);
    expect(cleared).toBe(0);
    expect(checked).toBe(n + 1);
    expect(single).toBe(1);
  });

  test('USR-LST-017 search placeholder', tc('USR-LST-017'), async ({ usersList: l }) => {
    const ph = await l.searchInput.getAttribute('placeholder');
    observe(`Placeholder "${ph}"`);
    expect(ph).toBe('Search account...');
  });

  test('USR-LST-018 result counter shows a valid range', tc('USR-LST-018'), async ({ usersList: l }) => {
    const raw = ((await l.pagination.counter.textContent()) ?? '').trim();
    const rows = await l.table.rows.count();
    observe(`Counter "${raw}" with ${rows} rows shown`);
    const m = raw.replace(/,/g, '').match(/Showing (-?\d+) to (-?\d+) of (\d+)/);
    expect(m, 'counter format').not.toBeNull();
    expect(Number(m![1])).toBe(1);
    expect(Number(m![2])).toBe(rows);
  });

  test('USR-LST-019 page 2 shows the next rows', tc('USR-LST-019'), async ({ usersList: l }) => {
    const first = await l.column('Username');
    await l.pagination.pageButton(2).click();
    await l.table.settle();
    const second = await l.column('Username');
    const counter = ((await l.pagination.counter.textContent()) ?? '').trim();
    observe(`Page 2: ${second.length} rows, first ${second[0]}; counter "${counter}"`);
    expect(second[0]).not.toBe(first[0]);
    expect(counter.replace(/,/g, '')).toMatch(new RegExp(`^Showing ${first.length + 1} to `));
  });

  test('USR-LST-020 each status tab has its own URL and count', tc('USR-LST-020'), async ({ usersList: l, page }) => {
    const seen: string[] = [];
    for (const name of ['Frozen', 'Deactivated', 'Deleted', 'first']) {
      const tab = name === 'first' ? l.firstTab : l.tabNamed(name);
      await tab.click();
      await l.table.settle();
      const total = (await l.pagination.counts().catch(() => ({ total: -1 }))).total;
      seen.push(`${name}: ${new URL(page.url()).search} total ${total}`);
    }
    observe(seen.join('; '));
    const urls = seen.map((s) => s.split(' total')[0].split(': ')[1]);
    expect(new Set(urls).size, 'one URL per tab').toBe(4);
  });

  test('USR-LST-021 Deleted row opens a deleted account', tc('USR-LST-021'), async ({ usersList: l, userDetails: d }) => {
    const u = await l.openFirstOf(l.deletedTab);
    if (!u) unmet('No Deleted account on testbox');
    await d.expectLoaded();
    const banner = (await d.statusBanner.textContent().catch(() => ''))?.trim();
    observe(`@${u}: banner "${banner}", status "${await d.statusWord()}"`);
    expect(banner).toBe('This account has been deleted!');
    expect((await d.statusWord()).toLowerCase()).toBe('deleted');
  });

  test('USR-LST-022 clearing the search restores the list', tc('USR-LST-022'), async ({ usersList: l }) => {
    const total = (await l.pagination.counts()).total;
    await l.search(env.umUsername);
    await l.search('');
    const after = (await l.pagination.counts()).total;
    observe(`Total before ${total}, after clearing ${after}`);
    expect(after).toBe(total);
  });

  test('USR-LST-023 no "null" in cells on any tab', tc('USR-LST-023'), async ({ usersList: l }) => {
    const bad: string[] = [];
    for (const tab of l.tabs()) {
      await tab.click();
      await l.table.settle();
      for (const r of await l.table.rows.all()) {
        const cells = (await r.getByRole('cell').allTextContents()).map((c) => c.trim());
        if (cells.some((c) => /\bnull\b/i.test(c))) bad.push(cells.slice(1, 4).join(' | '));
      }
    }
    observe(bad.length ? `${bad.length} row(s) with "null": ${bad.slice(0, 3).join(' ; ')}` : 'No "null" values');
    expect(bad).toEqual([]);
  });
});

test.describe('User management - 2. Accounts list filters', () => {
  test.beforeEach(async ({ usersList: l }) => {
    await l.open();
    await l.filters.openButton.click();
    if (!(await l.filters.heading.waitFor({ timeout: 8_000 }).then(() => true, () => false))) {
      blocked('Clicking "Filters" opens no "Filter by" panel (USR-LST-012)');
    }
  });

  test('USR-LSF-001 panel has Country and Registration date', tc('USR-LSF-001'), async ({ usersList: l }) => {
    const text = await l.filters.root.innerText();
    observe(`Panel: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
    expect(text).toMatch(/Country/);
    expect(text).toMatch(/Registration date|Creation date/);
  });

  test('USR-LSF-002 Country filter', tc('USR-LSF-002'), async ({ usersList: l }) => {
    await l.filters.choose('Country', 'Cameroon');
    await l.filters.apply();
    await l.table.settle();
    const countries = [...new Set(await l.column('Country'))];
    observe(`Countries after filter: ${countries.join(', ')}`);
    expect(countries).toEqual(['Cameroon']);
  });

  test('USR-LSF-003 Registration date filter', tc('USR-LSF-003'), async ({ usersList: l }) => {
    await l.filters.startDate.click();
    await l.filters.quickRange('Last 30 days').click();
    await l.filters.apply();
    await l.table.settle();
    observe(`Rows after "Last 30 days": ${await l.table.rows.count()}`);
    await expect(l.filters.heading).toBeHidden();
  });

  test('USR-LSF-004 Country + date use AND', tc('USR-LSF-004'), async ({ usersList: l }) => {
    await l.filters.choose('Country', 'Cameroon');
    await l.filters.startDate.click();
    await l.filters.quickRange('Last 90 days').click();
    await l.filters.apply();
    await l.table.settle();
    const countries = [...new Set(await l.column('Country'))];
    observe(`Rows ${await l.table.rows.count()}, countries ${countries.join(', ')}`);
    expect(countries.every((c) => c === 'Cameroon')).toBe(true);
  });

  test('USR-LSF-005 Reset clears the fields', tc('USR-LSF-005'), async ({ usersList: l }) => {
    await l.filters.choose('Country', 'Cameroon');
    await l.filters.resetButton.click();
    const text = await l.filters.select('Country').innerText();
    observe(`Country after Reset: "${text.trim()}"`);
    expect(text).not.toContain('Cameroon');
  });

  test('USR-LSF-006 filters apply within the current tab', tc('USR-LSF-006'), async ({ usersList: l, page }) => {
    await l.filters.close();
    await l.frozenTab.click();
    await l.filters.open();
    await l.filters.choose('Country', 'Cameroon');
    await l.filters.apply();
    await l.table.settle();
    observe(`URL after filtering on Frozen: ${new URL(page.url()).search}`);
    await expect(page).toHaveURL(/status=frozen/);
  });

  test('USR-LSF-007 closing without Apply discards changes', tc('USR-LSF-007'), async ({ usersList: l }) => {
    const before = (await l.pagination.counts()).total;
    await l.filters.choose('Country', 'Benin');
    await l.filters.close();
    const after = (await l.pagination.counts()).total;
    observe(`Total before ${before}, after closing ${after}`);
    expect(after).toBe(before);
  });

  test('USR-LSF-010 Apply disabled until a value is set', tc('USR-LSF-010'), async ({ usersList: l }) => {
    const enabled = await l.filters.applyButton.isEnabled();
    observe(`Apply filters enabled with no value: ${enabled}`);
    expect(enabled).toBe(false);
  });
});

