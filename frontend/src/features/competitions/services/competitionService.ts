import { api, newIdempotencyKey } from "@/services/apiClient";
import type {
  CompetitionListItem,
  CompetitionResults,
  CompetitionState,
  Difficulty,
  Submission,
} from "@/types/api";

export interface CreateCompetitionInput {
  difficulty: Difficulty | "any";
  max_players: number;
  duration_minutes: number;
}

export const competitionService = {
  create: (input: CreateCompetitionInput) => api.post<CompetitionState>("/competitions", input),
  mine: (signal?: AbortSignal) => api.get<CompetitionListItem[]>("/competitions", signal),
  join: (code: string) => api.post<CompetitionState>("/competitions/join", { code: code.trim().toUpperCase() }),
  get: (id: number, signal?: AbortSignal) => api.get<CompetitionState>(`/competitions/${id}`, signal),
  ready: (id: number, ready: boolean) => api.post<CompetitionState>(`/competitions/${id}/ready`, { ready }),
  start: (id: number) => api.post<CompetitionState>(`/competitions/${id}/start`),
  leave: (id: number) => api.post<void>(`/competitions/${id}/leave`),
  cancel: (id: number) => api.post<CompetitionState>(`/competitions/${id}/cancel`),
  /** Pass the same key when retrying the same click, so the server creates one submission. */
  submit: (id: number, code: string, idempotencyKey: string = newIdempotencyKey()) =>
    api.post<Submission>(`/competitions/${id}/submissions`, { code }, { idempotencyKey }),
  results: (id: number, signal?: AbortSignal) => api.get<CompetitionResults>(`/competitions/${id}/results`, signal),
  submission: (id: number) => api.get<Submission>(`/submissions/${id}`),
};
