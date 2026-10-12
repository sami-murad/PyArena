import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { activeMascot } from "@/config/mascots";
import { Bubble } from "@/features/mascot/Bubble";
import { Confetti } from "@/features/mascot/Confetti";
import { useMascot } from "@/features/mascot/MascotContext";
import { CONFETTI_MOODS, MOOD_LABEL } from "@/features/mascot/moods";
import { StickerBookModal } from "@/features/mascot/StickerBookModal";
import type { StickerItem } from "@/features/mascot/stickerData";
import { useSound } from "@/features/sound/useSound";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cx } from "@/utils/cx";

const FUNNY_CLICKS = [
  { mood: "happy" as const, line: "Code worked on the first try? Suspicious! 😄", badge: { text: "No bugs?!", tone: "success" as const } },
  { mood: "thinking" as const, line: "99 little bugs in the code... fix one, 127 bugs in the code. 🤔", badge: { text: "Debugging", tone: "accent" as const } },
  { mood: "celebrate" as const, line: "It works on my machine! Ship my laptop! 🎉", badge: { text: "Shipped!", tone: "success" as const }, confetti: true },
  { mood: "concerned" as const, line: "Wait, who pushed directly to main branch?! 😱", badge: { text: "Alert!", tone: "danger" as const } },
  { mood: "encouraging" as const, line: "Even senior devs Google basic syntax every single day. 💪", badge: { text: "Keep going!", tone: "warning" as const } },
  { mood: "trophy" as const, line: "Behold, the Python Algorithm Monarch! 👑", badge: { text: "Level Up", tone: "accent" as const }, confetti: true },
  { mood: "happy" as const, line: "Hot coffee + clean Python = Unlimited power! ☕", badge: { text: "Caffeinated", tone: "accent" as const } },
  { mood: "celebrate" as const, line: "Victory dance time! All green test cases! 💃", badge: { text: "Flawless", tone: "success" as const }, confetti: true },
];

export function Mascot() {
  const { state, visible, react } = useMascot();
  const { play } = useSound();
  const reduced = useReducedMotion();
  const [albumOpen, setAlbumOpen] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  useStickerPreload(visible);
  if (!visible) return null;

  const mascot = activeMascot();
  const variants = mascot.stickers[state.mood];
  const sticker = variants[state.seq % variants.length];
  const reacting = state.mood !== "idle";

  const handleMascotClick = () => {
    const nextIdx = clickCount % FUNNY_CLICKS.length;
    setClickCount((c) => c + 1);
    const item = FUNNY_CLICKS[nextIdx];
    play(item.mood === "concerned" ? "quack" : item.confetti ? "tada" : "boing");
    react(item);
  };

  const handleSelectSticker = (item: StickerItem) => {
    react({
      mood: item.mood,
      line: item.quote,
      badge: {
        text: item.badge,
        tone: item.mood === "concerned" ? "danger" : item.mood === "encouraging" ? "warning" : "success",
      },
      confetti: CONFETTI_MOODS.includes(item.mood),
    });
    setAlbumOpen(false);
  };

  return (
    <>
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
        <div className="mascot__stack">
          <button
            type="button"
            className="mascot__album-trigger"
            onClick={(e) => {
              e.stopPropagation();
              play("pop");
              setAlbumOpen(true);
            }}
            title="Browse all 28 Deb stickers"
            aria-label="Open Deb sticker album"
          >
            <Sparkles size={12} aria-hidden />
            <span>Stickers</span>
          </button>
          <button
            type="button"
            className="mascot__figure"
            onClick={handleMascotClick}
            title={`${mascot.name} is ${MOOD_LABEL[state.mood]} (Click for funny quote & pose!)`}
          >
            <img
              key={sticker}
              src={sticker}
              alt={`${mascot.description}, ${MOOD_LABEL[state.mood]}`}
              className="mascot__sticker"
              width={150}
              height={150}
              draggable={false}
            />
          </button>
        </div>
        {CONFETTI_MOODS.includes(state.mood) && state.confettiKey > 0 && <Confetti key={state.confettiKey} />}
      </aside>

      <StickerBookModal
        open={albumOpen}
        onClose={() => setAlbumOpen(false)}
        onSelectSticker={handleSelectSticker}
      />
    </>
  );
}

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
