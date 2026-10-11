/**
 * Every sound PyArena can play. They are synthesised with the Web Audio API at
 * play time (a few oscillator notes), so there are no audio files to license,
 * download or cache. public/sounds/ is reserved for optional custom files.
 *
 * priority:      while a sound is playing, a LOWER priority sound is dropped.
 * minIntervalMs: the same sound never plays twice within this time (no spam).
 * visual:        what the user sees instead (mascot mood + badge), so no
 *                information is ever conveyed by sound alone.
 */
export interface Note {
  /** Hz */
  freq: number;
  /** seconds after the sound starts */
  at: number;
  /** seconds */
  duration: number;
  type?: OscillatorType;
  /** 0..1, relative to the master volume */
  gain?: number;
  /** slide to this frequency over the note (Hz) */
  slideTo?: number;
}

export interface SoundDefinition {
  priority: number;
  minIntervalMs: number;
  notes: readonly Note[];
  visual: string;
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const A4 = 440;

export const SOUNDS = {
  tick: {
    priority: 10,
    minIntervalMs: 400,
    notes: [{ freq: 1400, at: 0, duration: 0.04, type: "triangle", gain: 0.25 }],
    visual: "mascot: thinking",
  },
  success: {
    priority: 40,
    minIntervalMs: 600,
    notes: [
      { freq: E5, at: 0, duration: 0.09, type: "sine" },
      { freq: G5, at: 0.08, duration: 0.14, type: "sine" },
    ],
    visual: "mascot: happy, badge 'Ran OK'",
  },
  error: {
    priority: 50,
    minIntervalMs: 600,
    notes: [
      { freq: 220, at: 0, duration: 0.12, type: "triangle", slideTo: 160 },
      { freq: 165, at: 0.11, duration: 0.16, type: "triangle", slideTo: 120 },
    ],
    visual: "mascot: concerned, badge with the error type",
  },
  wrong: {
    priority: 50,
    minIntervalMs: 800,
    notes: [
      { freq: 392, at: 0, duration: 0.1, type: "square", gain: 0.35 },
      { freq: 330, at: 0.1, duration: 0.18, type: "square", gain: 0.35 },
    ],
    visual: "mascot: concerned, badge 'Wrong answer'",
  },
  partial: {
    priority: 50,
    minIntervalMs: 800,
    notes: [
      { freq: C5, at: 0, duration: 0.1, type: "sine" },
      { freq: E5, at: 0.1, duration: 0.1, type: "sine" },
      { freq: 587.33, at: 0.2, duration: 0.2, type: "sine" },
    ],
    visual: "mascot: encouraging, badge 'n/m passed'",
  },
  limit: {
    priority: 60,
    minIntervalMs: 800,
    notes: [{ freq: 880, at: 0, duration: 0.35, type: "sawtooth", gain: 0.25, slideTo: 180 }],
    visual: "mascot: concerned, badge with the limit",
  },
  countdown: {
    priority: 30,
    minIntervalMs: 900,
    notes: [{ freq: A4, at: 0, duration: 0.12, type: "sine" }],
    visual: "mascot: encouraging; countdown overlay",
  },
  go: {
    priority: 45,
    minIntervalMs: 1500,
    notes: [
      { freq: A4, at: 0, duration: 0.08, type: "sine" },
      { freq: 880, at: 0.09, duration: 0.2, type: "sine" },
    ],
    visual: "mascot: thinking, badge 'Go!'",
  },
  accepted: {
    priority: 90,
    minIntervalMs: 1500,
    notes: [
      { freq: C5, at: 0, duration: 0.1, type: "triangle" },
      { freq: E5, at: 0.09, duration: 0.1, type: "triangle" },
      { freq: G5, at: 0.18, duration: 0.1, type: "triangle" },
      { freq: C6, at: 0.27, duration: 0.3, type: "triangle" },
    ],
    visual: "mascot: celebrate with confetti, badge 'Accepted'",
  },
  win: {
    priority: 100,
    minIntervalMs: 3000,
    notes: [
      { freq: G5 / 2, at: 0, duration: 0.12, type: "square", gain: 0.3 },
      { freq: C5, at: 0.12, duration: 0.12, type: "square", gain: 0.3 },
      { freq: E5, at: 0.24, duration: 0.12, type: "square", gain: 0.3 },
      { freq: G5, at: 0.36, duration: 0.18, type: "square", gain: 0.3 },
      { freq: E5, at: 0.56, duration: 0.1, type: "square", gain: 0.3 },
      { freq: G5, at: 0.66, duration: 0.4, type: "square", gain: 0.3 },
    ],
    visual: "mascot: trophy with confetti, badge 'You won!'",
  },
  lose: {
    priority: 70,
    minIntervalMs: 3000,
    notes: [
      { freq: 392, at: 0, duration: 0.18, type: "sine" },
      { freq: 349.23, at: 0.18, duration: 0.18, type: "sine" },
      { freq: 293.66, at: 0.36, duration: 0.4, type: "sine", slideTo: 260 },
    ],
    visual: "mascot: encouraging or concerned, badge 'Round over' / 'Time's up'",
  },
} as const satisfies Record<string, SoundDefinition>;

export type SoundName = keyof typeof SOUNDS;

export function soundLength(def: SoundDefinition): number {
  return Math.max(...def.notes.map((n) => n.at + n.duration));
}
