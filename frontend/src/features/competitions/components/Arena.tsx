import { Play, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { LazyCodeEditor } from "@/components/editor/LazyCodeEditor";
import { useToast } from "@/components/feedback/Toast";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { appConfig } from "@/config/appConfig";
import { MatchTimer } from "@/features/competitions/components/MatchTimer";
import { RaceLanes } from "@/features/competitions/components/RaceLanes";
import type { ActivityItem } from "@/features/competitions/hooks/useCompetitionRoom";
import { OutputConsole } from "@/features/playground/components/OutputConsole";
import { useCodeRunner } from "@/features/playground/hooks/useCodeRunner";
import { ProblemStatement } from "@/features/questions/components/ProblemStatement";
import { SubmissionResult } from "@/features/questions/components/SubmissionResult";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { errorMessage } from "@/services/apiClient";
import type { CompetitionState, QuestionDetail, Submission, SubmissionStatus } from "@/types/api";
import { cx } from "@/utils/cx";

interface ArenaProps {
  state: CompetitionState;
  question: QuestionDetail;
  myUserId: number;
  secondsLeft: number;
  attempts: Record<number, SubmissionStatus[]>;
  mySubmission: Submission | null;
  activity: ActivityItem[];
  onSubmit: (code: string) => Promise<void>;
}

export function Arena({ state, question, myUserId, secondsLeft, attempts, mySubmission, activity, onSubmit }: ArenaProps) {
  const { notify } = useToast();
  const [code, setCode] = useLocalStorage(`${appConfig.storageKeys.competitionDraftPrefix}${state.id}`, "");
  const [submitting, setSubmitting] = useState(false);
  const [stdin, setStdin] = useState("");
  const [panel, setPanel] = useState<"verdict" | "run">("verdict");
  const runner = useCodeRunner();
  const me = state.participants.find((p) => p.user_id === myUserId);
  const judging = mySubmission?.status === "PENDING" || me?.has_pending;

  useEffect(() => {
    if (!code) setCode(question.starter_code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  async function submit() {
    setPanel("verdict");
    setSubmitting(true);
    try {
      await onSubmit(code);
    } catch (err) {
      notify(errorMessage(err), "danger");
    } finally {
      setSubmitting(false);
    }
  }

  function run() {
    setPanel("run");
    void runner.run(code, stdin);
  }

  return (
    <div className="arena">
      <aside className="panel arena__problem">
        <h1 className="problem__title">{question.title}</h1>
        <ProblemStatement question={question} showTitle={false} />
      </aside>

      <section className="arena__work">
        <div className="toolbar">
          <div className="toolbar__group">
            <span className="lang-chip">
              <span className="lang-chip__dot" aria-hidden /> Python 3
            </span>
          </div>
          <div className="toolbar__group toolbar__group--actions">
            <Button size="sm" variant="secondary" icon={<Play size={16} aria-hidden />} onClick={run} loading={runner.phase === "running"}>
              Run
            </Button>
            <Button variant="primary" icon={<Send size={16} aria-hidden />} onClick={submit} loading={submitting || judging} disabled={secondsLeft <= 0}>
              {judging ? "Judging" : "Submit"}
            </Button>
          </div>
        </div>
        <div className="panel arena__editor">
          <LazyCodeEditor value={code} onChange={setCode} onRun={run} path={`competition-${state.id}.py`} />
        </div>
        <div className="panel arena__results">
          <div className="tabs" role="tablist" aria-label="Results">
            <button type="button" role="tab" aria-selected={panel === "verdict"} className={cx("tabs__tab", panel === "verdict" && "tabs__tab--active")} onClick={() => setPanel("verdict")}>
              Verdict
            </button>
            <button type="button" role="tab" aria-selected={panel === "run"} className={cx("tabs__tab", panel === "run" && "tabs__tab--active")} onClick={() => setPanel("run")}>
              Run output
            </button>
          </div>
          <div className="arena__results-body" role="tabpanel">
            {panel === "verdict" ? (
              mySubmission ? (
                <SubmissionResult submission={mySubmission} />
              ) : (
                <p className="console__placeholder">Submit when your solution passes the examples. Wrong answers cost nothing but time.</p>
              )
            ) : (
              <div className="arena__run">
                <Textarea label="Input for Run" value={stdin} onChange={(e) => setStdin(e.target.value)} rows={2} spellCheck={false} />
                <OutputConsole phase={runner.phase} result={runner.result} error={runner.error} />
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="arena__rail">
        <MatchTimer secondsLeft={secondsLeft} totalSeconds={state.duration_seconds} />
        <section aria-labelledby="race-heading">
          <h2 id="race-heading" className="section-title">
            Race
          </h2>
          <RaceLanes participants={state.participants} attempts={attempts} winner={state.winner} myUserId={myUserId} />
        </section>
        <section aria-labelledby="feed-heading" className="feed">
          <h2 id="feed-heading" className="section-title">
            Activity
          </h2>
          {activity.length === 0 ? (
            <p className="feed__empty">Submissions from every player show up here.</p>
          ) : (
            <ol className="feed__list" aria-live="polite">
              {activity.map((a) => (
                <li key={a.id} className={`feed__item feed__item--${a.tone}`}>
                  {a.text}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
