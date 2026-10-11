import { useCallback, useEffect, useRef, useState } from "react";

import { competitionService } from "@/features/competitions/services/competitionService";
import { emitReaction } from "@/features/reactions/reactionBus";
import { errorMessage } from "@/services/apiClient";
import { getSocket } from "@/services/socketClient";
import type { CompetitionState, Submission, SubmissionStatus, Winner } from "@/types/api";
import {
  SocketEvents,
  type Ack,
  type FinishedPayload,
  type StartedPayload,
  type SubmissionReceivedPayload,
  type SubmissionResultPayload,
  type WinnerPayload,
} from "@/types/events";

export type Connection = "connecting" | "connected" | "reconnecting" | "offline";

export interface ActivityItem {
  id: string;
  at: number;
  text: string;
  tone: "neutral" | "success" | "danger" | "accent" | "primary";
}

export interface RoomController {
  state: CompetitionState | null;
  loadError: string | null;
  connection: Connection;
  /** serverTime - clientTime in ms; add to Date.now() to get server time. */
  clockOffset: number;
  activity: ActivityItem[];
  /** Verdicts seen per user, in order. Drives the race lanes. */
  attempts: Record<number, SubmissionStatus[]>;
  mySubmission: Submission | null;
  setReady: (ready: boolean) => Promise<void>;
  start: () => Promise<void>;
  leave: () => Promise<void>;
  cancel: () => Promise<void>;
  submit: (code: string) => Promise<void>;
  reload: () => void;
}

let activitySeq = 0;

