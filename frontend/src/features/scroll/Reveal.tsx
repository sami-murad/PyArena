import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";

interface RevealProps {
  children: ReactNode;
  /** Element to render (default div). */
  as?: ElementType;
  /** Stagger delay in milliseconds. */
  delay?: number;
  className?: string;
}

/**
 * Fades and lifts its content in the first time it scrolls into view
 * (IntersectionObserver, no scroll listeners). Content is always in the DOM and
 * readable; without IntersectionObserver or with reduced motion it is simply shown.
 * Use on marketing pages only, never in workspaces.
 */
export function Reveal({ children, as: Tag = "div", delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => reduced || typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible || reduced) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, reduced]);

  const shown = visible || reduced;
  const style: CSSProperties | undefined = delay && !reduced ? { transitionDelay: `${delay}ms` } : undefined;
  return (
    <Tag
      ref={ref}
      className={["reveal", shown ? "is-revealed" : "", className ?? ""].filter(Boolean).join(" ")}
      style={style}
      data-testid="reveal"
    >
      {children}
    </Tag>
  );
}
