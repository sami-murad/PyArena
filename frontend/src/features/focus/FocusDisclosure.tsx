import { Eye } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useFocusMode } from "@/features/focus/FocusModeProvider";
import { ladder } from "@/features/focus/focusText";
import { errorMessage } from "@/services/apiClient";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * The notice every player accepts before a Focus Mode round: what is detected,
 * what is not, how it escalates, and the accessibility allowances.
 */
export function FocusDisclosure({ open, onClose }: Props) {
  const { policy, acknowledge } = useFocusMode();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await acknowledge();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="This room uses Focus Mode"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Not now
          </Button>
          <Button variant="primary" icon={<Eye size={16} aria-hidden />} onClick={accept} loading={busy} data-autofocus>
            I understand
          </Button>
        </>
      }
    >
      <div className="focus-notice" data-testid="focus-disclosure">
        <p>
          While the round runs, your browser tells PyArena when this tab is hidden or the window loses focus, and when
          you paste a large block of text. Nothing is blocked, recorded on camera or read from your screen.
        </p>
        <h3 className="focus-notice__heading">What counts</h3>
        <ul>
          <li>Leaving the tab or window for {policy ? policy.grace_ms / 1000 : 2} seconds or longer.</li>
          <li>Pasting {policy?.paste_limit_chars ?? 200} or more characters at once.</li>
          <li>Leaving fullscreen is noted for the record but never counts.</li>
        </ul>
        {policy && (
          <>
            <h3 className="focus-notice__heading">What happens</h3>
            <ul>
              {ladder(policy).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
        <h3 className="focus-notice__heading">Accessibility</h3>
        <p>
          Screen readers, magnifiers, voice control and system pop-ups can take focus for a moment. Anything shorter
          than {policy ? policy.grace_ms / 1000 : 2} seconds is ignored. If your setup needs longer, ask the host for a
          room without Focus Mode.
        </p>
        <p className="focus-notice__fine">
          Focus Mode cannot see other devices or other people. It is a fair-play signal, not proof of cheating.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