export function useCompetitionRoom(competitionId: number, myUserId: number | undefined): RoomController {
  const [state, setState] = useState<CompetitionState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [clockOffset, setClockOffset] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [attempts, setAttempts] = useState<Record<number, SubmissionStatus[]>>({});
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [version, setVersion] = useState(0);
  const mySubmissionId = useRef<number | null>(null);

  const lastSnapshotAt = useRef(0);
  const applyState = useCallback(
    (next: CompetitionState) => {
      if (next.id !== competitionId) return;
      // REST replies and socket pushes can arrive out of order; never let an
      // older snapshot overwrite a newer one.
      const at = Date.parse(next.server_time);
      if (at < lastSnapshotAt.current) return;
      lastSnapshotAt.current = at;
      setClockOffset(at - Date.now());
      setState(next);
    },
    [competitionId],
  );

  const log = useCallback((text: string, tone: ActivityItem["tone"] = "neutral") => {
    setActivity((items) => [{ id: `a${++activitySeq}`, at: Date.now(), text, tone }, ...items].slice(0, 40));
  }, []);

  // Initial snapshot over REST (works even if the socket is slow to connect).
  useEffect(() => {
    const controller = new AbortController();
    competitionService
      .get(competitionId, controller.signal)
      .then((next) => {
        setLoadError(null);
        applyState(next);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(err));
      });
    return () => controller.abort();
  }, [competitionId, applyState, version]);

  // Real-time channel.
  useEffect(() => {
    if (!myUserId) return;
    const socket = getSocket();
    const join = () => {
      socket.emit(SocketEvents.roomJoin, { competition_id: competitionId }, (ack: Ack) => {
        if (ack?.ok && ack.state) {
          applyState(ack.state);
          setConnection("connected");
        } else if (ack?.error) {
          setLoadError(ack.error);
        }
      });
    };
    const onConnect = () => join();
    const onDisconnect = () => setConnection("reconnecting");
    const onConnectError = () => setConnection(socket.active ? "reconnecting" : "offline");
    const onState = (payload: CompetitionState) => applyState(payload);
    const onCountdown = () => {
      log("The host started the competition.", "primary");
      emitReaction({ type: "competition:countdown" });
    };
    const onStarted = (p: StartedPayload) => {
      if (p.competition_id !== competitionId) return;
      log("Go! The question is live.", "primary");
      emitReaction({ type: "competition:started" });
    };
    const onReceived = (p: SubmissionReceivedPayload) => {
      if (p.competition_id !== competitionId) return;
      setAttempts((a) => ({ ...a, [p.user_id]: [...(a[p.user_id] ?? []), "PENDING"] }));
      log(`${p.username} submitted a solution.`, "accent");
    };
    const onResult = (p: SubmissionResultPayload) => {
      if (p.competition_id !== competitionId || p.user_id === undefined) return;
      const uid = p.user_id;
      setAttempts((a) => {
        const list = [...(a[uid] ?? [])];
        const idx = list.lastIndexOf("PENDING");
        if (idx >= 0) list[idx] = p.status;
        else list.push(p.status);
        return { ...a, [uid]: list };
      });
      if (p.status !== "ACCEPTED" && p.status !== "CANCELLED") {
        log(`${p.username}: ${p.passed_count ?? 0} of ${p.total_count ?? 0} tests passed.`, "danger");
      }
      if (p.submission_id === mySubmissionId.current) {
        competitionService.submission(p.submission_id).then(setMySubmission).catch(() => undefined);
      }
      if (uid === myUserId) {
        emitReaction({ type: "competition:verdict", status: p.status, passed: p.passed_count, total: p.total_count });
      }
    };
    const onWinner = (p: WinnerPayload) => {
      if (p.competition_id === competitionId && p.winner) {
        const w: Winner = p.winner;
        log(`${w.username} solved it first!`, "success");
        emitReaction(w.user_id === myUserId ? { type: "competition:won" } : { type: "competition:lost", winner: w.username });
      }
    };
    const onFinished = (p: FinishedPayload) => {
      if (p.competition_id !== competitionId) return;
      const reasons: Record<FinishedPayload["reason"], string> = {
        solved: "The competition is over.",
        time_up: "Time is up. Nobody solved it this round.",
        host_cancelled: "The host cancelled the room.",
        everyone_left: "Everyone left the room.",
        idle: "The lobby expired after a long wait.",
      };
      log(reasons[p.reason] ?? "The competition ended.", "neutral");
      if (p.reason === "time_up") emitReaction({ type: "competition:time-up" });
    };
    const onRoomError = (p: { message: string }) => log(p.message, "danger");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on(SocketEvents.roomState, onState);
    socket.on(SocketEvents.countdown, onCountdown);
    socket.on(SocketEvents.started, onStarted);
    socket.on(SocketEvents.submissionReceived, onReceived);
    socket.on(SocketEvents.submissionResult, onResult);
    socket.on(SocketEvents.winner, onWinner);
    socket.on(SocketEvents.finished, onFinished);
    socket.on(SocketEvents.roomError, onRoomError);
    if (socket.connected) join();
    else socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off(SocketEvents.roomState, onState);
      socket.off(SocketEvents.countdown, onCountdown);
      socket.off(SocketEvents.started, onStarted);
      socket.off(SocketEvents.submissionReceived, onReceived);
      socket.off(SocketEvents.submissionResult, onResult);
      socket.off(SocketEvents.winner, onWinner);
      socket.off(SocketEvents.finished, onFinished);
      socket.off(SocketEvents.roomError, onRoomError);
    };
  }, [competitionId, myUserId, applyState, log]);

  const refresh = useCallback(async () => {
    applyState(await competitionService.get(competitionId));
  }, [competitionId, applyState]);

  const setReady = useCallback(async (ready: boolean) => applyState(await competitionService.ready(competitionId, ready)), [competitionId, applyState]);
  const start = useCallback(async () => applyState(await competitionService.start(competitionId)), [competitionId, applyState]);
  const cancel = useCallback(async () => applyState(await competitionService.cancel(competitionId)), [competitionId, applyState]);
  const leave = useCallback(async () => {
    await competitionService.leave(competitionId);
  }, [competitionId]);

  const submit = useCallback(
    async (code: string) => {
      const sub = await competitionService.submit(competitionId, code);
      mySubmissionId.current = sub.id;
      setMySubmission(sub);
      await refresh().catch(() => undefined);
    },
    [competitionId, refresh],
  );

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return {
    state,
    loadError,
    connection,
    clockOffset,
    activity,
    attempts,
    mySubmission,
    setReady,
    start,
    leave,
    cancel,
    submit,
    reload,
  };
}
