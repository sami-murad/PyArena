import { appConfig } from "@/config/appConfig";
import { websitesInfo } from "@/config/websitesInfo";

/** An API failure with a message that is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

function messageFrom(status: number, payload: unknown): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      // FastAPI validation errors: [{loc: [...], msg: "..."}]
      const first = detail[0] as { loc?: unknown[]; msg?: string };
      const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : "";
      return field ? `${field}: ${first.msg ?? "invalid value"}` : (first.msg ?? "The request was not valid.");
    }
  }
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server had a problem handling this request. Please try again.";
  return `Request failed (${status}).`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), appConfig.requestTimeoutMs);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  let response: Response;
  try {
    response = await fetch(`${appConfig.apiBaseUrl}/api${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    });
  } catch {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (timeout.signal.aborted) throw new ApiError(0, "The request took too long. Please try again.");
    throw new ApiError(0, `Can't reach the ${websitesInfo.name} server. Check that the backend is running.`, "network");
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "code" in payload ? String((payload as { code: unknown }).code) : null;
    throw new ApiError(response.status, messageFrom(response.status, payload), code);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: "POST", body: body ?? {}, signal }),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
