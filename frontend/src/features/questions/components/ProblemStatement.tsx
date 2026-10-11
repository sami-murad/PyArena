import { Clock, Cpu } from "lucide-react";

import { InlineText, RichText } from "@/components/ui/RichText";
import { DifficultyBadge } from "@/features/questions/components/DifficultyBadge";
import type { QuestionDetail } from "@/types/api";

interface ProblemStatementProps {
  question: QuestionDetail;
  /** Hidden in competitions so the title is not repeated next to the timer. */
  showTitle?: boolean;
}

export function ProblemStatement({ question, showTitle = true }: ProblemStatementProps) {
  return (
    <article className="problem">
      {showTitle && <h1 className="problem__title">{question.title}</h1>}
      <div className="problem__meta">
        <DifficultyBadge difficulty={question.difficulty} />
        <span className="problem__limit">
          <Clock size={14} aria-hidden /> {question.time_limit_seconds}s per test
        </span>
        <span className="problem__limit">
          <Cpu size={14} aria-hidden /> {question.memory_limit_mb} MB
        </span>
        <span className="problem__limit">{question.total_tests} tests</span>
      </div>

      <RichText text={question.statement} className="problem__statement" />

      {question.signature && (
        <section className="problem__section">
          <h2>Function to write</h2>
          <pre className="code-block">{question.signature}</pre>
        </section>
      )}

      {(question.input_spec || question.output_spec) && (
        <section className="problem__section">
          <h2>{question.mode === "stdio" ? "Input and output" : "Arguments and result"}</h2>
          <dl className="spec">
            {question.input_spec && (
              <>
                <dt>{question.mode === "stdio" ? "Input" : "Arguments"}</dt>
                <dd>
                  <InlineText text={question.input_spec} />
                </dd>
              </>
            )}
            {question.output_spec && (
              <>
                <dt>{question.mode === "stdio" ? "Output" : "Returns"}</dt>
                <dd>
                  <InlineText text={question.output_spec} />
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      {question.examples.length > 0 && (
        <section className="problem__section">
          <h2>Examples</h2>
          {question.examples.map((ex, i) => (
            <div key={i} className="example">
              <div className="example__io">
                <div>
                  <span className="example__label">{question.mode === "stdio" ? "Input" : "Call"}</span>
                  <pre className="code-block">{ex.input || " "}</pre>
                </div>
                <div>
                  <span className="example__label">{question.mode === "stdio" ? "Output" : "Returns"}</span>
                  <pre className="code-block">{ex.output || " "}</pre>
                </div>
              </div>
              {ex.note && <p className="example__note">{ex.note}</p>}
            </div>
          ))}
        </section>
      )}

      {question.constraints.length > 0 && (
        <section className="problem__section">
          <h2>Constraints</h2>
          <ul className="problem__constraints">
            {question.constraints.map((c) => (
              <li key={c}>
                <InlineText text={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {question.explanation && (
        <section className="problem__section problem__explanation">
          <h2>How to solve it</h2>
          <RichText text={question.explanation} />
        </section>
      )}
    </article>
  );
}
