import { WifiOff } from "lucide-react";

import { Spinner } from "@/components/ui/Spinner";
import type { Connection } from "@/features/competitions/hooks/useCompetitionRoom";

export function ConnectionBanner({ connection }: { connection: Connection }) {
  if (connection === "connected" || connection === "connecting") return null;
  return (
    <div className="conn-banner" role="status">
      {connection === "reconnecting" ? <Spinner size="sm" label="" /> : <WifiOff size={16} aria-hidden />}
      {connection === "reconnecting"
        ? "Live connection lost. Reconnecting… Your code is safe in this tab."
        : "Can't reach the live server. Updates resume when the connection returns."}
    </div>
  );
}
