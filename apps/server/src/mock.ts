/**
 * Keyboard-driven mock of the real game engine.
 *
 *   npm run mock
 *   npm run mock -- --bots
 *
 * Keys
 *   n / space  advance to the next phase
 *   b          go back one phase
 *   r          reveal using the server answer key (only on a reveal step)
 *   v          cast random votes for every cluster (only while voting is open)
 *   p          grant Insurance/Amplify/Foresight to the current top 3
 *   s          print a compact snapshot
 *   q          quit
 */
import http from "node:http";
import readline from "node:readline";
import express from "express";
import { Server } from "socket.io";
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from "@engine/shared";
import { ANSWER_KEY } from "./answer-key.ts";
import { GameEngine } from "./engine.ts";
import { attachSockets } from "./sockets.ts";

const PORT = Number(process.env.PORT ?? 3001);
const bots = process.argv.includes("--bots");

const engine = new GameEngine({
  joinUrl: `http://localhost:${PORT}/play`,
});

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true, mock: true, phase: engine.step.phase }));
app.get("/api/snapshot", (_req, res) => res.json(engine.snapshot()));

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  server,
  { cors: { origin: true } },
);
attachSockets(io, engine);

function pushViews(): void {
  io.emit("snapshot", engine.snapshot());
  for (let n = 1; n <= engine.clusterCount; n++) {
    const view = engine.clusterView(n);
    const record = engine.getCluster(n);
    if (view && record?.socketId) {
      io.to(record.socketId).emit("clusterView", view);
    }
  }
}

function status(): void {
  const snap = engine.snapshot();
  const q = snap.question;
  console.log(
    `\n[${snap.stepIndex + 1}/${snap.stepCount}] ${snap.phase}` +
      (snap.roundId ? ` ${snap.roundId}` : "") +
      (snap.questionIndex ? ` Q${snap.questionIndex}` : "") +
      `  | connected ${snap.connectedCount}/${snap.clusterCount}` +
      `  | locked ${snap.lockedCount}`,
  );
  if (q) console.log(`  Q: ${q.prompt}`);
  if (snap.clue) console.log(`  Clue: ${snap.clue.title} — ${snap.clue.body}`);
}

function randomVotes(): void {
  const q = engine.getCurrentQuestion();
  if (!q) {
    console.log("No active question.");
    return;
  }
  const final = q.roundId === "FINAL";
  const vote = (n: number) => {
    const option = q.options[Math.floor(Math.random() * q.options.length)]!;
    const wager = final
      ? null
      : Math.round((0.5 + Math.floor(Math.random() * 11) * 0.1) * 10) / 10;
    engine.submitVote(n, q.id, option.id, wager);
  };
  for (let n = 1; n <= engine.clusterCount; n++) {
    if (engine.getCluster(n)?.power?.type === "foresight") continue;
    vote(n);
  }
  for (let n = 1; n <= engine.clusterCount; n++) {
    if (engine.getCluster(n)?.power?.type === "foresight") vote(n);
  }
  pushViews();
  console.log(`Cast random votes for ${engine.clusterCount} clusters.`);
}

function reveal(): void {
  const q = engine.getCurrentQuestion();
  if (!q) {
    console.log("No active question.");
    return;
  }
  const correct = ANSWER_KEY[q.id];
  if (!correct) {
    console.log(`No answer key for ${q.id}`);
    return;
  }
  const result = engine.reveal(correct);
  if (!result.ok) {
    console.log(result.message);
    return;
  }
  for (let n = 1; n <= engine.clusterCount; n++) {
    const record = engine.getCluster(n);
    if (record?.socketId) {
      io.to(record.socketId).emit("revealResult", {
        questionId: result.questionId,
        correctOptionId: correct,
        yourResult: result.results.get(n) ?? null,
      });
    }
  }
  pushViews();
  console.log(`Revealed ${q.id} → ${correct}`);
}

function grant(): void {
  const top = engine.topClusterNumbers(3);
  const powers = ["insurance", "amplify", "foresight"] as const;
  const grants = top.map((clusterNumber, i) => ({
    clusterNumber,
    power: powers[i]!,
  }));
  engine.grantPowers(grants);
  io.emit("powersGranted", { grants });
  pushViews();
  console.log("Granted", grants);
}

function broadcastAdvance(): void {
  engine.advance();
  if (bots && (engine.step.phase === "voting_open" || engine.step.phase === "final_inference_open")) {
    randomVotes();
  }
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
  pushViews();
  status();
}

server.listen(PORT, () => {
  console.log(`Mock engine on http://localhost:${PORT}`);
  console.log("Mobile UI: npm run dev:web → http://localhost:5173/play");
  console.log("Mobile team: io('http://localhost:3001') then emit 'join'");
  if (bots) console.log("--bots: random votes fire whenever voting opens");
  status();
  console.log("Keys: [n]ext  [b]ack  [r]eveal  [v]otes  [p]owers  [s]tatus  [q]uit");

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on("keypress", (_str, key: { name?: string; ctrl?: boolean; sequence?: string }) => {
    if (key.ctrl && key.name === "c") process.exit(0);
    switch (key.name) {
      case "n":
      case "space":
        broadcastAdvance();
        break;
      case "b":
        engine.back();
        pushViews();
        status();
        break;
      case "r":
        reveal();
        status();
        break;
      case "v":
        randomVotes();
        status();
        break;
      case "p":
        grant();
        status();
        break;
      case "s":
        console.log(JSON.stringify(engine.snapshot(), null, 2));
        break;
      case "q":
        process.exit(0);
        break;
      default:
        break;
    }
  });
});
