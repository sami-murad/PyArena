import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { PageSpinner } from "@/components/ui/Spinner";
import { routes } from "@/config/navigation";
import { useAuth } from "@/features/auth/AuthContext";

/** UI convenience only: the backend enforces authentication on every protected endpoint. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <PageSpinner label="Checking your session" />;
  if (!user) return <Navigate to={routes.login} replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
