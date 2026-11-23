/**
 * The real page objects behind catalog.json's words, on a Playwright page, for the executor (spec §6.10.4). Loaded
 * from the files the catalog names (`new X(page)`), so a new page object needs no registration: `npm run catalog`
 * is enough. Steps use the page object's own Locators and Playwright's waiting assertions.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Catalog } from '../support/catalog';
import type { StepScreen } from './execute';

export function readCatalog(root: string): Catalog {
  return JSON.parse(readFileSync(path.join(root, 'catalog.json'), 'utf8')) as Catalog;
}

const isLocator = (x: unknown): x is Locator => !!x && typeof (x as Locator).click === 'function' && typeof (x as Locator).fill === 'function';
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The step API on a page object: its Locators by property name, plus its own methods (for `do`). */
export function webScreen(id: string, obj: Record<string, unknown>, page: Page): StepScreen {
  const loc = (key: string): Locator => {
    const l = obj[key];
    if (!isLocator(l)) throw new Error(`${id} has no element "${key}"`);
    return l;
  };
  const api: StepScreen = {
    stepTap: async (key) => loc(key).click(),
    stepType: async (key, value) => loc(key).fill(value),
    async stepSelect(key, value) {
      const l = loc(key);
      if ((await l.evaluate((e) => e.tagName.toLowerCase())) === 'select') {
        await l.selectOption({ label: value });
        return;
      }
      // Ant Design selects: open, then pick the option by its name.
      await l.click();
      await page.getByRole('option', { name: value, exact: true }).or(page.getByTitle(value, { exact: true })).first().click();
    },
    async stepExpectShown() {
      const anchor = obj.heading ?? obj.anchor;
      if (isLocator(anchor)) return expect(anchor).toBeVisible();
      for (const m of ['expectLoaded', 'expectOpen']) if (typeof obj[m] === 'function') return (obj[m] as () => Promise<void>).call(obj);
      throw new Error(`${id} has no heading to check: write \`expect ${id}.<element>\``);
    },
    async stepExpect(key, condition) {
      const l = loc(key);
      if (condition === 'visible') await expect(l).toBeVisible();
      else if (condition === 'hidden') await expect(l).toBeHidden();
      else if (condition === 'enabled') await expect(l).toBeEnabled();
      else await expect(l).toBeDisabled();
    },
    stepText: async (key) => ((await loc(key).first().innerText()) ?? '').trim(),
    async stepExpectText(key, op, value) {
      const l = loc(key);
      if (op === 'is') await expect(l).toHaveText(value.trim());
      else if (op === 'contains') await expect(l).toContainText(new RegExp(escapeRegex(value), 'i'));
      else await expect(l).toHaveText(new RegExp(value));
    },
  };
  // `do screen.action(…)` calls the page object's own method.
  return new Proxy(api, {
    get: (target, prop) => (prop in target ? target[prop as keyof StepScreen] : typeof obj[prop as string] === 'function' ? (obj[prop as string] as (...a: unknown[]) => unknown).bind(obj) : obj[prop as string]),
  });
}

/** Screens and flows of the catalog on this page: one page object per screen, made once per test. */
export function webRegistry(catalog: Catalog, root: string, page: Page) {
  const made = new Map<string, StepScreen>();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = (file: string) => require(path.join(root, file)) as Record<string, unknown>;
  return {
    async screen(id: string): Promise<StepScreen> {
      const s = catalog.screens.find((x) => x.id === id);
      if (!s) throw new Error(`No screen "${id}" in catalog.json: run \`npm run catalog\``);
      if (!made.has(id)) {
        const Cls = load(s.file)[s.className] as (new (p: Page) => Record<string, unknown>) | undefined;
        if (typeof Cls !== 'function') throw new Error(`${s.file} doesn't export ${s.className}`);
        made.set(id, webScreen(id, new Cls(page), page));
      }
      return made.get(id)!;
    },
    async flow(id: string): Promise<(...args: unknown[]) => Promise<unknown>> {
      const f = catalog.flows.find((x) => x.id === id);
      if (!f) throw new Error(`No flow "${id}" in catalog.json: run \`npm run catalog\``);
      const fn = load(f.file)[id.slice(f.module.length + 1)];
      if (typeof fn !== 'function') throw new Error(`${f.file} doesn't export ${id}`);
      return fn as (...args: unknown[]) => Promise<unknown>;
    },
  };
}
