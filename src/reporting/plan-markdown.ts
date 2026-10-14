import * as fs from 'fs';
import * as path from 'path';

/**
 * Loads a module test plan (src/test-plan/<module>.plan.json) and renders it
 * as ClickUp markdown, optionally with a filled "Feedback" column from a run.
 * No TS-only runtime syntax here: scripts/render-plan.ts runs this file
 * directly with Node's type stripping.
 */

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low' | 'Usability';

export interface PlanCase {
  id: string;
  title: string;
  pre?: string;
  steps: string[];
  expected: string;
  priority: Priority;
  automate: boolean;
  smoke: boolean;
  change?: 'new' | 'updated';
  note?: string;
}

export interface PlanSection {
  id: string;
  name: string;
  figma: string;
  pre: string;
  cases: PlanCase[];
}

export interface Plan {
  title: string;
  version: string;
  date: string;
  figmaFile: string;
  /** Link text for figmaFile. Defaults to the Fiat Wallet label. */
  figmaLabel?: string;
  /** Module name shown in reports ("Fiat Wallet", "User Management"). */
  module?: string;
  /** Number of cases in the previous plan version. */
  previousTotal?: number;
  /** npm command that runs this module and publishes its report. */
  command?: string;
  scope: string;
  deferred: string;
  designNotes: string[];
  sections: PlanSection[];
}

export type Outcome = 'Passed' | 'Failed' | 'Skipped' | 'Blocked' | 'Not executed';

export interface CaseResult {
  outcome: Outcome;
  knownBug?: string;
  /** What the app showed, or why the test could not run. */
  feedback: string;
}

export const PLAN_FILE = path.join('src', 'test-plan', 'fiat-wallet.plan.json');

/** Plan file of a module: 'fiat-wallet' | 'user-management'. */
export const planFile = (module: string) => path.join('src', 'test-plan', `${module}.plan.json`);

export function loadPlan(root = process.cwd(), file = PLAN_FILE): Plan {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf-8')) as Plan;
}

export function allCases(plan: Plan): PlanCase[] {
  return plan.sections.flatMap((s) => s.cases);
}

/** Escapes a value for a markdown table cell. */
export function cell(text: string | undefined): string {
  // '<' outside <br> is replaced: ClickUp's markdown import rejects raw tags.
  return (text ?? '').replace(/<(?!br>)/g, '‹').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();
}

const ICON: Record<Outcome, string> = {
  Passed: '✅ Passed',
  Failed: '❌ Failed',
  Skipped: '⏭️ Skipped',
  Blocked: '⛔ Blocked',
  'Not executed': '✋ Manual',
};

export function outcomeLabel(r: CaseResult): string {
  return r.knownBug && r.outcome === 'Failed' ? '❌ Failed (known bug)' : ICON[r.outcome];
}

/**
 * The plan as a table, same columns as the v1 ClickUp plan. With `results`,
 * the Feedback column holds the run outcome and the actual result.
 */
export function renderPlanTable(plan: Plan, results?: Map<string, CaseResult>): string {
  const out: string[] = [];
  out.push('| TC ID | TC Title | Preconditions | Steps to Reproduce | Expected Results (design) | Feedback | Priority | Automate | Smoke |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of plan.sections) {
    // Full-width row: ClickUp rejects table rows with fewer cells than the header.
    out.push(`| **${s.id}. ${cell(s.name)}** | Figma ${cell(s.figma)} | **Section preconditions:** ${cell(s.pre)} |  |  |  |  |  |  |`);
    for (const c of s.cases) {
      const steps = c.steps.map((st, i) => `${i + 1}\\. ${cell(st)}`).join('<br>');
      const tag = c.change === 'new' ? ' 🆕' : c.change === 'updated' ? ' ✏️' : '';
      const r = results?.get(c.id);
      const feedback = r ? `**${outcomeLabel(r)}**${r.feedback ? '<br>' + cell(r.feedback) : ''}` : '';
      out.push(
        `| ${c.id}${tag} | ${cell(c.title)} | ${c.pre ? cell(c.pre) : '(section)'} | ${steps} | ${cell(c.expected)} | ${feedback} | ${c.priority} | ${c.automate ? 'True' : 'False'} | ${c.smoke ? 'True' : 'False'} |`,
      );
    }
  }
  return out.join('\n');
}

/** Full plan page (scope, legend, change log, table). */
export function renderPlanPage(plan: Plan): string {
  const cases = allCases(plan);
  const count = (f: (c: PlanCase) => boolean) => cases.filter(f).length;
  const changes = cases.filter((c) => c.change);
  return [
    `**${plan.title}**`,
    `**Scope:** ${plan.scope}`,
    `**Deferred (pending design submission):** ${plan.deferred}`,
    `**Design source:** [${plan.figmaLabel ?? 'Figma — Wallet'}](${plan.figmaFile})`,
    ...(plan.command ? [`**Automated run + report:** \`${plan.command}\``] : []),
    `**Total test cases: ${cases.length}** (v1: ${plan.previousTotal ?? 156}) | New: ${count((c) => c.change === 'new')} | Updated: ${count((c) => c.change === 'updated')} | Automated: ${count((c) => c.automate)} | Smoke: ${count((c) => c.smoke)} | **Date:** ${plan.date}`,
    '',
    '**Design notes**',
    ...plan.designNotes.map((n) => `- ${n}`),
    '',
    'Legend: 🆕 new in v2, ✏️ updated in v2. The Feedback column is filled by each automated run (see Test sessions > Automatic).',
    '',
    renderPlanTable(plan),
    '',
    '**What changed in v2**',
    '',
    '| TC ID | Change | Why |',
    '| --- | --- | --- |',
    ...changes.map((c) => `| ${c.id} | ${c.change === 'new' ? 'New' : 'Updated'} | ${cell(c.note ?? c.title)} |`),
  ].join('\n');
}
