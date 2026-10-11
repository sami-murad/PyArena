import { ChevronRight, Crown, DoorOpen, Plus, Swords } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { routes } from "@/config/navigation";
import { competitionService, type CreateCompetitionInput } from "@/features/competitions/services/competitionService";
import { useAsync } from "@/hooks/useAsync";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { errorMessage } from "@/services/apiClient";
import { formatRelative } from "@/utils/format";
import { capitalize, competitionLabels } from "@/utils/status";
import { cx } from "@/utils/cx";

const DIFFICULTIES: Array<CreateCompetitionInput["difficulty"]> = ["any", "easy", "medium", "hard"];
const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;

export default function CompetitionsPage() {
  useDocumentTitle("Competitions");
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateCompetitionInput>({ difficulty: "any", max_players: 4, duration_minutes: 15 });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const mine = useAsync((signal) => competitionService.mine(signal), []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const room = await competitionService.create(form);
      navigate(routes.competition(room.id));
    } catch (err) {
      setCreateError(errorMessage(err));
      setCreating(false);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    const clean = code.replace(/[\s-]/g, "").toUpperCase();
    if (!CODE_PATTERN.test(clean)) {
      setJoinError("Room codes are 8 characters, like 7KQ2 MXRA.");
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const room = await competitionService.join(clean);
      navigate(routes.competition(room.id));
    } catch (err) {
      setJoinError(errorMessage(err));
      setJoining(false);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Competitions</h1>
          <p className="page__lead">Open a private room, share the code, and race your friends to the first correct solution.</p>
        </div>
      </header>

      <div className="split">
        <form className="panel form-panel" onSubmit={create} aria-labelledby="create-heading">
          <h2 id="create-heading" className="form-panel__title">
            <Swords size={20} aria-hidden /> Open a room
          </h2>
          <fieldset className="field">
            <legend className="field__label">Difficulty</legend>
            <div className="segmented" role="radiogroup">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={form.difficulty === d}
                  className={cx("segmented__item", form.difficulty === d && "segmented__item--active")}
                  onClick={() => setForm((f) => ({ ...f, difficulty: d }))}
                >
                  {d === "any" ? "Any" : capitalize(d)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <Select
              label="Players"
              value={String(form.max_players)}
              onChange={(e) => setForm((f) => ({ ...f, max_players: Number(e.target.value) }))}
              options={[2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: `Up to ${n}` }))}
            />
            <Select
              label="Time limit"
              value={String(form.duration_minutes)}
              onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))}
              options={[5, 10, 15, 20, 30, 45].map((n) => ({ value: String(n), label: `${n} minutes` }))}
            />
          </div>
          {createError && <p className="form-error" role="alert">{createError}</p>}
          <Button type="submit" variant="primary" icon={<Plus size={17} aria-hidden />} loading={creating} block>
            Open room
          </Button>
        </form>

        <form className="panel form-panel" onSubmit={join} aria-labelledby="join-heading">
          <h2 id="join-heading" className="form-panel__title">
            <DoorOpen size={20} aria-hidden /> Join with a code
          </h2>
          <Input
            label="Room code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="7KQ2MXRA"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            className="field--code"
            error={joinError}
            hint="Ask the host for the 8-character code, or open their invite link."
          />
          <Button type="submit" variant="secondary" loading={joining} block>
            Join room
          </Button>
        </form>
      </div>

      <section className="section" aria-labelledby="mine-heading">
        <h2 id="mine-heading" className="section-title">
          Your rooms
        </h2>
        {mine.loading && <Spinner label="Loading your rooms" />}
        {mine.error && <ErrorMessage title="Couldn't load your rooms" message={mine.error} onRetry={mine.reload} />}
        {mine.data && mine.data.length === 0 && (
          <EmptyState title="No rooms yet">Rooms you open or join are listed here, with their results.</EmptyState>
        )}
        {mine.data && mine.data.length > 0 && (
          <ul className="room-list">
            {mine.data.map((r) => (
              <li key={r.id}>
                <Link to={routes.competition(r.id)} className="room-row">
                  <span className="room-row__code">{r.code}</span>
                  <StatusBadge tone={competitionLabels[r.status].tone}>{competitionLabels[r.status].label}</StatusBadge>
                  <span className="room-row__meta">
                    {capitalize(r.difficulty ?? "any")}, {r.player_count} {r.player_count === 1 ? "player" : "players"}
                  </span>
                  {r.won && (
                    <StatusBadge tone="success" icon={<Crown size={13} aria-hidden />}>
                      You won
                    </StatusBadge>
                  )}
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
