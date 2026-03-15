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

/** Dismiss any post-epoch popups (stats summary, bonus card) to return to planning. */
export async function dismissPostEpochPopups(page: Page): Promise<void> {
  // CI environments are slower; allow enough time for popups to mount after execution.
  const statsPopup = page.getByTestId('epoch-stats-popup');
  const hadStats = await statsPopup.isVisible({ timeout: 2000 }).catch(() => false);
  if (hadStats) {
    await statsPopup.click();
    await expect(statsPopup).not.toBeVisible({ timeout: 3000 });
  }
  // Bonus card may mount after stats dismissal; wait longer if stats were shown.
  const bonusCard = page.getByTestId('bonus-card-overlay');
  if (await bonusCard.isVisible({ timeout: hadStats ? 1000 : 500 }).catch(() => false)) {
    await page.getByTestId('bonus-option-left').click();
    await expect(bonusCard).not.toBeVisible({ timeout: 3000 });
  }
}
