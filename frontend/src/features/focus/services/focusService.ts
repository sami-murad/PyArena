import { api } from "@/services/apiClient";
import type { FocusSignal } from "@/features/focus/useFocusGuard";
import type { FocusEventResult, FocusState } from "@/types/api";

const base = (competitionId: number) => `/competitions/${competitionId}/focus`;

/** Focus Mode endpoints. The server times absences and decides what counts. */
export const focusService = {
  get: (competitionId: number, signal?: AbortSignal) => api.get<FocusState>(base(competitionId), signal),
  acknowledge: (competitionId: number) => api.post<FocusState>(`${base(competitionId)}/acknowledge`),
  report: (competitionId: number, signal: FocusSignal) =>
    api.post<FocusEventResult>(`${base(competitionId)}/events`, {
      kind: signal.kind,
      ...(signal.pasteChars !== undefined && { paste_chars: signal.pasteChars }),
      ...(signal.awayMs !== undefined && { away_ms: signal.awayMs }),
    }),
  heartbeat: (competitionId: number) => api.post<FocusState>(`${base(competitionId)}/heartbeat`),
};
