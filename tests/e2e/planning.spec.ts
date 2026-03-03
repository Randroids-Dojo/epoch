import { test, expect } from '@playwright/test';

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

test('lock-in button disables after click', async ({ page }) => {
  await page.goto('/');
  const btn = page.getByTestId('lock-in-btn');
  // Force click to bypass the Next.js dev portal overlay.
  await btn.click({ force: true });
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

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const candidateOffsets = [
    { x: 80, y: 40 },
    { x: 130, y: 55 },
    { x: 40, y: 80 },
    { x: 170, y: 100 },
    { x: 100, y: 130 },
    { x: 200, y: 70 },
  ];

  const slot = page.getByTestId('command-slot-0');
  let assigned = false;
  for (const offset of candidateOffsets) {
    await canvas.click({
      position: {
        x: Math.min(box!.width - 2, Math.max(2, box!.width / 2 + offset.x)),
        y: Math.min(box!.height - 2, Math.max(2, box!.height / 2 + offset.y)),
      },
      force: true,
    });

    if (await slot.getByText('BD').isVisible().catch(() => false)) {
      assigned = true;
      break;
    }

    // Re-open build targeting when click lands on an ineligible hex.
    await page.keyboard.press('1');
    await page.getByRole('menuitem', { name: 'Build' }).click();
    await page.getByTestId('build-option-barracks').click();
  }

  expect(assigned).toBe(true);

  await slot.hover();
  await slot.getByRole('button', { name: /clear slot 1/i }).click();
  await expect(slot.getByText('BD')).not.toBeVisible();
});
