import { useEffect, useRef } from "react";

import type { FocusEventKind } from "@/types/api";

export interface FocusSignal {
  kind: FocusEventKind;
  pasteChars?: number;
  /** With "visible"/"focus": how long the absence lasted, measured here (network delay excluded). */
  awayMs?: number;
}

interface GuardOptions {
  enabled: boolean;
  /** Pastes shorter than this are not reported at all. */
  pasteLimitChars: number;
  onSignal: (signal: FocusSignal) => void;
}

/**
 * Detection only: listens for the browser telling us the competition tab lost
 * attention and reports it. It never blocks anything (no disabled shortcuts,
 * no forced fullscreen, no "are you sure?" dialogs). The server times each
 * absence and ignores the ones shorter than the grace period (2 s).
 *
 * Signals: visibilitychange (tab hidden/visible), window blur/focus,
 * fullscreenchange (leaving fullscreen after entering it) and paste size.
 */
export function useFocusGuard({ enabled, pasteLimitChars, onSignal }: GuardOptions): void {
  const handler = useRef(onSignal);
  useEffect(() => {
    handler.current = onSignal;
  });

  useEffect(() => {
    if (!enabled) return;
    let wasFullscreen = Boolean(document.fullscreenElement);
    let awaySince: number | null = null;
    const send = (signal: FocusSignal) => handler.current(signal);
    const leave = (kind: "hidden" | "blur") => {
      if (awaySince === null) awaySince = performance.now();
      send({ kind });
    };
    const back = (kind: "visible" | "focus") => {
      const awayMs = awaySince === null ? undefined : Math.round(performance.now() - awaySince);
      awaySince = null;
      send(awayMs === undefined ? { kind } : { kind, awayMs });
    };

    const onVisibility = () => (document.visibilityState === "hidden" ? leave("hidden") : back("visible"));
    const onBlur = () => leave("blur");
    const onFocus = () => back("focus");
    const onFullscreen = () => {
      const now = Boolean(document.fullscreenElement);
      if (wasFullscreen && !now) send({ kind: "fullscreen_exit" });
      wasFullscreen = now;
    };
    const onPaste = (e: ClipboardEvent) => {
      const chars = e.clipboardData?.getData("text").length ?? 0;
      if (chars >= pasteLimitChars) send({ kind: "paste", pasteChars: chars });
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("paste", onPaste, true);
    // Already hidden when monitoring starts (e.g. the round began in a background tab).
    if (document.visibilityState === "hidden") leave("hidden");
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("paste", onPaste, true);
    };
  }, [enabled, pasteLimitChars]);
}
