import { useCallback, useEffect, useRef, useState } from "react";

import { runCode } from "@/features/playground/services/executionService";
import { emitReaction } from "@/features/reactions/reactionBus";
import { errorMessage } from "@/services/apiClient";
import type { ExecuteResponse } from "@/types/api";

export type RunPhase = "idle" | "running" | "done" | "failed" | "stopped";

export interface CodeRunner {
  phase: RunPhase;
  result: ExecuteResponse | null;
  error: string | null;
  run: (code: string, stdin: string) => Promise<void>;
  /**
   * Stops waiting for the result. The sandbox still enforces its own time
   * limit on the server; this only cancels the request in the browser.
   */
  stop: () => void;
  clear: () => void;
}

export function useCodeRunner(): CodeRunner {
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (code: string, stdin: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPhase("running");
    setError(null);
    emitReaction({ type: "run:started" });
    try {
      const response = await runCode(code, stdin, current.signal);
      if (current.signal.aborted) return;
      setResult(response);
      setPhase("done");
      emitReaction({ type: "run:finished", status: response.status });
    } catch (err) {
      if (current.signal.aborted) return;
      setResult(null);
      setError(errorMessage(err));
      setPhase("failed");
      emitReaction({ type: "run:failed" });
    }
  }, []);

  const stop = useCallback(() => {
    if (controller.current) {
      controller.current.abort();
      controller.current = null;
      setPhase("stopped");
      emitReaction({ type: "run:stopped" });
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    setPhase("idle");
  }, []);

  return { phase, result, error, run, stop, clear };
}
