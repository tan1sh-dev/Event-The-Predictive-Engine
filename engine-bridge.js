/**
 * Live engine bridge. Keep this file separate so the projector scene
 * in index.js can keep being edited on :5173.
 */
import { io } from "socket.io-client";

function engineUrl() {
  const { hostname, protocol, port } = window.location;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  if (local && port !== "3001") return `${protocol}//${hostname}:3001`;
  return undefined;
}

function applySnapshot(snap) {
  if (!snap) return;
  window.__engineLive = true;
  if (typeof window.applyEngineSnapshot === "function") {
    window.applyEngineSnapshot(snap);
  }
  if (!Array.isArray(snap.clusters) || typeof window.updateClusterWeight !== "function") return;
  for (const cluster of snap.clusters) {
    window.updateClusterWeight(cluster.number, cluster.visualWeight);
  }
}

function connectWhenReady() {
  if (typeof window.updateClusterWeight !== "function") {
    requestAnimationFrame(connectWhenReady);
    return;
  }

  const socket = io(engineUrl(), { transports: ["websocket", "polling"] });
  const join = () => {
    socket.emit("join", { role: "stage" }, (ack) => {
      if (ack?.ok) applySnapshot(ack.snapshot);
    });
  };
  socket.on("connect", join);
  socket.on("snapshot", applySnapshot);
  socket.on("weightsUpdated", (payload) => {
    if (payload?.clusters) applySnapshot({ clusters: payload.clusters });
  });
}

connectWhenReady();
