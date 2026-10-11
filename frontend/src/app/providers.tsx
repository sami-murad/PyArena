import type { ReactNode } from "react";

import { ThemeProvider } from "@/app/ThemeContext";
import { ToastProvider } from "@/components/feedback/Toast";
import { AuthProvider } from "@/features/auth/AuthContext";
import { MascotProvider } from "@/features/mascot/MascotContext";
import { SoundProvider } from "@/features/sound/SoundContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SoundProvider>
            <MascotProvider>{children}</MascotProvider>
          </SoundProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
