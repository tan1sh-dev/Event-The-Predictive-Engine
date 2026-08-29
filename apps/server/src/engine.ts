import { randomBytes } from "node:crypto";
import {
  CLUSTER_COUNT,
  ENSEMBLE_CALCULATING_MS,
  FINAL_CLUE,
  FINAL_ENVIRONMENTS,
  FINAL_QUESTION,
  FORESIGHT_GRACE_MS,
  INITIAL_WEIGHT,
  MAX_CLUSTER_COUNT,
  MIN_CLUSTER_COUNT,
  NO_VOTE_ALPHA,
  PHASE_SEQUENCE,
  POWER_GRANT_DURATION_MS,
  POWER_QUESTION_ID,
  clueDurationForRound,
  getQuestion,
  getRound,
  isFinalInference,
  isFinalTestingPhase,
  isPlayRoundUnlocked,
  isPowerQuestion,
  isVotingOpen,
  playRoundLockedMessage,
  roundStartIndex,
  unlockedPlayRoundIds,
  voteDurationForRound,
  type ClusterView,
  type EnsembleBar,
  type GameSnapshot,
  type HostPlayRoundId,
  type OptionId,
  type PendingVote,
  type PhaseStep,
  type PowerUp,
  type PublicClusterState,
  type Question,
  type QuestionResult,
  type RoundId,
  type TeamDetails,
  type VoteSplitEntry,
  type Wager,
  normalizeWager,
} from "@engine/shared";

export function newToken(): string {
  return randomBytes(16).toString("hex");
}

export function applyAdaBoost(
  weight: number,
  alpha: number,
  y: 1 | -1 | 0,
): number {
  if (y === 0) return weight;
  return weight * Math.exp(alpha * y);
}

interface ClusterRecord {
  number: number;
  token: string | null;
  socketId: string | null;
  weight: number;
  frozenWeight: number | null;
  pendingVote: PendingVote | null;
  lastResult: QuestionResult | null;
  roundWeightBefore: number | null;
  roundWeightAfter: number | null;
  power: { type: PowerUp; used: boolean } | null;
  roundResults: QuestionResult[];
  team: TeamDetails | null;
  foresightSplit: VoteSplitEntry[] | null;
}

interface QuestionScore {
  questionId: string;
  correctOptionId: OptionId;
  applied: boolean;
}

export interface EngineOptions {
  clusterCount?: number;
  joinUrl?: string;
  now?: () => number;
}

export class GameEngine {
  private _clusterCount: number;
  private joinUrl: string | null;
  private now: () => number;
  private stepIndex = 0;
  /** Furthest phase reached — going back or replaying a round does not relock later rounds. */
  private furthestStepIndex = 0;
  private clusters = new Map<number, ClusterRecord>();
  private scores = new Map<string, QuestionScore>();
  private weightsFrozen = false;
  private ensemble: EnsembleBar[] | null = null;
  private voteDeadlineAt: number | null = null;
  private clueDeadlineAt: number | null = null;
  private clueStartedAt: number | null = null;
  private powerGrantDeadlineAt: number | null = null;
  private calculatingDeadlineAt: number | null = null;
  private foresightGraceArmed = false;

  constructor(opts: EngineOptions = {}) {
    this._clusterCount = opts.clusterCount ?? CLUSTER_COUNT;
    this.joinUrl = opts.joinUrl ?? null;
    this.now = opts.now ?? Date.now;
    this.resetClusters();
  }

  get clusterCount(): number {
    return this._clusterCount;
  }

  /** Full show reset: lobby, default cluster count, new tokens. Returns live socket ids to kick. */
  reset(): string[] {
    const droppedSocketIds = [...this.clusters.values()]
      .map((c) => c.socketId)
      .filter((id): id is string => id != null);
    this.stepIndex = 0;
    this.furthestStepIndex = 0;
    this.scores.clear();
    this.weightsFrozen = false;
    this.ensemble = null;
    this.voteDeadlineAt = null;
    this.clueDeadlineAt = null;
    this.clueStartedAt = null;
    this.powerGrantDeadlineAt = null;
    this.calculatingDeadlineAt = null;
    this.foresightGraceArmed = false;
    this._clusterCount = 0;
    this.clusters = new Map();
    this.resetClusters();
    return droppedSocketIds;
  }

  private resetClusters(): void {
    const previous = this.clusters;
    this.clusters = new Map();
    for (let n = 1; n <= this._clusterCount; n++) {
      const prev = previous.get(n);
      this.clusters.set(n, {
        number: n,
        token: prev?.token ?? null,
        socketId: prev?.socketId ?? null,
        weight: INITIAL_WEIGHT,
        frozenWeight: null,
        pendingVote: null,
        lastResult: null,
        roundWeightBefore: null,
        roundWeightAfter: null,
        power: null,
        roundResults: [],
        team: prev?.team ?? null,
        foresightSplit: null,
      });
    }
  }

  get step(): PhaseStep {
    return PHASE_SEQUENCE[this.stepIndex] ?? PHASE_SEQUENCE[0];
  }

  getCurrentQuestion(): Question | null {
    const step = this.step;
    if (isFinalInference(step.phase) || step.phase === "ensemble" || step.phase === "final_reveal") {
      return FINAL_QUESTION;
    }
    if (!step.roundId || !step.questionIndex) return null;
    return getQuestion(step.roundId, step.questionIndex);
  }

