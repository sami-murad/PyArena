/** Types mirroring the backend's Pydantic schemas (backend/app/schemas). */

export type Difficulty = "easy" | "medium" | "hard";
export type QuestionMode = "function" | "stdio";

export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

export interface UserStatistics {
  competitions_played: number;
  competitions_won: number;
  submissions_total: number;
  submissions_accepted: number;
  questions_solved: number;
  acceptance_rate: number;
}

export type ExecutionStatus =
  | "OK"
  | "SYNTAX_ERROR"
  | "RUNTIME_ERROR"
  | "TIMEOUT"
  | "MEMORY_LIMIT"
  | "OUTPUT_LIMIT";

export interface Explanation {
  title: string;
  summary: string;
  tips: string[];
  line: number | null;
}

/** Why the sandbox stopped a program; null when it ended on its own. */
export type KillReason = "oom" | "cpu" | "wall" | "output" | "signal";

export interface ExecuteResponse {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
  truncated: boolean;
  error_type: string | null;
  kill_reason: KillReason | null;
  explanation: Explanation | null;
}

export interface QuestionSummary {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  mode: QuestionMode;
}

export interface Example {
  input: string;
  output: string;
  note: string | null;
}

export interface QuestionDetail extends QuestionSummary {
  statement: string;
  function_name: string | null;
  signature: string | null;
  input_spec: string;
  output_spec: string;
  constraints: string[];
  starter_code: string;
  examples: Example[];
  explanation: string | null;
  time_limit_seconds: number;
  memory_limit_mb: number;
  total_tests: number;
}

export type SubmissionStatus =
  | "PENDING"
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "SYNTAX_ERROR"
  | "RUNTIME_ERROR"
  | "TIMEOUT"
  | "MEMORY_LIMIT"
  | "OUTPUT_LIMIT"
  | "SYSTEM_ERROR"
  | "CANCELLED";

/** Empty fields are null (hidden tests never fill input, expected, actual, stdout or stderr). */
export interface SubmissionFeedback {
  message?: string | null;
  failed_test?: number | null;
  total_tests?: number | null;
  is_public?: boolean | null;
  error_type?: string | null;
  input?: string | null;
  expected?: string | null;
  actual?: string | null;
  stdout?: string | null;
  stderr?: string | null;
}

export interface Submission {
  id: number;
  question_id: number;
  competition_id: number | null;
  status: SubmissionStatus;
  passed_count: number;
  total_count: number;
  feedback: SubmissionFeedback | null;
  created_at: string;
  judged_at: string | null;
  code: string | null;
}

export interface Snippet {
  id: number;
  title: string;
  code: string;
  stdin: string;
  created_at: string;
  updated_at: string;
}

export type CompetitionStatus = "WAITING" | "COUNTDOWN" | "RUNNING" | "FINISHED" | "CANCELLED" | "EXPIRED";

export interface Participant {
  user_id: number;
  username: string;
  is_host: boolean;
  is_ready: boolean;
  online: boolean;
  attempts: number;
  has_pending: boolean;
  /** Focus Mode status ("off" when the room does not use Focus Mode). */
  focus: FocusStatus;
  focus_acknowledged: boolean;
}

export interface Winner {
  user_id: number;
  username: string;
  submission_id: number;
  accepted_at: string;
  solve_seconds: number;
}

export interface CompetitionState {
  id: number;
  code: string;
  status: CompetitionStatus;
  host_id: number;
  difficulty: Difficulty | null;
  max_players: number;
  min_players: number;
  duration_seconds: number;
  focus_mode: boolean;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
  finished_at: string | null;
  finish_reason: string | null;
  server_time: string;
  participants: Participant[];
  question: QuestionDetail | null;
  winner: Winner | null;
  can_start: boolean;
  start_blockers: string[];
}

export interface CompetitionListItem {
  id: number;
  code: string;
  status: CompetitionStatus;
  difficulty: Difficulty | null;
  created_at: string;
  player_count: number;
  is_host: boolean;
  won: boolean;
}

export interface PlayerResult {
  user_id: number;
  username: string;
  attempts: number;
  disqualified: boolean;
  solved: boolean;
  is_winner: boolean;
  best_status: SubmissionStatus | null;
  solve_seconds: number | null;
}

export interface ResultSubmission {
  id: number;
  username: string;
  status: SubmissionStatus;
  passed_count: number;
  total_count: number;
  seconds_after_start: number | null;
  is_winning: boolean;
}

export interface CompetitionResults {
  competition: CompetitionState;
  players: PlayerResult[];
  timeline: ResultSubmission[];
  tie_break_rule: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  checks: Record<string, string>;
}

/* ------------------------------------------------------------- Focus Mode */

export type FocusStatus = "off" | "ok" | "away" | "paused" | "frozen" | "disqualified";
export type FocusEventKind = "hidden" | "blur" | "visible" | "focus" | "fullscreen_exit" | "paste";
export type FocusAction = "pending" | "ignored" | "recorded" | "warn" | "pause" | "freeze" | "disqualify";

export interface FocusPolicy {
  warn_limit: number;
  pause_seconds: number;
  freeze_seconds: number;
  dq_after: number;
  grace_ms: number;
  paste_limit_chars: number;
  heartbeat_seconds: number;
}

export interface FocusState {
  competition_id: number;
  enabled: boolean;
  acknowledged: boolean;
  status: FocusStatus;
  counted_violations: number;
  warnings_left: number;
  next_action: FocusAction | null;
  paused_until: string | null;
  frozen_until: string | null;
  disqualified: boolean;
  server_time: string;
  policy: FocusPolicy;
}

export interface FocusEventResult {
  state: FocusState;
  recorded: boolean;
  counted: boolean;
  action: FocusAction | null;
}
