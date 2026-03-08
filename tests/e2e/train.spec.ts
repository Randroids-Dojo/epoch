import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as Window & { __EPOCH_SKIP_SETUP__?: boolean }).__EPOCH_SKIP_SETUP__ = true; });
});

test('queues a train command when barracks and CC are available', async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & { __EPOCH_TEST_MUTATOR__?: (state: unknown) => void };
    testWindow.__EPOCH_TEST_MUTATOR__ = (rawState) => {
      const state = rawState as {
        players: { player: { resources: { cc: number } } };
        structures: Map<string, unknown>;
        units: Map<string, unknown>;
      };
      state.players.player.resources.cc = 10;
      state.structures.set('s-train-ready', {
        id: 's-train-ready',
        owner: 'player',
        type: 'barracks',
        hex: { q: -8, r: 0 },
        hp: 40,
        buildProgress: 0,
        assignedDroneId: null,
      });
    };
  });

  await page.goto('/');
  await page.keyboard.press('1');
  await page.getByRole('menuitem', { name: 'Train' }).click();
  await page.getByRole('menuitem', { name: 'Pulse Sentry' }).click();

  const slot = page.getByTestId('command-slot-0');
  await expect(slot).toContainText('TR');
  await expect(slot).toContainText('pulse_sentry');
});

test('train button is disabled when no barracks exists', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('1');
  const trainBtn = page.getByRole('menuitem', { name: 'Train' });
  await expect(trainBtn).toBeDisabled();
  await expect(trainBtn).toHaveAttribute('title', 'No production building');
});

test('shows feedback when barracks exists but CC is insufficient', async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & { __EPOCH_TEST_MUTATOR__?: (state: unknown) => void };
    testWindow.__EPOCH_TEST_MUTATOR__ = (rawState) => {
      const state = rawState as {
        players: { player: { resources: { cc: number } } };
        structures: Map<string, unknown>;
        units: Map<string, unknown>;
      };
      state.players.player.resources.cc = 0;
      state.structures.set('s-low-cc', {
        id: 's-low-cc',
        owner: 'player',
        type: 'barracks',
        hex: { q: -8, r: 0 },
        hp: 40,
        buildProgress: 0,
        assignedDroneId: null,
      });
    };
  });

  await page.goto('/');
  await page.keyboard.press('1');
  await page.getByRole('menuitem', { name: 'Train' }).click();

  await expect(page.getByTestId('command-feedback')).toHaveText('Not enough CC to train any unit.');
});

test('shows feedback when barracks spawn space is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & { __EPOCH_TEST_MUTATOR__?: (state: unknown) => void };
    testWindow.__EPOCH_TEST_MUTATOR__ = (rawState) => {
      const state = rawState as {
        players: { player: { resources: { cc: number } } };
        structures: Map<string, unknown>;
        units: Map<string, unknown>;
      };
      state.players.player.resources.cc = 10;
      state.structures.set('s-blocked', {
        id: 's-blocked',
        owner: 'player',
        type: 'barracks',
        hex: { q: -8, r: 0 },
        hp: 40,
        buildProgress: 0,
        assignedDroneId: null,
      });

      const blockedHexes = [
        { q: -8, r: 0 },
        { q: -7, r: 0 },
        { q: -7, r: -1 },
        { q: -8, r: -1 },
        { q: -9, r: 0 },
        { q: -9, r: 1 },
        { q: -8, r: 1 },
      ];

      blockedHexes.forEach((hex, index) => {
        state.units.set(`u-block-${index}`, {
          id: `u-block-${index}`,
          owner: 'player',
          type: 'drone',
          hex,
          hp: 15,
          isDefending: false,
          assignedExtractorId: null,
        });
      });
    };
  });

  await page.goto('/');
  await page.keyboard.press('1');
  await page.getByRole('menuitem', { name: 'Train' }).click();

  await expect(page.getByTestId('command-feedback')).toHaveText('Train failed: barracks spawn is blocked.');
});
