import type { Server, Socket } from "socket.io";
import {
  MIN_CLUSTER_COUNT,
  normalizeTeamDetails,
  type ClientToServerEvents,
  type HostAck,
  type JoinAck,
  type ServerToClientEvents,
  type SessionResetReason,
  type SocketData,
} from "@engine/shared";
import { ANSWER_KEY } from "./answer-key.ts";
import type { GameEngine } from "./engine.ts";
import { persist } from "./snapshot.ts";

type Io = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

function hostPassword(): string {
  return process.env.HOST_PASSWORD ?? "rvce_host";
}

function requireHost(socket: Sock): HostAck | null {
  if (socket.data.role !== "host" || !socket.data.authenticatedHost) {
    return { ok: false, error: "not_host", message: "Host authentication required." };
  }
  return null;
}

function releaseClusterClient(sock: Sock): void {
  const n = sock.data.clusterNumber;
  if (n != null) sock.leave(`cluster:${n}`);
  sock.data.role = undefined;
  sock.data.clusterNumber = undefined;
}

function emitSessionReset(
  io: Io,
  reason: SessionResetReason,
  target?: Sock,
): void {
  if (target) {
    target.emit("sessionReset", { reason });
    return;
  }
  for (const sock of io.sockets.sockets.values()) {
    if (sock.data.role === "host" || sock.data.role === "stage") continue;
    sock.emit("sessionReset", { reason });
    if (sock.data.role === "cluster") releaseClusterClient(sock);
  }
}

