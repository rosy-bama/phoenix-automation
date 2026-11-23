/**
 * catalog.json: the vocabulary the Ejara Automation Tool's test cases are written in (spec §6.10.2), generated from
 * the page objects, never written by hand, so it can't drift from the code.
 *   - screens: every exported page object of src/pages/** built from the Playwright page (`new X(page)`); its id is
 *     its fixture name in src/fixtures/test-fixtures.ts (fiatAccounts, userDetails…), otherwise its class name
 *     ("FilterPanel" → filterPanel, "LoginPage" → login)
 *   - elements: its public `Locator` properties
 *   - actions: its public async methods; `returns` is what a read gives back (null for an action)
 *   - guards: a method tagged @movesMoney or @changesState in its JSDoc (and the elements it uses) runs from the
 *     tool's automation steps only when PHX_ALLOW_MONEY_OPS / PHX_ALLOW_ACCOUNT_OPS allow it (spec §6.10.4)
 *
 *   npm run catalog            # writes catalog.json
 *   npm run catalog -- --check # fails if catalog.json is out of date
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type Guard = 'movesMoney' | 'changesState';

export interface CatalogElement {
  id: string;
  kind: 'button' | 'field' | 'text' | 'tab' | 'toggle' | 'list' | 'anchor' | 'element';
  platforms: string[];
  guard?: Guard;
}
export interface CatalogParam {
  name: string;
  type: string;
  optional: boolean;
}
export interface CatalogAction {
  id: string;
  params: CatalogParam[];
  description: string | null;
  returns: string | null;
  guard?: Guard;
}
export interface CatalogScreen {
  id: string;
  name: string;
  /** The page object's class and file, for the executor. */
  className: string;
  file: string;
  description: string | null;
  elements: CatalogElement[];
  actions: CatalogAction[];
}
export interface Catalog {
  version: 1;
  app: string;
  framework: string;
  screens: CatalogScreen[];
  flows: (CatalogAction & { module: string; file: string; needsTestContext: boolean })[];
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out.sort();
}

const doc = (node: ts.Node): string | null => {
  const jsDoc = (node as { jsDoc?: { comment?: string | ts.NodeArray<ts.JSDocComment> }[] }).jsDoc;
  const text = (jsDoc ?? [])
    .map((d) => (typeof d.comment === 'string' ? d.comment : (d.comment?.map((x) => x.text).join('') ?? '')))
    .join(' ');
  return text.trim() ? text.replace(/\s+/g, ' ').trim() : null;
};

function guardOf(node: ts.Node): Guard | undefined {
  const tags = ts.getJSDocTags(node).map((t) => t.tagName.text);
  return tags.includes('movesMoney') ? 'movesMoney' : tags.includes('changesState') ? 'changesState' : undefined;
}

/** "submitButton" → button, "searchInput" → field, "heading" → anchor… */
export function elementKind(key: string): CatalogElement['kind'] {
  if (key === 'anchor' || key === 'heading') return 'anchor';
  if (/(button|btn|link|cta|option)$/i.test(key)) return 'button';
  if (/(input|field|box|select|amount|date)$/i.test(key)) return 'field';
  if (/tab$/i.test(key)) return 'tab';
  if (/(toggle|switch|checkbox)$/i.test(key)) return 'toggle';
  if (/(list|rows?|table)$/i.test(key)) return 'list';
  if (/(text|message|title|label|heading|badge|error|banner|description|breadcrumb|subtitle)$/i.test(key)) return 'text';
  return 'element';
}

const lowerFirst = (s: string) => s.replace(/^./, (c) => c.toLowerCase());
const isPublic = (m: ts.ClassElement) =>
  !ts.getModifiers(m as ts.HasModifiers)?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword || x.kind === ts.SyntaxKind.StaticKeyword) &&
  !!m.name &&
  ts.isIdentifier(m.name) &&
  !m.name.text.startsWith('_');

/** Fixture names of the page objects: `fiatAccounts: async ({ page }, use) => use(new FiatAccountListPage(page))`. */
function fixtureNames(file: string): Map<string, string> {
  const out = new Map<string, string>();
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const m of text.matchAll(/^\s*(\w+):\s*async\s*\(\{\s*page\s*\},\s*use\)\s*=>\s*use\(new\s+(\w+)\(page\)\)/gm)) out.set(m[2], m[1]);
  return out;
}

