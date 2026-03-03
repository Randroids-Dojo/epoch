import { test, expect, Page } from '@playwright/test';

async function advanceOneEpoch(page: Page): Promise<void> {
  await page.getByTestId('lock-in-btn').click({ force: true });
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 5000 });

  // Skip execution to keep the test fast and deterministic in CI.
  await page.keyboard.press('Escape');

  // Either planning returns or game-over appears.
  await expect
    .poll(async () => {
      const overVisible = await page.getByTestId('game-over-overlay').isVisible().catch(() => false);
      if (overVisible) return 'over';

      const planningVisible = await page.getByTestId('command-slot-0').isVisible().catch(() => false);
      if (planningVisible) return 'planning';

      return 'pending';
    }, { timeout: 5000 })
    .toMatch(/over|planning/);
}

test('smoke: player can play full match headlessly from planning to game-over @smoke', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('command-slot-0')).toBeVisible();

  // From a real player's perspective: repeatedly lock in and skip execution.
  // This drives the full game loop without using engine internals.
  const MAX_EPOCHS = 80;
  for (let epoch = 0; epoch < MAX_EPOCHS; epoch++) {
    const isOver = await page.getByTestId('game-over-overlay').isVisible().catch(() => false);
    if (isOver) break;

    await advanceOneEpoch(page);
  }

  await expect(page.getByTestId('game-over-overlay')).toBeVisible();
  await expect(page.getByTestId('game-over-result')).toBeVisible();

  const resultText = (await page.getByTestId('game-over-result').textContent())?.trim();
  expect(['VICTORY', 'DEFEAT']).toContain(resultText);
});
