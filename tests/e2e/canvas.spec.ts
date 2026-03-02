import { test, expect } from '@playwright/test';

test('homepage loads with game canvas @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Epoch/);
  await expect(page.locator('canvas')).toBeVisible();
});

test('canvas has non-zero dimensions', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
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
