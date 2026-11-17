/**
 * Test plan files from the Ejara Automation Tool, ID renaming (adopt step) and results for the runner.
 */
import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { caseTitle, normaliseId, readPlan, renameIds } from '../src/support/plan';
import { resultLine } from '../src/reporting/ejara-results';

const dir = mkdtempSync(path.join(tmpdir(), 'plan-'));
writeFileSync(
  path.join(dir, 'kyc.json'),
  JSON.stringify({ version: 1, app: 'Phoenix', module: 'KYC', kind: 'feature', prefix: 'KYC', cases: [{ id: 'KYC-012', title: 'Tabs', sections: [], flows: [], labels: ['Smoke'], tags: ['@smoke', '@high'], priority: 'high', platforms: [], environments: [], automation: 'automated', legacyIds: ['KYC-ACC-001', 'TC-KYC-OLD-009'], version: 1 }] }),
);

test('plan files: by TC ID and by former ID', () => {
  const plan = readPlan(dir);
  expect(plan.byId.get('KYC-012')?.tags).toEqual(['@smoke', '@high']);
  expect(plan.byLegacy.get('KYC-ACC-001')).toBe('KYC-012');
  expect(normaliseId('tc-man-001')).toBe('MAN-001');
  expect(caseTitle(plan, 'KYC-ACC-001', 'tabs', () => {})).toBe('KYC-012 tabs @smoke @high');
  // former IDs written with or without TC- resolve the same way
  expect(caseTitle(plan, 'TC-KYC-OLD-009', 'x', () => {})).toBe('KYC-012 x @smoke @high');
  expect(caseTitle(plan, 'KYC-OLD-009', 'x', () => {})).toBe('KYC-012 x @smoke @high');
});

test('renaming covers titles and tc() calls, whole IDs only', () => {
  const src = "test('KYC-ACC-001 tabs', tc('KYC-ACC-001'), async () => {}); test('KYC-ACC-0010 other', tc('KYC-ACC-0010'), …);";
  const { text, changes } = renameIds(src, { 'KYC-ACC-001': 'KYC-012' });
  expect(text).toBe("test('KYC-012 tabs', tc('KYC-012'), async () => {}); test('KYC-ACC-0010 other', tc('KYC-ACC-0010'), …);");
  expect(changes).toEqual([{ from: 'KYC-ACC-001', to: 'KYC-012', count: 2 }]);
});

test('runner results: one line per test, final attempt', () => {
  const line = resultLine({ title: 'KYC-012 tabs', titlePath: () => ['', 'kyc/01.spec.ts', 'KYC - Account list', 'KYC-012 tabs'], location: { file: path.join(process.cwd(), 'tests/kyc/01.spec.ts') } }, { status: 'failed', duration: 812.4, error: { message: 'expected 2 tabs' } });
  expect(line).toEqual({ title: 'KYC-012 tabs', fullTitle: 'kyc/01.spec.ts › KYC - Account list › KYC-012 tabs', file: 'tests/kyc/01.spec.ts', passed: false, skipped: false, error: 'expected 2 tabs', durationMs: 812 });
});
