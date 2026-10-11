import { Ban, Crown, EyeOff, Flag, PauseCircle, Snowflake } from "lucide-react";

import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { FocusStatus, Participant, SubmissionStatus, Winner } from "@/types/api";
import { cx } from "@/utils/cx";
import { submissionLabels } from "@/utils/status";

interface RaceLanesProps {
  participants: Participant[];
  attempts: Record<number, SubmissionStatus[]>;
  winner: Winner | null;
  myUserId?: number;
  /** An opponent's absence is only shown once it lasted this long (it would not count before). */
  focusGraceMs?: number;
}

/** A subtle Focus Mode marker for a lane. "Away" appears only after the grace period. */
function LaneFocus({ status, graceMs }: { status: FocusStatus; graceMs: number }) {
  const away = useDelayedFlag(status === "away", graceMs);
  if (away) {
    return (
      <span className="lane__focus" title="Left the competition tab" data-testid="lane-away">
        <EyeOff size={13} aria-hidden /> left tab
      </span>
    );
  }
  if (status === "paused" || status === "frozen") {
    const Icon = status === "paused" ? PauseCircle : Snowflake;
    return (
      <span className="lane__focus" title={`Focus Mode: ${status}`}>
        <Icon size={13} aria-hidden /> {status}
      </span>
    );
  }
  if (status === "disqualified") {
    return (
      <span className="lane__focus lane__focus--dq" title="Disqualified by Focus Mode">
        <Ban size={13} aria-hidden /> DQ
      </span>
    );
  }
  return null;
}

/**
 * One lane per player. Each attempt is a mark on the track, coloured by its
 * verdict; the winner's lane reaches the flag.
 */
export function RaceLanes({ participants, attempts, winner, myUserId, focusGraceMs = 2000 }: RaceLanesProps) {
  return (
    <ol data-lenis-prevent className="lanes" aria-label="Players">
      {participants.map((p) => {
        const seen = attempts[p.user_id] ?? [];
        // The server's count is authoritative; marks we did not witness live are shown as plain ticks.
        const unseen = Math.max(0, p.attempts - seen.length);
        const marks: Array<SubmissionStatus | "UNKNOWN"> = [...Array(unseen).fill("UNKNOWN"), ...seen];
        const won = winner?.user_id === p.user_id;
        return (
          <li key={p.user_id} className={cx("lane", won && "lane--won", !p.online && "lane--offline")}>
            <div className="lane__who">
              <span className="avatar avatar--sm" aria-hidden>
                {p.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="lane__name">
                {p.username}
                {p.user_id === myUserId && <span className="lane__you"> (you)</span>}
              </span>
              {won && <Crown size={15} aria-label="Winner" className="lane__crown" />}
              {p.user_id !== myUserId && <LaneFocus status={p.focus} graceMs={focusGraceMs} />}
              <span
                className={cx("presence", p.online ? "presence--on" : "presence--off")}
                aria-label={p.online ? "Online" : "Offline"}
                title={p.online ? "Online" : "Offline"}
              />
            </div>
            <div className="lane__track" aria-label={`${p.attempts} ${p.attempts === 1 ? "attempt" : "attempts"}`}>
              <span className="lane__rail" aria-hidden />
              {marks.slice(-12).map((status, i) => (
                <span
                  key={i}
                  className={cx(
                    "lane__mark",
                    status === "UNKNOWN" ? "lane__mark--unknown" : `lane__mark--${submissionLabels[status].tone}`,
                    status === "PENDING" && "lane__mark--pending",
                  )}
                  title={status === "UNKNOWN" ? "Earlier attempt" : submissionLabels[status].label}
                />
              ))}
              <Flag size={15} aria-hidden className="lane__flag" />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
