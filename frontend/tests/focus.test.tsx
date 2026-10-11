import { act, render, renderHook, screen, waitFor } from "@testing-library/react";

import { reactionForFocus } from "@/features/mascot/useMoodFromCompetition";
import { FocusBanner } from "@/features/focus/FocusBanner";
import { FocusModeProvider, useFocusMode } from "@/features/focus/FocusModeProvider";
import { FocusOverlay } from "@/features/focus/FocusOverlay";
import { ladder } from "@/features/focus/focusText";
import { useFocusGuard, type FocusSignal } from "@/features/focus/useFocusGuard";
import { onReaction, type ReactionEvent } from "@/features/reactions/reactionBus";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CompetitionState, FocusPolicy, FocusState } from "@/types/api";

import { jsonResponse, mockFetch } from "./helpers";

const POLICY: FocusPolicy = {
  warn_limit: 3,
  pause_seconds: 30,
  freeze_seconds: 60,
  dq_after: 4,
  grace_ms: 2000,
  paste_limit_chars: 200,
  heartbeat_seconds: 10,
};

function focusState(overrides: Partial<FocusState> = {}): FocusState {
  return {
    competition_id: 7,
    enabled: true,
    acknowledged: true,
    status: "ok",
    counted_violations: 0,
    warnings_left: 3,
    next_action: "warn",
    paused_until: null,
    frozen_until: null,
    disqualified: false,
    server_time: new Date().toISOString(),
    policy: POLICY,
    ...overrides,
  };
}

function room(overrides: Partial<CompetitionState> = {}): CompetitionState {
  return {
    id: 7,
    code: "ABCDEFGH",
    status: "RUNNING",
    host_id: 1,
    difficulty: "easy",
    max_players: 4,
    min_players: 2,
    duration_seconds: 900,
    focus_mode: true,
    created_at: new Date().toISOString(),
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 600_000).toISOString(),
    finished_at: null,
    finish_reason: null,
    server_time: new Date().toISOString(),
    participants: [],
    question: null,
    winner: null,
    can_start: false,
    start_blockers: [],
    ...overrides,
  };
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  setVisibility("visible");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useFocusGuard", () => {
  it("reports tab, window, fullscreen and large-paste signals, and nothing when disabled", () => {
    const signals: FocusSignal[] = [];
    const { rerender } = renderHook(({ enabled }) => useFocusGuard({ enabled, pasteLimitChars: 200, onSignal: (s) => signals.push(s) }), {
      initialProps: { enabled: false },
    });
    window.dispatchEvent(new Event("blur"));
    expect(signals).toEqual([]);

    rerender({ enabled: true });
    setVisibility("hidden");
    setVisibility("visible");
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));

    const paste = (text: string) => {
      const event = new Event("paste", { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
      document.body.dispatchEvent(event);
    };
    paste("x".repeat(20)); // small: not reported
    paste("y".repeat(450));

    expect(signals).toEqual([
      { kind: "hidden" },
      { kind: "visible", awayMs: expect.any(Number) },
      { kind: "blur" },
      { kind: "focus", awayMs: expect.any(Number) },
      { kind: "paste", pasteChars: 450 },
    ]);
  });

  it("reports leaving fullscreen only after fullscreen was entered", () => {
    const signals: FocusSignal[] = [];
    renderHook(() => useFocusGuard({ enabled: true, pasteLimitChars: 200, onSignal: (s) => signals.push(s) }));
    const setFullscreen = (el: Element | null) => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => el });
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    setFullscreen(null); // was never fullscreen
    setFullscreen(document.body);
    setFullscreen(null);
    expect(signals).toEqual([{ kind: "fullscreen_exit" }]);
  });
});

describe("useDelayedFlag", () => {
  it("shows an opponent as away only after the grace period", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDelayedFlag(v, 2000), { initialProps: { v: true } });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1999));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(2));
    expect(result.current).toBe(true);
    rerender({ v: false });
    expect(result.current).toBe(false);
    rerender({ v: true }); // a new absence starts from zero again
    expect(result.current).toBe(false);
  });
});

