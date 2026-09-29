import { Page, expect } from '@playwright/test';

/**
 * Fills the 6-box OTP input. CONFIRMED from codegen (29 Sep 2026): each box is
 * a textbox with accessible name "OTP Input 1" ... "OTP Input 6", and the form
 * auto-submits after the 6th digit (no Verify button click needed).
 * Used by both the login screen and manual-operation confirmation.
 */
export async function fillOtp(page: Page, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error(`OTP must be exactly 6 digits, got "${code}"`);
  await expect(page.getByRole('textbox', { name: 'OTP Input 1' })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.getByRole('textbox', { name: `OTP Input ${i + 1}` }).fill(code[i]);
  }
}