  getCluster(n: number): ClusterRecord | undefined {
    return this.clusters.get(n);
  }

  /** Join or reclaim a cluster. Returns the token to persist in localStorage. */
  joinCluster(
    clusterNumber: number,
    token: string | undefined,
    socketId: string,
    team?: TeamDetails | null,
  ):
    | { ok: true; token: string; stolen: boolean }
    | {
        ok: false;
        error: "invalid_cluster" | "cluster_in_use" | "bad_token";
        message: string;
      } {
    if (
      !Number.isInteger(clusterNumber) ||
      clusterNumber < 1 ||
      clusterNumber > this._clusterCount
    ) {
      return {
        ok: false,
        error: "invalid_cluster",
        message: `Cluster number must be 1–${this._clusterCount}.`,
      };
    }

    const cluster = this.clusters.get(clusterNumber)!;
    const occupied =
      cluster.socketId !== null && cluster.socketId !== socketId;

    if (occupied) {
      if (!token || token !== cluster.token) {
        return {
          ok: false,
          error: "cluster_in_use",
          message:
            "This cluster already has a live phone. Rejoin with the saved token to take over.",
        };
      }
    } else if (cluster.token && token && token !== cluster.token) {
      return {
        ok: false,
        error: "bad_token",
        message: "Token does not match this cluster.",
      };
    }

    if (!cluster.token) cluster.token = newToken();
    const stolen = occupied;
    cluster.socketId = socketId;
    if (team) cluster.team = team;
    return { ok: true, token: cluster.token, stolen };
  }

  disconnectSocket(socketId: string): number | null {
    for (const cluster of this.clusters.values()) {
      if (cluster.socketId === socketId) {
        cluster.socketId = null;
        return cluster.number;
      }
    }
    return null;
  }

  /**
   * Lobby-only. Grow or shrink the room. Existing clusters 1..min keep
   * their tokens/sockets; extra live phones are returned so the socket
   * layer can disconnect them.
   */
  setClusterCount(count: number):
    | { ok: true; droppedSocketIds: string[] }
    | { ok: false; error: "wrong_phase" | "bad_payload"; message: string } {
    if (this.step.phase !== "lobby") {
      return {
        ok: false,
        error: "wrong_phase",
        message: "Cluster count can only be changed in the lobby, before Round 0.",
      };
    }
    if (
      !Number.isInteger(count) ||
      count < MIN_CLUSTER_COUNT ||
      count > MAX_CLUSTER_COUNT
    ) {
      return {
        ok: false,
        error: "bad_payload",
        message: `Cluster count must be an integer from ${MIN_CLUSTER_COUNT} to ${MAX_CLUSTER_COUNT}.`,
      };
    }
    if (count === this._clusterCount) {
      return { ok: true, droppedSocketIds: [] };
    }

    const droppedSocketIds: string[] = [];
    if (count < this._clusterCount) {
      for (let n = count + 1; n <= this._clusterCount; n++) {
        const cluster = this.clusters.get(n);
        if (cluster?.socketId) droppedSocketIds.push(cluster.socketId);
        this.clusters.delete(n);
      }
    } else {
      for (let n = this._clusterCount + 1; n <= count; n++) {
        this.clusters.set(n, {
          number: n,
          token: null,
          socketId: null,
          weight: INITIAL_WEIGHT,
          frozenWeight: null,
          pendingVote: null,
          lastResult: null,
          roundWeightBefore: null,
          roundWeightAfter: null,
          power: null,
          roundResults: [],
          team: null,
          foresightSplit: null,
        });
      }
    }
    this._clusterCount = count;
    return { ok: true, droppedSocketIds };
  }

  kickCluster(clusterNumber: number): boolean {
    const cluster = this.clusters.get(clusterNumber);
    if (!cluster) return false;
    cluster.socketId = null;
    cluster.token = null;
    cluster.pendingVote = null;
    cluster.team = null;
    cluster.foresightSplit = null;
    return true;
  }

  setClusterSocket(clusterNumber: number, socketId: string | null): void {
    const cluster = this.clusters.get(clusterNumber);
    if (cluster) cluster.socketId = socketId;
  }

  connectedCount(): number {
    let n = 0;
    for (const c of this.clusters.values()) if (c.socketId) n += 1;
    return n;
  }

  lockedCount(): number {
    const question = this.getCurrentQuestion();
    if (!question) return 0;
    let n = 0;
    for (const c of this.clusters.values()) {
      if (this.voteForQuestion(c.pendingVote, question)) n += 1;
    }
    return n;
  }

  private voteForQuestion(vote: PendingVote | null, question: Question | null): PendingVote | null {
    if (!vote || !question) return null;
    if (vote.questionId && vote.questionId !== question.id) return null;
    if (!question.options.some((o) => o.id === vote.optionId)) return null;
    return vote;
  }

