import { test } from '@playwright/test';

/**
 * Marks the current test as a KNOWN BUG (Rose's convention, 29 Sep 2026):
 * the test asserts the EXPECTED (Figma/spec) behaviour, and is flagged with
 * test.fail() so the suite stays green while the bug is open.
 *
 * - Bug still present  -> test "fails as expected"  -> reported as passed.
 * - Bug fixed          -> test passes unexpectedly  -> reported as FAILED
 *                         with "expected to fail". That is your signal to
 *                         remove the knownBug() line and close the ticket.
 *
 * Also tag the test with '@known-bug' so `npm run test:known-bug` re-checks
 * just these after a new build.
 *
 * `id` should be the Jira/ClickUp ticket once one exists. Until then use the
 * TC ID from the Fiat Wallet test plan.
 */
export function knownBug(id: string, summary: string) {
  test.info().annotations.push({ type: 'known-bug', description: `${id} - ${summary}` });
  test.fail(true, `${id} - ${summary}`);
}
