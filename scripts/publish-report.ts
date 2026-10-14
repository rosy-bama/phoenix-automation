/**
 * Publishes an existing test-session report to ClickUp "Test sessions > Automatic"
 * (same as the end of a complete run), e.g. when CLICKUP_API_TOKEN was not set yet.
 * Run:  node --no-warnings --env-file=.env scripts/publish-report.ts reports/user-management/<stamp>.md "User management — 13/10/2026 23:55"
 */
import * as fs from 'fs';
import { publishPage } from '../src/reporting/clickup.ts';

const [file, name] = process.argv.slice(2);
const token = process.env.CLICKUP_API_TOKEN;
if (!file || !name) throw new Error('Usage: publish-report.ts <report.md> "<page name>"');
if (!token) throw new Error('Set CLICKUP_API_TOKEN in .env (ClickUp > Settings > Apps > API Token).');
publishPage(token, name, fs.readFileSync(file, 'utf-8')).then((url) => console.log(`Published: ${url}`));
