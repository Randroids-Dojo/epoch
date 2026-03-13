'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BonusCardDef, SwipeDirection } from '@/engine/bonusCards';

interface BonusCardProps {
  card: BonusCardDef;
  onSwipe: (direction: SwipeDirection) => void;
}

const SWIPE_THRESHOLD = 60;
const DISMISS_VELOCITY = 0.4; // px/ms — fast flick also counts

export default function BonusCard({ card, onSwipe }: BonusCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [dismissed, setDismissed] = useState<SwipeDirection | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback((dir: SwipeDirection) => {
    if (dismissed) return;
    setDismissed(dir);
    setTimeout(() => onSwipe(dir), 300);
  }, [dismissed, onSwipe]);

  // ── Touch (mobile swipe) ─────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    setOffsetX(0);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const dx = e.touches[0].clientX - startRef.current.x;
    setOffsetX(dx);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!startRef.current) return;
    const elapsed = Date.now() - startRef.current.t;
    const velocity = Math.abs(offsetX) / Math.max(elapsed, 1);
    const hitThreshold = Math.abs(offsetX) >= SWIPE_THRESHOLD || velocity >= DISMISS_VELOCITY;

    if (hitThreshold && offsetX !== 0) {
      dismiss(offsetX < 0 ? 'left' : 'right');
    } else {
      setOffsetX(0);
    }
    startRef.current = null;
  }, [offsetX, dismiss]);

  // ── Mouse drag (desktop drag) ────────────────────────────────────────────
  const mouseDown = useRef(false);
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDown.current = true;
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setOffsetX(0);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseDown.current || !startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    setOffsetX(dx);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!mouseDown.current) return;
    mouseDown.current = false;
    if (!startRef.current) return;
    const elapsed = Date.now() - startRef.current.t;
    const velocity = Math.abs(offsetX) / Math.max(elapsed, 1);
    const hitThreshold = Math.abs(offsetX) >= SWIPE_THRESHOLD || velocity >= DISMISS_VELOCITY;

    if (hitThreshold && offsetX !== 0) {
      dismiss(offsetX < 0 ? 'left' : 'right');
    } else {
      setOffsetX(0);
    }
    startRef.current = null;
  }, [offsetX, dismiss]);

  const onMouseLeave = useCallback(() => {
    if (mouseDown.current) {
      mouseDown.current = false;
      setOffsetX(0);
      startRef.current = null;
    }
  }, []);

  // ── Keyboard (arrow keys) ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (dismissed) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dismiss('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        dismiss('right');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismissed, dismiss]);

  // ── Visual feedback ──────────────────────────────────────────────────────
  const progress = Math.min(1, Math.abs(offsetX) / SWIPE_THRESHOLD);
  const leaning: SwipeDirection | null = offsetX < -10 ? 'left' : offsetX > 10 ? 'right' : null;

  const leftHighlight = leaning === 'left';
  const rightHighlight = leaning === 'right';

  const leftBg = leftHighlight
    ? `rgba(0, 180, 255, ${0.15 + progress * 0.35})`
    : 'rgba(0, 180, 255, 0.06)';
  const rightBg = rightHighlight
    ? `rgba(52, 211, 153, ${0.15 + progress * 0.35})`
    : 'rgba(52, 211, 153, 0.06)';

  const rotation = offsetX * 0.08;

  const dismissTransform = dismissed
    ? `translateX(${dismissed === 'left' ? '-120%' : '120%'}) rotate(${dismissed === 'left' ? -15 : 15}deg)`
    : `translateX(${offsetX}px) rotate(${rotation}deg)`;

  // Shared button style for the clickable option panels.
  const optionBtnStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    flex: 1,
    padding: '10px 8px',
    borderRadius: 6,
    border: `1px solid ${side === 'left'
      ? (leftHighlight ? `rgba(0,180,255,${0.4 + progress * 0.4})` : 'rgba(0,180,255,0.2)')
      : (rightHighlight ? `rgba(52,211,153,${0.4 + progress * 0.4})` : 'rgba(52,211,153,0.2)')
    }`,
    background: side === 'left' ? leftBg : rightBg,
    transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
    cursor: 'pointer',
    textAlign: 'left' as const,
  });

  return (
    <div
      data-testid="bonus-card-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(2,6,18,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'epoch-popup-in 0.4s ease-out',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* Swipe hints above card */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: 340,
          padding: '0 4px',
          marginBottom: 8,
          opacity: 0.7,
        }}
      >
        <div
          className="text-[10px] font-mono uppercase tracking-wider"
          style={{ color: '#00b4ff', textAlign: 'left' }}
        >
          &larr; SWIPE LEFT
        </div>
        <div
          className="text-[10px] font-mono uppercase tracking-wider"
          style={{ color: '#34d399', textAlign: 'right' }}
        >
          SWIPE RIGHT &rarr;
        </div>
      </div>

      {/* The draggable card */}
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: '20px 20px 16px',
          background: 'linear-gradient(145deg, #0f0e18 0%, #13111f 50%, #0d0b15 100%)',
          border: '1px solid #2a2535',
          borderRadius: 12,
          transform: dismissTransform,
          transition: dismissed
            ? 'transform 0.3s ease-out, opacity 0.3s ease-out'
            : offsetX === 0
              ? 'transform 0.2s ease-out'
              : 'none',
          opacity: dismissed ? 0 : 1,
          cursor: 'grab',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 60px rgba(230,57,70,0.05)',
        }}
      >
        {/* Card title */}
        <div
          className="text-center font-mono font-bold tracking-[0.25em] uppercase"
          style={{
            fontSize: 14,
            color: '#ffd700',
            textShadow: '0 0 10px rgba(255,215,0,0.4)',
            marginBottom: 6,
          }}
        >
          {card.title}
        </div>

        {/* Flavour text */}
        <div
          className="text-center font-mono italic"
          style={{ fontSize: 10, color: '#64748b', marginBottom: 12 }}
        >
          {card.flavour}
        </div>

        {/* ASCII art */}
        <div
          style={{
            background: 'rgba(0,0,0,0.35)',
            borderRadius: 6,
            padding: '10px 8px',
            marginBottom: 16,
            fontFamily: 'monospace',
            fontSize: 13,
            lineHeight: '16px',
            textAlign: 'center',
            color: '#94a3b8',
            letterSpacing: '0.05em',
            whiteSpace: 'pre',
          }}
        >
          {card.art.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>

        {/* Two clickable option panels */}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Left option — click or swipe left */}
          <button
            type="button"
            data-testid="bonus-option-left"
            onClick={(e) => { e.stopPropagation(); dismiss('left'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={optionBtnStyle('left')}
          >
            <div
              className="font-mono font-bold uppercase"
              style={{ fontSize: 10, color: '#00b4ff', marginBottom: 4, letterSpacing: '0.05em' }}
            >
              {card.left.label}
            </div>
            <div className="font-mono" style={{ fontSize: 9, color: '#64748b', lineHeight: '12px' }}>
              {card.left.description}
            </div>
          </button>

          {/* Right option — click or swipe right */}
          <button
            type="button"
            data-testid="bonus-option-right"
            onClick={(e) => { e.stopPropagation(); dismiss('right'); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={optionBtnStyle('right')}
          >
            <div
              className="font-mono font-bold uppercase"
              style={{ fontSize: 10, color: '#34d399', marginBottom: 4, letterSpacing: '0.05em' }}
            >
              {card.right.label}
            </div>
            <div className="font-mono" style={{ fontSize: 9, color: '#64748b', lineHeight: '12px' }}>
              {card.right.description}
            </div>
          </button>
        </div>
      </div>

      {/* Bottom hint — context-aware */}
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          color: '#475569',
          marginTop: 12,
          textAlign: 'center',
        }}
      >
        {leaning === 'left' && <span style={{ color: '#00b4ff' }}>Release for {card.left.label}</span>}
        {leaning === 'right' && <span style={{ color: '#34d399' }}>Release for {card.right.label}</span>}
        {!leaning && 'Swipe, click an option, or press arrow keys'}
      </div>
    </div>
  );
}