export function attachSockets(io: Io, engine: GameEngine): void {
  let voteTimer: ReturnType<typeof setTimeout> | null = null;
  let clueTimer: ReturnType<typeof setTimeout> | null = null;
  let powerGrantTimer: ReturnType<typeof setTimeout> | null = null;
  let calculatingTimer: ReturnType<typeof setTimeout> | null = null;
  let clockPulse: ReturnType<typeof setInterval> | null = null;

  const save = () => {
    persist(engine).catch((err) => console.error("snapshot save failed", err));
  };

  const emitClock = () => {
    io.emit("clock", engine.clock());
  };

  const armClockPulse = () => {
    const live =
      engine.msUntilVoteDeadline() != null ||
      engine.msUntilClueDeadline() != null ||
      engine.msUntilPowerGrantDeadline() != null ||
      engine.msUntilCalculatingDeadline() != null;
    if (!live) {
      if (clockPulse) {
        clearInterval(clockPulse);
        clockPulse = null;
        emitClock();
      }
      return;
    }
    emitClock();
    if (!clockPulse) {
      clockPulse = setInterval(emitClock, 200);
    }
  };

  const armVoteTimer = () => {
    if (voteTimer) {
      clearTimeout(voteTimer);
      voteTimer = null;
    }
    const remaining = engine.msUntilVoteDeadline();
    if (remaining == null) return;
    voteTimer = setTimeout(() => {
      voteTimer = null;
      if (engine.expireOpenVote()) broadcast();
    }, remaining);
  };

  const armClueTimer = () => {
    if (clueTimer) {
      clearTimeout(clueTimer);
      clueTimer = null;
    }
    const remaining = engine.msUntilClueDeadline();
    if (remaining == null) return;
    clueTimer = setTimeout(() => {
      clueTimer = null;
      if (engine.expireClue()) broadcast();
    }, remaining);
  };

  const armPowerGrantTimer = () => {
    if (powerGrantTimer) {
      clearTimeout(powerGrantTimer);
      powerGrantTimer = null;
    }
    const remaining = engine.msUntilPowerGrantDeadline();
    if (remaining == null) return;
    powerGrantTimer = setTimeout(() => {
      powerGrantTimer = null;
      if (engine.expirePowerGrant()) broadcast();
    }, remaining);
  };

  const armCalculatingTimer = () => {
    if (calculatingTimer) {
      clearTimeout(calculatingTimer);
      calculatingTimer = null;
    }
    const remaining = engine.msUntilCalculatingDeadline();
    if (remaining == null) return;
    calculatingTimer = setTimeout(() => {
      calculatingTimer = null;
      if (engine.expireCalculating()) {
        if (engine.step.phase === "ensemble") {
          io.emit("ensembleResult", { bars: engine.snapshot().ensemble ?? [] });
        }
        broadcast();
      }
    }, remaining);
  };

  const broadcast = () => {
    const snap = engine.snapshot();
    io.emit("snapshot", snap);
    io.emit("voteProgress", {
      lockedCount: snap.lockedCount,
      connectedCount: snap.connectedCount,
      clusterCount: snap.clusterCount,
    });
    for (let n = 1; n <= engine.clusterCount; n++) {
      const view = engine.clusterView(n, snap);
      const record = engine.getCluster(n);
      if (view && record?.socketId) {
        io.to(record.socketId).emit("clusterView", view);
      }
    }
    armVoteTimer();
    armClueTimer();
    armPowerGrantTimer();
    armCalculatingTimer();
    armClockPulse();
    save();
  };

  armVoteTimer();
  armClueTimer();
  armPowerGrantTimer();
  armCalculatingTimer();
  armClockPulse();

  io.on("connection", (socket) => {
    socket.on("join", (payload, cb) => {
      const ack = handleJoin(io, engine, socket, payload);
      cb(ack);
      if (ack.ok) broadcast();
    });

    socket.on("submitVote", (payload, cb) => {
      if (socket.data.role !== "cluster" || !socket.data.clusterNumber) {
        cb({ ok: false, error: "not_a_cluster", message: "Join as a cluster first." });
        return;
      }
      const result = engine.submitVote(
        socket.data.clusterNumber,
        payload.questionId,
        payload.optionId,
        payload.wager,
      );
      cb(result);
      if (result.ok) broadcast();
    });

    socket.on("usePower", (payload, cb) => {
      if (socket.data.role !== "cluster" || !socket.data.clusterNumber) {
        cb({ ok: false, error: "not_a_cluster", message: "Join as a cluster first." });
        return;
      }
      if (payload.power !== "foresight") {
        cb({
          ok: false,
          error: "passive_power",
          message: "Insurance and Amplify apply automatically. Only Foresight is activated.",
        });
        return;
      }
      const result = engine.useForesight(socket.data.clusterNumber);
      if (result.ok) {
        cb({ ok: true, power: result.power!, split: result.split });
        const view = engine.clusterView(socket.data.clusterNumber);
        if (view) socket.emit("clusterView", view);
        save();
      } else {
        cb(result);
      }
    });

    socket.on("claimPower", (payload, cb) => {
      if (socket.data.role !== "cluster" || !socket.data.clusterNumber) {
        cb({ ok: false, error: "not_a_cluster", message: "Join as a cluster first." });
        return;
      }
      const result = engine.claimPower(socket.data.clusterNumber, payload.power);
      if (result.ok) {
        cb({ ok: true, power: result.power });
        io.emit("powersGranted", {
          grants: [{ clusterNumber: socket.data.clusterNumber, power: payload.power }],
        });
        broadcast();
      } else {
        cb(result);
      }
    });

    socket.on("hostAdvance", (cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      if (engine.step.phase === "lobby" && engine.clusterCount < MIN_CLUSTER_COUNT) {
        cb({
          ok: false,
          error: "illegal_transition",
          message: "Set how many clusters before leaving the lobby.",
        });
        return;
      }
      engine.advance();
      if (engine.step.phase === "weight_update" && engine.step.roundId && engine.step.roundId !== "FINAL") {
        io.emit("weightsUpdated", {
          roundId: engine.step.roundId,
          discarded: engine.step.roundId === "R0",
          clusters: engine.snapshot().clusters,
        });
      }
      if (engine.step.phase === "ensemble") {
        io.emit("ensembleResult", { bars: engine.snapshot().ensemble ?? [] });
      }
      cb({ ok: true });
      broadcast();
    });

    socket.on("hostBack", (cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      engine.back();
      cb({ ok: true });
      broadcast();
    });

    socket.on("stageClueEnded", (cb) => {
      if (socket.data.role !== "stage") {
        cb?.({ ok: false });
        return;
      }
      if (engine.step.phase !== "clue") {
        cb?.({ ok: false });
        return;
      }
      if (engine.msUntilClueDeadline() != null) {
        cb?.({ ok: false });
        return;
      }
      const moved = engine.expireClue();
      cb?.({ ok: moved });
      if (moved) broadcast();
    });

    socket.on("hostPlayRound", (payload, cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      const result = engine.playRound(payload.roundId);
      if (!result.ok) {
        cb({
          ok: false,
          error: result.error,
          message: result.message,
        });
        return;
      }
      cb({ ok: true });
      broadcast();
    });

    socket.on("hostReveal", (payload, cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      const correct =
        payload.correctOptionId ||
        (engine.getCurrentQuestion()
          ? ANSWER_KEY[engine.getCurrentQuestion()!.id]
          : undefined);
      if (!correct) {
        cb({ ok: false, error: "bad_payload", message: "No correctOptionId provided." });
        return;
      }
      const result = engine.reveal(correct);
      if (!result.ok) {
        cb({ ok: false, error: "illegal_transition", message: result.message });
        return;
      }
      for (let n = 1; n <= engine.clusterCount; n++) {
        const record = engine.getCluster(n);
        const yourResult = result.results.get(n) ?? null;
        if (record?.socketId) {
          io.to(record.socketId).emit("revealResult", {
            questionId: result.questionId,
            correctOptionId: correct,
            yourResult,
          });
        }
      }
      io.to("stage").emit("revealResult", {
        questionId: result.questionId,
        correctOptionId: correct,
        yourResult: null,
      });
      io.to("host").emit("revealResult", {
        questionId: result.questionId,
        correctOptionId: correct,
        yourResult: null,
      });
      cb({ ok: true });
      broadcast();
    });

    socket.on("hostGrantPowers", (payload, cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      engine.grantPowers(payload.grants);
      io.emit("powersGranted", payload);
      cb({ ok: true });
      broadcast();
    });

    socket.on("hostSetWeight", (payload, cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      if (!engine.setWeight(payload.clusterNumber, payload.weight)) {
        cb({ ok: false, error: "bad_payload", message: "Unknown cluster." });
        return;
      }
      cb({ ok: true });
      broadcast();
    });

    socket.on("hostSetClusterCount", (payload, cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      const result = engine.setClusterCount(payload.clusterCount);
      if (!result.ok) {
        cb({
          ok: false,
          error: result.error === "wrong_phase" ? "illegal_transition" : "bad_payload",
          message: result.message,
        });
        return;
      }
      for (const sid of result.droppedSocketIds) {
        const sock = io.sockets.sockets.get(sid);
        sock?.emit("error", {
          message: "Host reduced the cluster count. Pick a new number.",
        });
        if (sock) releaseClusterClient(sock);
      }
      cb({ ok: true });
      broadcast();
    });

    socket.on("hostKick", (payload, cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      const cluster = engine.getCluster(payload.clusterNumber);
      const sid = cluster?.socketId;
      engine.kickCluster(payload.clusterNumber);
      if (sid) {
        const sock = io.sockets.sockets.get(sid);
        if (sock) {
          emitSessionReset(io, "kicked", sock);
          releaseClusterClient(sock);
        }
      }
      cb({ ok: true });
      broadcast();
    });

    socket.on("hostReset", (cb) => {
      const denied = requireHost(socket);
      if (denied) {
        cb(denied);
        return;
      }
      emitSessionReset(io, "game_reset");
      engine.reset();
      cb({ ok: true });
      broadcast();
    });

    socket.on("disconnect", () => {
      engine.disconnectSocket(socket.id);
      broadcast();
    });
  });
}

