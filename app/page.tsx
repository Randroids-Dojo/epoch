import GameCanvas from '@/components/shared/GameCanvas';

export default function Home() {
  return (
    <main
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ backgroundColor: '#0a0e1a' }}
    >
      {/* Header bar */}
      <header
        className="flex shrink-0 items-center justify-between border-b px-4 py-2"
        style={{ borderColor: '#1e293b' }}
      >
        <span
          className="font-mono text-sm font-bold tracking-[0.3em] uppercase"
          style={{ color: '#00d4ff', textShadow: '0 0 10px rgba(0,212,255,0.5)' }}
        >
          EPOCH
        </span>
        <span className="font-mono text-xs" style={{ color: '#334155' }}>
          v0.1.0 — Milestone 1: Hex Map
        </span>
      </header>

      {/* Full-screen game canvas */}
      <div className="relative min-h-0 flex-1">
        <GameCanvas />
      </div>
    </main>
  );
}
