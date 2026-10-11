import { Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useCodeRunner } from "@/features/playground/hooks/useCodeRunner";

const SAMPLE = `import random

def roll(dice: int) -> list[int]:
    return [random.randint(1, 6) for _ in range(dice)]

hand = roll(5)
print("You rolled", hand)
print("Total:", sum(hand))
`;

/** A real, editable mini-runner on the landing page: it calls the same sandbox as the playground. */
export function LiveSample() {
  const [code, setCode] = useState(SAMPLE);
  const runner = useCodeRunner();
  const out = runner.result ? runner.result.stdout + runner.result.stderr : runner.error;

  return (
    <div className="live">
      <div className="live__bar">
        <span className="live__dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="live__file">dice.py</span>
        <Button
          size="sm"
          variant="primary"
          icon={<Play size={14} aria-hidden />}
          onClick={() => void runner.run(code, "")}
          loading={runner.phase === "running"}
        >
          Run
        </Button>
      </div>
      <label htmlFor="live-code" className="visually-hidden">
        Sample Python code
      </label>
      <textarea
        id="live-code"
        className="live__code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        rows={9}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void runner.run(code, "");
        }}
      />
      <output className="live__out" aria-live="polite" htmlFor="live-code">
        {runner.phase === "idle" ? (
          <span className="live__prompt">Press Run. This executes in a real sandbox.</span>
        ) : runner.phase === "running" && !runner.result ? (
          <span className="live__prompt">Running…</span>
        ) : (
          <pre className={runner.result?.status === "OK" ? undefined : "live__err"}>{out}</pre>
        )}
      </output>
    </div>
  );
}
