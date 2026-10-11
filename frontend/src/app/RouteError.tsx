import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/config/navigation";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/** A lazily loaded page chunk that no longer exists (usually: a new version was deployed). */
function isStaleChunk(error: unknown): boolean {
  return error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
}

/**
 * The error boundary for each route. A crash in one page shows this inside the
 * normal layout, so the header and navigation keep working.
 */
export function RouteError() {
  const error = useRouteError();
  useDocumentTitle("Something went wrong");

  let message = "This page hit an unexpected error. Reloading usually fixes it.";
  if (isRouteErrorResponse(error)) message = `${error.status} ${error.statusText}`.trim();
  else if (isStaleChunk(error)) message = "PyArena was updated while this tab was open. Reload to get the new version.";

  return (
    <div className="page page--narrow" data-testid="route-error">
      <ErrorMessage title="Something went wrong" message={message} onRetry={() => window.location.reload()}>
        <ButtonLink to={routes.home} variant="ghost" size="sm">
          Go to the home page
        </ButtonLink>
      </ErrorMessage>
      {import.meta.env.DEV && error instanceof Error && <pre className="code-block route-error__detail">{error.stack ?? error.message}</pre>}
    </div>
  );
}
