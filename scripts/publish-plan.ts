/**
 * Publishes a module test plan to ClickUp as a new page.
 * Run:  node --no-warnings --env-file=.env scripts/publish-plan.ts kyc "KYC"
 *       (parent defaults to Phoenix > Test plans; pass a page id as 3rd
 *       argument to publish a reviewed version under the module's plan page)
 */
import { loadPlan, planFile, renderPlanPage } from '../src/reporting/plan-markdown.ts';
import { clickupTarget, publishPage } from '../src/reporting/clickup.ts';

const [module, name, parent = clickupTarget.plansPageId] = process.argv.slice(2);
const token = process.env.CLICKUP_API_TOKEN;
if (!module || !name) throw new Error('Usage: publish-plan.ts <module> "<page name>" [parentPageId]');
if (!token) throw new Error('Set CLICKUP_API_TOKEN in .env (ClickUp > Settings > Apps > API Token).');
publishPage(token, name, renderPlanPage(loadPlan(process.cwd(), planFile(module))), parent).then((url) => console.log(`Published: ${url}`));
