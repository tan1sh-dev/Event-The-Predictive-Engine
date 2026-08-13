import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@engine/shared";
import { GameEngine } from "./engine.ts";
import { restore } from "./snapshot.ts";
import { attachSockets } from "./sockets.ts";

const PORT = Number(process.env.PORT ?? 3001);
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

const engine = new GameEngine({
  joinUrl: `${PUBLIC_URL.replace(/\/$/, "")}/play`,
});

if (process.env.RESTORE !== "0") {
  restore(engine).then((ok) => {
    if (ok) console.log("Restored game snapshot from disk");
  });
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, phase: engine.snapshot().phase });
});

app.get("/api/snapshot", (_req, res) => {
  res.json(engine.snapshot());
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
app.get("/stage-static/index.html", (_req, res) => {
  res.sendFile(path.join(repoRoot, "index.html"));
});
app.get("/stage-static/index.js", (_req, res) => {
  res.sendFile(path.join(repoRoot, "index.js"));
});
app.get("/stage-static/engine-bridge.js", (_req, res) => {
  res.sendFile(path.join(repoRoot, "engine-bridge.js"));
});
app.use("/stage-static/assets", express.static(path.join(repoRoot, "assets")));
app.use("/media", express.static(path.join(repoRoot, "media")));

const webDist = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../web/dist");
app.use(express.static(webDist));

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  server,
  { cors: { origin: true } },
);

attachSockets(io, engine);

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (
    req.path.startsWith("/socket.io") ||
    req.path.startsWith("/api") ||
    req.path.startsWith("/health") ||
    req.path.startsWith("/stage-static") ||
    req.path.startsWith("/media")
  ) {
    return next();
  }
  if (req.path.includes(".")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) next();
  });
});

server.listen(PORT, () => {
  console.log(`Predictive Engine server on ${PUBLIC_URL}`);
  console.log(`  projector static: ${PUBLIC_URL}/stage-static/index.html`);
  console.log(`  socket.io path:   /socket.io`);
});
