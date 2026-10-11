import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { ButtonLink } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { routes } from "@/config/navigation";
import { competitionService } from "@/features/competitions/services/competitionService";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { errorMessage } from "@/services/apiClient";

/** Invite links land here: /join/<code>. */
export default function JoinPage() {
  useDocumentTitle("Join room");
  const code = useParams().code ?? "";
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    competitionService
      .join(code)
      .then((room) => navigate(routes.competition(room.id), { replace: true }))
      .catch((err) => setError(errorMessage(err)));
  }, [code, navigate]);

  if (!error) return <PageSpinner label={`Joining room ${code}`} />;
  return (
    <div className="page page--narrow">
      <ErrorMessage title="Couldn't join this room" message={error}>
        <ButtonLink to={routes.competitions} variant="ghost" size="sm" icon={<ArrowLeft size={15} aria-hidden />}>
          Back to competitions
        </ButtonLink>
      </ErrorMessage>
    </div>
  );
}
