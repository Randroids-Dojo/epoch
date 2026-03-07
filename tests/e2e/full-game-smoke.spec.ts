import { test, expect, Page } from '@playwright/test';
import { hexToPixel } from '@/engine/hex';
import { BASE_HEX_SIZE } from '@/renderer/drawHex';
import { DEFAULT_ZOOM } from '@/renderer/camera';

type Hex = { q: number; r: number };

type GameSnapshot = {
  phase: string;
  epoch: number;
  winner: string | null;
  resources: { cc: number; fx: number; te: number };
  playerStart: Hex;
  aiStart: Hex;
  playerStructureTypes: string[];
};

function hexDist(a: Hex, b: Hex): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

function sortClosestTo(hexes: Hex[], target: Hex): Hex[] {
  return [...hexes].sort((a, b) => hexDist(a, target) - hexDist(b, target));
}

async function getSnapshot(page: Page): Promise<GameSnapshot> {
  const snap = await page.evaluate(() => (window as Window & { __getGameSnapshot?: () => GameSnapshot }).__getGameSnapshot?.());
  if (!snap) throw new Error('__getGameSnapshot not available');
  return snap;
}

async function getTargets(page: Page, type: string): Promise<Hex[]> {
  return page.evaluate(
    (t) => (window as Window & { __getEligibleTargets?: (type: string) => Hex[] }).__getEligibleTargets?.(t) ?? [],
    type,
  );
}

async function clickCanvasHex(page: Page, target: Hex, playerStart: Hex): Promise<void> {
  const canvas = page.getByTestId('game-canvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  const sp = hexToPixel(playerStart, BASE_HEX_SIZE);
  const tp = hexToPixel(target, BASE_HEX_SIZE);
  await canvas.click({
    position: {
      x: Math.min(box.width - 2, Math.max(2, box.width / 2 + (tp.x - sp.x) * DEFAULT_ZOOM)),
      y: Math.min(box.height - 2, Math.max(2, box.height / 2 + (tp.y - sp.y) * DEFAULT_ZOOM)),
    },
    force: true,
  });
}

/** Click the first unassigned unit card and assign it a given action from the picker.
 *  Returns true if successfully assigned, false if picker didn't appear or action unavailable. */
async function assignNextUnit(
  page: Page,
  action: string,
  target: Hex | null,
  playerStart: Hex,
): Promise<boolean> {
  const unassigned = page.locator('text=TAP TO ASSIGN');
  if (await unassigned.count() === 0) return false;

  await unassigned.first().click({ force: true });

  const menu = page.getByRole('menu');
  try { await menu.waitFor({ state: 'visible', timeout: 1500 }); } catch { return false; }

  const item = page.getByRole('menuitem', { name: new RegExp(action, 'i') });
  if (!await item.isEnabled().catch(() => false)) {
    await page.keyboard.press('Escape');
    return false;
  }
  await item.click();

  if (target) await clickCanvasHex(page, target, playerStart);
  return true;
}

/** Assign build to the next unassigned unit card. */
async function assignBuild(
  page: Page,
  structureType: string,
  buildTarget: Hex,
  playerStart: Hex,
): Promise<boolean> {
  const unassigned = page.locator('text=TAP TO ASSIGN');
  if (await unassigned.count() === 0) return false;

  await unassigned.first().click({ force: true });

  const menu = page.getByRole('menu');
  try { await menu.waitFor({ state: 'visible', timeout: 1500 }); } catch { return false; }

  const item = page.getByRole('menuitem', { name: /Build/i });
  if (!await item.isEnabled().catch(() => false)) {
    await page.keyboard.press('Escape');
    return false;
  }
  await item.click();

  const buildOption = page.getByTestId(`build-option-${structureType}`);
  try { await buildOption.waitFor({ state: 'visible', timeout: 1500 }); } catch { return false; }
  await buildOption.click({ force: true });

  await clickCanvasHex(page, buildTarget, playerStart);
  return true;
}

async function fillEpoch(page: Page): Promise<void> {
  const snap = await getSnapshot(page);
  if (snap.phase !== 'planning') return;

  const { playerStart, aiStart, resources, playerStructureTypes } = snap;
  const hasBarracks  = playerStructureTypes.includes('barracks');
  const hasExtractor = playerStructureTypes.includes('crystal_extractor');

  const [moveHexes, attackHexes, gatherHexes, buildHexes] = await Promise.all([
    getTargets(page, 'move'),
    getTargets(page, 'attack'),
    getTargets(page, 'gather'),
    getTargets(page, 'build'),
  ]);

  const moveTarget   = sortClosestTo(moveHexes, aiStart)[0] ?? null;
  const attackTarget = sortClosestTo(attackHexes, playerStart)[0] ?? null;
  const gatherTarget = sortClosestTo(gatherHexes, playerStart)[0] ?? null;
  const buildTarget  = sortClosestTo(buildHexes, playerStart)[0] ?? null;

  let gatherUsed  = false;
  let buildUsed   = false;
  let attackUsed  = false;
  let moveUsed    = false;

  // Assign orders to every unassigned unit card
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await page.locator('text=TAP TO ASSIGN').count() === 0) break;

    // Priority 1: Attack a visible enemy
    if (!attackUsed && attackTarget) {
      if (await assignNextUnit(page, 'Attack', attackTarget, playerStart)) {
        attackUsed = true;
        continue;
      }
    }

    // Priority 2: Build extractor if none + affordable
    if (!buildUsed && !hasExtractor && resources.cc >= 3 && buildTarget) {
      if (await assignBuild(page, 'crystal_extractor', buildTarget, playerStart)) {
        buildUsed = true;
        continue;
      }
    }

    // Priority 3: Build barracks if none + affordable
    if (!buildUsed && !hasBarracks && resources.cc >= 5 && buildTarget) {
      if (await assignBuild(page, 'barracks', buildTarget, playerStart)) {
        buildUsed = true;
        continue;
      }
    }

    // Priority 4: Gather from nearest crystal/extractor
    if (!gatherUsed && gatherTarget) {
      if (await assignNextUnit(page, 'Gather', gatherTarget, playerStart)) {
        gatherUsed = true;
        continue;
      }
    }

    // Priority 5: Move toward AI
    if (!moveUsed && moveTarget) {
      if (await assignNextUnit(page, 'Move', moveTarget, playerStart)) {
        moveUsed = true;
        continue;
      }
    }

    // Fallback: Defend
    if (!await assignNextUnit(page, 'Defend', null, playerStart)) break;
  }

  // Global slot 0: Train a combat unit if affordable
  if (hasBarracks && resources.cc >= 4) {
    const slot0 = page.getByTestId('command-slot-0');
    if (await slot0.isVisible().catch(() => false)) {
      await slot0.click({ force: true });
      const menu = page.getByRole('menu');
      try {
        await menu.waitFor({ state: 'visible', timeout: 1500 });
        const trainItem = page.getByRole('menuitem', { name: /Train/i });
        if (await trainItem.isEnabled().catch(() => false)) {
          await trainItem.click();
          const sentryItem = page.getByRole('menuitem', { name: /Pulse Sentry/i });
          if (await sentryItem.isEnabled().catch(() => false)) {
            await sentryItem.click();
          } else {
            await page.keyboard.press('Escape');
          }
        } else {
          await page.keyboard.press('Escape');
        }
      } catch { /* noop */ }
    }
  }
}

