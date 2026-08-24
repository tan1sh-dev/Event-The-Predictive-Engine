import type { HostPlayRoundId, PhaseStep, RoundId } from "./types.ts";
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
  { phase: "clue", roundId: "FINAL" },
  { phase: "final_inference_open" },
  { phase: "final_inference_locked" },
  { phase: "ensemble" },
  { phase: "final_reveal" },
  { phase: "debrief" },
];

export function isVotingOpen(phase: PhaseStep["phase"]): boolean {
  return phase === "voting_open" || phase === "final_inference_open";
}

export function isFinalInference(phase: PhaseStep["phase"]): boolean {
  return phase === "final_inference_open" || phase === "final_inference_locked";
}

export function roundStartIndex(roundId: RoundId | "FINAL"): number {
  return PHASE_SEQUENCE.findIndex((s) => s.phase === "clue" && s.roundId === roundId);
}

export const HOST_PLAY_ROUNDS: { id: HostPlayRoundId; label: string; title: string }[] = [
  { id: "R0", label: "Play Round 0", title: "Main character energy" },
  { id: "R1", label: "Play Round 1", title: "Their Last Purchases" },
  { id: "R2", label: "Play Round 2", title: "The Vibe Check" },
  { id: "R3", label: "Play Round 3", title: "The Reality Check" },
  { id: "R4", label: "Play Round 4", title: "Is There a Lie?" },
  { id: "R5", label: "Play Round 5", title: "The Ambition Trap" },
  { id: "FINAL", label: "Play Final Testing Round", title: "Latent space" },
];
