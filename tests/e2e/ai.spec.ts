import { test, expect, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as Window & { __EPOCH_SKIP_SETUP__?: boolean }).__EPOCH_SKIP_SETUP__ = true; });
});

async function lockInAndWaitForExecution(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
}

test('AI takes actions during execution @smoke', async ({ page }) => {
  await page.goto('/');
  await lockInAndWaitForExecution(page);

  const logEntries = page.getByTestId('log-entry');
  await expect(logEntries.first()).toBeVisible({ timeout: 10000 });
  const allText = await logEntries.allTextContents();
  const aiEntries = allText.filter((t) => t.toLowerCase().startsWith('ai'));
  expect(aiEntries.length).toBeGreaterThan(0);
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
  const allText = await logEntries.allTextContents();
  const aiEntries = allText.filter((t) => t.toLowerCase().startsWith('ai'));
  expect(aiEntries.length).toBeGreaterThan(0);
});
