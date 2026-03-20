'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ActionTooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

const TOOLTIP_STYLE_TOP: React.CSSProperties = {
  bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6,
};
const TOOLTIP_STYLE_BOTTOM: React.CSSProperties = {
  top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6,
};
const WRAPPER_STYLE: React.CSSProperties = { position: 'relative' };

/**
 * Tooltip wrapper: hover on desktop, long-press on mobile.
 * On mobile the tooltip auto-closes on the next tap anywhere.
 */
export default function ActionTooltip({
  text,
  children,
  position = 'top',
}: ActionTooltipProps) {
  const [visible, setVisible] = useState(false);
  const longPressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

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

    let listenerAdded = false;
    const close = () => {
      if (mountedRef.current) hideTooltip();
    };
    // Defer so the current touch event doesn't immediately close
    const raf = requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      document.addEventListener('pointerdown', close, { once: true });
      listenerAdded = true;
    });
    return () => {
      cancelAnimationFrame(raf);
      if (listenerAdded) document.removeEventListener('pointerdown', close);
    };
  }, [visible, hideTooltip]);

  // Track mounted state and cleanup timer on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      style={WRAPPER_STYLE}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {children}
      {visible && (
        <span
          className="action-tooltip"
          style={position === 'top' ? TOOLTIP_STYLE_TOP : TOOLTIP_STYLE_BOTTOM}
        >
          {text}
        </span>
      )}
    </div>
  );
}
