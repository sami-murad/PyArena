import { SOUNDS, soundLength, type SoundDefinition, type SoundName } from "@/features/sound/sounds";

/**
 * The single place that plays sounds.
 *
 * - Autoplay policy: no AudioContext exists until the first user gesture
 *   (pointerdown, keydown or touchstart). Before that, play() does nothing.
 * - Global mute, persisted in localStorage ("pyarena:sound-muted").
 * - Spam control: per-sound minimum interval, and a lower-priority sound is
 *   dropped while a higher-priority one is still playing.
 */
const STORAGE_KEY = "pyarena:sound-muted";
const MASTER_VOLUME = 0.18;
const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

type AudioContextFactory = () => AudioContext | null;

export interface SoundManagerOptions {
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  createContext?: AudioContextFactory;
  /** Milliseconds, monotonic. */
  clock?: () => number;
  sounds?: Record<string, SoundDefinition>;
}

function defaultFactory(): AudioContext | null {
  const Ctor =
    typeof window !== "undefined"
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  return Ctor ? new Ctor() : null;
}

function safeStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  private readonly lastPlayed = new Map<string, number>();
  private busyUntil = 0;
  private busyPriority = -1;
  private readonly listeners = new Set<() => void>();
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  private readonly createContext: AudioContextFactory;
  private readonly clock: () => number;
  private readonly sounds: Record<string, SoundDefinition>;
  private unlockTarget: EventTarget | null = null;

  constructor(options: SoundManagerOptions = {}) {
    this.storage = options.storage === undefined ? safeStorage() : options.storage;
    this.createContext = options.createContext ?? defaultFactory;
    this.clock = options.clock ?? (() => performance.now());
    this.sounds = options.sounds ?? SOUNDS;
    let stored: string | null;
    try {
      stored = this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      stored = null;
    }
    this.muted = stored === "true";
  }

  /** True once a user gesture created the AudioContext. */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      this.storage?.setItem(STORAGE_KEY, String(muted));
    } catch {
      /* storage unavailable: keep the in-memory value */
    }
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Waits for the first user gesture, then creates the AudioContext. Call once. */
  installUnlock(target: EventTarget = window): void {
    if (this.unlockTarget) return;
    this.unlockTarget = target;
    const unlock = () => {
      this.unlock();
      UNLOCK_EVENTS.forEach((e) => target.removeEventListener(e, unlock));
    };
    UNLOCK_EVENTS.forEach((e) => target.addEventListener(e, unlock, { passive: true }));
  }

  /** Must only be called from a user gesture handler. */
  unlock(): void {
    if (this.ctx) return;
    try {
      this.ctx = this.createContext();
      void this.ctx?.resume?.();
    } catch {
      this.ctx = null; // audio unsupported or blocked: stay silent
    }
  }

  /** Plays a sound if allowed. Returns whether it was played. */
  play(name: SoundName | string): boolean {
    const def = this.sounds[name];
    if (!def || this.muted || !this.ctx) return false;
    const now = this.clock();
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < def.minIntervalMs) return false;
    if (now < this.busyUntil && def.priority < this.busyPriority) return false;
    this.lastPlayed.set(name, now);
    this.busyUntil = now + soundLength(def) * 1000;
    this.busyPriority = def.priority;
    this.schedule(def);
    return true;
  }

  private schedule(def: SoundDefinition): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const start = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
    for (const note of def.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type ?? "sine";
      const t0 = start + note.at;
      const t1 = t0 + note.duration;
      osc.frequency.setValueAtTime(note.freq, t0);
      if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, t1);
      // Short attack and release so notes do not click.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(note.gain ?? 0.6, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  }
}

export const soundManager = new SoundManager();
