/**
 * Results for the Ejara Automation Tool runner (spec §6.9.10): when the runner sets EJARA_RESULTS_FILE, one JSON line
 * per test (final attempt only: a test that passes on retry counts as passed). Registered in playwright.config.ts
 * only when the variable is set.
 */
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export function resultLine(test: { title: string; titlePath: () => string[]; location: { file: string } }, result: { status: string; duration: number; error?: { message?: string } }) {
  return {
    title: test.title,
    fullTitle: test.titlePath().filter(Boolean).join(' › '),
    file: path.relative(process.cwd(), test.location.file),
    passed: result.status === 'passed',
    skipped: result.status === 'skipped',
    error: result.status === 'passed' ? undefined : result.error?.message?.slice(0, 2000),
    durationMs: Math.round(result.duration),
  };
}

export default class EjaraResults implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    const file = process.env.EJARA_RESULTS_FILE;
    if (!file) return;
    const final = result.status === 'passed' || result.status === 'skipped' || result.retry >= test.retries;
    if (!final) return;
    appendFileSync(file, JSON.stringify(resultLine(test, result)) + '\n');
  }
}
