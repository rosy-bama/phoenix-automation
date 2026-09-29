import { Page } from '@playwright/test';

/**
 * Selector policy: role + accessible name first (checked in the DevTools
 * Accessibility panel), then placeholder/text, CSS classes last. Every
 * locator marked CONFIRMED came from Rose's codegen recording of 29 Sep 2026;
 * INFERRED ones still need a live check.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path = '/') {
    await this.page.goto(path);
  }
}
