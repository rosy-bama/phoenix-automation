/**
 * A run's plan, as the Ejara Automation Tool sends it (spec §6.10.5): the runner downloads it before a run started
 * from the tool and gives its path in EJARA_RUN_PLAN. Only the Runnable cases are here to run; the hand-written tests
 * run as usual (selected by their TC IDs), the rest is listed in the tool as "to run by hand".
 */
import { readFileSync } from 'node:fs';

export type Step =
  | { kind: 'do'; target: string; args: string[] }
  | { kind: 'tap'; target: string }
  | { kind: 'type' | 'select'; target: string; value: string }
  | { kind: 'expect'; target: string; condition: 'shown' | 'visible' | 'hidden' | 'enabled' | 'disabled' | 'text'; op?: 'is' | 'contains' | 'matches'; value?: string }
  | { kind: 'wait'; seconds: number };

export interface PlanCase {
  tcId: string;
  title: string;
  tags: string[];
  /** "<TC ID> <title> <tags>": the same title a hand-written test gets from tc(). */
  testTitle: string;
  steps: { line: number; text: string; step: Step }[];
}

export interface RunPlan {
  version: 1;
  job: { id: string; app: string; platform: string; env: string; suite: string | null; tag: string | null };
  catalogSha: string | null;
  cases: PlanCase[];
  coded: string[];
  manual: { tcId: string; title: string; state: string; reason: string }[];
}

/** The run's plan, or null when the run wasn't started from the tool (or the repo has no plan for it). */
export function loadRunPlan(file = process.env.EJARA_RUN_PLAN): RunPlan | null {
  if (!file) return null;
  const plan = JSON.parse(readFileSync(file, 'utf8')) as RunPlan;
  if (plan.version !== 1 || !Array.isArray(plan.cases)) throw new Error(`${file} isn't a run plan this executor knows (version ${String(plan.version)})`);
  return plan;
}
