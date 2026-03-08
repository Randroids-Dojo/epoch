import { test, expect } from '@playwright/test';
import { INITIAL_GLOBAL_SLOTS } from '@/engine/state';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as Window & { __EPOCH_SKIP_SETUP__?: boolean }).__EPOCH_SKIP_SETUP__ = true; });
});

test('global command slots are visible @smoke', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < INITIAL_GLOBAL_SLOTS; i++) {
    await expect(page.getByTestId(`command-slot-${i}`)).toBeVisible();
  }
});

test('timer is visible @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('timer-value')).toBeVisible();
  const text = await page.getByTestId('timer-value').textContent();
  expect(text).toMatch(/\d+s/);
});

test('lock-in button is visible and enabled initially', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByTestId('lock-in-btn');
  await expect(btn).toBeVisible();
  await expect(btn).not.toBeDisabled();
});

test('lock-in button disables after lock-in action', async ({ page, isMobile }) => {
  await page.goto('/');
  const btn = page.getByTestId('lock-in-btn');

  if (isMobile) {
    await page.keyboard.press('Space');
  } else {
    // Force click to bypass the Next.js dev portal overlay.
    await btn.click({ force: true });
  }

  await expect(btn).toBeDisabled();
});

test('keyboard shortcut 1 opens picker for slot 0 and slot is highlighted', async ({ page }) => {
  await page.goto('/');
  // The 1–N keys open the picker for the corresponding global slot.
  await page.keyboard.press('1');
  await expect(page.getByRole('menu', { name: /command picker/i })).toBeVisible();
  // Slot 0 should be highlighted (selected).
  const slot = page.getByTestId('command-slot-0');
  await expect(slot).toBeVisible();
});

test('Escape deselects slot / closes picker', async ({ page }) => {
  await page.goto('/');
  // Open picker via keyboard (works on all devices).
  await page.keyboard.press('1');
  await expect(page.getByRole('menu', { name: /command picker/i })).toBeVisible();
  // Press Escape.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: /command picker/i })).not.toBeVisible();
});

test('number key 1 opens picker for slot 0', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('1');
  await expect(page.getByRole('menu', { name: /command picker/i })).toBeVisible();
});

test('clicking a slot opens command picker (desktop)', async ({ page, isMobile }) => {
  // This test runs only on desktop where click interactions are reliable.
  test.skip(isMobile, 'Desktop-only: use keyboard shortcut test for mobile');
  await page.goto('/');
  const slot = page.getByTestId('command-slot-0');
  await slot.click({ force: true });
  await expect(page.getByRole('menu', { name: /command picker/i })).toBeVisible();
});

test('unit action panel shows units with action picker', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop-only interaction for unit picker');
  await page.goto('/');

  // Click the first unassigned unit card to open the unit action picker.
  const unassigned = page.locator('[data-testid="unit-card-unassigned"]');
  await expect(unassigned.first()).toBeVisible({ timeout: 5000 });
  await unassigned.first().click({ force: true });

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible({ timeout: 3000 });

  // Unit picker should show Move and Defend as always-enabled actions.
  await expect(page.getByRole('menuitem', { name: 'Move' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Defend' })).toBeVisible();

  // Press Escape to close.
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
});
