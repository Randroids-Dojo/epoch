/**
 * Procedural audio engine — Web Audio API only, zero audio files.
 * All AudioContext creation is deferred to first user interaction.
 */

export type AmbientState = 'planning' | 'tense' | 'execution' | 'late';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Ambient drone
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private droneHarmonicOsc: OscillatorNode | null = null;
  private droneHarmonicGain: GainNode | null = null;
  private droneLfoOsc: OscillatorNode | null = null;
  private droneLfoGain: GainNode | null = null;

  // Pre-allocated noise buffer — reused by all _noise() calls to avoid per-call allocation.
  private noiseBuffer: AudioBuffer | null = null;

  private initialized = false;

  /** Call on first user interaction to create AudioContext and start the drone. */
  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);
      this._initNoiseBuffer();
      this._startAmbient();
      this.initialized = true;
      window.addEventListener('beforeunload', () => this.ctx?.close(), { once: true });
    } catch {
      // Audio unavailable (e.g. SSR or policy block)
    }
  }

  private _initNoiseBuffer(): void {
    const ac = this.ctx!;
    // 0.5 s of white noise — long enough for any _noise() call; sources stop early via gain envelope.
    const size = Math.ceil(ac.sampleRate * 0.5);
    this.noiseBuffer = ac.createBuffer(1, size, ac.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  }

  private _startAmbient(): void {
    const ac = this.ctx!;

    // Main sine drone
    this.droneOsc = ac.createOscillator();
    this.droneOsc.type = 'sine';
    this.droneOsc.frequency.value = 65;
    this.droneGain = ac.createGain();
    this.droneGain.gain.value = 0.12;
    this.droneOsc.connect(this.droneGain);
    this.droneGain.connect(this.masterGain!);
    this.droneOsc.start();

    // Harmonic (sawtooth, silent until tense/execution)
    this.droneHarmonicOsc = ac.createOscillator();
    this.droneHarmonicOsc.type = 'sawtooth';
    this.droneHarmonicOsc.frequency.value = 130;
    this.droneHarmonicGain = ac.createGain();
    this.droneHarmonicGain.gain.value = 0;
    this.droneHarmonicOsc.connect(this.droneHarmonicGain);
    this.droneHarmonicGain.connect(this.masterGain!);
    this.droneHarmonicOsc.start();

    // LFO for amplitude pulsing during execution
    this.droneLfoOsc = ac.createOscillator();
    this.droneLfoOsc.type = 'sine';
    this.droneLfoOsc.frequency.value = 2;
    this.droneLfoGain = ac.createGain();
    this.droneLfoGain.gain.value = 0;
    this.droneLfoOsc.connect(this.droneLfoGain);
    this.droneLfoGain.connect(this.droneGain.gain);
    this.droneLfoOsc.start();
  }

  /** Update ambient drone character to reflect game state. */
  setAmbient(state: AmbientState): void {
    if (!this.initialized || !this.ctx || !this.droneOsc || !this.droneGain ||
        !this.droneHarmonicGain || !this.droneLfoGain) return;

    const now = this.ctx.currentTime;
    const ramp = 1.0;

    switch (state) {
      case 'planning':
        this.droneOsc.frequency.linearRampToValueAtTime(65, now + ramp);
        this.droneGain.gain.linearRampToValueAtTime(0.12, now + ramp);
        this.droneHarmonicGain.gain.linearRampToValueAtTime(0, now + ramp);
        this.droneLfoGain.gain.linearRampToValueAtTime(0, now + ramp);
        break;
      case 'tense':
        this.droneOsc.frequency.linearRampToValueAtTime(75, now + ramp);
        this.droneGain.gain.linearRampToValueAtTime(0.14, now + ramp);
        this.droneHarmonicGain.gain.linearRampToValueAtTime(0.03, now + ramp);
        this.droneLfoGain.gain.linearRampToValueAtTime(0, now + ramp);
        break;
      case 'execution':
        this.droneOsc.frequency.linearRampToValueAtTime(70, now + ramp);
        this.droneGain.gain.linearRampToValueAtTime(0.10, now + ramp);
        this.droneHarmonicGain.gain.linearRampToValueAtTime(0.04, now + ramp);
        this.droneLfoGain.gain.linearRampToValueAtTime(0.05, now + ramp);
        break;
      case 'late':
        this.droneOsc.frequency.linearRampToValueAtTime(80, now + ramp);
        this.droneGain.gain.linearRampToValueAtTime(0.15, now + ramp);
        this.droneHarmonicGain.gain.linearRampToValueAtTime(0.06, now + ramp);
        this.droneLfoGain.gain.linearRampToValueAtTime(0.02, now + ramp);
        break;
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private _tone(
    freq: number,
    type: OscillatorType,
    peak: number,
    dur: number,
    freqEnd?: number,
    delay = 0,
  ): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const ac = this.ctx;
    const t = ac.currentTime + delay;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) osc.frequency.linearRampToValueAtTime(freqEnd, t + dur);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.005);
    gain.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  private _noise(peak: number, dur: number, lpHz = 2000, delay = 0): void {
    if (!this.initialized || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ac = this.ctx;
    const t = ac.currentTime + delay;

    const src = ac.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lpHz;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
    src.stop(t + dur);
    src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  // ── UI Sounds ──────────────────────────────────────────────────────────────

  /** Fill slot — rising triangle, pitch increases with slot index (0–4). */
  playFillSlot(slotIndex: number): void {
    const base = 200 + slotIndex * 40;
    this._tone(base, 'triangle', 0.25, 0.1, base * 2);
  }

  /** Clear slot — descending triangle. */
  playClearSlot(): void {
    this._tone(400, 'triangle', 0.18, 0.1, 200);
  }

  /** Lock-in click-chord. earlyBonus adds a high shimmer for the TE bonus. */
  playLockIn(earlyBonus = false): void {
    this._noise(0.12, 0.05, 1500);
    this._tone(261.63, 'sine', 0.14, 0.2);   // C4
    this._tone(329.63, 'sine', 0.10, 0.2);   // E4
    this._tone(392.00, 'sine', 0.10, 0.2);   // G4
    if (earlyBonus) this._tone(1046.5, 'sine', 0.07, 0.3, 1318.5); // gold shimmer
  }

  /** Soft tick — 5 s timer warning. */
  playTimerWarning(): void {
    this._noise(0.09, 0.05, 800);
  }

  /** Rising tick — 1–3 s timer critical. */
  playTimerCritical(secondsLeft: number): void {
    const freq = 600 + (3 - secondsLeft) * 200;
    this._tone(freq, 'sine', 0.11, 0.05);
  }

  /** Deep resolving chord on epoch transition. */
  playEpochTransition(): void {
    this._tone(87.3, 'sine', 0.18, 0.5);
    this._tone(130.8, 'sine', 0.12, 0.5, undefined, 0.08);
    this._tone(174.6, 'sine', 0.09, 0.5, undefined, 0.16);
  }

  /** Short blip — unit selected. */
  playSelectUnit(): void {
    this._tone(800, 'sine', 0.13, 0.03);
  }

  /** Lower blip — structure selected. */
  playSelectStructure(): void {
    this._tone(400, 'sine', 0.13, 0.05);
  }

  // ── Execution Sounds ───────────────────────────────────────────────────────

  /** Soft filtered-noise tick per unit move. */
  playMoveTick(): void {
    this._noise(0.07, 0.02, 400);
  }

  /** Melee impact — noise burst + pitch drop. */
  playMeleeAttack(): void {
    this._noise(0.22, 0.04, 600);
    this._tone(150, 'sine', 0.12, 0.08, 60);
  }

  /** Ranged zap — sawtooth sweep. */
  playRangedAttack(): void {
    this._tone(200, 'sawtooth', 0.12, 0.1, 2000);
  }

  /** Dull thud — taking damage. */
  playDamageTaken(): void {
    this._noise(0.16, 0.06, 300);
  }

  /** Descending sweep — unit destroyed. */
  playUnitDestroyed(): void {
    this._noise(0.25, 0.15, 1200);
    this._tone(400, 'sine', 0.09, 0.3, 60);
  }

  /** Rising arpeggio — structure built. */
  playStructureCompleted(): void {
    this._tone(261.63, 'sine', 0.14, 0.1);
    this._tone(329.63, 'sine', 0.14, 0.1, undefined, 0.1);
    this._tone(392.00, 'sine', 0.14, 0.1, undefined, 0.2);
  }

  /** Crystalline chime — crystal gathered. */
  playResourceGathered(): void {
    this._tone(1046.5, 'sine', 0.11, 0.05);
    this._tone(1318.5, 'sine', 0.07, 0.08, undefined, 0.03);
  }

  // ── Temporal Sounds ────────────────────────────────────────────────────────

  /** Temporal Echo — pitch falls then partially resolves upward. */
  playTemporalEcho(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const ac = this.ctx;
    const t = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(150, t + 0.3);
    osc.frequency.linearRampToValueAtTime(300, t + 0.5);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.08);
    gain.gain.linearRampToValueAtTime(0, t + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.55);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  suspend(): void { this.ctx?.suspend(); }
  resume(): void { this.ctx?.resume(); }
}

export const audioEngine = new AudioEngine();
