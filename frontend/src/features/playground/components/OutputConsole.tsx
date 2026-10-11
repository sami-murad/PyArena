import { CircleSlash, TerminalSquare, WifiOff } from "lucide-react";

import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorExplanation } from "@/features/playground/components/ErrorExplanation";
import type { RunPhase } from "@/features/playground/hooks/useCodeRunner";
import type { ExecuteResponse } from "@/types/api";
import { formatDuration } from "@/utils/format";
import { executionLabels, killReasonLabels } from "@/utils/status";

interface OutputConsoleProps {
  phase: RunPhase;
  result: ExecuteResponse | null;
  error: string | null;
}

export function OutputConsole({ phase, result, error }: OutputConsoleProps) {
  return (
    <section className="panel console" aria-label="Output">
      <header className="panel__header">
        <h2 className="panel__title">
          <TerminalSquare size={16} aria-hidden /> Output
        </h2>
        <div className="console__meta" aria-live="polite">
          {phase === "running" && (
            <StatusBadge tone="accent" icon={<Spinner size="sm" label="" />}>
              Running
            </StatusBadge>
          )}
          {phase === "stopped" && <StatusBadge tone="neutral">Stopped</StatusBadge>}
          {phase === "done" && result && (
            <>
              <StatusBadge tone={executionLabels[result.status].tone}>{executionLabels[result.status].label}</StatusBadge>
              <span className="console__time">{formatDuration(result.duration_ms)}</span>
            </>
          )}
        </div>
      </header>
      <div className="console__body" tabIndex={0} aria-label="Program output">
        {phase === "idle" && (
          <p className="console__placeholder">
            Output appears here. Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to run.
          </p>
        )}
        {phase === "running" && !result && <p className="console__placeholder">Running in the sandbox…</p>}
        {phase === "stopped" && (
          <p className="console__placeholder">
            <CircleSlash size={16} aria-hidden /> Stopped waiting for this run. The sandbox ends it at the time limit.
          </p>
        )}
        {phase === "failed" && error && (
          <div className="console__failure" role="alert">
            <WifiOff size={18} aria-hidden />
            <p>{error}</p>
          </div>
        )}
        {result && phase !== "failed" && phase !== "stopped" && (
          <>
            {result.stdout && <pre className="console__stdout">{result.stdout}</pre>}
            {result.stderr && <pre className="console__stderr">{result.stderr}</pre>}
            {!result.stdout && !result.stderr && result.status === "OK" && (
              <p className="console__placeholder">The program finished without printing anything.</p>
            )}
            {/* Raw stdout and stderr are always shown first; this only adds why the run stopped. */}
            {result.kill_reason && (
              <p className="console__note" data-kill-reason={result.kill_reason}>
                {killReasonLabels[result.kill_reason]}
              </p>
            )}
            {result.truncated && !result.kill_reason && (
              <p className="console__note">Output was cut off at the size limit.</p>
            )}
            {result.explanation && <ErrorExplanation explanation={result.explanation} />}
          </>
        )}
      </div>
    </section>
  );
}
