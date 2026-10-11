import { Lightbulb } from "lucide-react";

import { features } from "@/config/features";
import type { Explanation } from "@/types/api";

export function ErrorExplanation({ explanation }: { explanation: Explanation }) {
  if (!features.errorExplanations) return null;
  return (
    <section className="explain" aria-label="What this error means">
      <h3 className="explain__title">
        <Lightbulb size={17} aria-hidden />
        {explanation.title}
        {explanation.line ? <span className="explain__line">Line {explanation.line}</span> : null}
      </h3>
      <p className="explain__summary">{explanation.summary}</p>
      {explanation.tips.length > 0 && (
        <ul className="explain__tips">
          {explanation.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
