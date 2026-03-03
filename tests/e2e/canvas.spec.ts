import { test, expect } from '@playwright/test';

test('homepage loads with game canvas @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Epoch/);
  await expect(page.getByTestId('game-canvas')).toBeVisible();
});

test('canvas has non-zero dimensions', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('game-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);
});

test('EPOCH header is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('EPOCH')).toBeVisible();
});

test('minimap is visible and placed by form factor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();

  const desktopBox = await minimap.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.x).toBeGreaterThan(1000);
  expect(desktopBox!.y).toBeLessThan(180);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const mobileBox = await page.getByTestId('minimap').boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.x).toBeLessThan(120);
  expect(mobileBox!.y + mobileBox!.height).toBeGreaterThan(680);
});

test('minimap viewport updates after camera movement', async ({ page }) => {
  await page.goto('/');

  const viewport = page.getByTestId('minimap-viewport');
  await expect(viewport).toBeVisible();
  const before = await viewport.boundingBox();
  expect(before).not.toBeNull();

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);

  const after = await viewport.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x).toBeGreaterThan(before!.x);
});
