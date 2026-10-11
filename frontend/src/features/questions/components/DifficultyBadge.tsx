import { StatusBadge } from "@/components/feedback/StatusBadge";
import type { Difficulty } from "@/types/api";
import { capitalize, difficultyTone } from "@/utils/status";

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <StatusBadge tone={difficultyTone[difficulty]}>{capitalize(difficulty)}</StatusBadge>;
}
