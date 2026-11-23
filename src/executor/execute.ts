/**
 * The executor (spec §6.10.4): runs a case of the tool from its automation steps, with the words of catalog.json —
 * the same screen objects and flows the hand-written tests use. Pure of WebdriverIO: everything it touches comes in
 * `deps` (src/executor/web.ts gives the real ones, on a Playwright page), so it is unit tested with fakes.
 */
import type { Catalog, Guard } from '../support/catalog';
import type { PlanCase, Step } from './plan';
import { resolveValue, shown, type ValueContext } from './values';

/** What a step can do on a screen (BaseScreen's step API) plus the screen's own actions. */
export interface StepScreen {
  stepTap(key: string): Promise<void>;
  stepType(key: string, value: string, o?: { secret?: boolean }): Promise<void>;
  stepSelect(key: string, value: string): Promise<void>;
  stepExpectShown(timeout?: number): Promise<void>;
  stepExpect(key: string, condition: 'visible' | 'hidden' | 'enabled' | 'disabled'): Promise<void>;
  stepText(key: string): Promise<string>;
  /** When the screen can wait for the text itself (web pages render late), instead of reading it once. */
  stepExpectText?(key: string, op: 'is' | 'contains' | 'matches', value: string): Promise<void>;
}

export interface ExecutorDeps {
  catalog: Catalog;
  screen(id: string): Promise<StepScreen>;
  flow(id: string): Promise<(...args: unknown[]) => Promise<unknown>>;
  values: ValueContext;
  /** What this machine allows (PHX_ALLOW_MONEY_OPS, PHX_ALLOW_ACCOUNT_OPS). */
  allow: { movesMoney: boolean; changesState: boolean };
  /** Given first to flows that take the Playwright page. */
  testContext: unknown;
  pause(ms: number): Promise<void>;
  log(line: string): void;
}

/** A case that would move money or change an account for good, on a run that doesn't allow it: not run at all. */
export class BlockedCase extends Error {}

const GUARD_HELP: Record<Guard, string> = {
  movesMoney: 'moves real money: runs only with PHX_ALLOW_MONEY_OPS=true (testbox only)',
  changesState: "changes a customer account: runs only with PHX_ALLOW_ACCOUNT_OPS=true (testbox only)",
};

/** The guard on what a step touches, from the catalog. */
export function guardOf(step: Step, catalog: Catalog): Guard | undefined {
  if (step.kind === 'wait' || step.kind === 'expect') return undefined;
  const [screenId, member] = step.target.split('.');
  if (step.kind === 'do') {
    const flow = catalog.flows.find((f) => f.id === step.target);
    if (flow) return flow.guard;
    return catalog.screens.find((s) => s.id === screenId)?.actions.find((a) => a.id === member)?.guard;
  }
  return catalog.screens.find((s) => s.id === screenId)?.elements.find((e) => e.id === member)?.guard;
}

/** Throws BlockedCase before anything runs when a step needs what this machine doesn't allow. */
export function checkGuards(c: PlanCase, deps: Pick<ExecutorDeps, 'catalog' | 'allow'>): void {
  for (const s of c.steps) {
    const g = guardOf(s.step, deps.catalog);
    if (g && !deps.allow[g]) throw new BlockedCase(`${c.tcId} not run: line ${s.line} (${s.text}) ${GUARD_HELP[g]}`);
  }
}

async function runStep(step: Step, deps: ExecutorDeps): Promise<void> {
  const val = (raw: string) => resolveValue(raw, deps.values);
  if (step.kind === 'wait') return deps.pause(step.seconds * 1000);
  const [screenId, member] = step.target.split('.');
  if (step.kind === 'do') {
    const args = step.args.map((a) => val(a).value);
    const flow = deps.catalog.flows.find((f) => f.id === step.target);
    if (flow) {
      const fn = await deps.flow(flow.id);
      await fn(...(flow.needsTestContext ? [deps.testContext, ...args] : args));
      return;
    }
    const screen = (await deps.screen(screenId)) as unknown as Record<string, unknown>;
    const method = screen[member];
    if (typeof method !== 'function') throw new Error(`${screenId} has no action ${member}`);
    await (method as (...a: unknown[]) => Promise<unknown>).apply(screen, args);
    return;
  }
  const screen = await deps.screen(screenId);
  if (step.kind === 'tap') return screen.stepTap(member);
  if (step.kind === 'type' || step.kind === 'select') {
    const v = val(step.value);
    if (typeof v.value !== 'string' && typeof v.value !== 'number') throw new Error(`${step.kind} needs text or a number, not ${v.secret ? 'an account' : typeof v.value}`);
    if (step.kind === 'type') return screen.stepType(member, String(v.value), { secret: v.secret });
    return screen.stepSelect(member, String(v.value));
  }
  if (step.kind !== 'expect') return;
  if (!member || step.condition === 'shown') return screen.stepExpectShown();
  if (step.condition !== 'text') return screen.stepExpect(member, step.condition);
  const want = val(step.value ?? '""');
  if (screen.stepExpectText) return screen.stepExpectText(member, step.op ?? 'is', String(want.value));
  const text = (await screen.stepText(member)).trim();
  const w = String(want.value);
  const ok = step.op === 'is' ? text === w.trim() : step.op === 'contains' ? text.toLowerCase().includes(w.toLowerCase()) : new RegExp(w).test(text);
  if (!ok) throw new Error(`it says ${JSON.stringify(text)}, expected it to ${step.op === 'is' ? 'be' : step.op === 'contains' ? 'contain' : 'match'} ${shown(step.value ?? '', want)}`);
}

/**
 * Runs a case's steps in order. A failure names the step: "step 4 (line 6): expect cashIn.continueButton enabled —
 * cashIn.continueButton stayed disabled".
 */
export async function runCase(c: PlanCase, deps: ExecutorDeps): Promise<void> {
  checkGuards(c, deps);
  for (const [i, s] of c.steps.entries()) {
    deps.log(`  ▸ step ${i + 1}: ${s.text}`);
    try {
      await runStep(s.step, deps);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = new Error(`step ${i + 1} (line ${s.line}): ${s.text} — ${msg}`);
      if (e instanceof Error && e.stack) err.stack = `${err.message}\n${e.stack.split('\n').slice(1).join('\n')}`;
      throw err;
    }
  }
}
