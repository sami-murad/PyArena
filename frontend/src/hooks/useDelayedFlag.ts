import { useEffect, useState } from "react";

/** True only after `value` has stayed true for `delayMs`; false immediately when it turns false. */
export function useDelayedFlag(value: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!value) return;
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => {
      window.clearTimeout(id);
      setShown(false);
    };
  }, [value, delayMs]);
  return value && shown;
}
