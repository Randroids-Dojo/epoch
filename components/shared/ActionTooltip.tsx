'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ActionTooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Tooltip wrapper: hover on desktop, long-press on mobile.
 * On mobile the tooltip auto-closes on the next tap anywhere.
 */
export default function ActionTooltip({
  text,
  children,
  position = 'top',
  className,
  style,
}: ActionTooltipProps) {
  const [visible, setVisible] = useState(false);
  const longPressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideTooltip = useCallback(() => {
    setVisible(false);
    longPressRef.current = false;
  }, []);

  // Desktop: hover
  const onMouseEnter = useCallback(() => setVisible(true), []);
  const onMouseLeave = useCallback(() => {
    if (!longPressRef.current) setVisible(false);
  }, []);

  // Mobile: long-press (500ms)
  const onTouchStart = useCallback(() => {
    timerRef.current = setTimeout(() => {
      longPressRef.current = true;
      setVisible(true);
    }, 500);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Auto-close on next tap anywhere when opened via long-press
  useEffect(() => {
    if (!visible || !longPressRef.current) return;

    const close = () => hideTooltip();
    // Defer so the current touch event doesn't immediately close
    const raf = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', close, { once: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', close);
    };
  }, [visible, hideTooltip]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const tooltipStyle: React.CSSProperties =
    position === 'top'
      ? { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 }
      : { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 };

  return (
    <div
      className={className}
      style={{ position: 'relative', ...style }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {children}
      {visible && (
        <span className="action-tooltip" style={tooltipStyle}>
          {text}
        </span>
      )}
    </div>
  );
}
