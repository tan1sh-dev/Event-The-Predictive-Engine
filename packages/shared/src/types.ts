/** Unset until the host enters a count in the lobby. */
export const CLUSTER_COUNT = 0;
export const MIN_CLUSTER_COUNT = 2;
export const MAX_CLUSTER_COUNT = 40;
export const INITIAL_WEIGHT = 1;
export const LOW_WAGER = 0.5;
export const HIGH_WAGER = 1.5;
export const MID_WAGER = 1;
export const WAGER_STEP = 0.1;
/** Projector-only look-up before the question lands on phones. */
export const CLUE_DURATION_MS = 30_000;
/** Round 2 plays the SIP video to the end — no projector countdown. */
export const R2_CLUE_DURATION_MS = null;
/** Round 5 plays the tab screen-recording to the end — no projector countdown. */
export const R5_CLUE_DURATION_MS = null;
/** Host-started clock on each scored question. */
export const VOTE_DURATION_MS = 90_000;
/** Round 0 warm-up: meme video plays to the end — no projector countdown. */
export const R0_CLUE_DURATION_MS = null;
/** Round 0 warm-up: shorter phone vote clock. */
export const R0_VOTE_DURATION_MS = 30_000;
/** Extra window if Foresight is still waiting when the main clock hits 0. */
export const FORESIGHT_GRACE_MS = 15_000;
/** Top-3 pick window after Round 3 weight update. */
export const POWER_GRANT_DURATION_MS = 30_000;
/** Theatrical pause after the final 90s lock — projector shows “engine calculating”. */
export const ENSEMBLE_CALCULATING_MS = 6_000;
/** Insurance, Amplify, and Foresight only resolve on this question. */
export const POWER_QUESTION_ID = "r4-q1";
/**
 * Silence is scored as a max-risk miss: y = −1, α = 1.5.
 * Same AdaBoost update as locking High Risk and being wrong — not y = −2.
 */
export const NO_VOTE_ALPHA = HIGH_WAGER;

export type RoundId = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
/** Host "Play round" buttons: warm-up R0, scored rounds 1–5, plus the final inference. */
export type HostPlayRoundId = RoundId | "FINAL";

export function isPowerQuestion(
  roundId: RoundId | "FINAL" | null | undefined,
  questionIndex: 1 | 2 | null | undefined,
): boolean {
  return roundId === "R4" && questionIndex === 1;
}

export function clueDurationForRound(roundId: RoundId | "FINAL" | null | undefined): number | null {
  if (roundId === "R0") return R0_CLUE_DURATION_MS;
  if (roundId === "R2") return R2_CLUE_DURATION_MS;
  if (roundId === "R5") return R5_CLUE_DURATION_MS;
  return CLUE_DURATION_MS;
}

export function voteDurationForRound(roundId: RoundId | "FINAL" | null | undefined): number {
  return roundId === "R0" ? R0_VOTE_DURATION_MS : VOTE_DURATION_MS;
}
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
export type MediaType = "image" | "audio" | "screenshot" | "video";
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
  /** Projector videos default to muted autoplay. Set false to sit paused with sound on and native controls. */
  autoplay?: boolean;
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
  /** One or two scored questions. R1 and R2 are single-question rounds. */
  questions: Question[];
}

export interface PhaseStep {
  phase: PhaseId;
  roundId?: RoundId | "FINAL";
  questionIndex?: 1 | 2;
}

export interface PendingVote {
  questionId: string;
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
  /** 0–4 teammates besides the leader (total group size 1–5). */
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
  /** Weight when this scored round began, before any of its questions were applied. */
  roundWeightBefore: number | null;
  /** Weight after every question in this scored round was applied. */
  roundWeightAfter: number | null;
}

export interface EnsembleBar {
  optionId: OptionId;
  label: string;
  score: number;
  pct: number;
}

export interface FinalEnvironment {
  optionId: OptionId;
  letter: string;
  src: string;
  caption: string;
}

