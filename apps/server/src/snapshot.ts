import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GameEngine } from "./engine.ts";

export function snapshotPath(): string {
  if (process.env.SNAPSHOT_PATH) return path.resolve(process.env.SNAPSHOT_PATH);
  if (process.env.VERCEL) return path.join("/tmp", "engine-state.json");
  return path.resolve(process.cwd(), "data/state.json");
}

export async function persist(engine: GameEngine): Promise<void> {
  const file = snapshotPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ savedAt: new Date().toISOString(), state: engine.serialize() }, null, 2),
    "utf8",
  );
}

export async function restore(engine: GameEngine): Promise<boolean> {
  try {
    const raw = JSON.parse(await readFile(snapshotPath(), "utf8")) as {
      state: unknown;
    };
    engine.restore(raw.state);
    return true;
  } catch {
    return false;
  }
}
