import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  CLUSTER_COUNT,
  type ClientToServerEvents,
  type ClusterView,
  type GameClock,
  type PowerUp,
  type ServerToClientEvents,
  type SessionResetReason,
  type TeamDetails,
  type Wager,
} from "@engine/shared";
import {
  clearJoinScreen,
  clearSession,
  hasSavedSession,
  loadJoinScreen,
  loadLastCluster,
  loadTeam,
  loadToken,
  markTeamScreen,
  saveTeam,
  saveToken,
} from "../lib/storage.ts";
import { ingestGameClock } from "../lib/game-clock.ts";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useEngineSocket(): GameSocket {
  const socket = useMemo(
    () =>
      io({
        transports: ["websocket", "polling"],
        autoConnect: true,
      }),
    [],
  );

  useEffect(() => {
    const onClock = (payload: GameClock) => ingestGameClock(payload);
    socket.on("clock", onClock);
    return () => {
      socket.off("clock", onClock);
    };
  }, [socket]);

  return socket;
}

export function useClusterSession(socket: GameSocket) {
  const [view, setView] = useState<ClusterView | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [clusterCount, setClusterCount] = useState(CLUSTER_COUNT);
  const [resuming, setResuming] = useState(hasSavedSession);
  const [startAtTeam, setStartAtTeam] = useState(() => loadJoinScreen() === "team");
  const [gateGeneration, setGateGeneration] = useState(0);
  const joinEpoch = useRef(0);
  const allowView = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/snapshot")
      .then((res) => (res.ok ? res.json() : null))
      .then((snap: { clusterCount?: number } | null) => {
        if (!cancelled && typeof snap?.clusterCount === "number") {
          setClusterCount(snap.clusterCount);
        }
      })
      .catch(() => {
        /* engine not up yet — snapshot events will fill this in */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onView = (next: ClusterView) => {
      if (!allowView.current) return;
      saveToken(next.clusterNumber, next.token);
      clearJoinScreen();
      setStartAtTeam(false);
      setView(next);
      setClusterCount(next.snapshot.clusterCount);
    };
    const onSnap = (snapshot: ClusterView["snapshot"]) => {
      setClusterCount(snapshot.clusterCount);
      setView((prev) => {
        if (!prev) return prev;
        if (prev.clusterNumber > snapshot.clusterCount) return null;
        return { ...prev, snapshot };
      });
    };
    const returnToJoinGate = (opts?: { teamScreen?: boolean }) => {
      joinEpoch.current += 1;
      allowView.current = false;
      clearSession();
      setView(null);
      setBusy(false);
      setResuming(false);
      setJoinError(null);
      if (opts?.teamScreen) {
        markTeamScreen();
        setStartAtTeam(true);
        setGateGeneration((g) => g + 1);
      }
    };
    const onSessionReset = ({ reason }: { reason: SessionResetReason }) => {
      returnToJoinGate({ teamScreen: true });
      setBanner(
        reason === "kicked"
          ? "Host removed this cluster. Enter your team details to join again."
          : "Host reset the game. Enter your team details to join again.",
      );
      // Drop any in-flight rejoin so this phone cannot silently reclaim the seat.
      socket.disconnect();
      socket.connect();
    };
    const onError = ({ message }: { message: string }) => {
      setBanner(message);
      if (/reset this cluster|reset the game/i.test(message)) {
        returnToJoinGate({ teamScreen: true });
        return;
      }
      if (/took over|reduced the cluster count/i.test(message)) {
        returnToJoinGate();
      }
    };
    const resume = () => {
      setConnected(true);
      if (loadJoinScreen() === "team") {
        setBusy(false);
        setResuming(false);
        setStartAtTeam(true);
        return;
      }
      const clusterNumber = loadLastCluster();
      const team = loadTeam();
      const token = clusterNumber != null ? loadToken(clusterNumber) : undefined;
      if (clusterNumber == null || !team || !token) {
        setBusy(false);
        setResuming(false);
        return;
      }
      const gen = ++joinEpoch.current;
      setBusy(true);
      socket.emit(
        "join",
        { role: "cluster", clusterNumber, token, team },
        (ack) => {
          if (gen !== joinEpoch.current) return;
          setBusy(false);
          setResuming(false);
          if (!ack.ok) {
            if (
              ack.error === "bad_token" ||
              ack.error === "invalid_cluster" ||
              ack.error === "game_reset"
            ) {
              clearSession();
              setView(null);
            }
            if (ack.error === "invalid_cluster" || ack.error === "game_reset") {
              markTeamScreen();
              setStartAtTeam(true);
            }
            setJoinError(ack.message);
            return;
          }
          setJoinError(null);
          allowView.current = true;
          clearJoinScreen();
          setStartAtTeam(false);
          if (ack.token && ack.clusterNumber) saveToken(ack.clusterNumber, ack.token);
          if (ack.view) setView(ack.view);
        },
      );
    };
    const onDisconnect = () => setConnected(false);

    socket.on("clusterView", onView);
    socket.on("snapshot", onSnap);
    socket.on("sessionReset", onSessionReset);
    socket.on("error", onError);
    socket.on("connect", resume);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) resume();
    return () => {
      socket.off("clusterView", onView);
      socket.off("snapshot", onSnap);
      socket.off("sessionReset", onSessionReset);
      socket.off("error", onError);
      socket.off("connect", resume);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket]);

  const join = useCallback(
    (clusterNumber: number, team: TeamDetails) => {
      const gen = ++joinEpoch.current;
      setBusy(true);
      setJoinError(null);
      socket.emit(
        "join",
        { role: "cluster", clusterNumber, token: loadToken(clusterNumber), team },
        (ack) => {
          if (gen !== joinEpoch.current) return;
          setBusy(false);
          if (!ack.ok) {
            setJoinError(ack.message);
            return;
          }
          saveTeam(team);
          allowView.current = true;
          clearJoinScreen();
          setStartAtTeam(false);
          if (ack.token && ack.clusterNumber) saveToken(ack.clusterNumber, ack.token);
          if (ack.view) setView(ack.view);
        },
      );
    },
    [socket],
  );

  const submitVote = useCallback(
    (questionId: string, optionId: string, wager: Wager | null, onAck?: (ok: boolean) => void) => {
      socket.emit("submitVote", { questionId, optionId, wager }, (ack) => {
        if (!ack.ok) setBanner(ack.message);
        onAck?.(ack.ok);
      });
    },
    [socket],
  );

  const claimPower = useCallback(
    (power: PowerUp) => {
      socket.emit("claimPower", { power }, (ack) => {
        if (!ack.ok) setBanner(ack.message);
      });
    },
    [socket],
  );

  return {
    view,
    join,
    joinError,
    busy,
    connected,
    submitVote,
    claimPower,
    banner,
    setBanner,
    lastCluster: loadLastCluster(),
    clusterCount,
    resuming,
    startAtTeam,
    gateGeneration,
  };
}
