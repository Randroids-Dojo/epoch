import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY_ORDER,
  difficultyIndex,
  isDifficultyUnlocked,
  computeNextUnlock,
} from '@/lib/useDifficultyUnlock';

describe('difficultyIndex', () => {
  it('returns correct indices for all difficulties', () => {
    expect(difficultyIndex('novice')).toBe(0);
    expect(difficultyIndex('adept')).toBe(1);
    expect(difficultyIndex('commander')).toBe(2);
    expect(difficultyIndex('epoch_master')).toBe(3);
  });
});

describe('isDifficultyUnlocked', () => {
  it('only novice is unlocked when maxUnlocked is novice', () => {
    expect(isDifficultyUnlocked('novice', 'novice')).toBe(true);
    expect(isDifficultyUnlocked('adept', 'novice')).toBe(false);
    expect(isDifficultyUnlocked('commander', 'novice')).toBe(false);
    expect(isDifficultyUnlocked('epoch_master', 'novice')).toBe(false);
  });

  it('novice and adept are unlocked when maxUnlocked is adept', () => {
    expect(isDifficultyUnlocked('novice', 'adept')).toBe(true);
    expect(isDifficultyUnlocked('adept', 'adept')).toBe(true);
    expect(isDifficultyUnlocked('commander', 'adept')).toBe(false);
    expect(isDifficultyUnlocked('epoch_master', 'adept')).toBe(false);
  });

  it('all are unlocked when maxUnlocked is epoch_master', () => {
    for (const d of DIFFICULTY_ORDER) {
      expect(isDifficultyUnlocked(d, 'epoch_master')).toBe(true);
    }
  });
});

describe('computeNextUnlock', () => {
  it('beating novice when novice is max unlocks adept', () => {
    expect(computeNextUnlock('novice', 'novice')).toBe('adept');
  });

  it('beating adept when adept is max unlocks commander', () => {
    expect(computeNextUnlock('adept', 'adept')).toBe('commander');
  });

  it('beating commander when commander is max unlocks epoch_master', () => {
    expect(computeNextUnlock('commander', 'commander')).toBe('epoch_master');
  });

  it('beating epoch_master when epoch_master is max stays at epoch_master', () => {
    expect(computeNextUnlock('epoch_master', 'epoch_master')).toBe('epoch_master');
  });

  it('beating a lower difficulty does not change max unlock', () => {
    expect(computeNextUnlock('novice', 'commander')).toBe('commander');
    expect(computeNextUnlock('adept', 'epoch_master')).toBe('epoch_master');
  });
});
