import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import {
  allCases, cell, loadPlan, outcomeLabel, planFile, renderPlanTable,
  type CaseResult, type Outcome, type Plan, type PlanCase,
} from './plan-markdown';
import { publishPage } from './clickup';

/**
 * Builds a module's test-session report after a run:
 * Passed / Failed / Skipped / Blocked, pass rate, expected (design) vs actual
 * for every case, and the plan with its Feedback column filled.
 *
 * One instance per module (playwright.config.ts: { module: 'fiat-wallet' }).
 * It stays silent when none of its plan's cases ran.
 * Always writes reports/<module>/<timestamp>.md. After a COMPLETE run
 * (every automated plan case was part of the run) it also publishes it as a
 * sub-page of ClickUp "Test sessions > Automatic" when CLICKUP_API_TOKEN is
 * set. PHX_PUBLISH_REPORT=false turns publishing off.
 */

const TC_ID = /\b(?:TC|USR)-[A-Z0-9]+-\d{3}\b/g;

type ModuleOptions = {
  /** Plan file name without extension, e.g. 'user-management'. */
  module: string;
  /** Feature name in the report title and ClickUp page name. */
  feature: string;
  /** Spec folder, used in the "Command" line of the report. */
  specDir: string;
  /** Extra header rows, e.g. which env flags gate destructive tests. */
  gates: () => [string, string][];
};

const MODULES: Record<string, Omit<ModuleOptions, 'module'>> = {
  'fiat-wallet': {
    feature: 'Fiat wallet',
    specDir: 'tests/fiat-wallet',
    gates: () => [['Money-moving tests', process.env.PHX_ALLOW_MONEY_OPS === 'true' ? 'Enabled' : 'Disabled (PHX_ALLOW_MONEY_OPS≠true) → Skipped']],
  },
  'user-management': {
    feature: 'User management',
    specDir: 'tests/user-management',
    gates: () => [['Account-changing tests', process.env.PHX_ALLOW_ACCOUNT_OPS === 'true' ? 'Enabled (disposable accounts from .env)' : 'Disabled (PHX_ALLOW_ACCOUNT_OPS≠true) → Skipped']],
  },
};
const RANK: Record<Outcome, number> = { Failed: 4, Blocked: 3, Passed: 2, Skipped: 1, 'Not executed': 0 };

type Attempt = { outcome: Outcome; knownBug?: string; feedback: string; title: string };

const clean = (s: string) =>
  s.replace(/\u001b\[[0-9;]*m/g, '').split('\nCall log:')[0].split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6).join(' · ');

export default class PlanReport implements Reporter {
  private opts: ModuleOptions;
  private plan!: Plan;
  private planIds = new Set<string>();
  private inRun = new Set<string>();
  /** Last attempt of each test (retries overwrite earlier attempts). */
  private lastAttempt = new Map<string, { ids: string[]; attempt: Attempt }>();
  private started = new Date();

  constructor(options: { module?: string } = {}) {
    const module = options.module ?? 'fiat-wallet';
    if (!MODULES[module]) throw new Error(`plan-report: unknown module "${module}"`);
    this.opts = { module, ...MODULES[module] };
  }

  onBegin(_config: FullConfig, suite: Suite) {
    this.plan = loadPlan(process.cwd(), planFile(this.opts.module));
    for (const c of allCases(this.plan)) this.planIds.add(c.id);
    for (const t of suite.allTests()) for (const id of t.title.match(TC_ID) ?? []) this.inRun.add(id);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const ids = (test.title.match(TC_ID) ?? []).filter((id) => this.planIds.has(id));
    if (!ids.length) return;
    const annotations = [...test.annotations, ...((result as { annotations?: TestResult['annotations'] }).annotations ?? [])];
    const of = (type: string) => [...new Set(annotations.filter((a) => a.type === type).map((a) => a.description ?? ''))];
    const actual = of('actual').join(' · ');
    const known = of('known-bug')[0];
    const error = clean(result.errors.map((e) => e.message ?? '').join('\n'));

    let a: Attempt;
    if (result.status === 'skipped') {
      const b = of('blocked')[0];
      const u = of('unmet')[0] ?? of('skip')[0];
      a = b ? { outcome: 'Blocked', feedback: b, title: test.title } : { outcome: 'Skipped', feedback: u || 'Skipped', title: test.title };
    } else if (test.expectedStatus === 'failed') {
      a = result.status === 'passed'
        ? { outcome: 'Passed', feedback: `Known bug no longer reproduces (${known}) — remove knownBug() and close the ticket.${actual ? ' ' + actual : ''}`, title: test.title }
        : { outcome: 'Failed', knownBug: known, feedback: [actual, `Known bug: ${known}`, error].filter(Boolean).join(' · '), title: test.title };
    } else if (result.status === 'passed') {
      a = { outcome: 'Passed', feedback: actual || 'As expected.', title: test.title };
    } else {
      a = { outcome: 'Failed', feedback: [actual, error].filter(Boolean).join(' · ') || result.status, title: test.title };
    }
    this.lastAttempt.set(test.id, { ids, attempt: a });
  }

