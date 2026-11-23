/**
 * Values in automation steps (spec §6.10.3): literals, or references resolved on this machine, so secrets never
 * appear in the tool.
 *
 *   "text"  500  true                 literals
 *   {{account.ADMIN.username}}        the admin account from .env (PHX_USERNAME, PHX_PASSWORD, PHX_OTP);
 *                                     password and otp are never printed
 *   {{data.walletUsername}}           test data from .env (walletUsername, savingsUsername, umUsername)
 *   {{run.env}} {{run.platform}}      the run's environment and platform
 */

export interface Account {
  fields: Record<string, string>;
  /** Fields never printed. */
  secret: string[];
}

export interface ValueContext {
  account: (name: string) => Account | undefined;
  data: (name: string) => string | undefined;
  run: { env: string; platform: string };
}

export interface Resolved {
  value: unknown;
  secret: boolean;
}

export function resolveValue(raw: string, ctx: ValueContext): Resolved {
  const t = raw.trim();
  if (t.startsWith('"')) return { value: JSON.parse(t) as string, secret: false };
  if (/^-?\d+(\.\d+)?$/.test(t)) return { value: Number(t), secret: false };
  if (t === 'true' || t === 'false') return { value: t === 'true', secret: false };
  const m = t.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
  if (!m) throw new Error(`Not a value: ${raw}`);
  const [scope, name, field, ...rest] = m[1].split('.');
  if (scope === 'account' && name && !rest.length) {
    const acc = ctx.account(name);
    if (!acc) throw new Error(`{{account.${name}}}: no such account on this machine`);
    if (!field) return { value: acc.fields, secret: true };
    if (!(field in acc.fields)) throw new Error(`{{account.${name}.${field}}}: an account has ${Object.keys(acc.fields).join(', ')}`);
    if (!acc.fields[field]) throw new Error(`{{account.${name}.${field}}} is not set in .env on this machine`);
    return { value: acc.fields[field], secret: acc.secret.includes(field) };
  }
  if (scope === 'data' && name && !field) {
    const v = ctx.data(name);
    if (v === undefined) throw new Error(`{{data.${name}}}: no such test data on this machine`);
    return { value: v, secret: false };
  }
  if (scope === 'run' && (name === 'env' || name === 'platform') && !field) return { value: ctx.run[name], secret: false };
  throw new Error(`Unknown reference ${t}: use {{account.NAME.field}}, {{data.NAME}}, {{run.env}} or {{run.platform}}`);
}

export const shown = (raw: string, r: Resolved): string => (r.secret ? raw : typeof r.value === 'string' ? JSON.stringify(r.value) : String(r.value));
