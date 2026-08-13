import { randomBytes } from "node:crypto";
import {
  CLUSTER_COUNT,
  FINAL_QUESTION,
  INITIAL_WEIGHT,
  MAX_CLUSTER_COUNT,
  MIN_CLUSTER_COUNT,
  PHASE_SEQUENCE,
  getQuestion,
  getRound,
  isFinalInference,
  isVotingOpen,
  type ClusterView,
  type EnsembleBar,
  type GameSnapshot,
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
  private clusters = new Map<number, ClusterRecord>();
  private scores = new Map<string, QuestionScore>();
  private weightsFrozen = false;
  private ensemble: EnsembleBar[] | null = null;

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
    this.scores.clear();
    this.weightsFrozen = false;
    this.ensemble = null;
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
    if (isFinalInference(step.phase) || step.phase === "ensemble") {
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
        this.unlockForesightIfReady();
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
      if (c.pendingVote && this.voteMatchesQuestion(c.pendingVote, question)) {
        n += 1;
      }
    }
    return n;
  }

  private voteMatchesQuestion(vote: PendingVote, question: Question): boolean {
    return question.options.some((o) => o.id === vote.optionId);
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
          | "foresight_wait";
        message: string;
      } {
    const cluster = this.clusters.get(clusterNumber);
    if (!cluster) {
      return { ok: false, error: "not_a_cluster", message: "Unknown cluster." };
    }
    if (!isVotingOpen(this.step.phase)) {
      return {
        ok: false,
        error: "voting_closed",
        message: "Voting is not open.",
      };
    }
    if (this.isForesightWaiting(cluster)) {
      return {
        ok: false,
        error: "foresight_wait",
        message: "Foresight waits for the rest of the room to lock in. Then you see the split.",
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
      optionId,
      wager: alpha,
      submittedAt: this.now(),
    };
    cluster.pendingVote = pendingVote;
    this.unlockForesightIfReady();
    return { ok: true, pendingVote };
  }

  private hasUnusedForesight(cluster: ClusterRecord): boolean {
    return cluster.power?.type === "foresight" && !cluster.power.used;
  }

  private isForesightWaiting(cluster: ClusterRecord): boolean {
    return this.hasUnusedForesight(cluster) && cluster.foresightSplit == null;
  }

  crowdLockedCount(): number {
    const question = this.getCurrentQuestion();
    if (!question) return 0;
    let n = 0;
    for (const c of this.clusters.values()) {
      if (c.power?.type === "foresight") continue;
      if (c.pendingVote && this.voteMatchesQuestion(c.pendingVote, question)) n += 1;
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
    return crowd.every(
      (c) => c.pendingVote && this.voteMatchesQuestion(c.pendingVote, question),
    );
  }

  voteSplit(question?: Question | null, opts?: { crowdOnly?: boolean }): VoteSplitEntry[] {
    const q = question ?? this.getCurrentQuestion();
    if (!q) return [];
    const crowdOnly = opts?.crowdOnly ?? false;
    const counts = new Map<string, number>();
    for (const opt of q.options) counts.set(opt.id, 0);
    for (const c of this.clusters.values()) {
      if (crowdOnly && c.power?.type === "foresight") continue;
      if (c.pendingVote && q.options.some((o) => o.id === c.pendingVote!.optionId)) {
        counts.set(
          c.pendingVote.optionId,
          (counts.get(c.pendingVote.optionId) ?? 0) + 1,
        );
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

  unlockForesightIfReady(): boolean {
    if (!this.isCrowdLocked()) return false;
    const split = this.voteSplit(this.getCurrentQuestion(), { crowdOnly: true });
    let changed = false;
    for (const cluster of this.clusters.values()) {
      if (!this.hasUnusedForesight(cluster)) continue;
      cluster.power = { type: "foresight", used: true };
      cluster.foresightSplit = split;
      changed = true;
    }
    return changed;
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
    this.unlockForesightIfReady();
    if (!cluster.foresightSplit) {
      return {
        ok: false,
        error: "wrong_phase",
        message: "Foresight waits for the rest of the room to lock in.",
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
      this.step.phase !== "final_inference_locked" &&
      this.step.phase !== "ensemble"
    ) {
      return { ok: false, message: "Reveal is only valid on a reveal step." };
    }
    if (!question.options.some((o) => o.id === correctOptionId)) {
      return { ok: false, message: "correctOptionId is not on this question." };
    }

    const results = new Map<number, QuestionResult>();
    for (const cluster of this.clusters.values()) {
      const vote = cluster.pendingVote;
      const voted =
        vote && question.options.some((o) => o.id === vote.optionId)
          ? vote
          : null;
      const correct = voted ? voted.optionId === correctOptionId : false;
      const y: 1 | -1 = correct ? 1 : -1;
      const alpha = voted?.wager ?? 0.5;
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
    if (!roundId) {
      throw new Error("weight_update requires a roundId");
    }
    const round = getRound(roundId);

    for (const cluster of this.clusters.values()) {
      const toApply = cluster.roundResults.filter((r) =>
        r.questionId.startsWith(`${roundId.toLowerCase()}-`),
      );
      let w = cluster.weight;
      for (const result of toApply) {
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
      cluster.roundResults = [];
      cluster.pendingVote = null;
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
    let y: 1 | -1 | 0 = result.correct ? 1 : -1;
    let alpha = result.wager ?? 0.5;
    let powerApplied: PowerUp | null = null;

    if (!result.correct && cluster.power?.type === "insurance" && !cluster.power.used) {
      y = 0;
      powerApplied = "insurance";
      cluster.power.used = true;
    } else if (result.correct && cluster.power?.type === "amplify" && !cluster.power.used) {
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
      const vote = cluster.pendingVote;
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

  advance(): PhaseStep {
    if (this.stepIndex < PHASE_SEQUENCE.length - 1) {
      this.onLeaveStep(this.step);
      this.stepIndex += 1;
      this.onEnterStep(this.step);
    }
    return this.step;
  }

  back(): PhaseStep {
    if (this.stepIndex > 0) {
      this.stepIndex -= 1;
    }
    return this.step;
  }

  private onLeaveStep(step: PhaseStep): void {
    if (step.phase === "weight_update" && step.roundId) {
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
    if (step.phase === "weight_update") {
      this.applyRoundWeights();
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
      hasVoted: Boolean(
        c.pendingVote &&
          question &&
          question.options.some((o) => o.id === c.pendingVote!.optionId),
      ),
      power: c.power,
      team: c.team,
    }));
  }

  snapshot(): GameSnapshot {
    const step = this.step;
    const question = this.getCurrentQuestion();
    const round = step.roundId ? getRound(step.roundId) : null;
    const scoreKey = question?.id;
    const correct = scoreKey ? this.scores.get(scoreKey)?.correctOptionId ?? null : null;

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
        step.phase === "ensemble"
          ? question
          : null,
      clue: step.phase === "clue" && round ? round.clue : null,
      roundTitle: round?.title ?? null,
      clusters: this.publicClusters(),
      connectedCount: this.connectedCount(),
      lockedCount: this.lockedCount(),
      crowdLockedCount: this.crowdLockedCount(),
      foresightWaitingCount: this.foresightWaitingCount(),
      clusterCount: this.clusterCount,
      weightsFrozen: this.weightsFrozen,
      topClusterNumbers: this.topClusterNumbers(3),
      ensemble: this.ensemble,
      correctOptionId:
        step.phase === "reveal" || step.phase === "final_reveal" || step.phase === "ensemble"
          ? correct
          : null,
      joinUrl: this.joinUrl,
    };
  }

  clusterView(clusterNumber: number): ClusterView | null {
    const cluster = this.clusters.get(clusterNumber);
    if (!cluster || !cluster.token) return null;
    const top = this.topClusterNumbers(3);
    return {
      clusterNumber,
      token: cluster.token,
      snapshot: this.snapshot(),
      pendingVote: cluster.pendingVote,
      lastResult: cluster.lastResult,
      power: cluster.power,
      canClaimPower:
        this.step.phase === "power_grant" &&
        top.includes(clusterNumber) &&
        cluster.power === null,
      isTopThree: top.includes(clusterNumber),
      foresightWaiting: this.isForesightWaiting(cluster),
      crowdSplit: cluster.foresightSplit,
    };
  }

  serialize(): unknown {
    return {
      stepIndex: this.stepIndex,
      clusterCount: this._clusterCount,
      weightsFrozen: this.weightsFrozen,
      ensemble: this.ensemble,
      scores: [...this.scores.entries()],
      clusters: [...this.clusters.values()].map((c) => ({
        ...c,
        socketId: null,
      })),
    };
  }

  restore(raw: unknown): void {
    const data = raw as {
      stepIndex: number;
      clusterCount?: number;
      weightsFrozen: boolean;
      ensemble: EnsembleBar[] | null;
      scores: [string, QuestionScore][];
      clusters: ClusterRecord[];
    };
    this.stepIndex = data.stepIndex ?? 0;
    this.weightsFrozen = data.weightsFrozen ?? false;
    this.ensemble = data.ensemble ?? null;
    this.scores = new Map(data.scores ?? []);
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
        live.power = c.power;
        live.roundResults = c.roundResults ?? [];
        live.team = c.team ?? null;
        live.foresightSplit = c.foresightSplit ?? null;
      }
    }
  }
}
