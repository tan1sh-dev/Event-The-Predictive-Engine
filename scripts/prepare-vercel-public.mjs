import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const webDist = path.join(root, "apps/web/dist");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name === ".git") continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.rmSync(publicDir, { recursive: true, force: true });
if (!fs.existsSync(webDist)) {
  throw new Error("apps/web/dist missing — run the Vite build first");
}
copyDir(webDist, publicDir);
copyDir(path.join(root, "media"), path.join(publicDir, "media"));

const stageDir = path.join(publicDir, "stage-static");
fs.mkdirSync(stageDir, { recursive: true });
for (const file of ["index.html", "index.js", "engine-bridge.js", "stage-cursor.js"]) {
  fs.copyFileSync(path.join(root, file), path.join(stageDir, file));
}
copyDir(path.join(root, "assets"), path.join(stageDir, "assets"));

console.log("Prepared public/ for Vercel (SPA, media, stage-static)");
