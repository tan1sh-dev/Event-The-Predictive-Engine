/** Unset until the host enters a count in the lobby. */
export const CLUSTER_COUNT = 0;
export const MIN_CLUSTER_COUNT = 2;
export const MAX_CLUSTER_COUNT = 40;
export const INITIAL_WEIGHT = 1;
export const LOW_WAGER = 0.5;
export const HIGH_WAGER = 1.5;
export const MID_WAGER = 1;
export const WAGER_STEP = 0.1;

export type RoundId = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
export type ClientRole = "cluster" | "stage" | "host";
export type Wager = number;

export function normalizeWager(raw: unknown): Wager | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < LOW_WAGER - 1e-9 || raw > HIGH_WAGER + 1e-9) return null;
  const steps = Math.round((raw - LOW_WAGER) / WAGER_STEP);
  const snapped = Math.round((LOW_WAGER + steps * WAGER_STEP) * 10) / 10;
  if (snapped < LOW_WAGER || snapped > HIGH_WAGER) return null;
  return snapped;
}
export type PowerUp = "insurance" | "amplify" | "foresight";
export type MediaType = "image" | "audio" | "screenshot";
export type OptionId = string;

export type PhaseId =
  | "lobby"
  | "clue"
  | "voting_open"
  | "voting_locked"
  | "reveal"
  | "weight_update"
  | "mic_moment"
  | "power_grant"
  | "active_query"
  | "freeze"
  | "final_inference_open"
  | "final_inference_locked"
  | "ensemble"
  | "final_reveal"
  | "debrief";

export interface MediaAsset {
  type: MediaType;
  src: string;
  caption?: string;
}

export interface QuestionOption {
  id: OptionId;
  label: string;
}

export interface Question {
  id: string;
  roundId: RoundId | "FINAL";
  index: 1 | 2;
  prompt: string;
  hint?: string;
  media?: MediaAsset;
  options: QuestionOption[];
  wagerRequired: boolean;
}

export interface RoundConfig {
  id: RoundId;
  title: string;
  theme: string;
  calibration: boolean;
  clue: {
    title: string;
    body: string;
    media?: MediaAsset;
  };
  questions: [Question, Question];
}

export interface PhaseStep {
  phase: PhaseId;
  roundId?: RoundId;
  questionIndex?: 1 | 2;
}

export interface PendingVote {
  optionId: OptionId;
  wager: Wager | null;
  submittedAt: number;
}

export interface PowerState {
  type: PowerUp;
  used: boolean;
}

export interface QuestionResult {
  questionId: string;
  optionId: OptionId;
  wager: Wager | null;
  correct: boolean;
  y: 1 | -1 | 0;
  alpha: number;
  weightBefore: number;
  weightAfter: number;
  powerApplied: PowerUp | null;
}

export interface TeamDetails {
  teamName: string;
  leaderName: string;
  /** Exactly four remaining teammates. */
  members: string[];
}

export interface PublicClusterState {
  number: number;
  connected: boolean;
  weight: number;
  /** 0–1 relative to the current heaviest cluster. Use this for orb size. */
  visualWeight: number;
  /** Shares that sum to 1 across all clusters. */
  normalizedWeight: number;
  hasVoted: boolean;
  power: PowerState | null;
  team: TeamDetails | null;
}

export interface EnsembleBar {
  optionId: OptionId;
  label: string;
  score: number;
  pct: number;
}

export interface GameSnapshot {
  phase: PhaseId;
  stepIndex: number;
  stepCount: number;
  roundId: RoundId | null;
  questionIndex: 1 | 2 | null;
  question: Question | null;
  clue: RoundConfig["clue"] | null;
  roundTitle: string | null;
  clusters: PublicClusterState[];
  connectedCount: number;
  lockedCount: number;
  crowdLockedCount: number;
  foresightWaitingCount: number;
  clusterCount: number;
  weightsFrozen: boolean;
  topClusterNumbers: number[];
  ensemble: EnsembleBar[] | null;
  correctOptionId: OptionId | null;
  joinUrl: string | null;
}

/** Per-cluster private view. Broadcast only to that cluster's socket. */
export interface ClusterView {
  clusterNumber: number;
  token: string;
  snapshot: GameSnapshot;
  pendingVote: PendingVote | null;
  lastResult: QuestionResult | null;
  power: PowerState | null;
  canClaimPower: boolean;
  isTopThree: boolean;
  /** Unused Foresight: still waiting for the rest of the room to lock. */
  foresightWaiting: boolean;
  /** Crowd split shown only to a Foresight holder after everyone else has voted. */
  crowdSplit: VoteSplitEntry[] | null;
}

