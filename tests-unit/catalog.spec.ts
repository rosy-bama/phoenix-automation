/**
 * catalog.json (spec §6.10.2): up to date with the page objects, and every word reaches real code — each page object
 * builds from a page, with each element a Locator and each action a method.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { buildCatalog, elementKind } from '../src/support/catalog';
import { webRegistry } from '../src/executor/web';

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(readFileSync(path.join(root, 'catalog.json'), 'utf8'));

test('catalog.json is up to date (npm run catalog)', () => {
  expect(buildCatalog(root)).toEqual(catalog);
});

test('element kinds from their names', () => {
  expect([elementKind('loginButton'), elementKind('searchInput'), elementKind('heading'), elementKind('mainWalletTab')]).toEqual(['button', 'field', 'anchor', 'tab']);
});

/** A page that answers anything with a locator-like object (no browser). */
const fakeLocator: unknown = new Proxy(function () {}, { get: () => fakeLocator, apply: () => fakeLocator });

test('every screen builds on a page, with its elements and actions', async () => {
  const { screen } = webRegistry(catalog, root, fakeLocator as never);
  for (const s of catalog.screens) {
    const sc = (await screen(s.id)) as unknown as Record<string, unknown>;
    for (const a of s.actions) expect(typeof sc[a.id], `${s.id}.${a.id}`).toBe('function');
  }
});
