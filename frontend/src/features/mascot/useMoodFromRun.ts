/**
 * Maps playground runs and practice submissions to a reaction (mood, line,
 * badge, sound). Pure functions: used by useReactions, tested directly.
 */
import type { MascotReaction } from "@/features/mascot/moods";
import type { SoundName } from "@/features/sound/sounds";
import type { ExecutionStatus, SubmissionStatus } from "@/types/api";

export interface Reaction extends MascotReaction {
  sound?: SoundName;
}

const LIMITS: Record<string, { badge: string; line: string }> = {
  TIMEOUT: { badge: "Time limit", line: "Whoa, that ran too long! Infinite loop?" },
  MEMORY_LIMIT: { badge: "Memory limit", line: "Too much memory! The sandbox said no." },
  OUTPUT_LIMIT: { badge: "Output limit", line: "Sooo much output! I stopped it." },
};

export function reactionForRun(status: ExecutionStatus): Reaction {
  switch (status) {
    case "OK":
      return { mood: "happy", sound: "success", badge: { text: "Ran OK", tone: "success" } };
    case "SYNTAX_ERROR":
      return {
        mood: "concerned",
        sound: "error",
        line: "Syntax hiccup. Look at the marked line.",
        badge: { text: "Syntax error", tone: "danger" },
      };
    case "RUNTIME_ERROR":
      return { mood: "concerned", sound: "error", badge: { text: "Runtime error", tone: "danger" } };
    default: {
      const limit = LIMITS[status];
      return { mood: "concerned", sound: "limit", line: limit.line, badge: { text: limit.badge, tone: "warning" } };
    }
  }
}

/** Test counts, when known, let a partial pass be cheered instead of mourned. */
export interface TestCounts {
  passed?: number;
  total?: number;
}

export function reactionForSubmission(status: SubmissionStatus, counts: TestCounts = {}): Reaction | null {
  switch (status) {
    case "ACCEPTED":
      return {
        mood: "celebrate",
        sound: "accepted",
        confetti: true,
        line: "Every test passed! Nailed it!",
        badge: { text: "Accepted", tone: "success" },
      };
    case "WRONG_ANSWER": {
      const { passed = 0, total = 0 } = counts;
      if (passed > 0 && total > 0) {
        return {
          mood: "encouraging",
          sound: "partial",
          line: `So close! ${passed} of ${total} tests pass.`,
          badge: { text: `${passed}/${total} passed`, tone: "warning" },
        };
      }
      return {
        mood: "concerned",
        sound: "wrong",
        line: "Hmm, the tests disagree. Check the examples.",
        badge: { text: "Wrong answer", tone: "danger" },
      };
    }
    case "SYSTEM_ERROR":
      return {
        mood: "concerned",
        line: "The judge is having a moment. Try again.",
        badge: { text: "Judge unavailable", tone: "warning" },
      };
    case "PENDING":
    case "CANCELLED":
      return null;
    default:
      return reactionForRun(status);
  }
}

export const RUN_STARTED: Reaction = { mood: "thinking", sound: "tick" };
export const RUN_FAILED: Reaction = {
  mood: "concerned",
  line: "I couldn't reach the sandbox.",
  badge: { text: "Couldn't run", tone: "warning" },
};
