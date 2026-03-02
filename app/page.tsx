export default function Home() {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0a0e1a' }}
    >
      {/* Hex-grid background pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 28px,
              rgba(0, 212, 255, 0.3) 28px,
              rgba(0, 212, 255, 0.3) 29px
            ),
            repeating-linear-gradient(
              60deg,
              transparent,
              transparent 28px,
              rgba(0, 212, 255, 0.3) 28px,
              rgba(0, 212, 255, 0.3) 29px
            ),
            repeating-linear-gradient(
              120deg,
              transparent,
              transparent 28px,
              rgba(0, 212, 255, 0.3) 28px,
              rgba(0, 212, 255, 0.3) 29px
            )
          `,
        }}
      />

      {/* Radial glow behind title */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        {/* Main title */}
        <h1
          className="text-8xl font-bold tracking-[0.3em] uppercase"
          style={{
            color: '#00d4ff',
            textShadow:
              '0 0 20px rgba(0,212,255,0.8), 0 0 40px rgba(0,212,255,0.4), 0 0 80px rgba(0,212,255,0.2)',
          }}
        >
          EPOCH
        </h1>

        {/* Tagline */}
        <p
          className="text-xl tracking-widest uppercase"
          style={{ color: '#a8d8ea', letterSpacing: '0.25em' }}
        >
          Plan the Next Epoch.
        </p>

        {/* Divider */}
        <div
          className="w-48 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)' }}
        />

        {/* Phase indicator dots */}
        <div className="flex items-center gap-6">
          {[
            { label: 'Planning', active: true },
            { label: 'Temporal', active: false },
            { label: 'Execution', active: false },
          ].map((phase) => (
            <div key={phase.label} className="flex flex-col items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{
                  backgroundColor: phase.active ? '#00d4ff' : '#1e3a4a',
                  boxShadow: phase.active ? '0 0 8px rgba(0,212,255,0.8)' : 'none',
                }}
              />
              <span
                className="text-xs tracking-widest uppercase"
                style={{ color: phase.active ? '#00d4ff' : '#2a5a6a' }}
              >
                {phase.label}
              </span>
            </div>
          ))}
        </div>

        {/* CTA button */}
        <button
          disabled
          className="mt-4 cursor-not-allowed rounded border px-10 py-3 text-sm tracking-[0.2em] uppercase transition-all"
          style={{
            borderColor: '#1e3a4a',
            color: '#2a5a6a',
            backgroundColor: 'transparent',
          }}
          title="Coming soon"
        >
          Begin Epoch
        </button>

        <p className="text-xs" style={{ color: '#1e3a4a' }}>
          v0.1.0 — Initializing systems...
        </p>
      </div>
    </main>
  )
}