describe("Focus Mode texts and reactions", () => {
  it("explains the escalation ladder from the server policy", () => {
    expect(ladder(POLICY)).toEqual([
      "The first 3 are warnings.",
      "The next one pauses your submissions for 30 seconds.",
      "After that, each one freezes your editor and submissions for 60 seconds.",
      "Number 7 disqualifies you from the round.",
    ]);
  });

  it("gives every counted violation a visible badge and a sound", () => {
    expect(reactionForFocus("warn", 2, 3)).toMatchObject({ mood: "concerned", sound: "error", badge: { text: "Focus warning 2/3" } });
    expect(reactionForFocus("disqualify", 7, 3)).toMatchObject({ badge: { text: "Disqualified" }, sound: "lose" });
    expect(reactionForFocus("ignored", 0, 3)).toBeNull();
  });
});

describe("FocusModeProvider", () => {
  function Probe() {
    const f = useFocusMode();
    return <output data-testid="probe">{`${f.monitoring}|${f.locked}|${f.submitBlocked}|${f.focus?.status ?? "-"}`}</output>;
  }

  it("monitors a running round, reports in order and announces counted violations", async () => {
    const events: ReactionEvent[] = [];
    const stop = onReaction((e) => events.push(e));
    const calls = mockFetch({
      "GET /competitions/7/focus": () => jsonResponse(focusState()),
      "POST /competitions/7/focus/heartbeat": () => jsonResponse(focusState()),
      "POST /competitions/7/focus/events": (body) => {
        const kind = (body as { kind: string }).kind;
        if (kind === "hidden") return jsonResponse({ state: focusState({ status: "away" }), recorded: true, counted: false, action: "pending" });
        return jsonResponse({
          state: focusState({ counted_violations: 1, warnings_left: 2 }),
          recorded: true,
          counted: true,
          action: "warn",
        });
      },
    });
    render(
      <FocusModeProvider room={room()}>
        <Probe />
        <FocusBanner />
      </FocusModeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("true|false|false|ok"));
    await waitFor(() => expect(calls.some((c) => c.path === "/competitions/7/focus/heartbeat")).toBe(true));

    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    await waitFor(() => expect(events).toContainEqual({ type: "focus:violation", action: "warn", count: 1, warnLimit: 3 }));
    const kinds = calls.filter((c) => c.path.endsWith("/events")).map((c) => (c.body as { kind: string }).kind);
    expect(kinds).toEqual(["hidden", "visible"]);
    expect(screen.getByTestId("focus-banner")).toHaveTextContent("1 counted. Next tab switch means a warning.");
    stop();
  });

  it("locks the editor while frozen and does not monitor a disqualified player", async () => {
    const frozen = focusState({ status: "frozen", frozen_until: new Date(Date.now() + 45_000).toISOString() });
    mockFetch({
      "GET /competitions/7/focus": () => jsonResponse(frozen),
      "POST /competitions/7/focus/heartbeat": () => jsonResponse(frozen),
    });
    const { unmount } = render(
      <FocusModeProvider room={room()}>
        <Probe />
        <FocusOverlay />
      </FocusModeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("true|true|true|frozen"));
    expect(screen.getByTestId("focus-overlay")).toHaveTextContent(/Frozen for (4[0-6])s/);
    unmount();

    mockFetch({ "GET /competitions/7/focus": () => jsonResponse(focusState({ status: "disqualified", disqualified: true })) });
    render(
      <FocusModeProvider room={room()}>
        <Probe />
        <FocusOverlay />
      </FocusModeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("false|true|true|disqualified"));
    expect(screen.getByTestId("focus-overlay")).toHaveTextContent("Disqualified by Focus Mode");
  });

  it("does nothing at all when the room has Focus Mode off", async () => {
    const calls = mockFetch({});
    render(
      <FocusModeProvider room={room({ focus_mode: false })}>
        <Probe />
        <FocusBanner />
      </FocusModeProvider>,
    );
    act(() => setVisibility("hidden"));
    expect(screen.getByTestId("probe")).toHaveTextContent("false|false|false|-");
    expect(screen.queryByTestId("focus-banner")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});
