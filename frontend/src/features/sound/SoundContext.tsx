import { createContext, useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { soundManager as defaultManager, type SoundManager } from "@/features/sound/soundManager";
import type { SoundName } from "@/features/sound/sounds";

export interface SoundApi {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  play: (name: SoundName) => boolean;
}

export const SoundContext = createContext<SoundApi | null>(null);

export function SoundProvider({ children, manager = defaultManager }: { children: ReactNode; manager?: SoundManager }) {
  // The AudioContext is created on the first user gesture, never on page load.
  useEffect(() => manager.installUnlock(window), [manager]);

  const muted = useSyncExternalStore(
    useCallback((l: () => void) => manager.subscribe(l), [manager]),
    () => manager.isMuted(),
    () => true,
  );

  const api = useMemo<SoundApi>(
    () => ({
      muted,
      setMuted: (m) => manager.setMuted(m),
      toggleMuted: () => manager.setMuted(!manager.isMuted()),
      play: (name) => manager.play(name),
    }),
    [manager, muted],
  );
  return <SoundContext.Provider value={api}>{children}</SoundContext.Provider>;
}
