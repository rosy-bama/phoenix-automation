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

async function call(token: string, method: 'POST' | 'PUT', path: string, body: object): Promise<{ id?: string }> {
  const { workspaceId, docId } = clickupTarget;
  const res = await fetch(`${API}/workspaces/${workspaceId}/docs/${docId}/pages${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json().catch(() => ({}))) as { id?: string };
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
  const { id } = await call(token, 'POST', '', { parent_page_id: parentPageId, name, content: first, content_format: 'text/md' });
  if (!id) throw new Error('ClickUp did not return a page id');
  for (const part of rest) {
    await call(token, 'PUT', `/${id}`, { content: '\n' + part, content_format: 'text/md', content_edit_mode: 'append' });
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
