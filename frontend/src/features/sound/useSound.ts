import { useContext } from "react";

import { SoundContext, type SoundApi } from "@/features/sound/SoundContext";

export function useSound(): SoundApi {
  const api = useContext(SoundContext);
  if (!api) throw new Error("useSound must be used inside <SoundProvider>");
  return api;
}
