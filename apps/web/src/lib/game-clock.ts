import type { GameClock } from "@engine/shared";

export type ClockKind = "vote" | "clue" | "power";

let latest: GameClock | null = null;
const listeners = new Set<() => void>();

export function ingestGameClock(payload: GameClock): void {
  latest = payload;
  for (const listener of listeners) listener();
}

export function getGameClock(): GameClock | null {
  return latest;
}

export function subscribeGameClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function remainingMsFromClock(kind: ClockKind, deadlineAt: number | null | undefined): number | null {
  if (!latest) return null;
  const deadline =
    kind === "vote"
      ? latest.voteDeadlineAt
      : kind === "clue"
        ? latest.clueDeadlineAt
        : latest.powerGrantDeadlineAt;
  const remaining =
    kind === "vote"
      ? latest.voteRemainingMs
      : kind === "clue"
        ? latest.clueRemainingMs
        : latest.powerGrantRemainingMs;
  if (deadline == null || remaining == null) return null;
  if (deadlineAt != null && deadline !== deadlineAt) return null;
  return remaining;
}
