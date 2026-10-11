import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activeMascot, mascots } from "@/config/mascots";
import { Mascot } from "@/features/mascot/Mascot";
import { MascotProvider, useMascot, type MascotApi } from "@/features/mascot/MascotContext";
import { canReplace, MOOD_DURATION_MS, MOODS } from "@/features/mascot/moods";
import { reactionForCompetition } from "@/features/mascot/useMoodFromCompetition";
import { reactionForRun, reactionForSubmission } from "@/features/mascot/useMoodFromRun";
import { emitReaction } from "@/features/reactions/reactionBus";
import { ReactionsBridge, reactionFor } from "@/features/reactions/useReactions";
import { SoundProvider } from "@/features/sound/SoundContext";
import { SoundManager } from "@/features/sound/soundManager";
import { SOUNDS } from "@/features/sound/sounds";

function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const holder: { api: MascotApi | null } = { api: null };
function Capture() {
  const mascot = useMascot();
  useEffect(() => {
    holder.api = mascot;
  });
  return null;
}

function renderMascot(manager?: SoundManager) {
  const sound = manager ?? new SoundManager({ storage: null, createContext: () => null, clock: () => 0 });
  return render(
    <SoundProvider manager={sound}>
      <MascotProvider>
        <Capture />
        <ReactionsBridge />
        <Mascot />
      </MascotProvider>
    </SoundProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  holder.api = null;
});

// Every sticker file that exists under public/stickers (keys like "../public/stickers/deb/01-coffee-sip.svg").
const existing = new Set(
  Object.keys(import.meta.glob("../public/stickers/**/*.svg", { query: "?url", eager: true })).map((k) =>
    k.replace("../public", ""),
  ),
);

describe("mascot config", () => {
  it("has at least two existing sticker files for every mood", () => {
    for (const mascot of Object.values(mascots)) {
      for (const mood of MOODS) {
        const files = mascot.stickers[mood];
        expect(files.length).toBeGreaterThanOrEqual(2);
        for (const url of files) {
          expect(existing.has(url), url).toBe(true);
        }
      }
    }
  });

  it("contains only original mascots", () => {
    expect(Object.keys(mascots)).toEqual(["deb"]);
    expect(activeMascot().name).toBe("Deb");
  });

  it("uses all 28 Deb stickers, each in exactly one mood", () => {
    const all = Object.values(activeMascot().stickers).flat();
    expect(all).toHaveLength(28);
    expect(new Set(all).size).toBe(28);
    const onDisk = [...existing].filter((url) => url.startsWith("/stickers/deb/"));
    expect(onDisk.sort()).toEqual([...all].sort());
  });
});

describe("mood precedence", () => {
  it("never lets a lower-priority mood replace a higher one", () => {
    expect(canReplace("celebrate", "thinking")).toBe(false);
    expect(canReplace("thinking", "happy")).toBe(true);
    expect(canReplace("concerned", "concerned")).toBe(true);
    expect(canReplace("trophy", "celebrate")).toBe(false);
    expect(canReplace("concerned", "encouraging")).toBe(false);
    expect(canReplace("idle", "thinking")).toBe(true);
  });

  it("ignores a late low-priority reaction while celebrating, then returns to idle", () => {
    renderMascot();
    act(() => {
      expect(holder.api!.react({ mood: "celebrate", confetti: true })).toBe(true);
    });
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "celebrate");
    expect(screen.getByTestId("confetti")).toBeInTheDocument();
    act(() => {
      expect(holder.api!.react({ mood: "thinking" })).toBe(false);
    });
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "celebrate");
    act(() => vi.advanceTimersByTime(MOOD_DURATION_MS.celebrate + 10));
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "idle");
    // Once it has settled, anything may show again.
    act(() => {
      expect(holder.api!.react({ mood: "thinking" })).toBe(true);
    });
  });

  it("release() only clears the mood it names", () => {
    renderMascot();
    act(() => void holder.api!.react({ mood: "thinking" }));
    act(() => holder.api!.release("happy"));
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "thinking");
    act(() => holder.api!.release("thinking"));
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "idle");
  });
});

