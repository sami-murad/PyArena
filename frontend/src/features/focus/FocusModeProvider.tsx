import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { focusService } from "@/features/focus/services/focusService";
import { useFocusGuard, type FocusSignal } from "@/features/focus/useFocusGuard";
import { useFocusHeartbeat } from "@/features/focus/useFocusHeartbeat";
import { emitReaction } from "@/features/reactions/reactionBus";
import type { CompetitionState, FocusPolicy, FocusState } from "@/types/api";

export interface FocusModeApi {
  /** Focus Mode is on for this room. */
  enabled: boolean;
  focus: FocusState | null;
  policy: FocusPolicy | null;
  /** Monitoring is running right now (round running, notice accepted, not disqualified). */
  monitoring: boolean;
  /** The editor is locked (frozen or disqualified). */
  locked: boolean;
  /** Submitting is blocked (paused, frozen or disqualified). */
  submitBlocked: boolean;
  /** Milliseconds to add to Date.now() to get the server's clock. */
  clockOffset: number;
  acknowledge: () => Promise<void>;
}

const OFF: FocusModeApi = {
  enabled: false,
  focus: null,
  policy: null,
  monitoring: false,
  locked: false,
  submitBlocked: false,
  clockOffset: 0,
  acknowledge: async () => undefined,
};

const FocusContext = createContext<FocusModeApi>(OFF);

function until(value: string | null, serverNow: number): number {
  return value ? Date.parse(value) - serverNow : 0;
}

/**
 * Focus Mode for one competition room: loads the player's focus state, runs
 * detection (useFocusGuard) and the heartbeat while the round is running, and
 * reports to the server, which owns timing and escalation. Counted violations
 * are announced to the reactions orchestrator so the mascot shows them.
 */
export function FocusModeProvider({ room, children }: { room: CompetitionState; children: ReactNode }) {
  const enabled = room.focus_mode;
  const cid = room.id;
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const apply = useCallback((next: FocusState) => {
    setFocus(next);
    setClockOffset(Date.parse(next.server_time) - Date.now());
  }, []);

  // Reload when the room changes phase or the server says my status changed.
  const mine = room.participants.map((p) => `${p.user_id}:${p.focus}:${p.focus_acknowledged}`).join(",");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    focusService
      .get(cid, controller.signal)
      .then(apply)
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, cid, room.status, mine, tick, apply]);

  const monitoring = Boolean(enabled && room.status === "RUNNING" && focus?.acknowledged && !focus.disqualified);
  const policy = focus?.policy ?? null;

  const report = useCallback(
    (signal: FocusSignal) => {
      // Sequential, so "hidden" always reaches the server before "visible".
      queue.current = queue.current.then(async () => {
        try {
          const result = await focusService.report(cid, signal);
          apply(result.state);
          if (result.counted && result.action) {
            emitReaction({
              type: "focus:violation",
              action: result.action,
              count: result.state.counted_violations,
              warnLimit: result.state.policy.warn_limit,
            });
          }
        } catch {
          // Offline or rate limited: the heartbeat gap still tells the server.
        }
      });
    },
    [cid, apply],
  );

  useFocusGuard({ enabled: monitoring, pasteLimitChars: policy?.paste_limit_chars ?? 200, onSignal: report });
  useFocusHeartbeat(monitoring, policy?.heartbeat_seconds ?? 10, () => {
    focusService
      .heartbeat(cid)
      .then(apply)
      .catch(() => undefined);
  });

  // Re-fetch when a pause or freeze ends, so the UI unlocks on time.
  useEffect(() => {
    if (!focus) return;
    const serverNow = Date.now() + clockOffset;
    const waits = [until(focus.paused_until, serverNow), until(focus.frozen_until, serverNow)].filter((ms) => ms > 0);
    if (waits.length === 0) return;
    const id = window.setTimeout(() => setTick((t) => t + 1), Math.min(...waits) + 300);
    return () => window.clearTimeout(id);
  }, [focus, clockOffset]);

  const acknowledge = useCallback(async () => {
    apply(await focusService.acknowledge(cid));
  }, [cid, apply]);

  const value = useMemo<FocusModeApi>(() => {
    if (!enabled) return OFF;
    const status = focus?.status ?? "ok";
    return {
      enabled,
      focus,
      policy,
      monitoring,
      locked: status === "frozen" || status === "disqualified",
      submitBlocked: status === "paused" || status === "frozen" || status === "disqualified",
      clockOffset,
      acknowledge,
    };
  }, [enabled, focus, policy, monitoring, clockOffset, acknowledge]);

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocusMode(): FocusModeApi {
  return useContext(FocusContext);
}
