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
 * Always writes reports/<module>/Test session - <Feature> - <DD-MM-YYYY>.md. After a COMPLETE run
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

type Defect = { id: string; severity: string; owner: string; area: string; title: string; tcs: string[]; known?: string; design?: boolean; ticket?: string };

type HistoryEntry = { session: string; date: string; passRate: string; open: { id: string; severity: string }[]; fixed?: number; new?: number };

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
    const dir = path.join('reports', this.opts.module);
    fs.mkdirSync(dir, { recursive: true });
    // "Test session - Fiat wallet - 13-10-2026", "(2)", "(3)"… for later runs the same day.
    const base = this.pageName().replace(/\//g, '-');
    let stamp = base;
    for (let n = 2; fs.existsSync(path.join(dir, `${stamp}.md`)); n++) stamp = `${base} (${n})`;
    const file = path.join(dir, `${stamp}.md`);
    fs.writeFileSync(file, md, 'utf-8');
    fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(Object.fromEntries(results), null, 2), 'utf-8');
    console.log(`\n${this.opts.feature} report: ${file}`);

    if (!complete) return console.log('Partial run: report written locally, not published to ClickUp.');
    if (this.defectState(results)) {
      const att = [...results.values()].filter((r) => ['Passed', 'Failed', 'Blocked'].includes(r.outcome));
      const passed = att.filter((r) => r.outcome === 'Passed').length;
      this.saveHistory(this.historyEntry(results, att.length ? `${((passed / att.length) * 100).toFixed(1)}%` : 'n/a'));
      console.log(`Defect history updated: ${this.historyFile()} (commit it to share the trend).`);
    }
    const token = process.env.CLICKUP_API_TOKEN;
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

  private defectsFile() {
    return path.join('src', 'test-plan', `${this.opts.module}.defects.json`);
  }

  /** Session history (tracked in git so the trend is shared): one entry per complete run. */
  private historyFile() {
    return path.join('src', 'test-plan', `${this.opts.module}.history.json`);
  }

  private loadHistory(): HistoryEntry[] {
    const file = this.historyFile();
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as { sessions: HistoryEntry[] }).sessions : [];
  }

  /**
   * Open defects for this run, from src/test-plan/<module>.defects.json: a
   * defect is open when one of its cases is Failed or Blocked (design defects,
   * in the Figma file itself, are always open). Null when no register exists.
   */
  defectState(results: Map<string, CaseResult>) {
    if (!fs.existsSync(this.defectsFile())) return null;
    const { defects } = JSON.parse(fs.readFileSync(this.defectsFile(), 'utf-8')) as { defects: Defect[] };
    const bad = (id: string) => ['Failed', 'Blocked'].includes(results.get(id)?.outcome ?? '');
    const order = ['Critical', 'High', 'Medium', 'Low'];
    const open = defects
      .filter((d) => d.design || d.tcs.some(bad))
      .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
    const covered = new Set(defects.flatMap((d) => d.tcs));
    const unmapped = [...results].filter(([id, r]) => ['Failed', 'Blocked'].includes(r.outcome) && !covered.has(id)).map(([id]) => id);
    const history = this.loadHistory().filter((h) => h.session !== this.pageName());
    const previous = history[history.length - 1];
    const prevOpen = new Set(previous?.open.map((o) => o.id) ?? []);
    const everOpen = new Set(history.flatMap((h) => h.open.map((o) => o.id)));
    const openIds = new Set(open.map((d) => d.id));
    const fixed = previous ? defects.filter((d) => prevOpen.has(d.id) && !openIds.has(d.id)) : [];
    const since = (d: Defect) =>
      !previous ? 'Baseline' : prevOpen.has(d.id) ? 'Still open' : everOpen.has(d.id) ? 'Reopened' : 'New';
    return { defects, open, fixed, unmapped, history, previous, since };
  }

  /** "## Defect trend": one row per past session plus this one. Goes on the report page. */
  private renderTrend(results: Map<string, CaseResult>, passRate: string): string[] {
    const st = this.defectState(results);
    if (!st) return [];
    const count = (list: { severity: string }[], s: string) => list.filter((d) => d.severity === s).length;
    const row = (h: HistoryEntry) =>
      `| ${cell(h.session)} | ${h.passRate} | **${h.open.length}** | ${count(h.open, 'Critical')} | ${count(h.open, 'High')} | ${count(h.open, 'Medium')} | ${count(h.open, 'Low')} | ${h.fixed ?? '—'} | ${h.new ?? '—'} |`;
    const current = this.historyEntry(results, passRate);
    const delta = st.previous ? current.open.length - st.previous.open.length : 0;
    return [
      '## Defect trend',
      '',
      st.previous
        ? `Open defects: **${current.open.length}** (${delta <= 0 ? '' : '+'}${delta} vs ${cell(st.previous.session)}) — ${current.fixed} fixed, ${current.new} new or reopened since the previous session.`
        : `Open defects: **${current.open.length}** — first session with a defect register (baseline).`,
      '',
      '| Session | Pass rate | Open defects | Critical | High | Medium | Low | Fixed since previous | New since previous |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...st.history.map(row),
      row(current).replace(/^\| ([^|]+) \|/, '| **$1 (this session)** |'),
      '',
      ...(st.fixed.length ? [`**Fixed since the previous session:** ${st.fixed.map((d) => `${d.id} — ${cell(d.title)}`).join('; ')}`, ''] : []),
    ];
  }

  /** "## Defects" table. Goes on the report page and at the top of "Test plan with feedback". */
  private renderDefects(results: Map<string, CaseResult>): string[] {
    const st = this.defectState(results);
    if (!st) return [];
    const icon = (id: string) => ({ Failed: '❌', Blocked: '⛔', Passed: '✅', Skipped: '⏭️' } as Record<string, string>)[results.get(id)?.outcome ?? ''] ?? '✋';
    const status = (d: Defect) => (d.ticket ? cell(d.ticket) : d.known ? `Known bug (${cell(d.known)})` : d.design ? 'Design (Figma)' : 'Ticket to file');
    return [
      '## Defects',
      '',
      `${st.open.length} open defect(s) behind the Failed and Blocked cases, most severe first. Severity is the defect's impact on CS work (not the test-case priority). Register: ${this.defectsFile()}.`,
      '',
      '| ID | Severity | Defect | Area | Owner | Test cases | Since last session | Ticket / status |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...st.open.map((d) => `| ${d.id} | ${d.severity} | ${cell(d.title)} | ${cell(d.area)} | ${d.owner} | ${d.tcs.map((id) => `${icon(id)} ${id}`).join('<br>')} | ${st.since(d)} | ${status(d)} |`),
      '',
      ...(st.unmapped.length ? [`**Failed/Blocked cases not linked to a defect yet:** ${st.unmapped.join(', ')} — add them to the register.`, ''] : []),
    ];
  }

  historyEntry(results: Map<string, CaseResult>, passRate: string): HistoryEntry {
    const st = this.defectState(results)!;
    const prevOpen = new Set(st.previous?.open.map((o) => o.id) ?? []);
    return {
      session: this.pageName(),
      date: this.started.toISOString(),
      passRate,
      open: st.open.map((d) => ({ id: d.id, severity: d.severity })),
      fixed: st.previous ? st.fixed.length : undefined,
      new: st.previous ? st.open.filter((d) => !prevOpen.has(d.id)).length : undefined,
    };
  }

  /** Appends (or replaces, same session name) this run in the history file. */
  saveHistory(entry: HistoryEntry) {
    const sessions = [...this.loadHistory().filter((h) => h.session !== entry.session), entry];
    fs.writeFileSync(this.historyFile(), JSON.stringify({ note: 'One entry per complete test session; written by plan-report.ts. Commit it so the defect trend is shared.', sessions }, null, 2) + '\n', 'utf-8');
  }

  private pageName() {
    const d = this.started;
    const p = (n: number) => String(n).padStart(2, '0');
    return `Test session - ${this.opts.feature} - ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
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
      ...this.renderTrend(results, pct(passed.length, attempted)),
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
      ...this.renderDefects(results),
      // ClickUp: everything from here is the "Test plan with feedback" sub-page.
      '## Test plan with feedback',
      '',
      ...this.renderDefects(results),
      '## Test plan',
      '',
      renderPlanTable(this.plan, results),
    ].join('\n');
  }
}

export { outcomeLabel };
