import { Timer } from "lucide-react";

import { cx } from "@/utils/cx";
import { formatClock } from "@/utils/format";

export function MatchTimer({ secondsLeft, totalSeconds }: { secondsLeft: number; totalSeconds: number }) {
  const urgent = secondsLeft <= 60;
  const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  return (
    <div className={cx("match-timer", urgent && "match-timer--urgent")} role="timer" aria-label="Time remaining">
      <Timer size={18} aria-hidden />
      <span className="match-timer__value">{formatClock(secondsLeft)}</span>
      <span className="match-timer__bar" aria-hidden>
        <span style={{ inlineSize: `${fraction * 100}%` }} />
      </span>
    </div>
  );
}
