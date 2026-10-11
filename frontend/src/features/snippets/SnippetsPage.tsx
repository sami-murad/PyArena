import { FileCode2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { useToast } from "@/components/feedback/Toast";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";
import { routes } from "@/config/navigation";
import { snippetService } from "@/features/snippets/services/snippetService";
import { useAsync } from "@/hooks/useAsync";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { errorMessage } from "@/services/apiClient";
import type { Snippet } from "@/types/api";
import { formatRelative } from "@/utils/format";

export default function SnippetsPage() {
  useDocumentTitle("Snippets");
  const { notify } = useToast();
  const { data, error, loading, reload, setData } = useAsync((signal) => snippetService.list(signal), []);
  const [toDelete, setToDelete] = useState<Snippet | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await snippetService.remove(toDelete.id);
      setData((data ?? []).filter((s) => s.id !== toDelete.id));
      notify(`Deleted "${toDelete.title}".`, "success");
      setToDelete(null);
    } catch (err) {
      notify(errorMessage(err), "danger");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Snippets</h1>
          <p className="page__lead">Code you saved from the playground. Open one to keep working on it.</p>
        </div>
        <ButtonLink to={routes.playground} variant="primary" icon={<Plus size={17} aria-hidden />}>
          New in playground
        </ButtonLink>
      </header>

      {loading && <PageSpinner label="Loading snippets" />}
      {error && <ErrorMessage title="Couldn't load your snippets" message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState
          icon={<FileCode2 size={28} aria-hidden />}
          title="No snippets yet"
          action={
            <ButtonLink to={routes.playground} variant="secondary">
              Open the playground
            </ButtonLink>
          }
        >
          Write something in the playground and press Save.
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ul className="snippet-grid">
          {data.map((s) => (
            <li key={s.id} className="snippet">
              <Link to={`${routes.playground}?snippet=${s.id}`} className="snippet__open">
                <h2 className="snippet__title">{s.title}</h2>
                <pre className="snippet__preview" aria-hidden>
                  {s.code.split("\n").slice(0, 6).join("\n") || " "}
                </pre>
              </Link>
              <footer className="snippet__footer">
                <span className="snippet__time">Edited {formatRelative(s.updated_at)}</span>
                <span className="snippet__actions">
                  <Link to={`${routes.playground}?snippet=${s.id}`} className="icon-btn" aria-label={`Open ${s.title}`}>
                    <Pencil size={16} aria-hidden />
                  </Link>
                  <button type="button" className="icon-btn icon-btn--danger" onClick={() => setToDelete(s)} aria-label={`Delete ${s.title}`}>
                    <Trash2 size={16} aria-hidden />
                  </button>
                </span>
              </footer>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={toDelete !== null}
        title="Delete snippet?"
        onClose={() => setToDelete(null)}
        busy={deleting}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting} data-autofocus>
              Delete snippet
            </Button>
          </>
        }
      >
        <p>
          "{toDelete?.title}" will be removed permanently. This can't be undone.
        </p>
      </Modal>
    </div>
  );
}
