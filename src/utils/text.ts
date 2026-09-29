export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "FCFA 5,000" -> 5000 ; "148280.00 XAF" -> 148280 */
export function parseAmount(text: string): number {
  const m = text.replace(/\s/g, '').match(/-?[\d,]+(\.\d+)?/);
  if (!m) throw new Error(`No amount found in "${text}"`);
  return Number(m[0].replace(/,/g, ''));
}
