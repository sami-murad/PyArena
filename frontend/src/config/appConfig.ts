/**
 * Public, environment-dependent application settings.
 *
 * Values come from VITE_* variables (see frontend/.env.example). Vite inlines
 * them into the bundle, so they must never contain secrets.
 */
const env = import.meta.env;

function numberFrom(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const appConfig = {
  /** Empty string means "same origin" (Vite proxy in dev, nginx in Docker). */
  apiBaseUrl: (env.VITE_API_BASE_URL ?? "").replace(/\/$/, ""),
  socketUrl: (env.VITE_SOCKET_URL ?? "").replace(/\/$/, ""),
  /** Versioned API path; the unversioned /api/... aliases are deprecated. */
  apiPrefix: "/api/v1",
  /** Client-side limits mirror the backend's defaults; the server re-checks everything. */
  maxCodeChars: numberFrom(env.VITE_MAX_CODE_CHARS, 20_000),
  maxStdinChars: numberFrom(env.VITE_MAX_STDIN_CHARS, 10_000),
  requestTimeoutMs: 30_000,
  storageKeys: {
    theme: "pyarena-theme",
    playgroundDraft: "pyarena-playground-draft",
    playgroundStdin: "pyarena-playground-stdin",
    questionDraftPrefix: "pyarena-question-draft-",
    competitionDraftPrefix: "pyarena-competition-draft-",
  },
  defaultPlaygroundCode: [
    "# Welcome to the playground. Press Run or Ctrl/Cmd + Enter.",
    "def greet(name: str) -> str:",
    '    return f"Hello, {name}!"',
    "",
    "name = input(\"What's your name? \") or \"world\"",
    "print()",
    "print(greet(name))",
    "",
  ].join("\n"),
} as const;
