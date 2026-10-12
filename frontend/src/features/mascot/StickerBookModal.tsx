import { Dices, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { ALL_STICKERS, type StickerItem } from "@/features/mascot/stickerData";
import { CONFETTI_MOODS, type BadgeTone, type Mood } from "@/features/mascot/moods";
import { useSound } from "@/features/sound/useSound";
import { cx } from "@/utils/cx";

interface StickerBookModalProps {
  open: boolean;
  onClose: () => void;
  onSelectSticker: (item: StickerItem) => void;
}

const CATEGORIES: { id: string; label: string; mood?: Mood }[] = [
  { id: "all", label: "All (28)" },
  { id: "idle", label: "☕ Chill", mood: "idle" },
  { id: "thinking", label: "🧠 Thinking", mood: "thinking" },
  { id: "happy", label: "😊 Happy", mood: "happy" },
  { id: "concerned", label: "😱 Concerned", mood: "concerned" },
  { id: "encouraging", label: "💪 Cheers", mood: "encouraging" },
  { id: "celebrate", label: "🎉 Celebrate", mood: "celebrate" },
  { id: "trophy", label: "🏆 Trophies", mood: "trophy" },
];

export function StickerBookModal({ open, onClose, onSelectSticker }: StickerBookModalProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { play } = useSound();

  const filtered = useMemo(() => {
    if (selectedCategory === "all") return ALL_STICKERS;
    const cat = CATEGORIES.find((c) => c.id === selectedCategory);
    if (!cat?.mood) return ALL_STICKERS;
    return ALL_STICKERS.filter((s) => s.mood === cat.mood);
  }, [selectedCategory]);

  const handleRandom = () => {
    const randomIndex = Math.floor(Math.random() * ALL_STICKERS.length);
    const chosen = ALL_STICKERS[randomIndex];
    play(chosen.sound || "pop");
    onSelectSticker(chosen);
  };

  const handlePick = (item: StickerItem) => {
    play(item.sound || "pop");
    onSelectSticker(item);
  };

  const getTone = (mood: Mood): BadgeTone => {
    if (mood === "concerned") return "danger";
    if (mood === "encouraging") return "warning";
    if (mood === "happy" || mood === "celebrate") return "success";
    return "accent";
  };

  return (
    <Modal open={open} title="Deb's Sticker Book (All 28 Stickers)" onClose={onClose}>
      <div className="sticker-book">
        <div className="sticker-book__header">
          <p className="sticker-book__intro">
            Every original Deb mascot sticker. Click any sticker to make Deb strike that pose and react!
          </p>
          <button type="button" className="sticker-book__random-btn" onClick={handleRandom}>
            <Dices size={16} aria-hidden />
            Surprise Pose
          </button>
        </div>

        <div className="sticker-book__filters" role="tablist" aria-label="Sticker categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              className={cx(
                "sticker-book__tab",
                selectedCategory === cat.id && "sticker-book__tab--active",
              )}
              onClick={() => {
                play("pop");
                setSelectedCategory(cat.id);
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="sticker-book__grid">
          {filtered.map((sticker) => {
            const tone = getTone(sticker.mood);
            const hasConfetti = CONFETTI_MOODS.includes(sticker.mood);
            return (
              <button
                key={sticker.id}
                type="button"
                className="sticker-card"
                onClick={() => handlePick(sticker)}
                title={`Pose Deb as ${sticker.name}`}
              >
                <div className="sticker-card__preview">
                  <img
                    src={sticker.file}
                    alt={sticker.name}
                    className="sticker-card__img"
                    width={96}
                    height={96}
                    loading="lazy"
                  />
                  {hasConfetti && (
                    <span className="sticker-card__sparkle" title="Has confetti!">
                      <Sparkles size={14} />
                    </span>
                  )}
                </div>
                <div className="sticker-card__info">
                  <span className="sticker-card__name">{sticker.name}</span>
                  <span className={cx("sticker-card__badge", `sticker-card__badge--${tone}`)}>
                    {sticker.badge}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