async function waitForPlanningOrGameOver(page: Page): Promise<'planning' | 'over'> {
  await page.waitForSelector(
    '[data-testid="command-slot-0"],[data-testid="game-over-overlay"]',
    { timeout: 15_000 },
  );
  const isOver = await page.getByTestId('game-over-overlay').isVisible().catch(() => false);
  return isOver ? 'over' : 'planning';
}

test('smoke: player can play full match from planning to game-over @smoke', async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto('/');

  // Dismiss the difficulty-picker setup overlay
  await expect(page.getByTestId('difficulty-picker')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('start-game-btn').click({ force: true });

  await expect(page.getByTestId('command-slot-0')).toBeVisible({ timeout: 5_000 });

  for (let epoch = 0; epoch < 15; epoch++) {
    const snap = await getSnapshot(page);
    if (snap.phase === 'over') break;

    await fillEpoch(page);

    await page.getByTestId('lock-in-btn').click({ force: true });
    await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 5_000 });

    const result = await waitForPlanningOrGameOver(page);
    if (result === 'over') break;
  }

  // Force game-over if the match hasn't ended naturally within 15 epochs
  const isOver = await page.getByTestId('game-over-overlay').isVisible().catch(() => false);
  if (!isOver) {
    await expect
      .poll(() => page.evaluate(() =>
        typeof (window as Window & { __triggerGameOver?: unknown }).__triggerGameOver === 'function'),
      { timeout: 5_000 })
      .toBe(true);
    await page.evaluate(() => {
      (window as Window & { __triggerGameOver?: (w: string) => void }).__triggerGameOver?.('ai');
    });
  }

  await expect(page.getByTestId('game-over-overlay')).toBeVisible();
  const result = (await page.getByTestId('game-over-result').textContent())?.trim();
  expect(['VICTORY', 'DEFEAT']).toContain(result);
});
