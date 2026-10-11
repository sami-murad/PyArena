/**
 * Maps competition events to a reaction. Pure functions: used by useReactions.
 */
import type { Reaction } from "@/features/mascot/useMoodFromRun";
import { reactionForSubmission } from "@/features/mascot/useMoodFromRun";
import type { ReactionEvent } from "@/features/reactions/reactionBus";

export function reactionForCompetition(event: ReactionEvent): Reaction | null {
  switch (event.type) {
    case "competition:countdown":
      return { mood: "encouraging", sound: "countdown", line: "Here we go. Stretch those fingers!" };
    case "competition:started":
      return { mood: "thinking", sound: "go", line: "Go go go!", badge: { text: "Go!", tone: "accent" } };
    case "competition:verdict":
      // Accepted is celebrated by the winner event; only misses react here.
      return event.status === "ACCEPTED" ? null : reactionForSubmission(event.status, { passed: event.passed, total: event.total });
    case "competition:won":
      return {
        mood: "trophy",
        sound: "win",
        confetti: true,
        line: "You won! Fastest fingers in the room!",
        badge: { text: "You won!", tone: "success" },
      };
    case "competition:lost":
      return {
        mood: "encouraging",
        sound: "lose",
        line: `${event.winner} got there first. Rematch?`,
        badge: { text: "Round over", tone: "accent" },
      };
    case "competition:time-up":
      return { mood: "concerned", sound: "lose", line: "Time's up! Nobody cracked it.", badge: { text: "Time's up", tone: "warning" } };
    default:
      return null;
  }
}
