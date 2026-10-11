import { useEffect, useRef } from "react";

/**
 * Calls `beat` every `seconds` while enabled, once immediately. The server
 * records a long gap between beats during a running round (the client stopped
 * reporting), see app/services/focus.py.
 */
export function useFocusHeartbeat(enabled: boolean, seconds: number, beat: () => void): void {
  const fn = useRef(beat);
  useEffect(() => {
    fn.current = beat;
  });

  useEffect(() => {
    if (!enabled) return;
    fn.current();
    const id = window.setInterval(() => fn.current(), Math.max(2, seconds) * 1000);
    return () => window.clearInterval(id);
  }, [enabled, seconds]);
}
