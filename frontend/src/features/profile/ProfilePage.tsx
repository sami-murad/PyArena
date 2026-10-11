import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { routes } from "@/config/navigation";
import { useAuth } from "@/features/auth/AuthContext";
import { competitionService } from "@/features/competitions/services/competitionService";
import { profileService } from "@/features/profile/services/profileService";
import { useAsync } from "@/hooks/useAsync";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { formatDate, formatRelative } from "@/utils/format";
import { competitionLabels } from "@/utils/status";

export default function ProfilePage() {
  useDocumentTitle("Profile");
  const { user } = useAuth();
  const stats = useAsync((signal) => profileService.statistics(signal), []);
  const rooms = useAsync((signal) => competitionService.mine(signal), []);

  if (!user) return null;
  const s = stats.data;

  return (
    <div className="page">
      <header className="profile-head">
        <span className="avatar avatar--xl" aria-hidden>
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="page__title">{user.username}</h1>
          <p className="page__lead">Member since {formatDate(user.created_at)}</p>
        </div>
      </header>

      {stats.loading && <PageSpinner label="Loading statistics" />}
      {stats.error && <ErrorMessage title="Couldn't load your statistics" message={stats.error} onRetry={stats.reload} />}
      {s && (
        <dl className="stats">
          <div className="stats__item">
            <dt>Competitions won</dt>
            <dd>
              {s.competitions_won}
              <span className="stats__of"> of {s.competitions_played}</span>
            </dd>
          </div>
          <div className="stats__item">
            <dt>Questions solved</dt>
            <dd>{s.questions_solved}</dd>
          </div>
          <div className="stats__item">
            <dt>Submissions</dt>
            <dd>{s.submissions_total}</dd>
          </div>
          <div className="stats__item">
            <dt>Accepted</dt>
            <dd>
              {Math.round(s.acceptance_rate * 100)}
              <span className="stats__of">%</span>
            </dd>
          </div>
        </dl>
      )}

      <section className="section" aria-labelledby="history-heading">
        <h2 id="history-heading" className="section-title">
          Recent competitions
        </h2>
        {rooms.data && rooms.data.length === 0 && (
          <EmptyState title="No competitions yet" action={<ButtonLink to={routes.competitions} variant="secondary">Open a room</ButtonLink>}>
            Your matches and results appear here.
          </EmptyState>
        )}
        {rooms.data && rooms.data.length > 0 && (
          <ul className="room-list">
            {rooms.data.map((r) => (
              <li key={r.id}>
                <Link to={routes.competition(r.id)} className="room-row">
                  <span className="room-row__code">{r.code}</span>
                  <StatusBadge tone={competitionLabels[r.status].tone}>{competitionLabels[r.status].label}</StatusBadge>
                  {r.won && <StatusBadge tone="success">Won</StatusBadge>}
                  <span className="room-row__time">{formatRelative(r.created_at)}</span>
                  <ChevronRight size={18} aria-hidden className="room-row__chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
