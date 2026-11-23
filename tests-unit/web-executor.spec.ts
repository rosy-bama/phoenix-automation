/**
 * The web step API on a real browser page (no Phoenix needed): click, fill, a custom select, waiting checks, and a
 * failing step that names itself.
 */
import { expect, test } from '@playwright/test';
import { runCase, type ExecutorDeps } from '../src/executor/execute';
import type { PlanCase, Step } from '../src/executor/plan';
import { webScreen } from '../src/executor/web';
import type { Catalog } from '../src/support/catalog';

const html = `<h1>Manual operation</h1>
<input aria-label="Amount" id="amount"><div role="combobox" aria-label="Operator" id="op">Pick</div>
<div id="list" hidden><div role="option" onclick="document.getElementById('op').textContent=this.textContent;document.getElementById('list').hidden=true">MTN</div><div role="option">Orange</div></div>
<button id="save" disabled onclick="setTimeout(()=>document.getElementById('msg').textContent='Saved 500 XAF',300)">Save</button><p id="msg"></p>
<script>document.getElementById('op').onclick=()=>document.getElementById('list').hidden=false;
document.getElementById('amount').oninput=(e)=>document.getElementById('save').disabled=!e.target.value</script>`;

const catalog: Catalog = { version: 1, app: 'Phoenix', framework: 'playwright', screens: [], flows: [] };
const kase = (...steps: Step[]): PlanCase => ({ tcId: 'FW-001', title: 'x', tags: [], testTitle: 'FW-001 x', steps: steps.map((step, i) => ({ line: i + 1, text: JSON.stringify(step), step })) });

test('steps run on a real page with the page object’s locators', async ({ page }) => {
  await page.setContent(html);
  const obj = {
    heading: page.getByRole('heading', { name: 'Manual operation' }),
    amountInput: page.getByRole('textbox', { name: 'Amount' }),
    operatorSelect: page.getByRole('combobox', { name: 'Operator' }),
    saveButton: page.getByRole('button', { name: 'Save' }),
    message: page.locator('#msg'),
  };
  const sc = webScreen('manualOp', obj, page);
  const deps: ExecutorDeps = {
    catalog,
    screen: async () => sc,
    flow: async () => async () => undefined,
    values: { account: () => undefined, data: () => undefined, run: { env: 'testbox', platform: 'web' } },
    allow: { movesMoney: false, changesState: false },
    testContext: page,
    pause: (ms) => page.waitForTimeout(ms),
    log: () => {},
  };
  await runCase(
    kase(
      { kind: 'expect', target: 'manualOp', condition: 'shown' },
      { kind: 'expect', target: 'manualOp.saveButton', condition: 'disabled' },
      { kind: 'type', target: 'manualOp.amountInput', value: '500' },
      { kind: 'select', target: 'manualOp.operatorSelect', value: '"MTN"' },
      { kind: 'expect', target: 'manualOp.operatorSelect', condition: 'text', op: 'is', value: '"MTN"' },
      { kind: 'tap', target: 'manualOp.saveButton' },
      { kind: 'expect', target: 'manualOp.message', condition: 'text', op: 'contains', value: '"saved 500"' },
    ),
    deps,
  );
  await expect(
    runCase(kase({ kind: 'expect', target: 'manualOp.message', condition: 'hidden' }), { ...deps, screen: async () => webScreen('manualOp', obj, page) }),
  ).rejects.toThrow(/^step 1 \(line 1\): .* — .*toBeHidden/s);
});
