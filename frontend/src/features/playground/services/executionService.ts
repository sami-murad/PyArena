import { appConfig } from "@/config/appConfig";
import { api, ApiError, newIdempotencyKey } from "@/services/apiClient";
import type { ExecuteResponse } from "@/types/api";

/** Client-side shape/size checks. The backend validates again; this only saves a round trip. */
export function validateRun(code: string, stdin: string): string | null {
  if (!code.trim()) return "Write some code before running it.";
  if (code.length > appConfig.maxCodeChars) return `Code is limited to ${appConfig.maxCodeChars.toLocaleString()} characters.`;
  if (stdin.length > appConfig.maxStdinChars) return `Input is limited to ${appConfig.maxStdinChars.toLocaleString()} characters.`;
  return null;
}

export async function runCode(code: string, stdin: string, signal?: AbortSignal): Promise<ExecuteResponse> {
  const problem = validateRun(code, stdin);
  if (problem) throw new ApiError(422, problem);
  return api.post<ExecuteResponse>("/execute", { code, stdin }, { signal, idempotencyKey: newIdempotencyKey() });
}
