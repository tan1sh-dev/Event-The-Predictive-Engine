import type { EnsembleBar, OptionId } from "@engine/shared";

export const PHASE_LABEL: Record<string, string> = {
  lobby: "Lobby",
  clue: "Clue",
  voting_open: "Voting",
  voting_locked: "Locked",
  reveal: "Reveal",
  weight_update: "Weight update",
  mic_moment: "Mic moment",
  power_grant: "Power grant",
  active_query: "Active query",
  freeze: "Freeze",
  final_inference_open: "Final testing",
  final_inference_locked: "Engine calculating",
  ensemble: "Prediction",
  final_reveal: "Truth",
  debrief: "Debrief",
};

export const LETTER: Record<string, string> = {
  a: "A",
  b: "B",
  c: "C",
  d: "D",
};

export type EngineVerdictStatus = "pending" | "hit" | "miss";

export interface EngineVerdict {
  /** Highest weighted-vote option — the engine's call. Null when nobody locked in. */
  pick: EnsembleBar | null;
  /** Top two options are tied on weight — the engine had to break a coin-flip. */
  tie: boolean;
  /** At least one cluster's weight landed on an option. */
  hasVotes: boolean;
  correctOptionId: OptionId | null;
  /** pending until the truth is revealed, then hit or miss. */
  status: EngineVerdictStatus;
}

/**
 * Reduce the final ensemble to a single verdict the UI can react to.
 * Being ready for a wrong prediction means the miss path is first-class,
 * not an afterthought — this powers both the phone reveal and the host panel.
 */
export function engineVerdict(
  ensemble: EnsembleBar[] | null | undefined,
  correctOptionId: OptionId | null | undefined,
): EngineVerdict {
  const bars = ensemble ?? [];
  const hasVotes = bars.some((b) => b.score > 0);
  const ranked = [...bars].sort((a, b) => b.score - a.score);
  const pick = hasVotes ? ranked[0] ?? null : null;
  const tie =
    hasVotes &&
    ranked.length > 1 &&
    Math.abs((ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0)) < 1e-9;

  let status: EngineVerdictStatus = "pending";
  if (correctOptionId && pick) {
    status = pick.optionId === correctOptionId ? "hit" : "miss";
  }

  return { pick, tie, hasVotes, correctOptionId: correctOptionId ?? null, status };
}