export interface GameSnapshot {
  phase: PhaseId;
  stepIndex: number;
  stepCount: number;
  roundId: RoundId | "FINAL" | null;
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
  /** Host Play-round buttons that may be started. Later rounds stay locked until the previous one finishes; FINAL waits for weightsFrozen. */
  unlockedPlayRoundIds: HostPlayRoundId[];
  topClusterNumbers: number[];
  ensemble: EnsembleBar[] | null;
  /** Three A/B/C environment stills for the final testing projector. Null outside that round. */
  finalEnvironments: FinalEnvironment[] | null;
  correctOptionId: OptionId | null;
  joinUrl: string | null;
  /** Epoch ms when the current scored vote window ends. Null if no clock. */
  voteDeadlineAt: number | null;
  /** Epoch ms when the projector-only clue window ends. Null if no clock. */
  clueDeadlineAt: number | null;
  /** Epoch ms when the top-3 power pick window ends. Null if no clock. */
  powerGrantDeadlineAt: number | null;
  /** Epoch ms when the final “engine calculating” beat ends. Null if no clock. */
  calculatingDeadlineAt: number | null;
  /** True while Foresight holders have their extra 15s after the room clock. */
  foresightGraceActive: boolean;
  /** Epoch ms when this clue play started. Changes if the host replays the round. */
  clueStartedAt: number | null;
  /** Server clock at snapshot time — clients use this to correct skew. */
  serverTime: number;
}

/** Shared countdown pulse so projector, host, and phones show the same second. */
export interface GameClock {
  serverTime: number;
  voteDeadlineAt: number | null;
  clueDeadlineAt: number | null;
  powerGrantDeadlineAt: number | null;
  calculatingDeadlineAt: number | null;
  voteRemainingMs: number | null;
  clueRemainingMs: number | null;
  powerGrantRemainingMs: number | null;
  calculatingRemainingMs: number | null;
}

/** Per-cluster private view. Broadcast only to that cluster's socket. */
export interface ClusterView {
  clusterNumber: number;
  token: string;
  snapshot: GameSnapshot;
  pendingVote: PendingVote | null;
  lastResult: QuestionResult | null;
  /** Weight before any question in the current scored round was applied. */
  roundWeightBefore: number | null;
  /** Weight after every question in the current scored round was applied. */
  roundWeightAfter: number | null;
  power: PowerState | null;
  canClaimPower: boolean;
  isTopThree: boolean;
  /** Unused Foresight on R4 Q1: watching the question, cannot lock in yet. */
  foresightWaiting: boolean;
  /** Crowd split shown only to a Foresight holder during the extra 15s. */
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

export interface HostPlayRoundPayload {
  roundId: HostPlayRoundId;
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
  hostPlayRound: (payload: HostPlayRoundPayload, cb: (res: HostAck) => void) => void;
  /** Projector: untimed clue media finished (R0 / R2 / R5 video). Opens the phone question. */
  stageClueEnded: (cb?: (res: { ok: boolean }) => void) => void;
  hostReveal: (payload: HostRevealPayload, cb: (res: HostAck) => void) => void;
  hostGrantPowers: (payload: HostGrantPowersPayload, cb: (res: HostAck) => void) => void;
  hostSetWeight: (payload: HostSetWeightPayload, cb: (res: HostAck) => void) => void;
  hostKick: (payload: HostKickPayload, cb: (res: HostAck) => void) => void;
  hostSetClusterCount: (payload: HostSetClusterCountPayload, cb: (res: HostAck) => void) => void;
  hostReset: (cb: (res: HostAck) => void) => void;
}

export type SessionResetReason = "game_reset" | "kicked";

export interface ServerToClientEvents {
  snapshot: (state: GameSnapshot) => void;
  clusterView: (view: ClusterView) => void;
  clock: (payload: GameClock) => void;
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
  /** Host ended this phone's session. Mobile UI must reopen the team-details form. */
  sessionReset: (payload: { reason: SessionResetReason }) => void;
}

export interface SocketData {
  role?: ClientRole;
  clusterNumber?: number;
  authenticatedHost?: boolean;
}
