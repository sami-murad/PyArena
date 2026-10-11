import { ArrowLeft, Play, RotateCcw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { LazyCodeEditor } from "@/components/editor/LazyCodeEditor";
import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { appConfig } from "@/config/appConfig";
import { routes } from "@/config/navigation";
import { useAuth } from "@/features/auth/AuthContext";
import { OutputConsole } from "@/features/playground/components/OutputConsole";
import { useCodeRunner } from "@/features/playground/hooks/useCodeRunner";
import { ProblemStatement } from "@/features/questions/components/ProblemStatement";
import { SubmissionResult } from "@/features/questions/components/SubmissionResult";
import { questionService } from "@/features/questions/services/questionService";
import { useAsync } from "@/hooks/useAsync";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { errorMessage } from "@/services/apiClient";
import type { Submission } from "@/types/api";
import { cx } from "@/utils/cx";

type Tab = "verdict" | "run";

export default function QuestionPage() {
  const id = Number(useParams().questionId);
  const { user } = useAuth();
  const { data: question, error, loading, reload } = useAsync((signal) => questionService.get(id, signal), [id]);
  useDocumentTitle(question?.title ?? "Question");

  const [code, setCode] = useLocalStorage(`${appConfig.storageKeys.questionDraftPrefix}${id}`, "");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("verdict");
  const runner = useCodeRunner();

  useEffect(() => {
    if (question && !code) setCode(question.starter_code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  if (loading) return <PageSpinner label="Loading question" />;
  if (error || !question)
    return (
      <div className="page">
        <ErrorMessage title="Couldn't load this question" message={error ?? "Question not found."} onRetry={reload} />
      </div>
    );

  async function submit() {
    if (!question) return;
    setTab("verdict");
    setSubmitting(true);
    setSubmitError(null);
    setSubmission({
      id: 0, question_id: question.id, competition_id: null, status: "PENDING", passed_count: 0,
      total_count: question.total_tests, feedback: null, created_at: new Date().toISOString(), judged_at: null, code,
    });
    try {
      setSubmission(await questionService.submit(question.id, code));
    } catch (err) {
      setSubmission(null);
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function tryRun() {
    setTab("run");
    // Function problems have no stdin: running shows prints and errors from module-level code.
    void runner.run(code, "");
  }

  return (
    <div className="workspace solve">
      <aside className="panel solve__problem">
        <Link to={routes.questions} className="back-link">
          <ArrowLeft size={16} aria-hidden /> All questions
        </Link>
        <ProblemStatement question={question} />
      </aside>

      <div className="solve__work">
        <div className="toolbar">
          <div className="toolbar__group">
            <span className="lang-chip">
              <span className="lang-chip__dot" aria-hidden /> Python 3
            </span>
          </div>
          <div className="toolbar__group toolbar__group--actions">
            <Button size="sm" variant="ghost" icon={<RotateCcw size={16} aria-hidden />} onClick={() => setCode(question.starter_code)}>
              Starter code
            </Button>
            <Button size="sm" variant="secondary" icon={<Play size={16} aria-hidden />} onClick={tryRun} loading={runner.phase === "running"}>
              Run
            </Button>
            {user ? (
              <Button variant="primary" icon={<Send size={16} aria-hidden />} onClick={submit} loading={submitting}>
                Submit
              </Button>
            ) : (
              <ButtonLink to={routes.login} state={{ from: routes.question(id) }} variant="primary">
                Sign in to submit
              </ButtonLink>
            )}
          </div>
        </div>
        <section className="panel solve__editor" aria-label="Editor">
          <LazyCodeEditor
            value={code}
            onChange={setCode}
            onRun={tryRun}
            path={`question-${id}.py`}
            errorLine={tab === "run" ? (runner.result?.explanation?.line ?? null) : null}
          />
        </section>
        <section className="panel solve__results">
          <div className="tabs" role="tablist" aria-label="Results">
            <button type="button" role="tab" aria-selected={tab === "verdict"} className={cx("tabs__tab", tab === "verdict" && "tabs__tab--active")} onClick={() => setTab("verdict")}>
              Verdict
            </button>
            <button type="button" role="tab" aria-selected={tab === "run"} className={cx("tabs__tab", tab === "run" && "tabs__tab--active")} onClick={() => setTab("run")}>
              Run output
            </button>
          </div>
          <div className="solve__results-body" role="tabpanel">
            {tab === "verdict" ? (
              submitError ? (
                <ErrorMessage title="Submission failed" message={submitError} />
              ) : submission ? (
                <SubmissionResult submission={submission} />
              ) : (
                <p className="console__placeholder">Submit to check your code against every test.</p>
              )
            ) : (
              <OutputConsole phase={runner.phase} result={runner.result} error={runner.error} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
