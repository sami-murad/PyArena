import type { ReactNode } from "react";

import { ThemeProvider } from "@/app/ThemeContext";
import { ToastProvider } from "@/components/feedback/Toast";
import { AuthProvider } from "@/features/auth/AuthContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
