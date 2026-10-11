import { describe, expect, it, vi } from "vitest";

import { SoundManager } from "@/features/sound/soundManager";
import { SOUNDS } from "@/features/sound/sounds";

/** A minimal fake of the Web Audio API that records started oscillators. */
function fakeAudio() {
  const started: number[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const ctx = {
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => undefined),
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createOscillator: () => ({
      type: "sine",
      frequency: param(),
      connect: vi.fn(),
      start: (t: number) => started.push(t),
      stop: vi.fn(),
    }),
  };
  return { ctx: ctx as unknown as AudioContext, started };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

function setup(initial: Record<string, string> = {}) {
  let now = 0;
  const audio = fakeAudio();
  const createContext = vi.fn(() => audio.ctx);
  const storage = memoryStorage(initial);
  const manager = new SoundManager({ storage, createContext, clock: () => now });
  return {
    manager,
    audio,
    storage,
    createContext,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("SoundManager", () => {
  it("creates no AudioContext and plays nothing before a user gesture", () => {
    const { manager, createContext, audio } = setup();
    const target = new EventTarget();
    manager.installUnlock(target);
    expect(manager.play("success")).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("pointerdown"));
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(manager.play("success")).toBe(true);
    expect(audio.started.length).toBe(SOUNDS.success.notes.length);
    // Later gestures do not create more contexts.
    target.dispatchEvent(new Event("keydown"));
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("respects each sound's minimum interval", () => {
    const { manager, advance } = setup();
    manager.unlock();
    expect(manager.play("error")).toBe(true);
    advance(SOUNDS.error.minIntervalMs - 1);
    expect(manager.play("error")).toBe(false);
    advance(1);
    expect(manager.play("error")).toBe(true);
  });

  it("drops a lower-priority sound while a higher-priority one plays, then allows it", () => {
    const { manager, advance } = setup();
    manager.unlock();
    expect(manager.play("win")).toBe(true);
    advance(100);
    expect(manager.play("tick")).toBe(false);
    expect(manager.play("success")).toBe(false);
    advance(2000); // win has finished
    expect(manager.play("success")).toBe(true);
  });

  it("lets a higher-priority sound interrupt a lower one", () => {
    const { manager, advance } = setup();
    manager.unlock();
    expect(manager.play("tick")).toBe(true);
    advance(10);
    expect(manager.play("accepted")).toBe(true);
  });

  it("mutes globally and remembers it in localStorage", () => {
    const { manager, storage } = setup();
    manager.unlock();
    const listener = vi.fn();
    manager.subscribe(listener);
    manager.setMuted(true);
    expect(listener).toHaveBeenCalled();
    expect(storage.data["pyarena:sound-muted"]).toBe("true");
    expect(manager.play("success")).toBe(false);

    const again = new SoundManager({ storage, createContext: () => fakeAudio().ctx, clock: () => 0 });
    expect(again.isMuted()).toBe(true);
  });

  it("stays silent if audio cannot be created", () => {
    const manager = new SoundManager({ storage: null, createContext: () => null, clock: () => 0 });
    manager.unlock();
    expect(manager.unlocked).toBe(false);
    expect(manager.play("success")).toBe(false);
  });

  it("every sound declares its visual equivalent", () => {
    for (const def of Object.values(SOUNDS)) {
      expect(def.visual.length).toBeGreaterThan(5);
    }
  });
});
