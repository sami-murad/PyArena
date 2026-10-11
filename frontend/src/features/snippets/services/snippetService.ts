import { api } from "@/services/apiClient";
import type { Snippet } from "@/types/api";

export interface SnippetInput {
  title: string;
  code: string;
  stdin: string;
}

export const snippetService = {
  list: (signal?: AbortSignal) => api.get<Snippet[]>("/snippets", signal),
  get: (id: number, signal?: AbortSignal) => api.get<Snippet>(`/snippets/${id}`, signal),
  create: (input: SnippetInput) => api.post<Snippet>("/snippets", input),
  update: (id: number, input: SnippetInput) => api.put<Snippet>(`/snippets/${id}`, input),
  remove: (id: number) => api.delete(`/snippets/${id}`),
};
