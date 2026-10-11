/**
 * The mascot's moods and their precedence: the single table that decides which
 * reaction may replace which. See MascotContext.tsx for how it is applied.
 * The moods match the Deb sticker categories (config/mascots.ts).
 *
 * | Mood        | Priority | Shown for | Typical trigger                                   |
 * |-------------|----------|-----------|---------------------------------------------------|
 * | trophy      | 110      | 6.0 s     | competition won                                   |
 * | celebrate   | 100      | 5.0 s     | every test passed                                 |
 * | concerned   | 65       | 3.5 s     | syntax/runtime error, limits, nothing passed, time up |
 * | happy       | 50       | 2.8 s     | a run finished without errors                     |
 * | encouraging | 45       | 3.0 s     | some tests passed, countdown, lost a round        |
 * | thinking    | 20       | until the result (max 15 s) | code is running         |
 * | idle        | 0        | always (the resting mood)  |                          |
 *
 * While a reaction is showing, a reaction with LOWER priority is ignored, so a
 * late "thinking" can never hide a "celebrate". Equal or higher priority replaces it.
 */
export const MOODS = ["idle", "thinking", "happy", "concerned", "encouraging", "celebrate", "trophy"] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_PRIORITY: Record<Mood, number> = {
  trophy: 110,
  celebrate: 100,
  concerned: 65,
  happy: 50,
  encouraging: 45,
  thinking: 20,
  idle: 0,
};

export const MOOD_DURATION_MS: Record<Mood, number> = {
  trophy: 6000,
  celebrate: 5000,
  concerned: 3500,
  happy: 2800,
  encouraging: 3000,
  thinking: 15000,
  idle: 0,
};

/** Default speech-bubble lines; reactions may pass a more specific one. */
export const MOOD_LINES: Record<Mood, readonly string[]> = {
  idle: ["Ready when you are.", "Psst: Ctrl + Enter runs your code."],
  thinking: ["Running it in the sandbox…", "Hmm, let me think…"],
  happy: ["It runs! Nice.", "Clean run. Love it."],
  concerned: ["Uh-oh. Check the marked line.", "That didn't go to plan."],
  encouraging: ["So close! Keep going.", "You're getting there."],
  celebrate: ["Every test passed!", "Woohoo, nailed it!"],
  trophy: ["Champion!", "Take a bow, you earned it."],
};

export const MOOD_LABEL: Record<Mood, string> = {
  idle: "relaxed",
  thinking: "thinking",
  happy: "happy",
  concerned: "worried",
  encouraging: "cheering you on",
  celebrate: "celebrating",
  trophy: "holding a trophy",
};

/** Moods that may come with a confetti burst. */
export const CONFETTI_MOODS: readonly Mood[] = ["celebrate", "trophy"];

export type BadgeTone = "success" | "danger" | "warning" | "accent";

export interface MascotReaction {
  mood: Mood;
  /** Speech bubble text (defaults to one of MOOD_LINES). */
  line?: string;
  /** Short status label shown on the mascot: the visual twin of the sound. */
  badge?: { text: string; tone: BadgeTone };
  /** Confetti burst (skipped with reduced motion). */
  confetti?: boolean;
}

/** Whether `next` may replace `current` while `current` is still showing. */
export function canReplace(current: Mood, next: Mood): boolean {
  return MOOD_PRIORITY[next] >= MOOD_PRIORITY[current];
}
