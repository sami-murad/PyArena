import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

import { useLenis } from "@/features/scroll/SmoothScroll";

/**
 * Scrolls to the top when the route changes, like a full page load would.
 * Back/forward navigation keeps the browser's restored position, and links to
 * an anchor (#section) are left to the browser.
 */
export function ScrollReset() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const lenis = useLenis();

  useEffect(() => {
    if (hash || navigationType === "POP") return;
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType, lenis]);

  return null;
}
