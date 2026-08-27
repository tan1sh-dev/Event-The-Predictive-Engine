import { MIN_CLUSTER_COUNT, type HostPlayRoundId, type PhaseStep, type RoundId } from "./types.ts";
import { ROUNDS } from "./game-config.ts";

function roundSteps(roundId: RoundId): PhaseStep[] {
  const round = ROUNDS.find((r) => r.id === roundId);
  if (!round) throw new Error(`Unknown round ${roundId}`);
  const questionSteps: PhaseStep[] = round.questions.flatMap((question) => [
    { phase: "voting_open", roundId, questionIndex: question.index },
    { phase: "voting_locked", roundId, questionIndex: question.index },
    { phase: "reveal", roundId, questionIndex: question.index },
  ]);
  return [{ phase: "clue", roundId }, ...questionSteps, { phase: "weight_update", roundId }];
}

/** Canonical host-advance order. R5 is the last scored round. */
export const PHASE_SEQUENCE: PhaseStep[] = [
  { phase: "lobby" },
  ...roundSteps("R0"),
  ...roundSteps("R1"),
  ...roundSteps("R2"),
  { phase: "mic_moment" },
  ...roundSteps("R3"),
  { phase: "power_grant" },
  ...roundSteps("R4"),
  ...roundSteps("R5"),
  { phase: "active_query" },
  { phase: "freeze" },
  { phase: "final_inference_open", roundId: "FINAL", questionIndex: 1 },
  { phase: "final_inference_locked", roundId: "FINAL", questionIndex: 1 },
  { phase: "ensemble", roundId: "FINAL", questionIndex: 1 },
  { phase: "final_reveal", roundId: "FINAL", questionIndex: 1 },
  { phase: "debrief" },
];

export function isVotingOpen(phase: PhaseStep["phase"]): boolean {
  return phase === "voting_open" || phase === "final_inference_open";
}

export function isFinalInference(phase: PhaseStep["phase"]): boolean {
  return phase === "final_inference_open" || phase === "final_inference_locked";
}

export function isFinalTestingPhase(phase: PhaseStep["phase"]): boolean {
  return (
    phase === "final_inference_open" ||
    phase === "final_inference_locked" ||
    phase === "ensemble" ||
    phase === "final_reveal"
  );
}

export function roundStartIndex(roundId: RoundId | "FINAL"): number {
  if (roundId === "FINAL") {
    return PHASE_SEQUENCE.findIndex((s) => s.phase === "final_inference_open");
  }
  return PHASE_SEQUENCE.findIndex((s) => s.phase === "clue" && s.roundId === roundId);
}

export const HOST_PLAY_ROUNDS: { id: HostPlayRoundId; label: string; title: string }[] = [
  { id: "R0", label: "Play Round 0", title: "Viral clip" },
  { id: "R1", label: "Play Round 1", title: "Their Last Purchases" },
  { id: "R2", label: "Play Round 2", title: "The Vibe Check" },
  { id: "R3", label: "Play Round 3", title: "The Reality Check" },
  { id: "R4", label: "Play Round 4", title: "Is There a Lie?" },
  { id: "R5", label: "Play Round 5", title: "The Ambition Trap" },
  { id: "FINAL", label: "Play Final Testing Round", title: "Latent space" },
];

const SCORED_PLAY_ROUNDS: RoundId[] = ["R0", "R1", "R2", "R3", "R4", "R5"];

export function lastStepIndexForRound(roundId: RoundId): number {
  for (let i = PHASE_SEQUENCE.length - 1; i >= 0; i--) {
    if (PHASE_SEQUENCE[i]?.roundId === roundId) return i;
  }
  return -1;
}

export function previousPlayRound(roundId: HostPlayRoundId): RoundId | null {
  if (roundId === "FINAL") return "R5";
  const idx = SCORED_PLAY_ROUNDS.indexOf(roundId);
  if (idx <= 0) return null;
  return SCORED_PLAY_ROUNDS[idx - 1] ?? null;
}

export function isPlayRoundUnlocked(
  roundId: HostPlayRoundId,
  opts: { furthestStepIndex: number; weightsFrozen: boolean; clusterCount: number },
): boolean {
  if (opts.clusterCount < MIN_CLUSTER_COUNT) return false;
  if (roundId === "FINAL") return opts.weightsFrozen;
  if (roundId === "R0") return true;
  const prev = previousPlayRound(roundId);
  if (!prev) return false;
  return opts.furthestStepIndex >= lastStepIndexForRound(prev);
}

export function unlockedPlayRoundIds(opts: {
  furthestStepIndex: number;
  weightsFrozen: boolean;
  clusterCount: number;
}): HostPlayRoundId[] {
  return HOST_PLAY_ROUNDS.map((round) => round.id).filter((id) => isPlayRoundUnlocked(id, opts));
}

export function playRoundLockedMessage(roundId: HostPlayRoundId): string {
  if (roundId === "FINAL") {
    return "Lock weights before starting the final testing round.";
  }
  const prev = previousPlayRound(roundId);
  if (!prev) return "Set how many clusters before starting a round.";
  return `Finish Round ${prev.slice(1)} before playing this round.`;
}
