import { api } from "@/services/apiClient";
import type { Difficulty, QuestionDetail, QuestionSummary, Submission } from "@/types/api";

export const questionService = {
  list: (difficulty?: Difficulty, signal?: AbortSignal) =>
    api.get<QuestionSummary[]>(difficulty ? `/questions?difficulty=${difficulty}` : "/questions", signal),
  get: (id: number, signal?: AbortSignal) => api.get<QuestionDetail>(`/questions/${id}`, signal),
  submit: (questionId: number, code: string) =>
    api.post<Submission>("/submissions", { question_id: questionId, code }),
  mySubmissions: (questionId: number, signal?: AbortSignal) =>
    api.get<Submission[]>(`/submissions?question_id=${questionId}`, signal),
  submission: (id: number) => api.get<Submission>(`/submissions/${id}`),
};
