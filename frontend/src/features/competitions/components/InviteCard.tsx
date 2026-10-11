import { Copy, Link2 } from "lucide-react";

import { useToast } from "@/components/feedback/Toast";
import { Button } from "@/components/ui/Button";
import { routes } from "@/config/navigation";
import { copyText } from "@/utils/download";

export function InviteCard({ code }: { code: string }) {
  const { notify } = useToast();
  const link = `${window.location.origin}${routes.join(code)}`;

  async function copy(value: string, what: string) {
    notify((await copyText(value)) ? `${what} copied.` : "Copy failed. Select it and copy it manually.", "info");
  }

  return (
    <section className="invite" aria-label="Invite friends">
      <p className="invite__label">Room code</p>
      <p className="invite__code" aria-label={`Room code ${code.split("").join(" ")}`}>
        {code.slice(0, 4)}
        <span className="invite__gap" aria-hidden />
        {code.slice(4)}
      </p>
      <div className="invite__actions">
        <Button size="sm" variant="secondary" icon={<Copy size={15} aria-hidden />} onClick={() => copy(code, "Room code")}>
          Copy code
        </Button>
        <Button size="sm" variant="ghost" icon={<Link2 size={15} aria-hidden />} onClick={() => copy(link, "Invite link")}>
          Copy invite link
        </Button>
      </div>
    </section>
  );
}
