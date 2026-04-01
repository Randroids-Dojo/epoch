'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/constants';

interface VictoryAnimationProps {
  winner: 'player' | 'ai';
  epoch: number;
  onComplete: () => void;
  /** When provided, shows a "Temporal Debrief" button to explore timeline branches. */
  onDebrief?: () => void;
  /** When provided, shows a "Challenge a Friend" share button after victory. */
  onShareTimeline?: () => void;
  /** Whether the share URL has been copied to clipboard. */
  shareCopied?: boolean;
  /** Fallback URL shown when clipboard write fails. */
  shareFallbackUrl?: string | null;
  /** Whether we're in rival mode (played against a timeline). */
  isRivalMode?: boolean;
  rivalName?: string;
}

/**
 * Smash Bros-style winner declaration animation.
 * "VICTORY" crashes in with screen flash, expanding rings, and particle burst.
 * "DEFEAT" uses red/coral tones with a darker aesthetic.
 */
export default function VictoryAnimation({
  winner, epoch, onComplete, onDebrief, onShareTimeline, shareCopied, shareFallbackUrl, isRivalMode, rivalName,
}: VictoryAnimationProps) {
  const [phase, setPhase] = useState<'flash' | 'slam' | 'rings' | 'details' | 'idle'>('flash');

  const isVictory = winner === 'player';
  const accentColor = isVictory ? COLORS.CYAN : COLORS.CORAL;
  const label = isVictory ? 'VICTORY' : 'DEFEAT';

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('slam'), 300),
      setTimeout(() => setPhase('rings'), 800),
      setTimeout(() => setPhase('details'), 2000),
      setTimeout(() => setPhase('idle'), 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      data-testid="victory-animation"
      onClick={onComplete}
      onTouchEnd={onComplete}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        background: 'rgba(10,14,26,0.92)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {/* Initial white flash */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isVictory ? COLORS.CYAN : COLORS.CORAL,
          opacity: phase === 'flash' ? 0.6 : 0,
          transition: 'opacity 0.4s ease-out',
          pointerEvents: 'none',
        }}
      />

      {/* Expanding rings */}
      {(phase === 'rings' || phase === 'details' || phase === 'idle') && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: `2px solid ${accentColor}`,
                animation: `victory-ring 1.5s ease-out ${i * 0.25}s both`,
                opacity: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Diagonal speed lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: phase === 'flash' || phase === 'slam' ? 1 : 0,
          transition: 'opacity 0.6s ease-out',
          pointerEvents: 'none',
        }}
      >
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `${10 + i * 11}%`,
              left: '-10%',
              width: '120%',
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${accentColor}66, transparent)`,
              transform: `rotate(${-5 + Math.random() * 10}deg)`,
              animation: `victory-speedline 0.4s ease-out ${i * 0.04}s both`,
            }}
          />
        ))}
      </div>

      {/* Main title: VICTORY / DEFEAT */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(3rem, 10vw, 8rem)',
          fontWeight: 900,
          letterSpacing: '0.2em',
          color: accentColor,
          textShadow: `0 0 40px ${accentColor}, 0 0 80px ${accentColor}66`,
          opacity: phase === 'flash' ? 0 : 1,
          transform: phase === 'flash' ? 'scale(3) translateY(-20px)' : phase === 'slam' ? 'scale(1.05)' : 'scale(1)',
          transition: phase === 'slam'
            ? 'opacity 0.1s, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            : 'transform 0.4s ease-out',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {label}
      </div>

      {/* Horizontal accent bar under title */}
      <div
        style={{
          width: phase === 'rings' || phase === 'details' || phase === 'idle' ? '60%' : '0%',
          maxWidth: '500px',
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          marginTop: '1rem',
          transition: 'width 0.6s ease-out',
          boxShadow: `0 0 20px ${accentColor}88`,
          position: 'relative',
          zIndex: 2,
        }}
      />

      {/* Epoch count + subtitle */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(0.7rem, 1.5vw, 0.9rem)',
          letterSpacing: '0.2em',
          color: '#64748b',
          marginTop: '1.5rem',
          opacity: phase === 'details' || phase === 'idle' ? 1 : 0,
          transform: phase === 'details' || phase === 'idle' ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          position: 'relative',
          zIndex: 2,
        }}
      >
        EPOCH {epoch} {isVictory
          ? isRivalMode
            ? `· ${rivalName ? rivalName.toUpperCase() + "'S" : ''} TIMELINE DEFEATED`
            : '· TIMELINE SECURED'
          : isRivalMode
            ? `· ${rivalName ? rivalName.toUpperCase() + "'S" : ''} TIMELINE PREVAILS`
            : '· TIMELINE COLLAPSED'}
      </div>

      {/* Particle burst */}
      {phase !== 'flash' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[...Array(32)].map((_, i) => {
            const angle = (i / 32) * 360;
            const dist = 25 + Math.random() * 45;
            const size = 2 + Math.random() * 4;
            const delay = Math.random() * 0.4;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: i % 4 === 0 ? '0' : '50%',
                  background: i % 2 === 0 ? accentColor : COLORS.ICE,
                  boxShadow: `0 0 8px ${accentColor}`,
                  animation: `intro-particle 1.5s ease-out ${delay}s both`,
                  ['--particle-x' as string]: `${Math.cos((angle * Math.PI) / 180) * dist}vmin`,
                  ['--particle-y' as string]: `${Math.sin((angle * Math.PI) / 180) * dist}vmin`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Buttons row */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '2.5rem',
          opacity: phase === 'idle' ? 1 : 0,
          transform: phase === 'idle' ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Share / Challenge button — only on victory */}
        {isVictory && onShareTimeline && (
          <button
            data-testid="share-timeline-btn"
            className="font-mono text-sm tracking-widest uppercase px-6 py-2 border"
            disabled={phase !== 'idle'}
            style={{
              color: shareCopied ? '#22c55e' : COLORS.CYAN,
              borderColor: shareCopied ? '#22c55e' : COLORS.CYAN,
              background: shareCopied ? 'rgba(34,197,94,0.08)' : 'rgba(0,212,255,0.08)',
              cursor: phase === 'idle' ? 'pointer' : 'default',
              transition: 'border-color 0.2s ease, color 0.2s ease, background 0.2s ease',
            }}
            onClick={(e) => { e.stopPropagation(); onShareTimeline(); }}
          >
            {shareCopied ? 'Link Copied!' : 'Challenge a Friend'}
          </button>
        )}

        {/* Fallback: show URL in a selectable input when clipboard fails */}
        {shareFallbackUrl && (
          <input
            data-testid="share-fallback-url"
            readOnly
            value={shareFallbackUrl}
            onClick={(e) => { e.stopPropagation(); (e.target as HTMLInputElement).select(); }}
            className="font-mono text-xs px-3 py-1.5 border rounded"
            style={{
              color: '#94a3b8',
              borderColor: '#334155',
              background: 'rgba(15,23,42,0.8)',
              width: '100%',
              maxWidth: 360,
              textAlign: 'center',
            }}
          />
        )}

        {/* Temporal Debrief button */}
        {onDebrief && (
          <button
            data-testid="temporal-debrief-btn"
            className="font-mono text-sm tracking-widest uppercase px-6 py-2 border"
            disabled={phase !== 'idle'}
            style={{
              color: COLORS.GOLD,
              borderColor: COLORS.GOLD,
              background: 'rgba(255,215,0,0.06)',
              cursor: phase === 'idle' ? 'pointer' : 'default',
              transition: 'border-color 0.2s ease, color 0.2s ease, background 0.2s ease',
            }}
            onClick={(e) => { e.stopPropagation(); onDebrief(); }}
          >
            Temporal Debrief
          </button>
        )}

        {/* Play Again button */}
        <button
          data-testid="play-again-btn"
          className="font-mono text-sm tracking-widest uppercase px-6 py-2 border"
          disabled={phase !== 'idle'}
          style={{
            color: '#94a3b8',
            borderColor: '#334155',
            background: 'transparent',
            cursor: phase === 'idle' ? 'pointer' : 'default',
            transition: 'border-color 0.2s ease, color 0.2s ease',
          }}
          onClick={onComplete}
          onMouseEnter={(e) => {
            if (phase === 'idle') {
              e.currentTarget.style.borderColor = accentColor;
              e.currentTarget.style.color = accentColor;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#334155';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
