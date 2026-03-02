import { test, expect } from '@playwright/test';

test('game-over overlay is not visible during planning @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('game-over-overlay')).not.toBeVisible();
});

test('VICTORY overlay shows when player wins', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const w = window as unknown as { __triggerGameOver: (w: string) => void };
    w.__triggerGameOver('player');
  });
  await expect(page.getByTestId('game-over-overlay')).toBeVisible();
  await expect(page.getByTestId('game-over-result')).toHaveText('VICTORY');
  await expect(page.getByTestId('play-again-btn')).toBeVisible();
});

test('DEFEAT overlay shows when AI wins', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const w = window as unknown as { __triggerGameOver: (w: string) => void };
    w.__triggerGameOver('ai');
  });
  await expect(page.getByTestId('game-over-overlay')).toBeVisible();
  await expect(page.getByTestId('game-over-result')).toHaveText('DEFEAT');
  await expect(page.getByTestId('play-again-btn')).toBeVisible();
});

test('command tray is hidden when game is over', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('command-slot-0')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __triggerGameOver: (w: string) => void };
    w.__triggerGameOver('ai');
  });
  await expect(page.getByTestId('game-over-overlay')).toBeVisible();
  await expect(page.getByTestId('command-slot-0')).not.toBeVisible();
});

test('Play Again resets to planning phase', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const w = window as unknown as { __triggerGameOver: (w: string) => void };
    w.__triggerGameOver('player');
  });
  await expect(page.getByTestId('game-over-overlay')).toBeVisible();
  await page.getByTestId('play-again-btn').click();
  await expect(page.getByTestId('game-over-overlay')).not.toBeVisible();
  await expect(page.getByTestId('command-slot-0')).toBeVisible();
});
