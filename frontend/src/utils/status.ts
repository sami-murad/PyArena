import type { Tone } from "@/components/feedback/StatusBadge";
import type { CompetitionStatus, Difficulty, ExecutionStatus, SubmissionStatus } from "@/types/api";

export const executionLabels: Record<ExecutionStatus, { label: string; tone: Tone }> = {
  OK: { label: "Finished", tone: "success" },
  SYNTAX_ERROR: { label: "Syntax error", tone: "danger" },
  RUNTIME_ERROR: { label: "Runtime error", tone: "danger" },
  TIMEOUT: { label: "Time limit", tone: "warning" },
  MEMORY_LIMIT: { label: "Memory limit", tone: "warning" },
  OUTPUT_LIMIT: { label: "Output limit", tone: "warning" },
};

export const submissionLabels: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Judging", tone: "accent" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  WRONG_ANSWER: { label: "Wrong answer", tone: "danger" },
  SYNTAX_ERROR: { label: "Syntax error", tone: "danger" },
  RUNTIME_ERROR: { label: "Runtime error", tone: "danger" },
  TIMEOUT: { label: "Time limit", tone: "warning" },
  MEMORY_LIMIT: { label: "Memory limit", tone: "warning" },
  OUTPUT_LIMIT: { label: "Output limit", tone: "warning" },
  SYSTEM_ERROR: { label: "Judge unavailable", tone: "neutral" },
  CANCELLED: { label: "Not judged", tone: "neutral" },
};

export const competitionLabels: Record<CompetitionStatus, { label: string; tone: Tone }> = {
  WAITING: { label: "In lobby", tone: "accent" },
  COUNTDOWN: { label: "Starting", tone: "primary" },
  RUNNING: { label: "Live", tone: "primary" },
  FINISHED: { label: "Finished", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const difficultyTone: Record<Difficulty, Tone> = {
  easy: "success",
  medium: "warning",
  hard: "danger",
};

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