export function buildCatalog(root: string): Catalog {
  const pageFiles = files(path.join(root, 'src', 'pages'));
  const flowsDir = path.join(root, 'src', 'flows');
  const flowFiles = (() => {
    try {
      return files(flowsDir);
    } catch {
      return [];
    }
  })();
  const program = ts.createProgram([...pageFiles, ...flowFiles], { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, strict: true, skipLibCheck: true, esModuleInterop: true });
  const checker = program.getTypeChecker();
  const fixtures = fixtureNames(path.join(root, 'src', 'fixtures', 'test-fixtures.ts'));

  const paramsOf = (fn: ts.SignatureDeclarationBase, src: ts.SourceFile): CatalogParam[] =>
    fn.parameters.map((p) => ({
      name: p.name.getText(src).replace(/\s+/g, ' '),
      type: p.type ? p.type.getText(src).replace(/\s+/g, ' ') : checker.typeToString(checker.getTypeAtLocation(p)),
      optional: Boolean(p.questionToken || p.initializer),
    }));
  /** Promise<void> → null (an action); Promise<string[]> → "string[]" (a read). Inferred when not written. */
  const returnsOf = (fn: ts.SignatureDeclaration): string | null => {
    const sig = checker.getSignatureFromDeclaration(fn);
    if (!sig) return null;
    const ret = checker.getReturnTypeOfSignature(sig);
    const inner = checker.getAwaitedType(ret) ?? ret;
    const t = checker.typeToString(inner);
    return t === 'void' || t === 'undefined' ? null : t;
  };

  const screens: CatalogScreen[] = [];
  for (const file of pageFiles) {
    const src = program.getSourceFile(file)!;
    for (const st of src.statements) {
      if (!ts.isClassDeclaration(st) || !st.name || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      // Built from the page only: constructor(page: Page) (a base class's constructor counts).
      const ctor = st.members.find(ts.isConstructorDeclaration);
      if (ctor && (ctor.parameters.length !== 1 || !/^Page$/.test(ctor.parameters[0].type?.getText(src) ?? ''))) continue;
      if (!ctor && !st.heritageClauses) continue;
      const className = st.name.text;
      if (className === 'BasePage') continue; // the base of every page: nothing of its own to use
      const elements: CatalogElement[] = [];
      const actions: CatalogAction[] = [];
      const guarded = new Map<string, Guard>();
      for (const m of st.members) {
        if (ts.isPropertyDeclaration(m) && isPublic(m) && m.type?.getText(src) === 'Locator') {
          const id = (m.name as ts.Identifier).text;
          const guard = guardOf(m);
          elements.push({ id, kind: elementKind(id), platforms: ['web'], ...(guard ? { guard } : {}) });
        }
        if (ts.isMethodDeclaration(m) && isPublic(m) && m.modifiers?.some((x) => x.kind === ts.SyntaxKind.AsyncKeyword)) {
          const guard = guardOf(m);
          // A guarded method does something by definition: an action even when it also tells something back.
          actions.push({ id: (m.name as ts.Identifier).text, params: paramsOf(m, src), description: doc(m), returns: guard ? null : returnsOf(m), ...(guard ? { guard } : {}) });
          // The elements a guarded method uses are guarded too: `tap x.confirmButton` is `do x.confirm()`.
          if (guard && m.body) for (const x of m.body.getText(src).matchAll(/this\.(\w+)/g)) guarded.set(x[1], guard);
        }
      }
      for (const el of elements) if (!el.guard && guarded.has(el.id)) el.guard = guarded.get(el.id);
      screens.push({
        id: fixtures.get(className) ?? lowerFirst(className.replace(/Page$/, '')),
        name: className,
        className,
        file: path.relative(root, file),
        description: doc(st),
        elements,
        actions,
      });
    }
  }

  const flows: Catalog['flows'] = [];
  for (const file of flowFiles) {
    const src = program.getSourceFile(file)!;
    const module = path.basename(file, '.ts');
    for (const st of src.statements) {
      if (!ts.isFunctionDeclaration(st) || !st.name || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (!st.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) continue;
      const params = paramsOf(st, src);
      const needsPage = params[0]?.type === 'Page';
      const guard = guardOf(st);
      flows.push({ id: `${module}.${st.name.text}`, module, file: path.relative(root, file), params: needsPage ? params.slice(1) : params, description: doc(st), returns: guard ? null : returnsOf(st), ...(guard ? { guard } : {}), needsTestContext: needsPage });
    }
  }
  const manifest = JSON.parse(readFileSync(path.join(root, 'ejara-automation.json'), 'utf8')) as { app: string; framework: string };
  return { version: 1, app: manifest.app, framework: manifest.framework, screens: screens.sort((a, b) => a.id.localeCompare(b.id)), flows };
}
