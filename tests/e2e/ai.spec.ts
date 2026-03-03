import { test, expect } from '@playwright/test';


async function lockInAndWaitExecution(page: import('@playwright/test').Page): Promise<void> {
  const btn = page.getByTestId('lock-in-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
}

test('AI takes actions during execution @smoke', async ({ page }) => {
  await page.goto('/');
  // Lock in to trigger resolution.
  await lockInAndWaitExecution(page);
  // Event log should show AI actions (entries starting with "ai").
  const logEntries = page.getByTestId('log-entry');
  // Wait for at least one log entry to appear.
  await expect(logEntries.first()).toBeVisible({ timeout: 5000 });
  // Collect log text — at least one should mention AI.
  const allText = await logEntries.allTextContents();
  const aiEntries = allText.filter((t) => t.toLowerCase().startsWith('ai'));
  expect(aiEntries.length).toBeGreaterThan(0);
});

test('AI builds structures over multiple epochs', async ({ page }) => {
  await page.goto('/');

  // Run 3 epochs by locking in and skipping each time.
  for (let i = 0; i < 3; i++) {
    await lockInAndWaitExecution(page);
    // Skip execution via keyboard.
    await page.keyboard.press('Escape');
    // Wait for planning phase to return.
    await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });
  }

  // After 3 epochs, the AI should have taken various actions.
  // Lock in one more time to see cumulative results.
  await lockInAndWaitExecution(page);
  const logEntries = page.getByTestId('log-entry');
  await expect(logEntries.first()).toBeVisible({ timeout: 5000 });
  const allText = await logEntries.allTextContents();
  const aiEntries = allText.filter((t) => t.toLowerCase().startsWith('ai'));
  expect(aiEntries.length).toBeGreaterThan(0);
});