  private attemptsFor(id: string): Attempt[] {
    return [...this.lastAttempt.values()].filter((v) => v.ids.includes(id)).map((v) => v.attempt);
  }

  /** Several tests (e.g. one per tab) can cover one case: the worst outcome wins. */
  private resultFor(c: PlanCase): CaseResult {
    const list = this.attemptsFor(c.id);
    if (!list?.length) {
      return c.automate
        ? { outcome: 'Skipped', feedback: this.inRun.has(c.id) ? 'Did not finish (run interrupted).' : 'Not part of this run.' }
        : { outcome: 'Not executed', feedback: 'Manual test case — not executed by automation.' };
    }
    const worst = list.reduce((w, x) => (RANK[x.outcome] > RANK[w.outcome] ? x : w));
    const multi = list.length > 1;
    const feedback = multi
      ? list.map((x) => `${x.title.replace(TC_ID, '').trim()}: ${x.outcome}${x.outcome === 'Passed' && x.feedback === 'As expected.' ? '' : ' — ' + x.feedback}`).join(' · ')
      : worst.feedback;
    return { outcome: worst.outcome, knownBug: worst.knownBug, feedback };
  }

  async onEnd(full: FullResult) {
    if (!this.plan) return;
    const cases = allCases(this.plan);
    const results = new Map(cases.map((c) => [c.id, this.resultFor(c)]));
    const automatedIds = cases.filter((c) => c.automate).map((c) => c.id);
    const complete = automatedIds.every((id) => this.inRun.has(id));
    if (!automatedIds.some((id) => this.inRun.has(id))) return; // this module did not run
    if (!this.lastAttempt.size) return; // nothing executed (e.g. --list)

    const md = this.render(results, full, complete);
    const stamp = this.started.toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const dir = path.join('reports', this.opts.module);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${stamp}.md`);
    fs.writeFileSync(file, md, 'utf-8');
    fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(Object.fromEntries(results), null, 2), 'utf-8');
    console.log(`\n${this.opts.feature} report: ${file}`);

    const token = process.env.CLICKUP_API_TOKEN;
    if (!complete) return console.log('Partial run: report written locally, not published to ClickUp.');
    if (!token || process.env.PHX_PUBLISH_REPORT === 'false') {
      return console.log('ClickUp publishing off (set CLICKUP_API_TOKEN to publish).');
    }
    try {
      const url = await publishPage(token, this.pageName(), md);
      console.log(`Published to ClickUp: ${url}`);
    } catch (e) {
      console.log(`ClickUp publish failed: ${(e as Error).message}. Report kept at ${file}.`);
    }
  }

  private pageName() {
    const d = this.started;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${this.opts.feature} — ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  render(results: Map<string, CaseResult>, full: FullResult, complete: boolean): string {
    const cases = allCases(this.plan);
    const by = (o: Outcome) => cases.filter((c) => results.get(c.id)!.outcome === o);
    const passed = by('Passed'), failed = by('Failed'), skipped = by('Skipped'), blockedC = by('Blocked'), manual = by('Not executed');
    const knownBugs = failed.filter((c) => results.get(c.id)!.knownBug);
    const attempted = passed.length + failed.length + blockedC.length;
    const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');
    const prioOrder = ['Critical', 'High', 'Medium', 'Low', 'Usability'];
    const sortP = (a: PlanCase, b: PlanCase) => prioOrder.indexOf(a.priority) - prioOrder.indexOf(b.priority);
    const critical = (list: PlanCase[]) => list.filter((c) => c.priority === 'Critical');
    const git = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'n/a'; } };
    const base = process.env.PHX_BASE_URL ?? 'https://phoenix-testbox.ejaraapis.xyz';

    const verdict = critical(failed).length || critical(blockedC).length
      ? `**No-Go** — ${critical(failed).length} Critical case(s) failed and ${critical(blockedC).length} Critical case(s) are blocked.`
      : failed.length ? '**Go with known issues** — no Critical failure; review the High failures below.' : '**Go** — no failures.';

    const detailRows = (list: PlanCase[]) => list.sort(sortP).map((c) => {
      const r = results.get(c.id)!;
      return `| ${c.id} | ${c.priority} | ${cell(c.title)} | ${cell(c.expected)} | ${cell(r.feedback)} |`;
    });
    const section = (title: string, list: PlanCase[], col4 = 'Expected (design)', col5 = 'Actual') =>
      list.length ? [`### ${title} (${list.length})`, '', `| TC ID | Priority | Title | ${col4} | ${col5} |`, '| --- | --- | --- | --- | --- |', ...detailRows(list), ''] : [];

    const sectionRows = this.plan.sections.map((s) => {
      const n = (o: Outcome) => s.cases.filter((c) => results.get(c.id)!.outcome === o).length;
      const att = n('Passed') + n('Failed') + n('Blocked');
      return `| ${s.id}. ${cell(s.name)} | ${s.cases.length} | ${n('Passed')} | ${n('Failed')} | ${n('Skipped')} | ${n('Blocked')} | ${n('Not executed')} | ${pct(n('Passed'), att)} |`;
    });

    const designFeedback = [...failed, ...blockedC].filter((c) => /design feedback|figma .*(shows|copy)|design defect|design \+ dev/i.test(c.expected));
    const devFeedback = [...failed, ...blockedC].filter((c) => !designFeedback.includes(c) && c.priority !== 'Usability');
    const uxFeedback = [...failed].filter((c) => !designFeedback.includes(c) && c.priority === 'Usability');

    return [
      `**${this.plan.module ?? this.opts.feature} — automated test session**`,
      '',
      `| | |`,
      `| --- | --- |`,
      `| Feature tested | ${this.plan.module ?? this.opts.feature}: ${cell(this.plan.scope)} |`,
      `| Command | \`${this.plan.command ?? `npx playwright test ${this.opts.specDir}`}\` (re-run one section: \`npx playwright test ${this.opts.specDir}/<spec>\`) |`,
      `| Date | ${this.started.toISOString().replace('T', ' ').slice(0, 16)} UTC |`,
      `| Environment | ${process.env.PHX_ENV ?? 'testbox'} — ${base} |`,
      `| Test plan | ${this.plan.title} (${cases.length} cases) |`,
      `| Design | [${this.plan.figmaLabel ?? 'Figma — Wallet'}](${this.plan.figmaFile}) |`,
      `| Automation | phoenix-automation @ ${git('git rev-parse --short HEAD')} (${git('git rev-parse --abbrev-ref HEAD')}) |`,
      `| Run | ${complete ? 'Complete' : 'Partial'} · Playwright status: ${full.status} · ${Math.round(full.duration / 60000)} min |`,
      ...this.opts.gates().map(([k, v]) => `| ${k} | ${v} |`),
      '',
      '## Summary',
      '',
      '| Result | Cases |',
      '| --- | --- |',
      `| ✅ Passed | ${passed.length} |`,
      `| ❌ Failed | ${failed.length} (of which ${knownBugs.length} known bugs) |`,
      `| ⏭️ Skipped — test requirement not met | ${skipped.length} |`,
      `| ⛔ Blocked — blocking bug or missing implementation | ${blockedC.length} |`,
      `| ✋ Manual — not executed by automation | ${manual.length} |`,
      `| **Total in plan** | **${cases.length}** |`,
      '',
      `**Pass rate: ${pct(passed.length, attempted)}** = Passed / (Passed + Failed + Blocked) = ${passed.length} / ${attempted}`,
      `Pass rate over all automated cases (Skipped counted as not passed): ${pct(passed.length, cases.length - manual.length)}. Execution coverage: ${pct(attempted, cases.length)} of the plan.`,
      '',
      `**Release verdict:** ${verdict}`,
      '',
      '## Results by section',
      '',
      '| Section | Cases | Passed | Failed | Skipped | Blocked | Manual | Pass rate |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...sectionRows,
      '',
      '## Details',
      '',
      ...section('❌ Failed', failed),
      ...section('⛔ Blocked', blockedC, 'Expected (design)', 'Blocking reason'),
      ...section('⏭️ Skipped', skipped, 'Expected (design)', 'Unmet requirement'),
      '## Feedback for collaborators',
      '',
      `**Developers** (${devFeedback.length}): ${devFeedback.sort(sortP).map((c) => `${c.id} (${c.priority})`).join(', ') || 'none'}`,
      '',
      `**Designers** (${designFeedback.length}): ${designFeedback.map((c) => c.id).join(', ') || 'none'} — copy or states that are wrong in Figma itself.`,
      '',
      `**UX / copy** (${uxFeedback.length}): ${uxFeedback.map((c) => c.id).join(', ') || 'none'}`,
      '',
      `**Product** — manual cases needing a decision: ${manual.map((c) => c.id).join(', ') || 'none'}. Not designed yet, so not tested: ${cell(this.plan.deferred)}`,
      '',
      '**Test data needs** (to turn Skipped into executed): ' + ([...new Set(skipped.map((c) => results.get(c.id)!.feedback))].map((f) => `"${cell(f)}"`).join('; ') || 'none'),
      '',
      '## Test plan with feedback',
      '',
      renderPlanTable(this.plan, results),
    ].join('\n');
  }
}

export { outcomeLabel };
