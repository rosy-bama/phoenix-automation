import * as fs from 'fs';
import * as path from 'path';
import { expect } from '@playwright/test';
import { FiatTransactionsPage, TxnTab } from '../pages/fiat/FiatTransactionsPage';

/**
 * Finds test data the plan needs but testbox doesn't guarantee (a failed
 * deposit, a manual deposit). Filtering by status crashes the Transactions
 * page (13 Oct 2026), so we walk the list instead, 50 rows per page.
 * The walk is cached in test-results/ (cleared by Playwright at every run),
 * so it happens once per run even though workers restart after failures.
 */

export type TxnRow = Record<string, string> & { page: string };

const MAX_PAGES = 15;
const cacheFile = (tab: TxnTab) => path.join('test-results', `fiat-${tab.toLowerCase()}-rows.json`);

export async function listRows(t: FiatTransactionsPage, tab: TxnTab): Promise<TxnRow[]> {
  const file = cacheFile(tab);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')) as TxnRow[];
  await t.open();
  await t.openTab(tab);
  await expect(t.table.rows.first()).toBeVisible();
  await t.pagination.setPageSize(50);
  await expect.poll(() => t.table.rows.count()).toBeGreaterThan(20);
  const headers = (await t.table.table.getByRole('columnheader').allTextContents()).map((h) => h.trim());
  const rows: TxnRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    for (const row of await t.table.rows.all()) {
      const cells = (await row.getByRole('cell').allTextContents()).map((c) => c.trim());
      rows.push({ ...Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])), page: String(page) } as TxnRow);
    }
    const { to, total } = await t.pagination.counts();
    if (to >= total) break;
    await t.pagination.nextButton.click();
    await t.pagination.waitForFrom(to + 1);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows), 'utf-8');
  return rows;
}

/** Opens the details panel of a row found by listRows(). */
export async function openRow(t: FiatTransactionsPage, tab: TxnTab, row: TxnRow) {
  await t.open();
  await t.openTab(tab);
  await expect(t.table.rows.first()).toBeVisible();
  await t.pagination.setPageSize(50);
  for (let p = 1; p < Number(row.page); p++) {
    const { to } = await t.pagination.counts();
    await t.pagination.nextButton.click();
    await t.pagination.waitForFrom(to + 1);
  }
  const match = t.table.rows
    .filter({ hasText: row.Username })
    .filter({ hasText: row['Total amount'] })
    .filter({ hasText: row.Date });
  await match.first().getByRole('button', { name: 'See details' }).click();
  await t.txnDetails.expectOpen();
}

export const isFailed = (r: TxnRow) => /^failed$/i.test(r.Status);
export const isComplete = (r: TxnRow) => /^complete(d)?$/i.test(r.Status);

/** First manual deposit: candidates are "Cash" rows, confirmed by Transaction mode. */
export async function findManualDeposit(t: FiatTransactionsPage): Promise<TxnRow | undefined> {
  const file = path.join('test-results', 'fiat-manual-deposit.json');
  if (fs.existsSync(file)) return (JSON.parse(fs.readFileSync(file, 'utf-8')) as { row?: TxnRow }).row;
  const rows = await listRows(t, 'Deposits');
  let found: TxnRow | undefined;
  for (const row of rows.filter((r) => /^cash$/i.test(r['Payment method'])).slice(0, 3)) {
    await openRow(t, 'Deposits', row);
    if (/manual/i.test(await t.txnDetails.value('Transaction mode'))) { found = row; break; }
  }
  fs.writeFileSync(file, JSON.stringify({ row: found }), 'utf-8');
  return found;
}
