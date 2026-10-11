import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { authService } from "@/features/auth/services/authService";
import { ApiError } from "@/services/apiClient";
import { resetSocket } from "@/services/socketClient";
import type { User } from "@/types/api";

interface AuthContextValue {
  user: User | null;
  /** True until the initial session check finishes. */
  checking: boolean;
  login: (login: string, password: string) => Promise<User>;
  register: (username: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    authService
      .session()
      .then((u) => active && setUser(u))
      .catch((err: unknown) => {
        // 401 simply means "signed out"; network errors are surfaced by the pages that need the API.
        if (active && !(err instanceof ApiError && err.status === 401)) setUser(null);
      })
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (loginName: string, password: string) => {
    const u = await authService.login(loginName, password);
    resetSocket();
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const u = await authService.register(username, email, password);
    resetSocket();
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      resetSocket();
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, checking, login, register, logout }), [user, checking, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
