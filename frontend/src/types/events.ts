/** Socket.IO event names and payloads. Must match backend/app/websocket/events.py. */
import type { CompetitionState, FocusAction, Participant, QuestionDetail, SubmissionStatus, Winner } from "@/types/api";

export const SocketEvents = {
  roomJoin: "room:join",
  roomLeave: "room:leave",
  playerReady: "player:ready",
  roomState: "room:state",
  roomParticipants: "room:participants",
  roomError: "room:error",
  countdown: "competition:countdown",
  started: "competition:started",
  submissionReceived: "submission:received",
  submissionResult: "submission:result",
  winner: "competition:winner",
  finished: "competition:finished",
  playerDisconnected: "player:disconnected",
  focusViolation: "focus:violation",
  focusResumed: "focus:resumed",
} as const;

export interface Ack {
  ok: boolean;
  error?: string;
  state?: CompetitionState;
}

export interface CountdownPayload {
  competition_id: number;
  starts_at: string;
  ends_at: string;
  server_time: string;
}

export interface StartedPayload {
  competition_id: number;
  starts_at: string;
  ends_at: string | null;
  question: QuestionDetail;
}

export interface SubmissionReceivedPayload {
  competition_id: number;
  submission_id: number;
  user_id: number;
  username: string;
}

export interface SubmissionResultPayload {
  competition_id: number;
  submission_id: number;
  user_id?: number;
  username?: string;
  status: SubmissionStatus;
  passed_count?: number;
  total_count?: number;
}

export interface WinnerPayload {
  competition_id: number;
  winner: Winner | null;
}

export interface FinishedPayload {
  competition_id: number;
  reason: "solved" | "time_up" | "host_cancelled" | "everyone_left" | "idle";
}

export interface ParticipantsPayload {
  competition_id: number;
  participants: Participant[];
}

/** A player left the tab (pending) or a counted violation such as a large paste happened. */
export interface FocusViolationPayload {
  competition_id: number;
  user_id: number;
  username: string;
  kind: "away" | "paste";
  pending: boolean;
  action?: FocusAction;
}

/** The player is back; `counted` says whether the absence counted. */
export interface FocusResumedPayload {
  competition_id: number;
  user_id: number;
  username: string;
  counted: boolean;
  action: FocusAction;
  count?: number;
}
