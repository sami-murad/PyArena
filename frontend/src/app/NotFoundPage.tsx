import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/config/navigation";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <div className="page page--narrow not-found">
      <pre className="not-found__trace" aria-hidden>
        {`Traceback (most recent call last):\n  File "router.py", line 404\nPageNotFoundError: no route matches this URL`}
      </pre>
      <h1 className="page__title">This page doesn't exist</h1>
      <p className="page__lead">The link may be old, or the address has a typo.</p>
      <ButtonLink to={routes.home} variant="primary">
        Go to the home page
      </ButtonLink>
    </div>
  );
}
