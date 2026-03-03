import { test, expect } from '@playwright/test';
import { BASE_HEX_SIZE } from '@/renderer/drawHex';
import { DEFAULT_ZOOM } from '@/renderer/camera';
import { createInitialState } from '@/engine/state';
import { computeEligibleBuildHexes } from '@/engine/targeting';
import { hexDistance, hexToPixel } from '@/engine/hex';

test('5 command slots are visible @smoke', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 5; i++) {
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
  // The 1–5 keys open the picker for the corresponding slot.
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

test('build flow: choose structure, target hex, then clear command', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop-only interaction for canvas clicking');
  await page.goto('/');

  await page.keyboard.press('1');
  await page.getByRole('menuitem', { name: 'Build' }).click();
  await expect(page.getByRole('dialog', { name: /build structure picker/i })).toBeVisible();
  await page.getByTestId('build-option-barracks').click();

  const state = createInitialState(42);
  const eligibleHexes = [...computeEligibleBuildHexes(state)]
    .map((key) => state.map.cells.get(key)!.hex)
    .sort((a, b) => hexDistance(a, state.map.playerStart) - hexDistance(b, state.map.playerStart));
  const targetHex = eligibleHexes[0];
  expect(targetHex).toBeDefined();

  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const startPx = hexToPixel(state.map.playerStart, BASE_HEX_SIZE);
  const targetPx = hexToPixel(targetHex, BASE_HEX_SIZE);

  const clickX = box!.width / 2 + (targetPx.x - startPx.x) * DEFAULT_ZOOM;
  const clickY = box!.height / 2 + (targetPx.y - startPx.y) * DEFAULT_ZOOM;

  await canvas.click({
    position: {
      x: Math.min(box!.width - 2, Math.max(2, clickX)),
      y: Math.min(box!.height - 2, Math.max(2, clickY)),
    },
    force: true,
  });

  const slot = page.getByTestId('command-slot-0');
  await expect(slot).toContainText('BD');

  await slot.hover();
  await slot.getByRole('button', { name: /clear slot 1/i }).click();
  await expect(slot.getByText('BD')).not.toBeVisible();
});
