'use client';

import { useState } from 'react';
import { AIDifficulty, DIFFICULTY_SLOTS } from '@/engine/state';
import { COLORS } from '@/lib/constants';

const DIFFICULTY_HELP: { value: AIDifficulty; temporal: string; behavior: string }[] = [
  { value: 'novice',       temporal: 'None',         behavior: 'Single archetype, no adaptation' },
  { value: 'adept',        temporal: 'Echo',          behavior: 'Mild adaptation, optimizes resources' },
  { value: 'commander',    temporal: 'Echo + Shift',  behavior: 'Blended archetypes, adapts to player patterns' },
  { value: 'epoch_master', temporal: 'All',           behavior: 'Full blending, exploits player habits' },
];

interface DifficultyHelpButtonProps {
  labels: Record<AIDifficulty, string>;
}

export default function DifficultyHelpButton({ labels }: DifficultyHelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        data-testid="difficulty-help-btn"
        className="font-mono text-sm tracking-widest uppercase px-4 py-2 border"
        style={{ color: '#94a3b8', borderColor: '#2a2535', background: 'transparent' }}
        onClick={() => setOpen(true)}
      >
        ?
      </button>

      {open && (
        <div
          data-testid="difficulty-help-modal"
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(10,14,26,0.95)', zIndex: 60 }}
          onClick={() => setOpen(false)}
        >
          <div
            className="font-mono max-w-lg w-full mx-4 p-6 border"
            style={{ borderColor: '#2a2535', background: COLORS.NAVY }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.CYAN }}>
                Difficulty Details
              </div>
              <button
                data-testid="difficulty-help-close"
                className="text-sm px-2 py-1 border"
                style={{ color: '#94a3b8', borderColor: '#2a2535' }}
                onClick={() => setOpen(false)}
              >
                X
              </button>
            </div>

            <table className="w-full text-xs" style={{ color: '#94a3b8' }}>
              <thead>
                <tr style={{ color: '#64748b' }}>
                  <th className="text-left py-1 pr-2"></th>
                  <th className="text-center py-1 px-1">Slots</th>
                  <th className="text-center py-1 px-1">Temporal</th>
                  <th className="text-left py-1 pl-2">Behavior</th>
                </tr>
              </thead>
              <tbody>
                {DIFFICULTY_HELP.map((row) => (
                  <tr key={row.value} style={{ borderTop: '1px solid #1e293b' }}>
                    <td className="py-2 pr-2 font-bold" style={{ color: COLORS.CYAN }}>
                      {labels[row.value]}
                    </td>
                    <td className="py-2 px-1 text-center">{DIFFICULTY_SLOTS[row.value]}</td>
                    <td className="py-2 px-1 text-center">{row.temporal}</td>
                    <td className="py-2 pl-2">{row.behavior}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 text-xs" style={{ color: '#475569' }}>
              Difficulty only affects the AI opponent. Your options stay the same across all levels.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
