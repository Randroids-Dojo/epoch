'use client';

import { useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 30_000;

export default function UpdateBanner() {
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    const current = process.env.NEXT_PUBLIC_APP_VERSION;
    if (!current || current === 'dev') return;

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json() as { version: string };
        if (version !== current) setIsStale(true);
      } catch {
        // Network error — ignore
      }
    }

    const initial = setTimeout(() => {
      check();
      const interval = setInterval(check, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(initial);
  }, []);

  if (!isStale) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '7px 16px',
        background: 'rgba(10,14,26,0.97)',
        borderBottom: '1px solid #00d4ff',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        letterSpacing: '0.08em',
        color: '#94a3b8',
      }}
    >
      <span>NEW VERSION AVAILABLE</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: 'rgba(0,212,255,0.12)',
          border: '1px solid #00d4ff',
          color: '#00d4ff',
          padding: '3px 12px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          borderRadius: 4,
        }}
      >
        RELOAD
      </button>
    </div>
  );
}