function handleJoin(
  io: Io,
  engine: GameEngine,
  socket: Sock,
  payload: Parameters<ClientToServerEvents["join"]>[0],
): JoinAck {
  if (payload.role === "host") {
    if (payload.hostPassword !== hostPassword()) {
      return { ok: false, error: "bad_password", message: "Wrong host password." };
    }
    socket.data.role = "host";
    socket.data.authenticatedHost = true;
    socket.join("host");
    return { ok: true, role: "host", snapshot: engine.snapshot() };
  }

  if (payload.role === "stage") {
    socket.data.role = "stage";
    socket.join("stage");
    return { ok: true, role: "stage", snapshot: engine.snapshot() };
  }

  if (payload.clusterNumber == null) {
    return {
      ok: false,
      error: "missing_cluster_number",
      message: "clusterNumber is required for role 'cluster'.",
    };
  }

  const team = normalizeTeamDetails(payload.team);
  if (!team) {
    return {
      ok: false,
      error: "invalid_team",
      message: "Enter a team name, leader, and unique teammate names (1–5 people total) before picking a cluster.",
    };
  }

  const result = engine.joinCluster(
    payload.clusterNumber,
    payload.token,
    socket.id,
    team,
  );
  if (!result.ok) {
    return { ok: false, error: result.error, message: result.message };
  }

  if (result.stolen) {
    for (const other of io.sockets.sockets.values()) {
      if (
        other.id !== socket.id &&
        other.data.role === "cluster" &&
        other.data.clusterNumber === payload.clusterNumber
      ) {
        other.emit("error", { message: "Another phone took over this cluster." });
        releaseClusterClient(other);
      }
    }
  }

  if (socket.data.clusterNumber != null && socket.data.clusterNumber !== payload.clusterNumber) {
    socket.leave(`cluster:${socket.data.clusterNumber}`);
  }
  socket.data.role = "cluster";
  socket.data.clusterNumber = payload.clusterNumber;
  socket.join(`cluster:${payload.clusterNumber}`);

  const view = engine.clusterView(payload.clusterNumber);
  return {
    ok: true,
    role: "cluster",
    token: result.token,
    clusterNumber: payload.clusterNumber,
    snapshot: engine.snapshot(),
    view: view ?? undefined,
  };
}
