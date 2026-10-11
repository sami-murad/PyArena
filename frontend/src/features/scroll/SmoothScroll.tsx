import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";

// The active Lenis instance lives outside React (it drives the document's
// scroll position), so components read it through a tiny external store.
let current: Lenis | null = null;
const listeners = new Set<() => void>();

function setCurrent(next: Lenis | null): void {
  current = next;
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active Lenis instance, or null when smooth scrolling is off on this page. */
export function useLenis(): Lenis | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

interface SmoothScrollProps {
  /** Only marketing pages enable it (see scrollRoutes.ts). */
  enabled: boolean;
  children: ReactNode;
}

/**
 * Lenis smooth scrolling for the whole page, on marketing pages only.
 *
 * - Off when the user prefers reduced motion: native scrolling is used.
 * - Inner scrollers (editor, output console, problem statement, results, player
 *   lists) carry `data-lenis-prevent`, so the wheel scrolls them, not the page.
 * - Lenis drives the native document scroll position, so anchors, find-in-page,
 *   keyboard scrolling and screen readers keep working.
 */
export function SmoothScroll({ enabled, children }: SmoothScrollProps) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!enabled || reduced) return undefined;
    const instance = new Lenis({ autoRaf: true, lerp: 0.12, smoothWheel: true, anchors: true });
    setCurrent(instance);
    return () => {
      instance.destroy();
      setCurrent(null);
    };
  }, [enabled, reduced]);

  return <>{children}</>;
}
