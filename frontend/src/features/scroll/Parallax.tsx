import { useEffect, useRef, type ReactNode } from "react";

import { MAX_PARALLAX_PER_PAGE } from "@/features/scroll/scrollRoutes";
import { useReducedMotion } from "@/hooks/useReducedMotion";

let mounted = 0;

/** Test helper: how many parallax layers are currently moving. */
export function activeParallaxCount(): number {
  return mounted;
}

interface ParallaxProps {
  children: ReactNode;
  /** Fraction of the scroll distance to move by; positive moves slower than the page. */
  speed?: number;
  className?: string;
}

/**
 * Gentle vertical parallax for hero decorations. At most MAX_PARALLAX_PER_PAGE
 * layers move at once; extra layers render still (and warn in development).
 * Off with reduced motion. Decorative only: wrap nothing a user must read or click.
 */
export function Parallax({ children, speed = 0.15, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (reduced || !node) return undefined;
    if (mounted >= MAX_PARALLAX_PER_PAGE) {
      if (import.meta.env.DEV) {
        console.warn(`Parallax: more than ${MAX_PARALLAX_PER_PAGE} layers on one page; extra layers stay still.`);
      }
      return undefined;
    }
    mounted += 1;
    node.dataset.parallax = "on";
    let frame = 0;
    const update = () => {
      frame = 0;
      node.style.transform = `translate3d(0, ${(window.scrollY * speed).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      mounted -= 1;
      node.dataset.parallax = "off";
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      node.style.transform = "";
    };
  }, [reduced, speed]);

  return (
    <div ref={ref} className={className} aria-hidden="true" data-parallax="off">
      {children}
    </div>
  );
}
