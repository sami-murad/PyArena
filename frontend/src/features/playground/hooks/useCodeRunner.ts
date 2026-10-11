import { useCallback, useEffect, useRef, useState } from "react";

import { runCode } from "@/features/playground/services/executionService";
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
    try {
      const response = await runCode(code, stdin, current.signal);
      if (current.signal.aborted) return;
      setResult(response);
      setPhase("done");
    } catch (err) {
      if (current.signal.aborted) return;
      setResult(null);
      setError(errorMessage(err));
      setPhase("failed");
    }
  }, []);

  const stop = useCallback(() => {
    if (controller.current) {
      controller.current.abort();
      controller.current = null;
      setPhase("stopped");
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    setPhase("idle");
  }, []);

  return { phase, result, error, run, stop, clear };
}
