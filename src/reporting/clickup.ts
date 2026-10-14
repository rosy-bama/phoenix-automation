/**
 * Publishes a markdown page to ClickUp Docs (API v3).
 * Defaults point at Phoenix > Test sessions > Automatic
 * (https://app.clickup.com/20509715/v/dc/khx0k-185755/khx0k-269135).
 *
 * The report page keeps the summary; "@@subpage <name>" sections (Defects,
 * Test plan with feedback) become child pages. Content is sent in chunks of at most ~25k characters (create, then
 * append), each table chunk repeating its header row. Found while publishing
 * by hand (13 Oct 2026): ClickUp rejects ("Bad Request") table rows with fewer
 * cells than the header and raw "<tag>" text — plan-markdown.ts avoids both.
 */

const API = 'https://api.clickup.com/api/v3';
const CHUNK = 25_000;

export const clickupTarget = {
  workspaceId: process.env.CLICKUP_WORKSPACE_ID ?? '20509715',
  docId: process.env.CLICKUP_DOC_ID ?? 'khx0k-185755',
  parentPageId: process.env.CLICKUP_REPORTS_PAGE_ID ?? 'khx0k-269135',
};

class ServerError extends Error {}

async function call(token: string, method: 'GET' | 'POST' | 'PUT', path: string, body?: object): Promise<any> {
  const { workspaceId, docId } = clickupTarget;
  let res: Response;
  try {
    res = await fetch(`${API}/workspaces/${workspaceId}/docs/${docId}${path}`, {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ServerError(`network: ${(e as Error).message}`);
  }
  const text = await res.text();
  if (res.status >= 500) throw new ServerError(`ClickUp ${res.status}: ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Letters and digits only: compares content across ClickUp's markdown re-formatting. */
const plain = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

type Listed = { id: string; name: string; parent_page_id?: string; pages?: Listed[] };
async function findChild(token: string, parentPageId: string, name: string): Promise<string | undefined> {
  const walk = (list: Listed[]): Listed | undefined => {
    for (const p of list) {
      if (p.parent_page_id === parentPageId && p.name === name) return p;
      const hit = walk(p.pages ?? []);
      if (hit) return hit;
    }
  };
  return walk((await call(token, 'GET', '/page_listing?max_page_depth=-1')) as Listed[])?.id;
}

/**
 * ClickUp sometimes answers 5xx ("context deadline exceeded", 14 Oct 2026)
 * after it has already done the work. So a retry first checks: for a create,
 * is the page already there? For an append, does the page already end with
 * this chunk? Only if not is the request sent again (up to 3 attempts).
 */
async function withRetry(what: string, attempt: () => Promise<string>, alreadyDone: () => Promise<string | undefined>) {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (e) {
      if (!(e instanceof ServerError) || n >= 3) throw e;
      console.log(`ClickUp: ${what} failed (${e.message}); checking before retry ${n}…`);
      await wait(5_000 * n);
      const done = await alreadyDone().catch(() => undefined);
      if (done) return done;
    }
  }
}

/** Splits markdown into chunks, cutting only between lines and repeating the current table header. */
export function chunk(markdown: string, size = CHUNK): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  let header: string[] = [];
  const lines = markdown.split('\n');
  lines.forEach((line, i) => {
    if (line.startsWith('| ') && lines[i + 1]?.startsWith('| ---')) header = [line, lines[i + 1]];
    else if (!line.startsWith('|')) header = [];
    if (length + line.length > size && current.length) {
      chunks.push(current.join('\n'));
      current = line.startsWith('|') && header.length && !line.startsWith('| ---') && line !== header[0] ? [...header] : [];
      length = current.join('\n').length;
    }
    current.push(line);
    length += line.length + 1;
  });
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

async function createChunked(token: string, name: string, markdown: string, parentPageId: string): Promise<string> {
  const [first, ...rest] = chunk(markdown);
  const id = await withRetry(
    `create "${name}"`,
    async () => {
      const { id } = await call(token, 'POST', '/pages', { parent_page_id: parentPageId, name, content: first, content_format: 'text/md' });
      if (!id) throw new Error('ClickUp did not return a page id');
      return id as string;
    },
    () => findChild(token, parentPageId, name),
  );
  for (const [i, part] of rest.entries()) {
    const lastLine = plain(part.trim().split('\n').pop() ?? '');
    await withRetry(
      `append part ${i + 2}/${rest.length + 1} of "${name}"`,
      async () => (await call(token, 'PUT', `/pages/${id}`, { content: '\n' + part, content_format: 'text/md', content_edit_mode: 'append' }), id),
      async () => {
        const page = await call(token, 'GET', `/pages/${id}?content_format=text/md`);
        return plain(page.content ?? '').endsWith(lastLine) ? id : undefined;
      },
    );
  }
  return id;
}

/**
 * Creates the report page and one child page per "@@subpage <name>" marker
 * line in the markdown (the markers themselves are not sent), e.g. "Defects"
 * and "Test plan with feedback". Returns the report URL.
 */
export async function publishPage(token: string, name: string, markdown: string): Promise<string> {
  const { workspaceId, docId, parentPageId } = clickupTarget;
  const [main, ...subpages] = markdown.split(/^@@subpage /m);
  const id = await createChunked(token, name, main.trimEnd(), parentPageId);
  for (const sub of subpages) {
    const newline = sub.indexOf('\n');
    await createChunked(token, sub.slice(0, newline).trim(), sub.slice(newline + 1).trim(), id);
  }
  return `https://app.clickup.com/${workspaceId}/v/dc/${docId}/${id}`;
}
