import { test, expect, Page } from '@playwright/test';
import { PlayerId } from '@/engine/player';

async function advanceOneEpoch(page: Page): Promise<void> {
  await page.getByTestId('lock-in-btn').click({ force: true });
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');

  const gameOverVisible = await page.getByTestId('game-over-overlay').isVisible().catch(() => false);
  if (!gameOverVisible) {
    await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });
  }
}

async function triggerGameOver(page: Page, winner: PlayerId): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return typeof (window as Window & { __triggerGameOver?: unknown }).__triggerGameOver === 'function';
      });
    }, { timeout: 5000 })
    .toBe(true);

  await page.evaluate((w) => {
    (window as Window & { __triggerGameOver?: (winner: PlayerId) => void }).__triggerGameOver?.(w);
  }, winner);
}

test('smoke: player can play full match headlessly from planning to game-over @smoke', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await expect(page.getByTestId('command-slot-0')).toBeVisible();

  // Drive real player interactions through multiple full epochs.
  const EPOCHS_TO_PLAY = 20;
  for (let epoch = 0; epoch < EPOCHS_TO_PLAY; epoch++) {
    const isOver = await page.getByTestId('game-over-overlay').isVisible().catch(() => false);
    if (isOver) break;
    await advanceOneEpoch(page);
  }

  // Deterministic finish in test mode (only if the match did not naturally end yet).
  const isOver = await page.getByTestId('game-over-overlay').isVisible().catch(() => false);
  if (!isOver) {
    await triggerGameOver(page, 'ai');
  }

  await expect(page.getByTestId('game-over-overlay')).toBeVisible();
  await expect(page.getByTestId('game-over-result')).toBeVisible();

  const resultText = (await page.getByTestId('game-over-result').textContent())?.trim();
  expect(['VICTORY', 'DEFEAT']).toContain(resultText);
});
