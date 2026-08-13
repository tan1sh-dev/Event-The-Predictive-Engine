import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  CLUSTER_COUNT,
  type ClientToServerEvents,
  type ClusterView,
  type PowerUp,
  type ServerToClientEvents,
  type TeamDetails,
  type Wager,
} from "@engine/shared";
import {
  clearSession,
  hasSavedSession,
  loadLastCluster,
  loadTeam,
  loadToken,
  saveTeam,
  saveToken,
} from "../lib/storage.ts";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useEngineSocket(): GameSocket {
  return useMemo(
    () =>
      io({
        transports: ["websocket", "polling"],
        autoConnect: true,
      }),
    [],
  );
}

export function useClusterSession(socket: GameSocket) {
  const [view, setView] = useState<ClusterView | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [clusterCount, setClusterCount] = useState(CLUSTER_COUNT);
  const [resuming, setResuming] = useState(hasSavedSession);
  const joinEpoch = useRef(0);

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
      saveToken(next.clusterNumber, next.token);
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
    const returnToJoinGate = () => {
      joinEpoch.current += 1;
      clearSession();
      setView(null);
      setBusy(false);
      setResuming(false);
      setJoinError(null);
    };
    const onError = ({ message }: { message: string }) => {
      setBanner(message);
      if (
        /took over|reset this cluster|reduced the cluster count|reset the game/i.test(
          message,
        )
      ) {
        returnToJoinGate();
      }
    };
    const resume = () => {
      setConnected(true);
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
            setJoinError(ack.message);
            return;
          }
          setJoinError(null);
          if (ack.token && ack.clusterNumber) saveToken(ack.clusterNumber, ack.token);
          if (ack.view) setView(ack.view);
        },
      );
    };
    const onDisconnect = () => setConnected(false);

    socket.on("clusterView", onView);
    socket.on("snapshot", onSnap);
    socket.on("error", onError);
    socket.on("connect", resume);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) resume();
    return () => {
      socket.off("clusterView", onView);
      socket.off("snapshot", onSnap);
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
          if (ack.token && ack.clusterNumber) saveToken(ack.clusterNumber, ack.token);
          if (ack.view) setView(ack.view);
        },
      );
    },
    [socket],
  );

  const submitVote = useCallback(
    (questionId: string, optionId: string, wager: Wager | null) => {
      socket.emit("submitVote", { questionId, optionId, wager }, (ack) => {
        if (!ack.ok) setBanner(ack.message);
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
  };
}
