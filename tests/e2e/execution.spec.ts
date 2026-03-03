import { test, expect, Page } from '@playwright/test';

async function lockIn(page: Page, isMobile: boolean): Promise<void> {
  const btn = page.getByTestId('lock-in-btn');
  await expect(btn).toBeVisible();

  if (isMobile) {
    await page.keyboard.press('Space');
  } else {
    await btn.click({ force: true });
  }
}

test('lock-in triggers execution animation with phase label @smoke', async ({ page, isMobile }) => {
  await page.goto('/');
  await lockIn(page, isMobile);
  // Phase label should appear during execution (after ~800ms lock-in delay).
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
});

test('skip button is visible during execution', async ({ page, isMobile }) => {
  await page.goto('/');
  await lockIn(page, isMobile);
  await expect(page.getByTestId('skip-btn')).toBeVisible({ timeout: 10000 });
});

test('skipping execution returns to planning', async ({ page, isMobile }) => {
  await page.goto('/');
  await lockIn(page, isMobile);
  // Wait for execution phase to start.
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
  // Skip via keyboard (Escape) — avoids FAB pointer interception race.
  await page.keyboard.press('Escape');
  // After skip, command tray should reappear (planning phase).
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });
  // Phase label should be gone.
  await expect(page.getByTestId('phase-label')).not.toBeVisible();
});

test('command tray is hidden during execution', async ({ page, isMobile }) => {
  await page.goto('/');
  // Verify tray is visible initially.
  await expect(page.getByTestId('command-slot-0')).toBeVisible();
  await lockIn(page, isMobile);
  // Wait for execution to start.
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
  // Tray should be hidden.
  await expect(page.getByTestId('command-slot-0')).not.toBeVisible();
});

test('keyboard shortcut skips execution', async ({ page, isMobile }) => {
  await page.goto('/');
  await lockIn(page, isMobile);
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
  // Press Space to skip.
  await page.keyboard.press('Space');
  // Should return to planning.
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 3000 });
});
