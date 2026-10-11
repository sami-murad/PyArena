import { Check, Crown, DoorOpen, Hourglass, Play, XCircle } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/feedback/StatusBadge";
import { useToast } from "@/components/feedback/Toast";
import { Button } from "@/components/ui/Button";
import { InviteCard } from "@/features/competitions/components/InviteCard";
import { errorMessage } from "@/services/apiClient";
import type { CompetitionState } from "@/types/api";
import { capitalize } from "@/utils/status";
import { cx } from "@/utils/cx";

interface LobbyProps {
  state: CompetitionState;
  myUserId: number;
  onReady: (ready: boolean) => Promise<void>;
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
  onLeave: () => Promise<void>;
}

export function Lobby({ state, myUserId, onReady, onStart, onCancel, onLeave }: LobbyProps) {
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const isHost = state.host_id === myUserId;
  const me = state.participants.find((p) => p.user_id === myUserId);
  const seatsLeft = state.max_players - state.participants.length;

  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try {
      await fn();
    } catch (err) {
      notify(errorMessage(err), "danger");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="lobby">
      <div className="lobby__main">
        <header className="lobby__header">
          <h1 className="page__title">Lobby</h1>
          <p className="page__lead">
            {capitalize(state.difficulty ?? "any")} difficulty, {Math.round(state.duration_seconds / 60)} minutes. The
            first correct solution wins.
          </p>
        </header>

        <section className="lobby__players" aria-labelledby="players-heading">
          <h2 id="players-heading" className="section-title">
            Players <span className="section-title__count">{state.participants.length} of {state.max_players}</span>
          </h2>
          <ul className="roster">
            {state.participants.map((p) => (
              <li key={p.user_id} className={cx("roster__item", !p.online && "roster__item--offline")}>
                <span className="avatar" aria-hidden>
                  {p.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="roster__name">
                  {p.username}
                  {p.user_id === myUserId && <span className="roster__you"> (you)</span>}
                </span>
                {p.is_host && (
                  <StatusBadge tone="primary" icon={<Crown size={13} aria-hidden />}>
                    Host
                  </StatusBadge>
                )}
                {!p.is_host &&
                  (p.is_ready ? (
                    <StatusBadge tone="success" icon={<Check size={13} aria-hidden />}>
                      Ready
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral" icon={<Hourglass size={13} aria-hidden />}>
                      Not ready
                    </StatusBadge>
                  ))}
                <span className={cx("presence", p.online ? "presence--on" : "presence--off")} title={p.online ? "Online" : "Offline"} aria-label={p.online ? "Online" : "Offline"} />
              </li>
            ))}
            {Array.from({ length: Math.max(0, Math.min(seatsLeft, 3)) }, (_, i) => (
              <li key={`empty-${i}`} className="roster__item roster__item--empty">
                Open seat
              </li>
            ))}
          </ul>
        </section>

        <div className="lobby__actions">
          {isHost ? (
            <>
              <Button
                variant="primary"
                size="lg"
                icon={<Play size={18} aria-hidden />}
                disabled={!state.can_start}
                loading={busy === "start"}
                onClick={() => act("start", onStart)}
              >
                Start competition
              </Button>
              <Button variant="ghost" icon={<XCircle size={16} aria-hidden />} loading={busy === "cancel"} onClick={() => act("cancel", onCancel)}>
                Cancel room
              </Button>
            </>
          ) : (
            <Button
              variant={me?.is_ready ? "secondary" : "primary"}
              size="lg"
              icon={<Check size={18} aria-hidden />}
              loading={busy === "ready"}
              onClick={() => act("ready", () => onReady(!me?.is_ready))}
              aria-pressed={me?.is_ready ?? false}
            >
              {me?.is_ready ? "Ready. Click to undo" : "I'm ready"}
            </Button>
          )}
          <Button variant="ghost" icon={<DoorOpen size={16} aria-hidden />} loading={busy === "leave"} onClick={() => act("leave", onLeave)}>
            Leave room
          </Button>
        </div>
        {isHost && state.start_blockers.length > 0 && (
          <p className="lobby__blocker" role="status">
            {state.start_blockers[0]}
          </p>
        )}
        {!isHost && <p className="lobby__blocker">The host starts the competition once everyone is ready.</p>}
      </div>
      <aside className="lobby__side">
        <InviteCard code={state.code} />
        <div className="rules">
          <h2 className="section-title">How it works</h2>
          <ol className="rules__list">
            <li>Everyone gets the same question at the same moment.</li>
            <li>Submit as often as you like. Each submission is judged on hidden tests.</li>
            <li>The first submission the server receives that passes every test wins.</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
