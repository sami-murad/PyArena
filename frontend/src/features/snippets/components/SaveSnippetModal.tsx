import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/services/apiClient";

interface SaveSnippetModalProps {
  initialTitle: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
  mode: "create" | "update";
}

/** Render only while open, so each opening starts with fresh form state. */
export function SaveSnippetModal({ initialTitle, onClose, onSave, mode }: SaveSnippetModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) {
      setError("Give the snippet a name.");
      return;
    }
    setSaving(true);
    try {
      await onSave(clean);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const action = mode === "create" ? "Save snippet" : "Update snippet";
  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      title={action}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="save-snippet-form" loading={saving}>
            {action}
          </Button>
        </>
      }
    >
      <form id="save-snippet-form" onSubmit={submit} noValidate>
        <Input
          label="Name"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          error={error}
          hint="Code and input are saved together."
          data-autofocus
        />
      </form>
    </Modal>
  );
}
