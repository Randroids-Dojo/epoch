import { useCallback, useState } from 'react';
import type { AIDifficulty } from '@/engine/state';

/** Ordered list of difficulties from easiest to hardest. */
export const DIFFICULTY_ORDER: AIDifficulty[] = [
  'novice',
  'adept',
  'commander',
  'epoch_master',
];

const COOKIE_NAME = 'epoch_max_unlocked';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5; // 5 years

// ── Cookie helpers ──────────────────────────────────────────────────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

// ── Pure helpers (exported for testing) ─────────────────────────────────────

/** Return the index of a difficulty in the ordered list (-1 if invalid). */
export function difficultyIndex(d: AIDifficulty): number {
  return DIFFICULTY_ORDER.indexOf(d);
}

/**
 * Given the highest unlocked difficulty, return whether `d` is playable.
 */
export function isDifficultyUnlocked(
  d: AIDifficulty,
  maxUnlocked: AIDifficulty,
): boolean {
  return difficultyIndex(d) <= difficultyIndex(maxUnlocked);
}

/**
 * After beating `beaten`, return the new highest unlocked difficulty.
 * Only advances if `beaten` is the current max.
 */
export function computeNextUnlock(
  beaten: AIDifficulty,
  currentMax: AIDifficulty,
): AIDifficulty {
  if (beaten !== currentMax) return currentMax;
  const idx = difficultyIndex(beaten);
  if (idx < 0 || idx >= DIFFICULTY_ORDER.length - 1) return currentMax;
  return DIFFICULTY_ORDER[idx + 1];
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * React hook that tracks which difficulties are unlocked.
 * Persists the highest unlocked difficulty in a browser cookie.
 */
export function useDifficultyUnlock() {
  const [maxUnlocked, setMaxUnlocked] = useState<AIDifficulty>(() => {
    const stored = readCookie(COOKIE_NAME);
    if (stored && DIFFICULTY_ORDER.includes(stored as AIDifficulty)) {
      return stored as AIDifficulty;
    }
    return DIFFICULTY_ORDER[0]; // novice
  });

  const isUnlocked = useCallback(
    (d: AIDifficulty) => isDifficultyUnlocked(d, maxUnlocked),
    [maxUnlocked],
  );

  /** Call when the player wins a game on the given difficulty. */
  const recordVictory = useCallback(
    (beaten: AIDifficulty) => {
      const next = computeNextUnlock(beaten, maxUnlocked);
      if (next !== maxUnlocked) {
        setMaxUnlocked(next);
        writeCookie(COOKIE_NAME, next);
      }
    },
    [maxUnlocked],
  );

  return { maxUnlocked, isUnlocked, recordVictory } as const;
}
