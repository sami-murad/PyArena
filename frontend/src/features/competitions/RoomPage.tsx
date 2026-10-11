import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { useToast } from "@/components/feedback/Toast";
import { ButtonLink } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { routes } from "@/config/navigation";
import { useAuth } from "@/features/auth/AuthContext";
import { Arena } from "@/features/competitions/components/Arena";
import { ConnectionBanner } from "@/features/competitions/components/ConnectionBanner";
import { CountdownOverlay } from "@/features/competitions/components/CountdownOverlay";
import { Lobby } from "@/features/competitions/components/Lobby";
import { ResultsView } from "@/features/competitions/components/ResultsView";
import { useCompetitionRoom } from "@/features/competitions/hooks/useCompetitionRoom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useNow } from "@/hooks/useNow";

export default function RoomPage() {
  const competitionId = Number(useParams().competitionId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const room = useCompetitionRoom(competitionId, user?.id);
  const { state } = room;
  const live = state?.status === "COUNTDOWN" || state?.status === "RUNNING";
  const now = useNow(250, live) + room.clockOffset;

  useDocumentTitle(state ? `Room ${state.code}` : "Competition");

  if (room.loadError && !state) {
    return (
      <div className="page">
        <ErrorMessage title="Couldn't open this competition" message={room.loadError} onRetry={room.reload}>
          <ButtonLink to={routes.competitions} variant="ghost" size="sm" icon={<ArrowLeft size={15} aria-hidden />}>
            Back to competitions
          </ButtonLink>
        </ErrorMessage>
      </div>
    );
  }
  if (!state || !user) return <PageSpinner label="Joining the room" />;

  const startsIn = state.starts_at ? (Date.parse(state.starts_at) - now) / 1000 : 0;
  const endsIn = state.ends_at ? (Date.parse(state.ends_at) - now) / 1000 : 0;

  async function leave() {
    await room.leave();
    notify("You left the room.", "info");
    navigate(routes.competitions);
  }

  let body;
  if (state.status === "WAITING") {
    body = (
      <div className="page">
        <Lobby state={state} myUserId={user.id} onReady={room.setReady} onStart={room.start} onCancel={room.cancel} onLeave={leave} />
      </div>
    );
  } else if (state.status === "COUNTDOWN" || (state.status === "RUNNING" && !state.question)) {
    body = <CountdownOverlay secondsLeft={startsIn} />;
  } else if (state.status === "RUNNING" && state.question) {
    body = (
      <Arena
        state={state}
        question={state.question}
        myUserId={user.id}
        secondsLeft={endsIn}
        attempts={room.attempts}
        mySubmission={room.mySubmission}
        activity={room.activity}
        onSubmit={room.submit}
      />
    );
  } else {
    body = (
      <div className="page">
        <ResultsView state={state} myUserId={user.id} />
      </div>
    );
  }

  return (
    <>
      <ConnectionBanner connection={room.connection} />
      {body}
    </>
  );
}
