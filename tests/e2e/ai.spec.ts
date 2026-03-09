import { test, expect, Page } from '@playwright/test';
import { skipSetup, waitForGameReady } from './helpers';

test.beforeEach(async ({ page }) => { await skipSetup(page); });

async function lockInAndWaitForExecution(page: Page): Promise<void> {
  await waitForGameReady(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
}

test('AI takes actions during execution @smoke', async ({ page }) => {
  await page.goto('/');
  await lockInAndWaitForExecution(page);

  // Skip execution so the resolved event log is available in game state.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });

  const eventLog: string[] = await page.evaluate(() =>
    (window as Window & { __getEventLog?: () => string[] }).__getEventLog?.() ?? [],
  );
  const aiEvents = eventLog.filter((e) => e.toLowerCase().startsWith('ai'));
  expect(aiEvents.length).toBeGreaterThan(0);
});

test('AI builds structures over multiple epochs', async ({ page }) => {
  await page.goto('/');

  for (let i = 0; i < 3; i++) {
    await lockInAndWaitForExecution(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });
  }

  // After 3 epochs the AI should have taken actions visible in the event log.
  const eventLog: string[] = await page.evaluate(() =>
    (window as Window & { __getEventLog?: () => string[] }).__getEventLog?.() ?? [],
  );
  const aiEvents = eventLog.filter((e) => e.toLowerCase().startsWith('ai'));
  expect(aiEvents.length).toBeGreaterThan(0);
});
