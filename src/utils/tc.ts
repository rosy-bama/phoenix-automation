import { test } from '@playwright/test';
import { env } from './env';

/**
 * Result-reporting helpers for test-plan cases. The module report
 * (src/reporting/plan-report.ts) puts each test into one of four buckets:
 *
 * - Passed   the app matches the expected (Figma/plan) result.
 * - Failed   the app does not match. A knownBug() test that still fails is
 *            "Failed (known bug)" in the report, even though Playwright
 *            counts it as passed.
 * - Skipped  unmet(): a test requirement is missing (data, env flag, role).
 * - Blocked  blocked(): the steps cannot be completed because of a blocking
 *            bug or a missing implementation in the app.
 *
 * Test titles must start with the plan's TC ID ("TC-WALLIST-001 ...",
 * "USR-LST-001 ..."): the report reads the expected result from
 * src/test-plan/<module>.plan.json.
 */

/** Records what the app actually showed. Shown as "Actual" in the report. */
export function observe(actual: string) {
  test.info().annotations.push({ type: 'actual', description: actual });
}

/** Stops the test as BLOCKED (blocking bug / missing implementation). */
export function blocked(reason: string): never {
  test.info().annotations.push({ type: 'blocked', description: reason });
  test.skip(true, `BLOCKED: ${reason}`);
  throw new Error('unreachable');
}

/** Stops the test as SKIPPED because a test requirement is not met. */
export function unmet(reason: string): never {
  test.info().annotations.push({ type: 'unmet', description: reason });
  test.skip(true, `SKIPPED: ${reason}`);
  throw new Error('unreachable');
}

/** Money-moving steps only run on testbox with PHX_ALLOW_MONEY_OPS=true. */
export function requireMoneyOps() {
  if (!env.allowMoneyOps) unmet('Moves money: set PHX_ALLOW_MONEY_OPS=true (testbox only) to run it');
}

/**
 * Account-changing steps (freeze, delete, deactivate, MFA, contact details,
 * payment methods) only run on testbox with PHX_ALLOW_ACCOUNT_OPS=true and a
 * disposable account named in `envVar`. Returns that username.
 */
export function requireAccountOps(envVar: string, what: string): string {
  if (!env.allowAccountOps) unmet(`Changes a customer account: set PHX_ALLOW_ACCOUNT_OPS=true (testbox only) and ${envVar}=<disposable username> to ${what}`);
  const username = process.env[envVar];
  if (!username) unmet(`Needs a disposable test account: set ${envVar}=<username> to ${what}`);
  return username;
}

/** Short timeout for design checks on an already-loaded screen. */
export const DESIGN = { timeout: 5_000 };
