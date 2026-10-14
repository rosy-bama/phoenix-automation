import fiat from './fiat-wallet.plan.json';
import users from './user-management.plan.json';

type Case = { id: string; priority: string; smoke: boolean };
const plans: { sections: { cases: Case[] }[] }[] = [fiat, users];
const cases = new Map(plans.flatMap((p) => p.sections.flatMap((s) => s.cases)).map((c) => [c.id, c]));

/**
 * Test details for a plan case: '@smoke' when the plan marks it Smoke, plus
 * its priority ('@critical', '@high', ...). Unknown IDs fail fast, so a test
 * can't silently drift away from the plan.
 */
export function tc(id: string, ...extraTags: string[]) {
  const c = cases.get(id);
  if (!c) throw new Error(`${id} is not in any src/test-plan/*.plan.json`);
  return { tag: [...(c.smoke ? ['@smoke'] : []), `@${c.priority.toLowerCase()}`, ...extraTags] };
}
