/**
 * Writes catalog.json (spec §6.10.2), generated from the page objects: see src/support/catalog.ts.
 *
 *   npm run catalog            # writes catalog.json
 *   npm run catalog -- --check # fails if catalog.json is out of date (pull requests)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCatalog } from '../src/support/catalog.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'catalog.json');
const catalog = buildCatalog(root);
const text = JSON.stringify(catalog, null, 2) + '\n';
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* none yet */
  }
  if (current !== text) {
    console.error('✘ catalog.json is out of date: run `npm run catalog` and commit it.');
    process.exit(1);
  }
  console.log('✔ catalog.json is up to date.');
} else {
  writeFileSync(out, text);
  const el = catalog.screens.flatMap((s) => s.elements);
  console.log(`✔ catalog.json: ${catalog.screens.length} screens, ${el.length} elements, ${catalog.screens.reduce((n, s) => n + s.actions.length, 0)} actions, ${catalog.flows.length} flows`);
}
