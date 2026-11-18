/**
 * Applies the plan bundle downloaded from the Ejara Automation Tool (App page › Automation › Download the plan bundle):
 *   1. writes test-plan/*.json (generated files: never edit them by hand)
 *   2. renames former IDs to TC IDs, and TC IDs renumbered in the tool (cases reordered), found by comparing
 *      the current test-plan/ files with the bundle in tests/** (titles and tc() calls, e.g. "KYC-ACC-001" → "KYC-012")
 *
 *   npm run plan:apply -- ~/Downloads/ejara-plan-bundle.json           # dry run: shows what would change
 *   npm run plan:apply -- ~/Downloads/ejara-plan-bundle.json --write   # writes
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { readPlanFiles, renameIds, renamesFor, type PlanBundle } from '../src/support/plan.ts';

const [bundlePath, flag] = process.argv.slice(2);
if (!bundlePath) {
  console.error('Usage: npm run plan:apply -- <bundle.json> [--write]');
  process.exit(1);
}
const write = flag === '--write';
const root = path.resolve(import.meta.dirname, '..');
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as PlanBundle;
if (bundle.version !== 1) throw new Error(`Unknown bundle version ${bundle.version}`);

const planDir = path.join(root, 'test-plan');
const files = Object.keys(bundle.files);
// Read before the plan files are replaced: renumbered cases are found by comparing them with the bundle.
const renames = renamesFor(readPlanFiles(planDir), bundle);
const renumbered = Object.keys(renames).filter((k) => bundle.idMap[k] !== renames[k]).length;
console.log(`${bundle.app}: ${files.length} plan file(s), ${Object.keys(renames).length} ID(s) to rename${renumbered > 0 ? ` (${renumbered} renumbered in the tool)` : ''} (bundle of ${bundle.generatedAt})`);
for (const c of bundle.conflicts) console.warn(`! ${c.legacyId} is claimed by ${c.tcIds.join(' and ')}: not renamed, sort it out in the tool`);

if (write) {
  mkdirSync(planDir, { recursive: true });
  for (const f of readdirSync(planDir).filter((x) => x.endsWith('.json'))) rmSync(path.join(planDir, f));
  for (const f of files) writeFileSync(path.join(root, f), JSON.stringify(bundle.files[f], null, 2) + '\n');
}
for (const f of files) console.log(`${write ? 'wrote' : 'would write'} ${f} (${bundle.files[f].cases.length} cases)`);

const specs: string[] = [];
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) specs.push(p);
  }
};
walk(path.join(root, 'tests'));
let total = 0;
for (const file of specs) {
  const before = readFileSync(file, 'utf8');
  const renamed = renameIds(before, renames);
  if (!renamed.changes.length) continue;
  total += renamed.changes.reduce((s, c) => s + c.count, 0);
  console.log(`${path.relative(root, file)}: ${renamed.changes.map((c) => `${c.from} → ${c.to}${c.count > 1 ? ` (×${c.count})` : ''}`).join(', ')}`);
  if (write) writeFileSync(file, renamed.text);
}
console.log(
  write
    ? `Done: ${total} ID(s) renamed (titles and tc() calls). Review with git diff, run typecheck, unit tests and a smoke run, then commit.`
    : `Dry run: ${total} ID(s) would be renamed. Add --write to apply.`,
);