export interface JoinPayload {
  role: ClientRole;
  clusterNumber?: number;
  token?: string;
  hostPassword?: string;
  team?: TeamDetails;
}

export type JoinAck =
  | {
      ok: true;
      role: ClientRole;
      token?: string;
      clusterNumber?: number;
      snapshot: GameSnapshot;
      view?: ClusterView;
    }
  | {
      ok: false;
      error:
        | "invalid_cluster"
        | "cluster_in_use"
        | "bad_token"
        | "bad_password"
        | "missing_cluster_number"
        | "invalid_team"
        | "game_reset";
      message: string;
    };

export interface SubmitVotePayload {
  questionId: string;
  optionId: OptionId;
  wager?: Wager | null;
}

export type VoteAck =
  | { ok: true; pendingVote: PendingVote }
  | {
      ok: false;
      error:
        | "not_a_cluster"
        | "voting_closed"
        | "wrong_question"
        | "invalid_option"
        | "wager_required"
        | "wager_not_allowed"
        | "already_locked"
        | "foresight_wait";
      message: string;
    };

export interface UsePowerPayload {
  power: PowerUp;
}

export interface ClaimPowerPayload {
  power: PowerUp;
}

export type PowerAck =
  | { ok: true; power: PowerState; split?: VoteSplitEntry[] }
  | {
      ok: false;
      error:
        | "not_a_cluster"
        | "no_power"
        | "already_used"
        | "wrong_phase"
        | "not_top_three"
        | "already_claimed"
        | "passive_power";
      message: string;
    };

export interface VoteSplitEntry {
  optionId: OptionId;
  label: string;
  count: number;
  /** 0–1 share of the crowd (non-foresight) vote. */
  pct: number;
}

export interface HostGrantPowersPayload {
  grants: { clusterNumber: number; power: PowerUp }[];
}

export interface HostRevealPayload {
  correctOptionId: OptionId;
}

export interface HostSetWeightPayload {
  clusterNumber: number;
  weight: number;
}

export interface HostKickPayload {
  clusterNumber: number;
}

export interface HostSetClusterCountPayload {
  clusterCount: number;
}

export type HostAck =
  | { ok: true }
  | { ok: false; error: "not_host" | "illegal_transition" | "bad_payload"; message: string };

export interface ClientToServerEvents {
  join: (payload: JoinPayload, cb: (res: JoinAck) => void) => void;
  submitVote: (payload: SubmitVotePayload, cb: (res: VoteAck) => void) => void;
  usePower: (payload: UsePowerPayload, cb: (res: PowerAck) => void) => void;
  claimPower: (payload: ClaimPowerPayload, cb: (res: PowerAck) => void) => void;
  hostAdvance: (cb: (res: HostAck) => void) => void;
  hostBack: (cb: (res: HostAck) => void) => void;
  hostReveal: (payload: HostRevealPayload, cb: (res: HostAck) => void) => void;
  hostGrantPowers: (payload: HostGrantPowersPayload, cb: (res: HostAck) => void) => void;
  hostSetWeight: (payload: HostSetWeightPayload, cb: (res: HostAck) => void) => void;
  hostKick: (payload: HostKickPayload, cb: (res: HostAck) => void) => void;
  hostSetClusterCount: (payload: HostSetClusterCountPayload, cb: (res: HostAck) => void) => void;
  hostReset: (cb: (res: HostAck) => void) => void;
}

export interface ServerToClientEvents {
  snapshot: (state: GameSnapshot) => void;
  clusterView: (view: ClusterView) => void;
  voteProgress: (payload: { lockedCount: number; connectedCount: number; clusterCount: number }) => void;
  revealResult: (payload: {
    questionId: string;
    correctOptionId: OptionId;
    yourResult: QuestionResult | null;
  }) => void;
  weightsUpdated: (payload: {
    roundId: RoundId;
    discarded: boolean;
    clusters: PublicClusterState[];
  }) => void;
  powersGranted: (payload: { grants: { clusterNumber: number; power: PowerUp }[] }) => void;
  ensembleResult: (payload: { bars: EnsembleBar[] }) => void;
  error: (payload: { message: string }) => void;
}

export interface SocketData {
  role?: ClientRole;
  clusterNumber?: number;
  authenticatedHost?: boolean;
}
