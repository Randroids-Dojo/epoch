'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/constants';

interface IntroAnimationProps {
  onComplete: () => void;
}

/**
 * Smash Bros-style title card intro animation.
 * Plays a dramatic slash-in reveal of "EPOCH" with sweeping light,
 * particle burst, and tagline before auto-dismissing.
 */
export default function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const [phase, setPhase] = useState<'black' | 'slash' | 'title' | 'tagline' | 'fadeout'>('black');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('slash'), 400),
      setTimeout(() => setPhase('title'), 900),
      setTimeout(() => setPhase('tagline'), 1800),
      setTimeout(() => setPhase('fadeout'), 3200),
      setTimeout(() => onComplete(), 3800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div
      data-testid="intro-animation"
      onClick={onComplete}
      onTouchEnd={onComplete}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        background: COLORS.NAVY,
        overflow: 'hidden',
        cursor: 'pointer',
        opacity: phase === 'fadeout' ? 0 : 1,
        transition: 'opacity 0.6s ease-out',
      }}
    >
      {/* Diagonal slash lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: phase === 'black' ? 0 : 1,
          transition: 'opacity 0.3s ease',
        }}
      >
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: `${-20 + i * 30}%`,
              width: '4px',
              height: '200%',
              background: `linear-gradient(180deg, transparent, ${COLORS.CYAN}44, transparent)`,
              transform: 'rotate(-25deg)',
              transformOrigin: 'top left',
              animation: `intro-slash-line 0.6s ease-out ${i * 0.08}s both`,
            }}
          />
        ))}
      </div>

      {/* Sweeping horizontal light bar */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          width: '100%',
          height: '3px',
          transform: 'translateY(-50%)',
          overflow: 'hidden',
          opacity: phase === 'black' ? 0 : 1,
        }}
      >
        <div
          style={{
            width: '40%',
            height: '100%',
            background: `linear-gradient(90deg, transparent, ${COLORS.CYAN}, transparent)`,
            animation: 'intro-sweep 0.7s ease-in-out 0.3s both',
            boxShadow: `0 0 30px ${COLORS.CYAN}, 0 0 60px ${COLORS.CYAN}88`,
          }}
        />
      </div>

      {/* Main title: EPOCH */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'clamp(4rem, 12vw, 10rem)',
            fontWeight: 900,
            letterSpacing: '0.25em',
            color: COLORS.ICE,
            textShadow: `0 0 40px ${COLORS.CYAN}, 0 0 80px ${COLORS.CYAN}66, 0 0 120px ${COLORS.CYAN}33`,
            opacity: phase === 'black' || phase === 'slash' ? 0 : 1,
            transform: phase === 'black' || phase === 'slash' ? 'scale(1.8) translateY(-10px)' : 'scale(1) translateY(0)',
            transition: 'opacity 0.15s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          EPOCH
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'clamp(0.7rem, 2vw, 1.1rem)',
            letterSpacing: '0.35em',
            color: COLORS.CYAN,
            marginTop: '1.5rem',
            opacity: phase === 'tagline' || phase === 'fadeout' ? 1 : 0,
            transform: phase === 'tagline' || phase === 'fadeout' ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
          }}
        >
          TIME IS YOUR WEAPON
        </div>
      </div>

      {/* Center flash on title reveal */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '200vmax',
          height: '200vmax',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.CYAN}22 0%, transparent 60%)`,
          opacity: phase === 'title' ? 1 : 0,
          transition: 'opacity 0.8s ease-out',
          pointerEvents: 'none',
        }}
      />

      {/* Particle burst */}
      {(phase === 'title' || phase === 'tagline' || phase === 'fadeout') && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[...Array(24)].map((_, i) => {
            const angle = (i / 24) * 360;
            const dist = 30 + Math.random() * 40;
            const size = 2 + Math.random() * 3;
            const delay = Math.random() * 0.3;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: '50%',
                  background: i % 3 === 0 ? COLORS.CYAN : COLORS.ICE,
                  boxShadow: `0 0 6px ${COLORS.CYAN}`,
                  animation: `intro-particle 1.2s ease-out ${delay}s both`,
                  ['--particle-x' as string]: `${Math.cos((angle * Math.PI) / 180) * dist}vmin`,
                  ['--particle-y' as string]: `${Math.sin((angle * Math.PI) / 180) * dist}vmin`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Skip hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          letterSpacing: '0.1em',
          color: '#334155',
          opacity: phase === 'black' ? 0 : 1,
          transition: 'opacity 0.5s ease',
          pointerEvents: 'none',
        }}
      >
        TAP TO SKIP
      </div>
    </div>
  );
}
