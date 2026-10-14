import { Locator, Page } from '@playwright/test';

/**
 * Index of the tab that looks selected: an explicit aria/class state first,
 * otherwise the one tab whose background differs from all the others
 * (Phoenix tabs are plain buttons with a white "pill" on the active one).
 */
export async function selectedIndex(tabs: Locator[]): Promise<number> {
  const states = await Promise.all(
    tabs.map((t) =>
      t.evaluate((e) => ({
        aria: e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true',
        cls: /\b(active|selected)\b/i.test(e.className),
        bg: getComputedStyle(e).backgroundColor,
      })),
    ),
  );
  const explicit = states.findIndex((s) => s.aria || s.cls);
  if (explicit >= 0) return explicit;
  return states.findIndex((s, i) => states.every((o, j) => j === i || o.bg !== s.bg));
}

/** "rgb(26, 153, 77)" -> 'green' | 'red' | 'other', from text or border colour. */
export async function tone(el: Locator): Promise<'green' | 'red' | 'other'> {
  const colors = await el.evaluate((e) => {
    const s = getComputedStyle(e);
    return [s.color, s.borderColor, s.backgroundColor];
  });
  for (const c of colors) {
    const m = c.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const [r, g, b] = m.slice(1).map(Number);
    if (g > r + 30 && g > b) return 'green';
    if (r > g + 60 && r > b + 40) return 'red';
  }
  return 'other';
}

/** "28/09/2026 10:48" -> Date. */
export function parseDmy(text: string): Date {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) throw new Error(`No DD/MM/YYYY date in "${text}"`);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function isDescending(dates: Date[]) {
  return dates.every((d, i) => i === 0 || dates[i - 1].getTime() >= d.getTime());
}

export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

/** True when the app shows its "Oops! An unexpected error occurred." page. */
export async function crashed(page: Page): Promise<boolean> {
  return page.getByRole('heading', { name: 'Oops!' }).isVisible();
}
