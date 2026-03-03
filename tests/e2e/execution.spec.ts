import { test, expect, Page } from '@playwright/test';

async function enterExecution(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
}

test('lock-in triggers execution animation with phase label @smoke', async ({ page }) => {
  await page.goto('/');
  await enterExecution(page);
});

test('skip button is visible during execution', async ({ page }) => {
  await page.goto('/');
  await enterExecution(page);
  await expect(page.getByTestId('skip-btn')).toBeVisible({ timeout: 5000 });
});

test('skipping execution returns to planning', async ({ page }) => {
  await page.goto('/');
  await enterExecution(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('phase-label')).not.toBeVisible();
});

test('command tray is hidden during execution', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('command-slot-0')).toBeVisible();
  await enterExecution(page);
  await expect(page.getByTestId('command-slot-0')).not.toBeVisible();
});

test('keyboard shortcut skips execution', async ({ page }) => {
  await page.goto('/');
  await enterExecution(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 3000 });
});
