import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function mime(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".mp3")) return "audio/mpeg";
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
}

function projectorFromRepo(): Plugin {
  return {
    name: "projector-from-repo-root",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        let rel: string | null = null;
        if (url.startsWith("/stage-static")) {
          rel = decodeURIComponent(url.slice("/stage-static".length));
          if (rel === "" || rel === "/") rel = "/index.html";
        } else if (url.startsWith("/media/")) {
          rel = decodeURIComponent(url);
        } else {
          return next();
        }
        const file = path.resolve(repoRoot, `.${rel}`);
        if (!file.startsWith(repoRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next();
        }
        res.setHeader("Content-Type", mime(file));
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), projectorFromRepo()],
  server: {
    host: true,
    port: 5173,
    fs: { allow: [repoRoot] },
    proxy: {
      "/socket.io": { target: "http://localhost:3001", ws: true },
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
