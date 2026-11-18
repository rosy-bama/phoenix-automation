/**
 * The test plan as the Ejara Automation Tool generates it (`test-plan/<module>.json`, never edited by hand) and the
 * ID renaming of the adopt step. Pure functions, unit tested in test/unit/plan.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface PlanCase {
  id: string;
  /** The tool's stable key of the case: never changes, even when the TC ID is renumbered. */
  key?: string;
  title: string;
  sections: string[];
  flows: string[];
  labels: string[];
  /** e.g. ["@smoke", "@urgent"]: added to the test title so `--mochaOpts.grep @smoke` picks it. */
  tags: string[];
  priority: string;
  platforms: string[];
  environments: string[];
  automation: string | null;
  legacyIds: string[];
  version: number;
}

export interface PlanFile {
  version: number;
  app: string;
  module: string;
  kind: string;
  prefix: string;
  cases: PlanCase[];
}

export interface PlanBundle {
  version: number;
  generatedAt: string;
  app: string;
  framework: string | null;
  files: Record<string, PlanFile>;
  idMap: Record<string, string>;
  conflicts: { legacyId: string; tcIds: string[] }[];
}

export interface Plan {
  byId: Map<string, PlanCase & { module: string }>;
  /** Former ID → TC ID (adopted tests not renamed yet). */
  byLegacy: Map<string, string>;
}

export function readPlan(dir: string): Plan {
  const byId = new Map<string, PlanCase & { module: string }>();
  const byLegacy = new Map<string, string>();
  if (!existsSync(dir)) return { byId, byLegacy };
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const file = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as PlanFile;
    for (const c of file.cases) {
      byId.set(c.id, { ...c, module: file.module });
      for (const old of c.legacyIds) if (normaliseId(old) !== c.id) byLegacy.set(normaliseId(old), c.id);
    }
  }
  return { byId, byLegacy };
}

/** "TC-CNHP-001" and "CNHP-001" are the same former ID (the TC- prefix was written inconsistently). */
export const normaliseId = (id: string) => id.trim().toUpperCase().replace(/^TC-/, '');

/**
 * The test title for a case: "<TC ID> <title> <tags>". Before the repo is adopted (no plan files), the title is kept
 * as written. With plan files, an unknown ID throws, so a test can't drift away from the plan; a former ID still
 * resolves (with a warning) until the apply script renames it.
 */
export function caseTitle(plan: Plan, id: string, title: string, warn: (m: string) => void = () => {}): string {
  if (plan.byId.size === 0) return `${id} ${title}`;
  const key = normaliseId(id);
  let c = plan.byId.get(key);
  if (!c && plan.byLegacy.has(key)) {
    c = plan.byId.get(plan.byLegacy.get(key)!);
    warn(`${id} is a former ID of ${c?.id}: run \`npm run plan:apply -- <bundle> --write\` to rename it`);
  }
  if (!c) throw new Error(`${id} is not in test-plan/: add the case in the tool, or remove the test`);
  return [c.id, title, ...c.tags].join(' ');
}

/**
 * Renames IDs in a test file, all in one pass (so a swap LOG-001 ↔ LOG-002 doesn't undo itself). Only whole IDs,
 * with or without "TC-"; longest IDs first so "SMK-12b" isn't taken for "SMK-12".
 */
export function renameIds(source: string, idMap: Record<string, string>): { text: string; changes: { from: string; to: string; count: number }[] } {
  const from = Object.keys(idMap).filter((k) => idMap[k] !== k).sort((a, b) => b.length - a.length);
  if (!from.length) return { text: source, changes: [] };
  const counts = new Map<string, number>();
  const re = new RegExp(`(?<![A-Za-z0-9-])(?:TC-)?(${from.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z0-9])`, 'g');
  const text = source.replace(re, (_m, id: string) => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    return idMap[id];
  });
  const changes = from.filter((k) => counts.has(k)).map((k) => ({ from: k, to: idMap[k], count: counts.get(k)! }));
  return { text, changes };
}

/** The plan files the repo has now (before applying a new bundle). */
export function readPlanFiles(dir: string): PlanFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((x) => x.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as PlanFile);
}

/**
 * The renames a new bundle brings: former IDs of adopted tests (bundle idMap), plus cases whose TC ID changed since
 * the repo's current plan files (renumbered when cases were reordered), found by their stable key.
 */
export function renamesFor(previous: PlanFile[], bundle: PlanBundle): Record<string, string> {
  const out: Record<string, string> = { ...bundle.idMap };
  const before = new Map<string, string>();
  for (const f of previous) for (const c of f.cases) if (c.key) before.set(c.key, c.id);
  for (const f of Object.values(bundle.files))
    for (const c of f.cases) {
      const old = c.key ? before.get(c.key) : undefined;
      if (old && old !== c.id) out[old] = c.id;
    }
  return out;
}
