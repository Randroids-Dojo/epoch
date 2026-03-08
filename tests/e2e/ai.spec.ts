import { test, expect, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as Window & { __EPOCH_SKIP_SETUP__?: boolean }).__EPOCH_SKIP_SETUP__ = true; });
});

async function waitForGameReady(page: Page): Promise<void> {
  await expect(page.getByTestId('difficulty-picker')).not.toBeVisible({ timeout: 5000 });
}

async function lockInAndWaitForExecution(page: Page): Promise<void> {
  await waitForGameReady(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
}

test('AI takes actions during execution @smoke', async ({ page }) => {
  await page.goto('/');
  await lockInAndWaitForExecution(page);

  const logEntries = page.getByTestId('log-entry');
  await expect(logEntries.first()).toBeVisible({ timeout: 10000 });

  // Poll until AI log entries appear (execution animation streams entries over time).
  await expect.poll(async () => {
    const allText = await logEntries.allTextContents();
    return allText.filter((t) => t.toLowerCase().startsWith('ai')).length;
  }, { timeout: 10000 }).toBeGreaterThan(0);
});

test('AI builds structures over multiple epochs', async ({ page }) => {
  await page.goto('/');

  for (let i = 0; i < 3; i++) {
    await lockInAndWaitForExecution(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });
  }

  await lockInAndWaitForExecution(page);
  const logEntries = page.getByTestId('log-entry');
  await expect(logEntries.first()).toBeVisible({ timeout: 10000 });

  // Poll until AI log entries appear.
  await expect.poll(async () => {
    const allText = await logEntries.allTextContents();
    return allText.filter((t) => t.toLowerCase().startsWith('ai')).length;
  }, { timeout: 10000 }).toBeGreaterThan(0);
});
