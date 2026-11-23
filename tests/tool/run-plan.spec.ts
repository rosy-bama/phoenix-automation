/**
 * Cases of the Ejara Automation Tool run from their automation steps (spec §6.10.4).
 *
 * Only in a run started from the tool: the runner downloads the run's plan and gives its path in EJARA_RUN_PLAN.
 * Each Runnable case becomes one test named like a hand-written one ("FW-001 Account list opens @smoke @high"), so
 * --grep (labels, suites) selects them the same way and the results reach the tool by TC ID. Without a plan this
 * file has no tests.
 */
import path from 'node:path';
import { test } from '../../src/fixtures/test-fixtures';
import { env } from '../../src/utils/env';
import { BlockedCase, runCase } from '../../src/executor/execute';
import { loadRunPlan } from '../../src/executor/plan';
import { readCatalog, webRegistry } from '../../src/executor/web';

const root = path.resolve(__dirname, '../..');
const plan = loadRunPlan();

if (plan?.cases.length) {
  const catalog = readCatalog(root);
  test.describe(`Ejara Automation Tool · ${plan.job.suite ?? plan.job.tag ?? 'all tests'} (automation steps)`, () => {
    for (const c of plan.cases) {
      test(c.testTitle, async ({ page }) => {
        const { screen, flow } = webRegistry(catalog, root, page);
        try {
          await runCase(c, {
            catalog,
            screen,
            flow,
            values: {
              account: (name) => (name === 'ADMIN' ? { fields: { username: env.username, password: env.password, otp: env.otp }, secret: ['password', 'otp'] } : undefined),
              data: (name) => ({ walletUsername: env.walletUsername, savingsUsername: env.savingsUsername, umUsername: env.umUsername })[name],
              run: { env: env.targetEnv, platform: plan.job.platform },
            },
            allow: { movesMoney: env.allowMoneyOps, changesState: env.allowAccountOps },
            testContext: page,
            pause: (ms) => page.waitForTimeout(ms),
            log: (line) => console.log(line),
          });
        } catch (e) {
          if (!(e instanceof BlockedCase)) throw e;
          test.skip(true, `SKIPPED: ${e.message}`);
        }
      });
    }
  });
}
