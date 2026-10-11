import { api } from "@/services/apiClient";
import type { User } from "@/types/api";

export const authService = {
  session: () => api.get<User | null>("/auth/session"),
  login: (login: string, password: string) => api.post<User>("/auth/login", { login, password }),
  register: (username: string, email: string, password: string) =>
    api.post<User>("/auth/register", { username, email, password }),
  logout: () => api.post<void>("/auth/logout"),
};
