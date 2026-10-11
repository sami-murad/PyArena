/**
 * Domain events that may deserve a reaction. Features EMIT these (a run
 * finished, a verdict arrived); only useReactions decides what the mascot and
 * the sound do about them, so no component triggers a reaction directly.
 */
import type { ExecutionStatus, FocusAction, SubmissionStatus } from "@/types/api";

export type ReactionEvent =
  | { type: "run:started" }
  | { type: "run:finished"; status: ExecutionStatus }
  | { type: "run:failed" }
  | { type: "run:stopped" }
  | { type: "submit:started" }
  | { type: "submit:finished"; status: SubmissionStatus; passed?: number; total?: number }
  | { type: "submit:failed" }
  | { type: "competition:countdown" }
  | { type: "competition:started" }
  | { type: "competition:verdict"; status: SubmissionStatus; passed?: number; total?: number }
  | { type: "competition:won" }
  | { type: "competition:lost"; winner: string }
  | { type: "competition:time-up" }
  | { type: "focus:violation"; action: FocusAction; count: number; warnLimit: number };

type Listener = (event: ReactionEvent) => void;
const listeners = new Set<Listener>();

export function emitReaction(event: ReactionEvent): void {
  listeners.forEach((listener) => listener(event));
}

export function onReaction(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
