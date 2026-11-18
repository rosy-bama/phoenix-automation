import { defineConfig } from '@playwright/test';

/** Unit tests (no browser): npm run test:unit */
export default defineConfig({ testDir: './tests-unit', reporter: 'list' });