  submitVote(
    clusterNumber: number,
    questionId: string,
    optionId: OptionId,
    wager: Wager | null | undefined,
  ):
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
      } {
    const cluster = this.clusters.get(clusterNumber);
    if (!cluster) {
      return { ok: false, error: "not_a_cluster", message: "Unknown cluster." };
    }
    if (!isVotingOpen(this.step.phase) || this.voteWindowClosed()) {
      return {
        ok: false,
        error: "voting_closed",
        message: "Voting is not open.",
      };
    }
    if (this.foresightGraceArmed && !this.canVoteInForesightGrace(cluster)) {
      return {
        ok: false,
        error: "voting_closed",
        message: "The room clock is over. Foresight nodes have 15 extra seconds.",
      };
    }
    if (this.isForesightWaiting(cluster)) {
      return {
        ok: false,
        error: "foresight_wait",
        message: "Foresight watches with the room. You lock in after the clock, with 15 extra seconds.",
      };
    }
    const question = this.getCurrentQuestion();
    if (!question || question.id !== questionId) {
      return {
        ok: false,
        error: "wrong_question",
        message: "This is not the active question.",
      };
    }
    if (this.voteForQuestion(cluster.pendingVote, question)) {
      return {
        ok: false,
        error: "already_locked",
        message: "Your answer is locked in. It can't be changed.",
      };
    }
    if (!question.options.some((o) => o.id === optionId)) {
      return {
        ok: false,
        error: "invalid_option",
        message: "That option is not on this question.",
      };
    }

    const final = question.roundId === "FINAL";
    if (final && wager != null) {
      return {
        ok: false,
        error: "wager_not_allowed",
        message: "The final inference has no wager.",
      };
    }
    const alpha = final ? null : normalizeWager(wager);
    if (!final && alpha == null) {
      return {
        ok: false,
        error: "wager_required",
        message: "Pick a confidence wager from 0.5 to 1.5.",
      };
    }

    const pendingVote: PendingVote = {
      questionId,
      optionId,
      wager: alpha,
      submittedAt: this.now(),
    };
    cluster.pendingVote = pendingVote;
    return { ok: true, pendingVote };
  }

  private isPowerQuestionStep(step: PhaseStep = this.step): boolean {
    return isPowerQuestion(step.roundId, step.questionIndex ?? null);
  }

  private hasUnusedForesight(cluster: ClusterRecord): boolean {
    return cluster.power?.type === "foresight" && !cluster.power.used;
  }

  private isForesightWaiting(cluster: ClusterRecord): boolean {
    return (
      this.isPowerQuestionStep() &&
      isVotingOpen(this.step.phase) &&
      this.hasUnusedForesight(cluster) &&
      cluster.foresightSplit == null
    );
  }

  private canVoteInForesightGrace(cluster: ClusterRecord): boolean {
    return cluster.power?.type === "foresight" && cluster.foresightSplit != null;
  }

  crowdLockedCount(): number {
    const question = this.getCurrentQuestion();
    if (!question) return 0;
    let n = 0;
    for (const c of this.clusters.values()) {
      if (c.power?.type === "foresight") continue;
      if (this.voteForQuestion(c.pendingVote, question)) n += 1;
    }
    return n;
  }

  foresightWaitingCount(): number {
    let n = 0;
    for (const c of this.clusters.values()) {
      if (this.isForesightWaiting(c)) n += 1;
    }
    return n;
  }

  isCrowdLocked(): boolean {
    if (!isVotingOpen(this.step.phase)) return false;
    const question = this.getCurrentQuestion();
    if (!question) return false;
    const crowd = [...this.clusters.values()].filter(
      (c) => c.socketId && c.power?.type !== "foresight",
    );
    if (crowd.length === 0) return true;
    return crowd.every((c) => this.voteForQuestion(c.pendingVote, question));
  }

  voteSplit(question?: Question | null, opts?: { crowdOnly?: boolean }): VoteSplitEntry[] {
    const q = question ?? this.getCurrentQuestion();
    if (!q) return [];
    const crowdOnly = opts?.crowdOnly ?? false;
    const counts = new Map<string, number>();
    for (const opt of q.options) counts.set(opt.id, 0);
    for (const c of this.clusters.values()) {
      if (crowdOnly && c.power?.type === "foresight") continue;
      const vote = this.voteForQuestion(c.pendingVote, q);
      if (vote) {
        counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
      }
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    return q.options.map((opt) => {
      const count = counts.get(opt.id) ?? 0;
      return {
        optionId: opt.id,
        label: opt.label,
        count,
        pct: total > 0 ? count / total : 0,
      };
    });
  }

  private openForesightGrace(): boolean {
    const waiting = [...this.clusters.values()].filter((c) => this.isForesightWaiting(c));
    if (waiting.length === 0) return false;
    const split = this.voteSplit(this.getCurrentQuestion(), { crowdOnly: true });
    for (const cluster of waiting) {
      cluster.power = { type: "foresight", used: true };
      cluster.foresightSplit = split;
    }
    this.foresightGraceArmed = true;
    this.voteDeadlineAt = this.now() + FORESIGHT_GRACE_MS;
    return true;
  }

  useForesight(clusterNumber: number):
    | { ok: true; power: ClusterRecord["power"]; split: VoteSplitEntry[] }
    | {
        ok: false;
        error: "not_a_cluster" | "no_power" | "already_used" | "wrong_phase" | "passive_power";
        message: string;
      } {
    const cluster = this.clusters.get(clusterNumber);
    if (!cluster) {
      return { ok: false, error: "not_a_cluster", message: "Unknown cluster." };
    }
    if (!cluster.power) {
      return { ok: false, error: "no_power", message: "You have no power-up." };
    }
    if (cluster.power.type !== "foresight") {
      return {
        ok: false,
        error: "passive_power",
        message: `${cluster.power.type} applies automatically on the next matching answer. You don't activate it.`,
      };
    }
    if (this.step.phase !== "voting_open" && this.step.phase !== "final_inference_open") {
      return {
        ok: false,
        error: "wrong_phase",
        message: "Foresight only works while voting is open.",
      };
    }
    if (!cluster.foresightSplit) {
      return {
        ok: false,
        error: "wrong_phase",
        message: "Foresight unlocks after the room clock. You’ll get 15 extra seconds with the crowd split.",
      };
    }
    return { ok: true, power: cluster.power, split: cluster.foresightSplit };
  }

  claimPower(
    clusterNumber: number,
    power: PowerUp,
  ):
    | { ok: true; power: NonNullable<ClusterRecord["power"]> }
    | {
        ok: false;
        error: "not_a_cluster" | "wrong_phase" | "not_top_three" | "already_claimed";
        message: string;
      } {
    if (this.step.phase !== "power_grant") {
      return {
        ok: false,
        error: "wrong_phase",
        message: "Power-ups can only be claimed during the grant window after R3.",
      };
    }
    if (this.powerGrantDeadlineAt != null && this.now() >= this.powerGrantDeadlineAt) {
      return {
        ok: false,
        error: "wrong_phase",
        message: "The 30-second pick window has closed.",
      };
    }
    const cluster = this.clusters.get(clusterNumber);
    if (!cluster) {
      return { ok: false, error: "not_a_cluster", message: "Unknown cluster." };
    }
    const top = this.topClusterNumbers(3);
    if (!top.includes(clusterNumber)) {
      return {
        ok: false,
        error: "not_top_three",
        message: "Only the top 3 clusters after R3 may claim a power.",
      };
    }
    if (cluster.power) {
      return {
        ok: false,
        error: "already_claimed",
        message: "This cluster already has a power.",
      };
    }
    cluster.power = { type: power, used: false };
    return { ok: true, power: cluster.power };
  }

  grantPowers(grants: { clusterNumber: number; power: PowerUp }[]): void {
    for (const g of grants) {
      const cluster = this.clusters.get(g.clusterNumber);
      if (!cluster) continue;
      cluster.power = { type: g.power, used: false };
      cluster.foresightSplit = null;
    }
  }

  setWeight(clusterNumber: number, weight: number): boolean {
    const cluster = this.clusters.get(clusterNumber);
    if (!cluster) return false;
    cluster.weight = Math.max(0.0001, weight);
    return true;
  }

  /**
   * Score the current question against `correctOptionId`.
   * Does not change weights — that happens on the weight_update step.
   */
  reveal(correctOptionId: OptionId):
    | { ok: true; questionId: string; results: Map<number, QuestionResult> }
    | { ok: false; message: string } {
    const question = this.getCurrentQuestion();
    if (!question) {
      return { ok: false, message: "No active question to reveal." };
    }
    if (
      this.step.phase !== "reveal" &&
      this.step.phase !== "ensemble" &&
      this.step.phase !== "final_reveal"
    ) {
      return { ok: false, message: "Reveal is only valid on a reveal step." };
    }
    if (!question.options.some((o) => o.id === correctOptionId)) {
      return { ok: false, message: "correctOptionId is not on this question." };
    }

    const results = new Map<number, QuestionResult>();
    for (const cluster of this.clusters.values()) {
      const voted = this.voteForQuestion(cluster.pendingVote, question);
      const correct = voted ? voted.optionId === correctOptionId : false;
      const y: 1 | -1 = correct ? 1 : -1;
      const alpha = voted ? (voted.wager ?? 0.5) : NO_VOTE_ALPHA;
      const result: QuestionResult = {
        questionId: question.id,
        optionId: voted?.optionId ?? "",
        wager: voted?.wager ?? null,
        correct,
        y,
        alpha,
        weightBefore: cluster.weight,
        weightAfter: cluster.weight,
        powerApplied: null,
      };
      cluster.lastResult = result;
      if (question.roundId !== "FINAL") {
        cluster.roundResults = cluster.roundResults.filter(
          (r) => r.questionId !== question.id,
        );
        cluster.roundResults.push(result);
      }
      results.set(cluster.number, result);
    }

    this.scores.set(question.id, {
      questionId: question.id,
      correctOptionId,
      applied: question.roundId === "FINAL",
    });
    return { ok: true, questionId: question.id, results };
  }

  applyRoundWeights(): {
    roundId: RoundId;
    discarded: boolean;
    clusters: PublicClusterState[];
  } {
    const roundId = this.step.roundId;
    if (!roundId || roundId === "FINAL") {
      throw new Error("weight_update requires a roundId");
    }
    const round = getRound(roundId);

    for (const cluster of this.clusters.values()) {
      const toApply = cluster.roundResults.filter((r) =>
        r.questionId.startsWith(`${roundId.toLowerCase()}-`),
      );
      if (toApply.length > 0) {
        const ordered = [...toApply].sort((a, b) =>
          a.questionId.localeCompare(b.questionId),
        );
        let w = cluster.weight;
        for (const result of ordered) {
          if (this.weightsFrozen) break;
          const applied = this.applyOneResult(cluster, result, w);
          w = applied.weightAfter;
          result.weightBefore = applied.weightBefore;
          result.weightAfter = applied.weightAfter;
          result.y = applied.y;
          result.alpha = applied.alpha;
          result.powerApplied = applied.powerApplied;
          cluster.lastResult = result;
        }
        cluster.weight = w;
        const first = ordered[0];
        const last = ordered[ordered.length - 1];
        cluster.roundWeightBefore = first?.weightBefore ?? cluster.weight;
        cluster.roundWeightAfter = last?.weightAfter ?? w;
      } else {
        const fromThisRound = (cluster.lastResult?.questionId ?? "").startsWith(
          `${roundId.toLowerCase()}-`,
        );
        if (!fromThisRound) {
          cluster.roundWeightBefore = cluster.weight;
          cluster.roundWeightAfter = cluster.weight;
        }
      }
      cluster.roundResults = [];
      cluster.pendingVote = null;
      if (roundId === "R4") this.consumeLeftoverWeightPowers(cluster);
    }

    const discarded = round.calibration;
    if (discarded) {
      for (const cluster of this.clusters.values()) {
        cluster.weight = INITIAL_WEIGHT;
      }
    }

    return {
      roundId,
      discarded,
      clusters: this.publicClusters(),
    };
  }

  private applyOneResult(
    cluster: ClusterRecord,
    result: QuestionResult,
    weight: number,
  ): QuestionResult {
    const abstained = !result.optionId;
    let y: 1 | -1 | 0 = result.correct ? 1 : -1;
    let alpha = abstained ? NO_VOTE_ALPHA : (result.wager ?? 0.5);
    let powerApplied: PowerUp | null = null;

    const onPowerQuestion = result.questionId === POWER_QUESTION_ID;
    if (
      onPowerQuestion &&
      !abstained &&
      !result.correct &&
      cluster.power?.type === "insurance" &&
      !cluster.power.used
    ) {
      y = 0;
      powerApplied = "insurance";
      cluster.power.used = true;
    } else if (
      onPowerQuestion &&
      !abstained &&
      result.correct &&
      cluster.power?.type === "amplify" &&
      !cluster.power.used
    ) {
      alpha = alpha * 2;
      powerApplied = "amplify";
      cluster.power.used = true;
    }

    const weightAfter = applyAdaBoost(weight, alpha, y);
    return {
      ...result,
      y,
      alpha,
      weightBefore: weight,
      weightAfter,
      powerApplied,
    };
  }

  private expireUnusedForesight(): void {
    for (const cluster of this.clusters.values()) {
      if (!this.hasUnusedForesight(cluster)) continue;
      cluster.power = { type: "foresight", used: true };
    }
  }

  private consumeLeftoverWeightPowers(cluster: ClusterRecord): void {
    if (!cluster.power || cluster.power.used) return;
    if (cluster.power.type === "insurance" || cluster.power.type === "amplify") {
      cluster.power.used = true;
    }
  }

  freezeWeights(): void {
    this.weightsFrozen = true;
    for (const cluster of this.clusters.values()) {
      cluster.frozenWeight = cluster.weight;
      cluster.pendingVote = null;
    }
  }

  computeEnsemble(correctOptionId?: OptionId): EnsembleBar[] {
    const question = FINAL_QUESTION;
    const scores = new Map<string, number>();
    for (const opt of question.options) scores.set(opt.id, 0);

    for (const cluster of this.clusters.values()) {
      const vote = this.voteForQuestion(cluster.pendingVote, question);
      if (!vote) continue;
      const w = cluster.frozenWeight ?? cluster.weight;
      scores.set(vote.optionId, (scores.get(vote.optionId) ?? 0) + w);
    }

    const total = [...scores.values()].reduce((a, b) => a + b, 0) || 1;
    this.ensemble = question.options.map((opt) => ({
      optionId: opt.id,
      label: opt.label,
      score: scores.get(opt.id) ?? 0,
      pct: (scores.get(opt.id) ?? 0) / total,
    }));

    if (correctOptionId) {
      this.scores.set(question.id, {
        questionId: question.id,
        correctOptionId,
        applied: true,
      });
    }
    return this.ensemble;
  }

  private scoredVoteOpen(): boolean {
    return this.step.phase === "voting_open" || this.step.phase === "final_inference_open";
  }

  private voteWindowClosed(): boolean {
    return this.voteDeadlineAt != null && this.now() >= this.voteDeadlineAt;
  }

  msUntilVoteDeadline(): number | null {
    if (!this.scoredVoteOpen() || this.voteDeadlineAt == null) return null;
    return Math.max(0, this.voteDeadlineAt - this.now());
  }

  msUntilClueDeadline(): number | null {
    if (this.step.phase !== "clue" || this.clueDeadlineAt == null) return null;
    return Math.max(0, this.clueDeadlineAt - this.now());
  }

  clock(): {
    serverTime: number;
    voteDeadlineAt: number | null;
    clueDeadlineAt: number | null;
    powerGrantDeadlineAt: number | null;
    calculatingDeadlineAt: number | null;
    voteRemainingMs: number | null;
    clueRemainingMs: number | null;
    powerGrantRemainingMs: number | null;
    calculatingRemainingMs: number | null;
  } {
    return {
      serverTime: this.now(),
      voteDeadlineAt: this.scoredVoteOpen() ? this.voteDeadlineAt : null,
      clueDeadlineAt: this.step.phase === "clue" ? this.clueDeadlineAt : null,
      powerGrantDeadlineAt: this.step.phase === "power_grant" ? this.powerGrantDeadlineAt : null,
      calculatingDeadlineAt:
        this.step.phase === "final_inference_locked" ? this.calculatingDeadlineAt : null,
      voteRemainingMs: this.msUntilVoteDeadline(),
      clueRemainingMs: this.msUntilClueDeadline(),
      powerGrantRemainingMs: this.msUntilPowerGrantDeadline(),
      calculatingRemainingMs: this.msUntilCalculatingDeadline(),
    };
  }

  /**
   * Called by the socket layer when the clock hits 0.
   * Locks the question, or gives Foresight holders a short extra window first.
   */
  expireOpenVote(): boolean {
    if (!this.scoredVoteOpen()) return false;
    if (this.voteDeadlineAt != null && this.now() < this.voteDeadlineAt) return false;

    if (!this.foresightGraceArmed && this.openForesightGrace()) {
      return true;
    }

    this.advance();
    return true;
  }

  /**
   * Called when the projector clue window ends — timer, video `ended`, or host skip.
   * Opens voting immediately with the phone clock (30s on R0, else 90s).
   * Untimed clues (Round 0, Round 2, and Round 5 video) have no deadline and complete as soon as this is called.
   */
  expireClue(): boolean {
    if (this.step.phase !== "clue") return false;
    if (this.clueDeadlineAt != null && this.now() < this.clueDeadlineAt) return false;
    this.advance();
    return true;
  }

  /**
   * Called when the top-3 pick window hits 0. Unclaimed nodes keep no power.
   */
  expirePowerGrant(): boolean {
    if (this.step.phase !== "power_grant") return false;
    if (this.powerGrantDeadlineAt != null && this.now() < this.powerGrantDeadlineAt) return false;
    this.advance();
    return true;
  }

  /**
   * After the final 90s lock, the projector holds on “engine calculating”
   * then this opens the weighted prediction.
   */
  expireCalculating(): boolean {
    if (this.step.phase !== "final_inference_locked") return false;
    if (this.calculatingDeadlineAt != null && this.now() < this.calculatingDeadlineAt) return false;
    this.advance();
    return true;
  }

  /**
   * Jump to a round's start. Training rounds open the projector clue look-up.
   * Final testing skips the look-up and opens the 90s A/B/C vote immediately.
   * Rounds unlock in order after the previous weight update. Final testing
   * waits until weights are frozen.
   */
  playRound(roundId: HostPlayRoundId):
    | { ok: true }
    | { ok: false; error: "illegal_transition" | "bad_payload"; message: string } {
    if (this._clusterCount < MIN_CLUSTER_COUNT) {
      return {
        ok: false,
        error: "illegal_transition",
        message: "Set how many clusters before starting a round.",
      };
    }
    if (
      !isPlayRoundUnlocked(roundId, {
        furthestStepIndex: this.furthestStepIndex,
        weightsFrozen: this.weightsFrozen,
        clusterCount: this._clusterCount,
      })
    ) {
      return {
        ok: false,
        error: "illegal_transition",
        message: playRoundLockedMessage(roundId),
      };
    }
    const target = roundStartIndex(roundId);
    if (target < 0) {
      return { ok: false, error: "bad_payload", message: `No start step for ${roundId}.` };
    }
    if (this.stepIndex !== target) {
      this.onLeaveStep(this.step);
      this.stepIndex = target;
    }
    this.markProgress();
    this.onEnterStep(this.step);
    return { ok: true };
  }

  private markProgress(): void {
    if (this.stepIndex > this.furthestStepIndex) this.furthestStepIndex = this.stepIndex;
  }

  private startVoteClock(): void {
    this.voteDeadlineAt = this.now() + voteDurationForRound(this.step.roundId);
    this.foresightGraceArmed = false;
  }

  private clearVoteClock(): void {
    this.voteDeadlineAt = null;
    this.foresightGraceArmed = false;
  }

  private startClueClock(): void {
    const duration = clueDurationForRound(this.step.roundId);
    this.clueDeadlineAt = duration == null ? null : this.now() + duration;
  }

  private clearClueClock(): void {
    this.clueDeadlineAt = null;
  }

  private startPowerGrantClock(): void {
    this.powerGrantDeadlineAt = this.now() + POWER_GRANT_DURATION_MS;
  }

  private clearPowerGrantClock(): void {
    this.powerGrantDeadlineAt = null;
  }

  private syncPowerGrantClock(): void {
    if (this.step.phase !== "power_grant") {
      this.clearPowerGrantClock();
      return;
    }
    if (this.powerGrantDeadlineAt == null) this.startPowerGrantClock();
  }

  msUntilPowerGrantDeadline(): number | null {
    if (this.step.phase !== "power_grant" || this.powerGrantDeadlineAt == null) return null;
    return Math.max(0, this.powerGrantDeadlineAt - this.now());
  }

  private startCalculatingClock(): void {
    this.calculatingDeadlineAt = this.now() + ENSEMBLE_CALCULATING_MS;
  }

  private clearCalculatingClock(): void {
    this.calculatingDeadlineAt = null;
  }

  private syncCalculatingClock(): void {
    if (this.step.phase !== "final_inference_locked") {
      this.clearCalculatingClock();
      return;
    }
    if (this.calculatingDeadlineAt == null) this.startCalculatingClock();
  }

  msUntilCalculatingDeadline(): number | null {
    if (this.step.phase !== "final_inference_locked" || this.calculatingDeadlineAt == null) {
      return null;
    }
    return Math.max(0, this.calculatingDeadlineAt - this.now());
  }

  private syncVoteClock(): void {
    if (this.scoredVoteOpen()) {
      if (this.voteDeadlineAt == null) this.startVoteClock();
    } else {
      this.clearVoteClock();
    }
  }

  private syncClueClock(): void {
    if (this.step.phase !== "clue") {
      this.clearClueClock();
      return;
    }
    if (clueDurationForRound(this.step.roundId) == null) {
      this.clueDeadlineAt = null;
      return;
    }
    if (this.clueDeadlineAt == null) this.startClueClock();
  }

  private showingClueMedia(step: PhaseStep = this.step): boolean {
    return step.phase === "clue";
  }

  advance(): PhaseStep {
    if (this.stepIndex < PHASE_SEQUENCE.length - 1) {
      this.onLeaveStep(this.step);
      this.stepIndex += 1;
      this.markProgress();
      this.onEnterStep(this.step);
    }
    return this.step;
  }

  back(): PhaseStep {
    if (this.stepIndex > 0) {
      this.stepIndex -= 1;
      this.syncVoteClock();
      this.syncClueClock();
      this.syncPowerGrantClock();
      this.syncCalculatingClock();
    }
    return this.step;
  }

  private onLeaveStep(step: PhaseStep): void {
    if (step.phase === "voting_open" && this.isPowerQuestionStep(step)) {
      this.expireUnusedForesight();
    }
    if (step.phase === "weight_update" && step.roundId && step.roundId !== "FINAL") {
      // ensure applied if host skipped the animation wait
      const anyUnapplied = [...this.clusters.values()].some((c) =>
        c.roundResults.some((r) =>
          r.questionId.startsWith(`${step.roundId!.toLowerCase()}-`),
        ),
      );
      if (anyUnapplied) this.applyRoundWeights();
    }
  }

  private onEnterStep(step: PhaseStep): void {
    if (step.phase === "voting_open" || step.phase === "final_inference_open") {
      for (const c of this.clusters.values()) {
        c.pendingVote = null;
        c.foresightSplit = null;
      }
    }
    if (this.scoredVoteOpen()) {
      this.startVoteClock();
    } else {
      this.clearVoteClock();
    }
    if (step.phase === "clue") {
      this.clueStartedAt = this.now();
      this.startClueClock();
    } else if (!this.showingClueMedia(step)) {
      this.clueStartedAt = null;
      this.clearClueClock();
    } else {
      this.clearClueClock();
    }
    if (step.phase === "weight_update") {
      this.applyRoundWeights();
    }
    if (step.phase === "power_grant") {
      this.startPowerGrantClock();
    } else {
      this.clearPowerGrantClock();
    }
    if (step.phase === "final_inference_locked") {
      this.startCalculatingClock();
    } else {
      this.clearCalculatingClock();
    }
    if (step.phase === "freeze") {
      this.freezeWeights();
    }
    if (step.phase === "ensemble") {
      this.computeEnsemble();
    }
  }

  topClusterNumbers(n = 3): number[] {
    return [...this.clusters.values()]
      .sort((a, b) => b.weight - a.weight || a.number - b.number)
      .slice(0, n)
      .map((c) => c.number);
  }

  publicClusters(): PublicClusterState[] {
    const weights = [...this.clusters.values()].map((c) => c.weight);
    const max = Math.max(...weights, 0.0001);
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const question = this.getCurrentQuestion();

    return [...this.clusters.values()].map((c) => ({
      number: c.number,
      connected: c.socketId !== null,
      weight: c.weight,
      visualWeight: c.weight / max,
      normalizedWeight: c.weight / sum,
      hasVoted: Boolean(this.voteForQuestion(c.pendingVote, question)),
      power: c.power,
      team: c.team,
      roundWeightBefore: c.roundWeightBefore,
      roundWeightAfter: c.roundWeightAfter,
    }));
  }

  snapshot(): GameSnapshot {
    const step = this.step;
    const question = this.getCurrentQuestion();
    const round = step.roundId && step.roundId !== "FINAL" ? getRound(step.roundId) : null;
    const scoreKey = question?.id;
    const correct = scoreKey ? this.scores.get(scoreKey)?.correctOptionId ?? null : null;
    const clue =
      step.phase !== "clue"
        ? null
        : step.roundId === "FINAL"
          ? FINAL_CLUE
          : (round?.clue ?? null);

    return {
      phase: step.phase,
      stepIndex: this.stepIndex,
      stepCount: PHASE_SEQUENCE.length,
      roundId: step.roundId ?? null,
      questionIndex: step.questionIndex ?? null,
      question:
        step.phase === "voting_open" ||
        step.phase === "voting_locked" ||
        step.phase === "reveal" ||
        step.phase === "final_inference_open" ||
        step.phase === "final_inference_locked" ||
        step.phase === "ensemble" ||
        step.phase === "final_reveal"
          ? question
          : null,
      clue,
      roundTitle: step.roundId === "FINAL" ? "Final testing" : round?.title ?? null,
      clusters: this.publicClusters(),
      connectedCount: this.connectedCount(),
      lockedCount: this.lockedCount(),
      crowdLockedCount: this.crowdLockedCount(),
      foresightWaitingCount: this.foresightWaitingCount(),
      clusterCount: this.clusterCount,
      weightsFrozen: this.weightsFrozen,
      unlockedPlayRoundIds: unlockedPlayRoundIds({
        furthestStepIndex: this.furthestStepIndex,
        weightsFrozen: this.weightsFrozen,
        clusterCount: this.clusterCount,
      }),
      topClusterNumbers: this.topClusterNumbers(3),
      ensemble: this.ensemble,
      finalEnvironments: isFinalTestingPhase(step.phase) ? [...FINAL_ENVIRONMENTS] : null,
      correctOptionId:
        step.phase === "reveal" || step.phase === "final_reveal" || step.phase === "ensemble"
          ? correct
          : null,
      joinUrl: this.joinUrl,
      voteDeadlineAt: this.scoredVoteOpen() ? this.voteDeadlineAt : null,
      clueDeadlineAt: step.phase === "clue" ? this.clueDeadlineAt : null,
      powerGrantDeadlineAt: step.phase === "power_grant" ? this.powerGrantDeadlineAt : null,
      calculatingDeadlineAt:
        step.phase === "final_inference_locked" ? this.calculatingDeadlineAt : null,
      foresightGraceActive: this.foresightGraceArmed && this.scoredVoteOpen(),
      clueStartedAt: this.showingClueMedia(step) ? this.clueStartedAt : null,
      serverTime: this.now(),
    };
  }

  clusterView(clusterNumber: number, snapshot?: GameSnapshot): ClusterView | null {
    const cluster = this.clusters.get(clusterNumber);
    if (!cluster || !cluster.token) return null;
    const top = this.topClusterNumbers(3);
    return {
      clusterNumber,
      token: cluster.token,
      snapshot: snapshot ?? this.snapshot(),
      pendingVote: cluster.pendingVote,
      lastResult: cluster.lastResult,
      roundWeightBefore: cluster.roundWeightBefore,
      roundWeightAfter: cluster.roundWeightAfter,
      power: cluster.power,
      canClaimPower:
        this.step.phase === "power_grant" &&
        top.includes(clusterNumber) &&
        cluster.power === null,
      isTopThree: top.includes(clusterNumber),
      foresightWaiting: this.isForesightWaiting(cluster),
      crowdSplit: this.foresightGraceArmed ? cluster.foresightSplit : null,
    };
  }

  serialize(): unknown {
    return {
      stepIndex: this.stepIndex,
      furthestStepIndex: this.furthestStepIndex,
      clusterCount: this._clusterCount,
      weightsFrozen: this.weightsFrozen,
      ensemble: this.ensemble,
      scores: [...this.scores.entries()],
      voteDeadlineAt: this.voteDeadlineAt,
      clueDeadlineAt: this.clueDeadlineAt,
      clueStartedAt: this.clueStartedAt,
      powerGrantDeadlineAt: this.powerGrantDeadlineAt,
      calculatingDeadlineAt: this.calculatingDeadlineAt,
      foresightGraceArmed: this.foresightGraceArmed,
      clusters: [...this.clusters.values()].map((c) => ({
        ...c,
        socketId: null,
      })),
    };
  }

  restore(raw: unknown): void {
    const data = raw as {
      stepIndex: number;
      furthestStepIndex?: number;
      clusterCount?: number;
      weightsFrozen: boolean;
      ensemble: EnsembleBar[] | null;
      scores: [string, QuestionScore][];
      voteDeadlineAt?: number | null;
      clueDeadlineAt?: number | null;
      clueStartedAt?: number | null;
      powerGrantDeadlineAt?: number | null;
      calculatingDeadlineAt?: number | null;
      foresightGraceArmed?: boolean;
      clusters: ClusterRecord[];
    };
    this.stepIndex = data.stepIndex ?? 0;
    this.furthestStepIndex = Math.max(data.furthestStepIndex ?? 0, this.stepIndex);
    this.weightsFrozen = data.weightsFrozen ?? false;
    this.ensemble = data.ensemble ?? null;
    this.scores = new Map(data.scores ?? []);
    this.voteDeadlineAt = data.voteDeadlineAt ?? null;
    this.clueDeadlineAt = data.clueDeadlineAt ?? null;
    this.clueStartedAt = data.clueStartedAt ?? null;
    this.powerGrantDeadlineAt = data.powerGrantDeadlineAt ?? null;
    this.calculatingDeadlineAt = data.calculatingDeadlineAt ?? null;
    this.foresightGraceArmed = data.foresightGraceArmed ?? false;
    const restoredCount = data.clusterCount ?? data.clusters?.length ?? this._clusterCount;
    if (
      Number.isInteger(restoredCount) &&
      restoredCount >= 0 &&
      restoredCount <= MAX_CLUSTER_COUNT &&
      (restoredCount === 0 || restoredCount >= MIN_CLUSTER_COUNT)
    ) {
      this._clusterCount = restoredCount;
      this.resetClusters();
    }
    if (Array.isArray(data.clusters)) {
      for (const c of data.clusters) {
        const live = this.clusters.get(c.number);
        if (!live) continue;
        live.token = c.token;
        live.weight = c.weight;
        live.frozenWeight = c.frozenWeight;
        live.pendingVote = c.pendingVote;
        live.lastResult = c.lastResult;
        live.roundWeightBefore = c.roundWeightBefore ?? null;
        live.roundWeightAfter = c.roundWeightAfter ?? null;
        live.power = c.power;
        live.roundResults = c.roundResults ?? [];
        live.team = c.team ?? null;
        live.foresightSplit = c.foresightSplit ?? null;
      }
    }
    this.syncVoteClock();
    this.syncClueClock();
    this.syncPowerGrantClock();
    this.syncCalculatingClock();
  }
}
