import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  canReplace,
  MOOD_DURATION_MS,
  MOOD_LINES,
  type BadgeTone,
  type MascotReaction,
  type Mood,
} from "@/features/mascot/moods";
import { useLocalStorage } from "@/hooks/useLocalStorage";

/**
 * The single source of truth for the mascot's mood.
 *
 * Only the reactions orchestrator (features/reactions/useReactions.ts) calls
 * `react`; components read the state. Precedence and durations come from moods.ts.
 */
export interface MascotState {
  mood: Mood;
  line: string;
  badge: { text: string; tone: BadgeTone } | null;
  /** Increments for each confetti burst (used as a React key). */
  confettiKey: number;
  /** Increments with every accepted reaction; picks the sticker variant. */
  seq: number;
}

export interface MascotApi {
  state: MascotState;
  /** Shows a reaction if its mood may replace the current one. Returns whether it was shown. */
  react: (reaction: MascotReaction) => boolean;
  /** Returns to idle if `mood` is the one showing (e.g. a run was cancelled while thinking). */
  release: (mood: Mood) => void;
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

const MascotContext = createContext<MascotApi | null>(null);

const IDLE: MascotState = { mood: "idle", line: MOOD_LINES.idle[0], badge: null, confettiKey: 0, seq: 0 };

export function MascotProvider({ children, now = Date.now }: { children: ReactNode; now?: () => number }) {
  const [state, setState] = useState<MascotState>(IDLE);
  const [stored, setStored] = useLocalStorage("pyarena:mascot-visible", "true");
  const visible = stored !== "false";
  const setVisible = useCallback((next: boolean) => setStored(next ? "true" : "false"), [setStored]);
  const current = useRef<{ mood: Mood; until: number }>({ mood: "idle", until: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const count = useRef(0);

  const toIdle = useCallback(() => {
    current.current = { mood: "idle", until: 0 };
    setState((s) => ({ ...s, mood: "idle", badge: null, line: MOOD_LINES.idle[count.current % 2], seq: s.seq + 1 }));
  }, []);

  const react = useCallback(
    (reaction: MascotReaction): boolean => {
      const t = now();
      const active = current.current.until > t;
      if (active && !canReplace(current.current.mood, reaction.mood)) return false;
      const duration = MOOD_DURATION_MS[reaction.mood];
      current.current = { mood: reaction.mood, until: duration > 0 ? t + duration : 0 };
      count.current += 1;
      const lines = MOOD_LINES[reaction.mood];
      const line = reaction.line ?? lines[count.current % lines.length];
      setState((s) => ({
        mood: reaction.mood,
        line,
        badge: reaction.badge ?? null,
        confettiKey: reaction.confetti ? s.confettiKey + 1 : s.confettiKey,
        seq: s.seq + 1,
      }));
      clearTimeout(timer.current);
      if (duration > 0) timer.current = setTimeout(toIdle, duration);
      return true;
    },
    [now, toIdle],
  );

  const release = useCallback(
    (mood: Mood) => {
      if (current.current.mood !== mood) return;
      clearTimeout(timer.current);
      toIdle();
    },
    [toIdle],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const api = useMemo<MascotApi>(
    () => ({ state, react, release, visible, setVisible }),
    [state, react, release, visible, setVisible],
  );
  return <MascotContext.Provider value={api}>{children}</MascotContext.Provider>;
}

export function useMascot(): MascotApi {
  const api = useContext(MascotContext);
  if (!api) throw new Error("useMascot must be used inside <MascotProvider>");
  return api;
}
