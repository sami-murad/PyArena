import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import type { Submission } from "@/types/api";
import { submissionLabels } from "@/utils/status";

/** Verdict for one submission. Hidden-test details are never sent by the server. */
export function SubmissionResult({ submission }: { submission: Submission }) {
  const { label, tone } = submissionLabels[submission.status];
  const fb = submission.feedback ?? {};
  const pending = submission.status === "PENDING";
  const total = submission.total_count;
  return (
    <section className={`verdict verdict--${tone}`} aria-live="polite">
      <header className="verdict__header">
        <StatusBadge tone={tone} icon={pending ? <Spinner size="sm" label="" /> : undefined}>
          {label}
        </StatusBadge>
        {!pending && total > 0 && (
          <span className="verdict__count">
            {submission.passed_count} of {total} tests passed
          </span>
        )}
      </header>
      {total > 0 && !pending && (
        <div
          className="verdict__meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={submission.passed_count}
          aria-label="Tests passed"
        >
          <span style={{ inlineSize: `${(submission.passed_count / total) * 100}%` }} />
        </div>
      )}
      {fb.message && <p className="verdict__message">{fb.message}</p>}
      {fb.is_public && (fb.input || fb.expected) && (
        <dl className="verdict__details">
          {fb.input !== undefined && (
            <>
              <dt>Input</dt>
              <dd>
                <pre className="code-block">{fb.input || " "}</pre>
              </dd>
            </>
          )}
          {fb.expected !== undefined && (
            <>
              <dt>Expected</dt>
              <dd>
                <pre className="code-block">{fb.expected || " "}</pre>
              </dd>
            </>
          )}
          {fb.actual !== undefined && (
            <>
              <dt>Your result</dt>
              <dd>
                <pre className="code-block">{fb.actual || " "}</pre>
              </dd>
            </>
          )}
          {fb.stderr && (
            <>
              <dt>Error</dt>
              <dd>
                <pre className="code-block code-block--danger">{fb.stderr}</pre>
              </dd>
            </>
          )}
          {fb.stdout && (
            <>
              <dt>Printed</dt>
              <dd>
                <pre className="code-block">{fb.stdout}</pre>
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
