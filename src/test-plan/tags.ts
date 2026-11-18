import fiat from './fiat-wallet.plan.json';
import users from './user-management.plan.json';
import kyc from './kyc.plan.json';
import path from 'node:path';
import { normaliseId, readPlan } from '../support/plan';

const toolPlan = readPlan(path.resolve(__dirname, '../../test-plan'));

type Case = { id: string; priority: string; smoke: boolean };
const plans: { sections: { cases: Case[] }[] }[] = [fiat, users, kyc];
const cases = new Map(plans.flatMap((p) => p.sections.flatMap((s) => s.cases)).map((c) => [c.id, c]));

/**
 * Test details for a plan case: '@smoke' when the plan marks it Smoke, plus
 * its priority ('@critical', '@high', ...). Unknown IDs fail fast, so a test
 * can't silently drift away from the plan.
 */
export function tc(id: string, ...extraTags: string[]) {
  // Once the Ejara Automation Tool's plan is applied (test-plan/*.json), it is the source of IDs and tags.
  if (toolPlan.byId.size) {
    const key = normaliseId(id);
    const found = toolPlan.byId.get(key) ?? toolPlan.byId.get(toolPlan.byLegacy.get(key) ?? '');
    if (!found) throw new Error(`${id} is not in test-plan/: add the case in the tool, or remove the test`);
    if (!toolPlan.byId.has(key)) console.warn(`[tc] ${id} is a former ID of ${found.id}: run \`npm run plan:apply -- <bundle> --write\``);
    return { tag: [...found.tags, ...extraTags] };
  }
  const c = cases.get(id);
  if (!c) throw new Error(`${id} is not in any src/test-plan/*.plan.json`);
  return { tag: [...(c.smoke ? ['@smoke'] : []), `@${c.priority.toLowerCase()}`, ...extraTags] };
}