describe("Mascot dock", () => {
  it("shows a bubble and a badge while reacting, and nothing extra when idle", () => {
    renderMascot();
    expect(screen.queryByTestId("mascot-bubble")).not.toBeInTheDocument();
    act(() => void holder.api!.react({ mood: "concerned", line: "Ouch.", badge: { text: "Runtime error", tone: "danger" } }));
    expect(screen.getByTestId("mascot-bubble")).toHaveTextContent("Ouch.");
    expect(screen.getByTestId("mascot-badge")).toHaveTextContent("Runtime error");
    expect(screen.getByRole("img")).toHaveAttribute("src", expect.stringMatching(/\/stickers\/deb\/(11-panic|12-head-tilt|13-facepalm|14-cracked-screen)\.svg$/));
  });

  it("has no confetti and no animation class with reduced motion", () => {
    mockReducedMotion(true);
    renderMascot();
    act(() => void holder.api!.react({ mood: "celebrate", confetti: true }));
    expect(screen.queryByTestId("confetti")).not.toBeInTheDocument();
    expect(screen.getByTestId("mascot")).toHaveClass("mascot--still");
  });

  it("can be hidden, and remembers it", () => {
    const { unmount } = renderMascot();
    act(() => holder.api!.setVisible(false));
    expect(screen.queryByTestId("mascot")).not.toBeInTheDocument();
    unmount();
    renderMascot();
    expect(screen.queryByTestId("mascot")).not.toBeInTheDocument();
  });
});

describe("reactions orchestrator", () => {
  it("turns events into moods, and plays a sound only when the mood was shown", () => {
    const manager = new SoundManager({ storage: null, createContext: () => null, clock: () => 0 });
    const play = vi.spyOn(manager, "play").mockReturnValue(true);
    renderMascot(manager);

    act(() => emitReaction({ type: "run:started" }));
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "thinking");
    act(() => emitReaction({ type: "run:finished", status: "TIMEOUT" }));
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "concerned");
    expect(screen.getByTestId("mascot-badge")).toHaveTextContent("Time limit");
    expect(play).toHaveBeenLastCalledWith("limit");

    play.mockClear();
    act(() => emitReaction({ type: "run:started" })); // lower priority than concerned: ignored
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "concerned");
    expect(play).not.toHaveBeenCalled();

    act(() => emitReaction({ type: "competition:won" }));
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "trophy");
    expect(screen.getByTestId("mascot-badge")).toHaveTextContent("You won!");
    expect(play).toHaveBeenLastCalledWith("win");
  });

  it("returns to idle when a run is stopped while thinking", () => {
    renderMascot();
    act(() => emitReaction({ type: "run:started" }));
    act(() => emitReaction({ type: "run:stopped" }));
    expect(screen.getByTestId("mascot")).toHaveAttribute("data-mood", "idle");
  });

  it("maps every status to a mood with a matching sound and badge", () => {
    expect(reactionForRun("OK")).toMatchObject({ mood: "happy", sound: "success" });
    expect(reactionForRun("SYNTAX_ERROR")).toMatchObject({ mood: "concerned", sound: "error" });
    expect(reactionForRun("MEMORY_LIMIT").badge?.text).toBe("Memory limit");
    expect(reactionForSubmission("ACCEPTED")).toMatchObject({ mood: "celebrate", confetti: true });
    expect(reactionForSubmission("WRONG_ANSWER")).toMatchObject({ mood: "concerned", sound: "wrong" });
    expect(reactionForSubmission("WRONG_ANSWER", { passed: 0, total: 5 })).toMatchObject({ mood: "concerned" });
    expect(reactionForSubmission("WRONG_ANSWER", { passed: 3, total: 5 })).toMatchObject({
      mood: "encouraging",
      sound: "partial",
      badge: { text: "3/5 passed" },
    });
    expect(reactionForCompetition({ type: "competition:verdict", status: "WRONG_ANSWER", passed: 4, total: 6 })).toMatchObject({
      mood: "encouraging",
    });
    expect(reactionForCompetition({ type: "competition:won" })).toMatchObject({ mood: "trophy", confetti: true });
    expect(reactionForSubmission("PENDING")).toBeNull();
    expect(reactionForCompetition({ type: "competition:verdict", status: "ACCEPTED" })).toBeNull();
    expect(reactionForCompetition({ type: "competition:lost", winner: "ada" })?.line).toContain("ada");
    expect(reactionFor({ type: "run:stopped" })).toBeNull();
    // Every reaction that has a sound also has a visible mood, and sounds exist.
    const events = [
      { type: "run:finished", status: "OK" },
      { type: "submit:finished", status: "ACCEPTED" },
      { type: "competition:countdown" },
      { type: "competition:started" },
      { type: "competition:time-up" },
    ] as const;
    for (const e of events) {
      const r = reactionFor(e);
      expect(r?.mood).toBeTruthy();
      if (r?.sound) expect(SOUNDS[r.sound]).toBeDefined();
    }
  });
});
