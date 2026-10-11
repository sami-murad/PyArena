import { useEffect } from "react";

import { activeMascot } from "@/config/mascots";
import { Bubble } from "@/features/mascot/Bubble";
import { Confetti } from "@/features/mascot/Confetti";
import { useMascot } from "@/features/mascot/MascotContext";
import { CONFETTI_MOODS, MOOD_LABEL } from "@/features/mascot/moods";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cx } from "@/utils/cx";

/**
 * The mascot dock (bottom right). Small while idle; it grows, speaks and shows
 * a status badge while reacting, then settles back. It only displays the mood
 * from MascotContext; it never decides one.
 */
export function Mascot() {
  const { state, visible, react } = useMascot();
  const reduced = useReducedMotion();
  useStickerPreload(visible);
  if (!visible) return null;

  const mascot = activeMascot();
  const variants = mascot.stickers[state.mood];
  const sticker = variants[state.seq % variants.length];
  const reacting = state.mood !== "idle";

  return (
    <aside
      className={cx("mascot", reacting && "mascot--reacting", reduced && "mascot--still")}
      aria-label={`${mascot.name}, the mascot`}
      data-mood={state.mood}
      data-testid="mascot"
    >
      {reacting && <Bubble text={state.line} />}
      {state.badge && reacting && (
        <span className={cx("mascot__badge", `mascot__badge--${state.badge.tone}`)} data-testid="mascot-badge">
          {state.badge.text}
        </span>
      )}
      <button
        type="button"
        className="mascot__figure"
        onClick={() => react({ mood: "happy", line: "Hi! I react to your runs and matches." })}
        title={`${mascot.name} is ${MOOD_LABEL[state.mood]}`}
      >
        <img
          key={sticker}
          src={sticker}
          alt={`${mascot.description}, ${MOOD_LABEL[state.mood]}`}
          className="mascot__sticker"
          width={120}
          height={120}
          draggable={false}
        />
      </button>
      {CONFETTI_MOODS.includes(state.mood) && state.confettiKey > 0 && <Confetti key={state.confettiKey} />}
    </aside>
  );
}

/**
 * Warms the browser cache with every sticker once the page is idle, so a mood
 * change shows its sticker instantly instead of flashing an empty frame.
 */
function useStickerPreload(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const urls = Object.values(activeMascot().stickers).flat();
    const load = () => urls.forEach((url) => (new Image().src = url));
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(load, 1500);
    return () => window.clearTimeout(id);
  }, [enabled]);
}
