import { Crown, Plus, Trophy } from "lucide-react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { routes } from "@/config/navigation";
import { competitionService } from "@/features/competitions/services/competitionService";
import { ProblemStatement } from "@/features/questions/components/ProblemStatement";
import { useAsync } from "@/hooks/useAsync";
import type { CompetitionState } from "@/types/api";
import { formatSeconds } from "@/utils/format";
import { submissionLabels } from "@/utils/status";

const ENDINGS: Record<string, string> = {
  time_up: "Time ran out before anyone passed every test.",
  host_cancelled: "The host cancelled this room before it started.",
  everyone_left: "Everyone left before the competition started.",
  idle: "This lobby expired after waiting too long.",
};

export function ResultsView({ state, myUserId }: { state: CompetitionState; myUserId: number }) {
  const { data, error, loading, reload } = useAsync((signal) => competitionService.results(state.id, signal), [state.id, state.status]);

  const started = state.starts_at !== null && state.status !== "CANCELLED" && state.status !== "EXPIRED";
  const winner = state.winner;
  const iWon = winner?.user_id === myUserId;

  return (
    <div className="results">
      <section className={winner ? "podium podium--won" : "podium"} aria-live="polite">
        {winner ? (
          <>
            <Trophy size={40} aria-hidden className="podium__icon" />
            <p className="podium__eyebrow">{iWon ? "You won" : "Winner"}</p>
            <h1 className="podium__name">{winner.username}</h1>
            <p className="podium__detail">Solved in {formatSeconds(winner.solve_seconds)} after the start.</p>
          </>
        ) : (
          <>
            <h1 className="podium__name podium__name--plain">
              {state.status === "FINISHED" ? "No winner this round" : state.status === "EXPIRED" ? "Room expired" : "Room closed"}
            </h1>
            <p className="podium__detail">{ENDINGS[state.finish_reason ?? ""] ?? "This competition has ended."}</p>
          </>
        )}
        <ButtonLink to={routes.competitions} variant="primary" icon={<Plus size={16} aria-hidden />}>
          New room
        </ButtonLink>
      </section>

      {loading && <PageSpinner label="Loading results" />}
      {error && <ErrorMessage title="Couldn't load the results" message={error} onRetry={reload} />}
      {data && started && (
        <div className="results__grid">
          <section aria-labelledby="standings-heading">
            <h2 id="standings-heading" className="section-title">
              Standings
            </h2>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Best result</th>
                  <th scope="col">Solved after</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.user_id} className={p.is_winner ? "table__row--win" : undefined}>
                    <td>
                      <span className="table__player">
                        {p.is_winner && <Crown size={15} aria-label="Winner" />}
                        {p.username}
                        {p.user_id === myUserId && <span className="roster__you"> (you)</span>}
                      </span>
                    </td>
                    <td>{p.attempts}</td>
                    <td>
                      {p.best_status ? (
                        <StatusBadge tone={submissionLabels[p.best_status].tone}>{submissionLabels[p.best_status].label}</StatusBadge>
                      ) : (
                        <span className="muted">No submissions</span>
                      )}
                    </td>
                    <td>{p.solve_seconds !== null ? formatSeconds(p.solve_seconds) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="section-title section-title--spaced">Every submission</h2>
            {data.timeline.length === 0 ? (
              <EmptyState title="Nobody submitted">Submissions show here in the order the server received them.</EmptyState>
            ) : (
              <ol className="timeline">
                {data.timeline.map((t) => (
                  <li key={t.id} className={t.is_winning ? "timeline__item timeline__item--win" : "timeline__item"}>
                    <span className="timeline__time">{t.seconds_after_start !== null ? formatSeconds(t.seconds_after_start) : ""}</span>
                    <span className="timeline__who">{t.username}</span>
                    <StatusBadge tone={submissionLabels[t.status].tone}>{submissionLabels[t.status].label}</StatusBadge>
                    {t.total_count > 0 && (
                      <span className="timeline__tests">
                        {t.passed_count}/{t.total_count}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <p className="results__rule">{data.tie_break_rule}</p>
          </section>
          {state.question && (
            <section className="panel results__question" aria-label="The question">
              <ProblemStatement question={state.question} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
