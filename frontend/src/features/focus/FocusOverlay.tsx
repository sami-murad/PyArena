import { Ban, Snowflake } from "lucide-react";

import { useFocusMode } from "@/features/focus/FocusModeProvider";
import { useNow } from "@/hooks/useNow";

/**
 * Covers the editor while it is frozen or after disqualification. The server
 * enforces both (submissions are refused); this only explains what happened.
 */
export function FocusOverlay() {
  const { focus, locked, clockOffset } = useFocusMode();
  const frozen = focus?.status === "frozen";
  const now = useNow(500, frozen) + clockOffset;
  if (!focus || !locked) return null;

  if (focus.status === "disqualified") {
    return (
      <div className="focus-overlay focus-overlay--dq" role="alert" data-testid="focus-overlay">
        <Ban size={28} aria-hidden />
        <p className="focus-overlay__title">Disqualified by Focus Mode</p>
        <p className="focus-overlay__text">
          You left the competition tab too many times. You can still follow the race until it ends.
        </p>
      </div>
    );
  }
  const left = focus.frozen_until ? Math.max(0, Math.ceil((Date.parse(focus.frozen_until) - now) / 1000)) : 0;
  return (
    <div className="focus-overlay" role="alert" data-testid="focus-overlay">
      <Snowflake size={28} aria-hidden />
      <p className="focus-overlay__title">Frozen for {left}s</p>
      <p className="focus-overlay__text">
        Focus Mode froze your editor after another tab switch. It unlocks by itself; stay on this tab.
      </p>
    </div>
  );
}
