import { Eye, PauseCircle } from "lucide-react";

import { useFocusMode } from "@/features/focus/FocusModeProvider";
import { actionLabel } from "@/features/focus/focusText";
import { useNow } from "@/hooks/useNow";
import { cx } from "@/utils/cx";

/** A slim status line above the editor while Focus Mode is on. */
export function FocusBanner() {
  const { enabled, focus, clockOffset } = useFocusMode();
  const paused = focus?.status === "paused";
  const now = useNow(500, paused) + clockOffset;
  if (!enabled || !focus || focus.status === "disqualified" || focus.status === "frozen") return null;

  if (paused && focus.paused_until) {
    const left = Math.max(0, Math.ceil((Date.parse(focus.paused_until) - now) / 1000));
    return (
      <div className="focus-banner focus-banner--paused" role="status" data-testid="focus-banner">
        <PauseCircle size={16} aria-hidden />
        <span>
          Submissions paused by Focus Mode for <strong>{left}s</strong>. You can keep editing.
        </span>
      </div>
    );
  }
  const used = focus.counted_violations;
  return (
    <div className={cx("focus-banner", used > 0 && "focus-banner--warned")} role="status" data-testid="focus-banner">
      <Eye size={16} aria-hidden />
      <span>
        Focus Mode is on.{" "}
        {used === 0
          ? "Stay on this tab; switches under 2 seconds don't count."
          : `${used} counted. Next tab switch means ${actionLabel(focus.next_action)}.`}
      </span>
    </div>
  );
}
