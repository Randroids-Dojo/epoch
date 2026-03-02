import { test, expect } from '@playwright/test';

test('lock-in triggers execution animation with phase label @smoke', async ({ page }) => {
  await page.goto('/');
  // Lock in via the button.
  const btn = page.getByTestId('lock-in-btn');
  await btn.click({ force: true });
  // Phase label should appear during execution (after ~800ms lock-in delay).
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 5000 });
});

test('skip button is visible during execution', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByTestId('lock-in-btn');
  await btn.click({ force: true });
  await expect(page.getByTestId('skip-btn')).toBeVisible({ timeout: 5000 });
});

test('skip button ends execution and returns to planning', async ({ page }) => {
  await page.goto('/');
  const lockBtn = page.getByTestId('lock-in-btn');
  await lockBtn.click({ force: true });
  // Wait for execution phase to start.
  await expect(page.getByTestId('skip-btn')).toBeVisible({ timeout: 5000 });
  // Click skip.
  await page.getByTestId('skip-btn').click();
  // After skip, command tray should reappear (planning phase).
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 3000 });
  // Phase label should be gone.
  await expect(page.getByTestId('phase-label')).not.toBeVisible();
});

test('command tray is hidden during execution', async ({ page }) => {
  await page.goto('/');
  // Verify tray is visible initially.
  await expect(page.getByTestId('command-slot-0')).toBeVisible();
  // Lock in.
  await page.getByTestId('lock-in-btn').click({ force: true });
  // Wait for execution to start.
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 5000 });
  // Tray should be hidden.
  await expect(page.getByTestId('command-slot-0')).not.toBeVisible();
});

test('keyboard shortcut skips execution', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('lock-in-btn').click({ force: true });
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 5000 });
  // Press Space to skip.
  await page.keyboard.press('Space');
  // Should return to planning.
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 3000 });
});
