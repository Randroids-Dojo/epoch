import { Page, expect } from '@playwright/test';

/** Set the skip-setup flag before page load so the difficulty picker is auto-dismissed. */
export async function skipSetup(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __EPOCH_SKIP_SETUP__?: boolean }).__EPOCH_SKIP_SETUP__ = true;
  });
}

/** Wait for the difficulty picker to be dismissed before interacting. */
export async function waitForGameReady(page: Page): Promise<void> {
  await expect(page.getByTestId('difficulty-picker')).not.toBeVisible({ timeout: 5000 });
}
