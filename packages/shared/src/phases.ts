import type { PhaseStep, RoundId } from "./types.ts";

function roundSteps(roundId: RoundId): PhaseStep[] {
  return [
    { phase: "clue", roundId },
    { phase: "voting_open", roundId, questionIndex: 1 },
    { phase: "voting_locked", roundId, questionIndex: 1 },
    { phase: "reveal", roundId, questionIndex: 1 },
    { phase: "voting_open", roundId, questionIndex: 2 },
    { phase: "voting_locked", roundId, questionIndex: 2 },
    { phase: "reveal", roundId, questionIndex: 2 },
    { phase: "weight_update", roundId },
  ];
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
