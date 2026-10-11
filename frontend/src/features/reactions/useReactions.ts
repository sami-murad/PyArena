import { useEffect } from "react";

import { useMascot } from "@/features/mascot/MascotContext";
import { reactionForCompetition } from "@/features/mascot/useMoodFromCompetition";
import {
  reactionForRun,
  reactionForSubmission,
  RUN_FAILED,
  RUN_STARTED,
  type Reaction,
} from "@/features/mascot/useMoodFromRun";
import { onReaction, type ReactionEvent } from "@/features/reactions/reactionBus";
import { useSound } from "@/features/sound/useSound";

export function reactionFor(event: ReactionEvent): Reaction | null {
  switch (event.type) {
    case "run:started":
    case "submit:started":
      return RUN_STARTED;
    case "run:finished":
      return reactionForRun(event.status);
    case "submit:finished":
      return reactionForSubmission(event.status, { passed: event.passed, total: event.total });
    case "run:failed":
    case "submit:failed":
      return RUN_FAILED;
    case "run:stopped":
      return null;
    default:
      return reactionForCompetition(event);
  }
}

/**
 * The reactions orchestrator: the ONLY place where events turn into mascot
 * moods and sounds. Mounted once (ReactionsBridge in MainLayout).
 *
 * A sound plays only if the mascot actually showed the reaction, so the visual
 * and the audio always match, and precedence applies to both.
 */
export function useReactions(): void {
  const { react, release } = useMascot();
  const { play } = useSound();

  useEffect(
    () =>
      onReaction((event) => {
        if (event.type === "run:stopped") {
          release("thinking");
          return;
        }
        const reaction = reactionFor(event);
        if (!reaction) return;
        const { sound, ...visual } = reaction;
        if (react(visual) && sound) play(sound);
      }),
    [react, release, play],
  );
}

export function ReactionsBridge(): null {
  useReactions();
  return null;
}
