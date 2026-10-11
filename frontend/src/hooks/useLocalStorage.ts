import { useCallback, useState } from "react";

function read(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** A string kept in localStorage. Failures (private mode, quota) fall back to memory. */
export function useLocalStorage(key: string, fallback: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => read(key, fallback));
  const update = useCallback(
    (next: string) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* storage unavailable: keep the in-memory value */
      }
    },
    [key],
  );
  return [value, update];
}
