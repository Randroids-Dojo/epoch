import { test, expect, Page } from '@playwright/test';
import { skipSetup, waitForGameReady } from './helpers';

test.beforeEach(async ({ page }) => { await skipSetup(page); });

/** Ensure the game is in a stable planning state ready for input. */
async function waitForPlanningReady(page: Page): Promise<void> {
  await waitForGameReady(page);
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('phase-label')).not.toBeVisible();
}

/** Lock in the current epoch and wait for execution animation to start. */
async function lockInAndWaitForExecution(page: Page): Promise<void> {
  await waitForPlanningReady(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 10000 });
}

/** Run one full epoch: lock in → execution animation → skip → back to planning. */
async function runEpoch(page: Page): Promise<void> {
  await lockInAndWaitForExecution(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5000 });
}

test('AI takes actions during execution @smoke', async ({ page }) => {
  await page.goto('/');
  await runEpoch(page);

  const eventLog: string[] = await page.evaluate(() =>
    (window as Window & { __getEventLog?: () => string[] }).__getEventLog?.() ?? [],
  );
  const aiEvents = eventLog.filter((e) => e.toLowerCase().startsWith('ai'));
  expect(aiEvents.length).toBeGreaterThan(0);
});

test('AI builds structures over multiple epochs', async ({ page }) => {
  await page.goto('/');

  let allAiEvents: string[] = [];
  for (let i = 0; i < 3; i++) {
    await runEpoch(page);
    const eventLog: string[] = await page.evaluate(() =>
      (window as Window & { __getEventLog?: () => string[] }).__getEventLog?.() ?? [],
    );
    allAiEvents = allAiEvents.concat(
      eventLog.filter((e) => e.toLowerCase().startsWith('ai')),
    );
  }

  // After 3 epochs the AI should have taken actions visible in the event log.
  expect(allAiEvents.length).toBeGreaterThan(0);
});
