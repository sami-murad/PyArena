import { BookOpenCheck, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { PageSpinner } from "@/components/ui/Spinner";
import { routes } from "@/config/navigation";
import { DifficultyBadge } from "@/features/questions/components/DifficultyBadge";
import { questionService } from "@/features/questions/services/questionService";
import { useAsync } from "@/hooks/useAsync";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { Difficulty } from "@/types/api";
import { cx } from "@/utils/cx";

const FILTERS: Array<{ value: Difficulty | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export default function QuestionsPage() {
  useDocumentTitle("Questions");
  const [filter, setFilter] = useState<Difficulty | "all">("all");
  const { data, error, loading, reload } = useAsync(
    (signal) => questionService.list(filter === "all" ? undefined : filter, signal),
    [filter],
  );

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Questions</h1>
          <p className="page__lead">
            Practise with the same problems used in competitions. Your code is checked against examples and hidden
            tests.
          </p>
        </div>
      </header>

      <div className="segmented" role="radiogroup" aria-label="Filter by difficulty">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            className={cx("segmented__item", filter === f.value && "segmented__item--active")}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <PageSpinner label="Loading questions" />}
      {error && <ErrorMessage title="Couldn't load questions" message={error} onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && (
        <EmptyState icon={<BookOpenCheck size={28} aria-hidden />} title="No questions here yet">
          Load the question bank with <code>python -m app.seed</code> in the backend folder.
        </EmptyState>
      )}
      {!loading && data && data.length > 0 && (
        <ol className="question-list">
          {data.map((q) => (
            <li key={q.id}>
              <Link to={routes.question(q.id)} className="question-row">
                <span className="question-row__title">{q.title}</span>
                <span className="question-row__mode">{q.mode === "function" ? "Function" : "Input and output"}</span>
                <DifficultyBadge difficulty={q.difficulty} />
                <ChevronRight size={18} aria-hidden className="question-row__chevron" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
