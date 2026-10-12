import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { useLenis } from "@/features/scroll/SmoothScroll";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cx } from "@/utils/cx";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const lenis = useLenis();
  const reduced = useReducedMotion();

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setVisible(window.scrollY > 200);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    if (lenis) {
      lenis.scrollTo(0, { immediate: reduced });
    } else {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: reduced ? "instant" : "smooth",
      });
    }
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      className={cx("scroll-to-top", reduced && "scroll-to-top--still")}
      onClick={scrollToTop}
      aria-label="Scroll back to top"
      title="Scroll back to top"
      data-testid="scroll-to-top"
    >
      <ArrowUp size={18} aria-hidden />
      <span className="scroll-to-top__text">Top</span>
    </button>
  );
}
