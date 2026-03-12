import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import EpochStatsPopup, { EpochStatsSnapshot } from '@/components/hud/EpochStatsPopup';

const baseStats: EpochStatsSnapshot = {
  epoch: 2,
  player: {
    unitCount: 3,
    droneCount: 1,
    totalAttack: 25,
    nexusHp: 100,
    nexusMaxHp: 100,
    crystals: 15,
    flux: 2,
    techTier: 1,
  },
  ai: {
    unitCount: 4,
    droneCount: 2,
    totalAttack: 30,
    nexusHp: 80,
    nexusMaxHp: 100,
    crystals: 12,
    flux: 1,
    techTier: 0,
  },
  playerDelta: {
    units: 1,
    drones: 0,
    crystals: 5,
    flux: 2,
  },
};

describe('EpochStatsPopup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders epoch label', () => {
    render(<EpochStatsPopup stats={baseStats} onDismiss={() => {}} />);
    expect(screen.getByText(/EPOCH 2 COMPLETE/)).toBeInTheDocument();
  });

  it('renders popup with data-testid', () => {
    render(<EpochStatsPopup stats={baseStats} onDismiss={() => {}} />);
    expect(screen.getByTestId('epoch-stats-popup')).toBeInTheDocument();
  });

  it('shows positive deltas', () => {
    render(<EpochStatsPopup stats={baseStats} onDismiss={() => {}} />);
    expect(screen.getByText('+1 Units')).toBeInTheDocument();
    expect(screen.getByText('+5 CC')).toBeInTheDocument();
    expect(screen.getByText('+2 FX')).toBeInTheDocument();
  });

  it('calls onDismiss when clicked', () => {
    const onDismiss = vi.fn();
    render(<EpochStatsPopup stats={baseStats} onDismiss={onDismiss} />);
    screen.getByTestId('epoch-stats-popup').click();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('auto-dismisses after 7 seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<EpochStatsPopup stats={baseStats} onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(7000); });
    expect(onDismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('shows player and AI nexus health bars', () => {
    render(<EpochStatsPopup stats={baseStats} onDismiss={() => {}} />);
    expect(screen.getAllByText('YOU').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CPU').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('100/100')).toBeInTheDocument();
    expect(screen.getByText('80/100')).toBeInTheDocument();
  });

  it('shows attack power values', () => {
    render(<EpochStatsPopup stats={baseStats} onDismiss={() => {}} />);
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });
});
