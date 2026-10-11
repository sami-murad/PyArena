import { api } from "@/services/apiClient";
import type { UserStatistics } from "@/types/api";

export const profileService = {
  statistics: (signal?: AbortSignal) => api.get<UserStatistics>("/users/me/statistics", signal),
};
