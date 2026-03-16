import { describe, it, expect } from 'vitest';
import { getEchoRevealCamera, ECHO_REVEAL_DURATION_MS, EchoRevealState } from '@/renderer/drawEntities';
import { Camera } from '@/renderer/camera';

const userCam: Camera = { x: 100, y: 100, zoom: 1.0 };
const cssW = 800;
const cssH = 600;

function makeReveal(elapsed: number): EchoRevealState {
  return {
    targetWorldX: 500,
    targetWorldY: 400,
    startedAt: performance.now() - elapsed,
    durationMs: ECHO_REVEAL_DURATION_MS,
  };
}

describe('getEchoRevealCamera', () => {
  it('returns done=true when elapsed >= duration', () => {
    const reveal = makeReveal(ECHO_REVEAL_DURATION_MS + 100);
    const result = getEchoRevealCamera(reveal, cssW, cssH, userCam);
    expect(result.done).toBe(true);
    expect(result.t).toBe(1);
  });

  it('zooms out during phase 1 (t < 0.35)', () => {
    const reveal = makeReveal(ECHO_REVEAL_DURATION_MS * 0.2);
    const result = getEchoRevealCamera(reveal, cssW, cssH, userCam);
    expect(result.done).toBe(false);
    expect(result.cam.zoom).toBeLessThan(userCam.zoom);
  });

  it('zooms back in during phase 3 (t > 0.65)', () => {
    const reveal = makeReveal(ECHO_REVEAL_DURATION_MS * 0.85);
    const result = getEchoRevealCamera(reveal, cssW, cssH, userCam);
    expect(result.done).toBe(false);
    // Should be zooming back up toward the zoom-in target
    expect(result.cam.zoom).toBeGreaterThan(0.35);
  });

  it('returns t between 0 and 1 for mid-animation', () => {
    const reveal = makeReveal(ECHO_REVEAL_DURATION_MS * 0.5);
    const result = getEchoRevealCamera(reveal, cssW, cssH, userCam);
    expect(result.t).toBeGreaterThan(0);
    expect(result.t).toBeLessThan(1);
  });

  it('ECHO_REVEAL_DURATION_MS is a reasonable value', () => {
    expect(ECHO_REVEAL_DURATION_MS).toBeGreaterThanOrEqual(1500);
    expect(ECHO_REVEAL_DURATION_MS).toBeLessThanOrEqual(5000);
  });
});
