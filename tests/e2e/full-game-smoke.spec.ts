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

async function tryQueue(
  page: Page,
  slotNum: number,
  commandLabel: string,
  target: Hex | null,
  playerStart: Hex,
  extra?: () => Promise<void>,
): Promise<boolean> {
  await page.keyboard.press(String(slotNum));
  const menu = page.getByRole('menu', { name: /command picker/i });
  try { await menu.waitFor({ state: 'visible', timeout: 1500 }); } catch { return false; }

  const item = page.getByRole('menuitem', { name: commandLabel });
  if (!await item.isEnabled().catch(() => false)) {
    await page.keyboard.press('Escape');
    return false;
  }
  await item.click();

  if (extra) await extra();

  if (target) await clickCanvasHex(page, target, playerStart);
  return true;
}

async function fillSlots(page: Page): Promise<void> {
  // Snap camera home so click coordinates are valid.
  await page.keyboard.press('Home');

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

  // Sort move targets closest-to-AI; others closest-to-playerStart.
  const moveTargets   = sortClosestTo(moveHexes, aiStart);
  const attackTargets = sortClosestTo(attackHexes, playerStart);
  const gatherTargets = sortClosestTo(gatherHexes, playerStart);
  const buildTargets  = sortClosestTo(buildHexes, playerStart);

  let slot = 1;

  // Move toward the enemy.
  if (slot <= 5 && moveTargets.length > 0) {
    await tryQueue(page, slot, 'Move', moveTargets[0], playerStart);
    slot++;
  }

  // Attack any visible enemy unit or structure.
  if (slot <= 5 && attackTargets.length > 0) {
    await tryQueue(page, slot, 'Attack', attackTargets[0], playerStart);
    slot++;
  }

  // Gather from the nearest crystal node.
  if (slot <= 5 && gatherTargets.length > 0) {
    await tryQueue(page, slot, 'Gather', gatherTargets[0], playerStart);
    slot++;
  }

  // Build a Barracks if we don't have one and can afford it.
  if (slot <= 5 && !hasBarracks && resources.cc >= 5 && buildTargets.length > 0) {
    await tryQueue(page, slot, 'Build', buildTargets[0], playerStart, async () => {
      await page.getByTestId('build-option-barracks').click();
    });
    slot++;
  }

  // Build a Crystal Extractor if we don't have one and can afford it.
  if (slot <= 5 && !hasExtractor && resources.cc >= 3 && buildTargets.length > 0) {
    await tryQueue(page, slot, 'Build', buildTargets[0], playerStart, async () => {
      await page.getByTestId('build-option-crystal_extractor').click();
    });
    slot++;
  }

  // Train a Pulse Sentry if we have a Barracks and can afford it.
  if (slot <= 5 && hasBarracks && resources.cc >= 4) {
    await tryQueue(page, slot, 'Train', null, playerStart, async () => {
      const unitMenu = page.getByRole('menuitem', { name: /Pulse Sentry/i });
      if (await unitMenu.isVisible().catch(() => false)) await unitMenu.click();
    });
    slot++;
  }

  // Fill remaining slots with Defend (grants TE income).
  while (slot <= 5) {
    await tryQueue(page, slot, 'Defend', null, playerStart);
    slot++;
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

test('smoke: player can play full match headlessly from planning to game-over @smoke', async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto('/');
  await expect(page.getByTestId('command-slot-0')).toBeVisible();

  for (let epoch = 0; epoch < 15; epoch++) {
    const snap = await getSnapshot(page);
    if (snap.phase === 'over') break;

    await fillSlots(page);

    await page.getByTestId('lock-in-btn').click({ force: true });
    await expect(page.getByTestId('phase-label')).toBeVisible({ timeout: 5_000 });

    const result = await waitForPlanningOrGameOver(page);
    if (result === 'over') break;
  }

  // Deterministic finish if the match didn't end naturally.
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
