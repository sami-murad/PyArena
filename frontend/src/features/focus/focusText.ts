import type { FocusAction, FocusPolicy } from "@/types/api";

/** Plain-language description of the escalation ladder, built from the server's policy. */
export function ladder(policy: FocusPolicy): string[] {
  const { warn_limit: warn, pause_seconds: pause, freeze_seconds: freeze, dq_after: dq } = policy;
  const steps: string[] = [];
  if (warn > 0) steps.push(`${warn === 1 ? "The first one is a warning" : `The first ${warn} are warnings`}.`);
  steps.push(`The next one pauses your submissions for ${pause} seconds.`);
  if (dq > 2) steps.push(`After that, each one freezes your editor and submissions for ${freeze} seconds.`);
  steps.push(`Number ${warn + dq} disqualifies you from the round.`);
  return steps;
}

export function actionLabel(action: FocusAction | null): string {
  switch (action) {
    case "warn":
      return "a warning";
    case "pause":
      return "a pause";
    case "freeze":
      return "a freeze";
    case "disqualify":
      return "disqualification";
    default:
      return "nothing";
  }
}
