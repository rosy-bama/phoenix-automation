/**
 * Prints a module test plan (src/test-plan/<module>.plan.json) as ClickUp
 * markdown, to paste into / publish as the plan page.
 * Run:  npm run plan:render > plan.md                 (Fiat Wallet)
 *       npm run plan:render -- user-management > plan.md
 */
import { loadPlan, planFile, renderPlanPage } from '../src/reporting/plan-markdown.ts';

const module = process.argv[2] ?? 'fiat-wallet';
process.stdout.write(renderPlanPage(loadPlan(process.cwd(), planFile(module))) + '\n');
