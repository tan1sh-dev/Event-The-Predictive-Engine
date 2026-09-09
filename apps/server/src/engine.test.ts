import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENSEMBLE_CALCULATING_MS, PHASE_SEQUENCE, previousPlayRound, normalizeTeamDetails, type HostPlayRoundId, type PhaseStep } from "@engine/shared";
import { ANSWER_KEY } from "./answer-key.ts";
import { applyAdaBoost, GameEngine, newToken } from "./engine.ts";

function goTo(engine: GameEngine, pred: (step: PhaseStep) => boolean): void {
  for (let i = 0; i < PHASE_SEQUENCE.length + 2; i++) {
    if (pred(engine.step)) return;
    engine.advance();
  }
  throw new Error(`Never reached target phase (stuck at ${engine.step.phase})`);
}

function unlockPlayRound(engine: GameEngine, roundId: HostPlayRoundId): void {
  if (roundId === "R0") return;
  if (roundId === "FINAL") {
    goTo(engine, (s) => s.phase === "freeze");
    return;
  }
  const prev = previousPlayRound(roundId);
  if (!prev) return;
  goTo(engine, (s) => s.phase === "weight_update" && s.roundId === prev);
}

function playQuestion(
  engine: GameEngine,
  votes: { cluster: number; option: string; wager?: number }[],
  correct: string,
): void {
  goTo(
    engine,
    (s) => s.phase === "voting_open" || s.phase === "final_inference_open",
  );
  const q = engine.getCurrentQuestion();
  assert.ok(q);
  for (const v of votes) {
    const res = engine.submitVote(v.cluster, q.id, v.option, v.wager ?? 0.5);
    assert.equal(res.ok, true, res.ok ? "" : res.message);
  }
  engine.advance(); // locked
  engine.advance(); // reveal
  const revealed = engine.reveal(correct);
  assert.equal(revealed.ok, true);
}

describe("applyAdaBoost", () => {
  it("matches the advertised formula w * exp(α * y)", () => {
    assert.equal(applyAdaBoost(1, 0.5, 1), Math.exp(0.5));
    assert.equal(applyAdaBoost(1, 1.5, 1), Math.exp(1.5));
    assert.equal(applyAdaBoost(1, 0.5, -1), Math.exp(-0.5));
    assert.equal(applyAdaBoost(1, 1.5, -1), Math.exp(-1.5));
    assert.equal(applyAdaBoost(2, 0.5, 0), 2);
  });
});

const SAMPLE_TEAM = {
  teamName: "Signal Breakers",
  leaderName: "Asha Rao",
  members: ["Dev Patel", "Maya Iyer", "Rohan Das", "Leela Shah"],
};

describe("normalizeTeamDetails", () => {
  it("requires a team name and leader, with 0–4 unique teammates", () => {
    assert.deepEqual(normalizeTeamDetails(SAMPLE_TEAM), SAMPLE_TEAM);
    assert.deepEqual(
      normalizeTeamDetails({ ...SAMPLE_TEAM, members: ["A", "B"] }),
      { ...SAMPLE_TEAM, members: ["A", "B"] },
    );
    assert.deepEqual(
      normalizeTeamDetails({ ...SAMPLE_TEAM, members: [] }),
      { ...SAMPLE_TEAM, members: [] },
    );
    assert.equal(
      normalizeTeamDetails({
        ...SAMPLE_TEAM,
        members: ["A", "B", "C", "D", "E"],
      }),
      null,
    );
    assert.equal(normalizeTeamDetails({ ...SAMPLE_TEAM, members: ["A", ""] }), null);
    assert.equal(normalizeTeamDetails({ ...SAMPLE_TEAM, teamName: "  " }), null);
    assert.equal(normalizeTeamDetails({ ...SAMPLE_TEAM, leaderName: "" }), null);
    assert.equal(
      normalizeTeamDetails({
        ...SAMPLE_TEAM,
        leaderName: "Tanish M",
        members: ["Tanish M", "Virat Kohli", "Rohit Sharma", "Jasprit Bumrah"],
      }),
      null,
    );
    assert.equal(
      normalizeTeamDetails({
        ...SAMPLE_TEAM,
        members: ["Maya", "maya"],
      }),
      null,
    );
  });
});

describe("GameEngine reconnection", () => {
  it("stores team details on join and exposes them in the snapshot", () => {
    const engine = new GameEngine({ clusterCount: 6 });
    const joined = engine.joinCluster(2, undefined, "sock-a", SAMPLE_TEAM);
    assert.equal(joined.ok, true);
    const cluster = engine.snapshot().clusters.find((c) => c.number === 2);
    assert.deepEqual(cluster?.team, SAMPLE_TEAM);
    engine.disconnectSocket("sock-a");
    engine.joinCluster(2, undefined, "sock-b");
    assert.deepEqual(engine.getCluster(2)?.team, SAMPLE_TEAM);
    engine.kickCluster(2);
    assert.equal(engine.getCluster(2)?.team, null);
  });

  it("restores team details from a snapshot", () => {
    const engine = new GameEngine({ clusterCount: 4 });
    engine.joinCluster(1, undefined, "sock-a", SAMPLE_TEAM);
    const raw = engine.serialize();
    const next = new GameEngine({ clusterCount: 4 });
    next.restore(raw);
    assert.deepEqual(next.getCluster(1)?.team, SAMPLE_TEAM);
  });

  it("issues a token on first join and reclaims a disconnected cluster without it", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    const first = engine.joinCluster(5, undefined, "sock-a");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    engine.disconnectSocket("sock-a");
    const again = engine.joinCluster(5, undefined, "sock-b");
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.token, first.token);
  });

  it("rejects a live cluster without the token, and steals with it", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    const first = engine.joinCluster(1, undefined, "sock-a");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const blocked = engine.joinCluster(1, undefined, "sock-b");
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.error, "cluster_in_use");
    const stolen = engine.joinCluster(1, first.token, "sock-b");
    assert.equal(stolen.ok, true);
  });

  it("rejects an out-of-range cluster number", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    const res = engine.joinCluster(21, undefined, "x");
    assert.equal(res.ok, false);
  });

  it("lets the host resize the room in lobby and drops extra clusters", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    engine.joinCluster(18, undefined, "sock-18");
    const grown = engine.setClusterCount(12);
    assert.equal(grown.ok, true);
    if (!grown.ok) return;
    assert.equal(engine.clusterCount, 12);
    assert.deepEqual(grown.droppedSocketIds, ["sock-18"]);
    assert.equal(engine.joinCluster(13, undefined, "x").ok, false);
    const again = engine.setClusterCount(8);
    assert.equal(again.ok, true);
    assert.equal(engine.snapshot().clusters.length, 8);
    engine.advance();
    const locked = engine.setClusterCount(10);
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.error, "wrong_phase");
  });

  it("mints unique tokens", () => {
    assert.notEqual(newToken(), newToken());
  });

  it("starts at zero clusters until the host sets a count", () => {
    const engine = new GameEngine();
    assert.equal(engine.clusterCount, 0);
    assert.equal(engine.joinCluster(1, undefined, "s").ok, false);
    const set = engine.setClusterCount(6);
    assert.equal(set.ok, true);
    assert.equal(engine.clusterCount, 6);
    assert.equal(engine.snapshot().clusters.length, 6);
    assert.equal(engine.joinCluster(1, undefined, "s").ok, true);
  });

  it("full reset restores zero clusters and drops sessions", () => {
    const engine = new GameEngine({ clusterCount: 8 });
    engine.joinCluster(3, undefined, "sock-3");
    engine.setClusterCount(8);
    const dropped = engine.reset();
    assert.deepEqual(dropped, ["sock-3"]);
    assert.equal(engine.clusterCount, 0);
    assert.equal(engine.snapshot().phase, "lobby");
    assert.equal(engine.snapshot().clusters.length, 0);
    assert.equal(engine.getCluster(3), undefined);
  });
});

describe("voting + AdaBoost round", () => {
  it("grows a high-risk correct vote more than a low-risk correct vote", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    engine.joinCluster(3, undefined, "s3");

    playQuestion(
      engine,
      [
        { cluster: 1, option: "c", wager: 0.5 },
        { cluster: 2, option: "c", wager: 1.5 },
        { cluster: 3, option: "a", wager: 1.5 },
      ],
      "c",
    );
    playQuestion(
      engine,
      [
        { cluster: 1, option: "d", wager: 0.5 },
        { cluster: 2, option: "d", wager: 1.5 },
        { cluster: 3, option: "d", wager: 0.5 },
      ],
      "d",
    );

    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R0");
    const c1 = engine.getCluster(1)!;
    const c2 = engine.getCluster(2)!;
    const c3 = engine.getCluster(3)!;
    // R0 is calibration — weights discarded back to 1
    assert.equal(c1.weight, 1);
    assert.equal(c2.weight, 1);
    assert.equal(c3.weight, 1);
  });

  it("applies and keeps weights on R1", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");

    // skip R0 entirely by advancing past its weight_update after empty reveals
    goTo(engine, (s) => s.phase === "clue" && s.roundId === "R1");

    playQuestion(
      engine,
      [
        { cluster: 1, option: "b", wager: 0.5 },
        { cluster: 2, option: "b", wager: 1.5 },
      ],
      "b",
    );

    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R1");
    const low = engine.getCluster(1)!.weight;
    const high = engine.getCluster(2)!.weight;
    // R1 is a single question — correct 0.5 vs correct 1.5
    assert.ok(Math.abs(low - Math.exp(0.5)) < 1e-9, `low=${low}`);
    assert.ok(Math.abs(high - Math.exp(1.5)) < 1e-9, `high=${high}`);
    assert.ok(high > low);
    const view = engine.clusterView(1)!;
    assert.ok(Math.abs((view.roundWeightBefore ?? 0) - 1) < 1e-9);
    assert.ok(Math.abs((view.roundWeightAfter ?? 0) - low) < 1e-9);
  });

  it("orb delta is the full round, not the last question", () => {
    const engine = new GameEngine({ clusterCount: 4 });
    engine.joinCluster(1, undefined, "s1");
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R3" && s.questionIndex === 1);
    engine.setWeight(1, 2);
    playQuestion(engine, [{ cluster: 1, option: "a", wager: 0.5 }], "a");
    playQuestion(engine, [{ cluster: 1, option: "a", wager: 1 }], "b");
    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R3");

    const expectedAfter = 2 * Math.exp(0.5) * Math.exp(-1);
    const lastQuestionBefore = 2 * Math.exp(0.5);
    const cluster = engine.getCluster(1)!;
    assert.ok(Math.abs(cluster.weight - expectedAfter) < 1e-9);
    assert.ok(Math.abs((cluster.roundWeightBefore ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((cluster.roundWeightAfter ?? 0) - expectedAfter) < 1e-9);
    assert.ok(Math.abs((cluster.lastResult?.weightBefore ?? 0) - lastQuestionBefore) < 1e-9);
    assert.ok(Math.abs((cluster.lastResult?.weightAfter ?? 0) - expectedAfter) < 1e-9);

    const view = engine.clusterView(1)!;
    const publicMe = engine.snapshot().clusters.find((c) => c.number === 1)!;
    assert.ok(Math.abs((view.roundWeightBefore ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((view.roundWeightAfter ?? 0) - expectedAfter) < 1e-9);
    assert.ok(Math.abs((publicMe.roundWeightBefore ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((publicMe.roundWeightAfter ?? 0) - expectedAfter) < 1e-9);
    assert.ok(
      Math.abs((publicMe.roundWeightBefore ?? 0) - lastQuestionBefore) > 0.01,
      "round delta must not be the last question only",
    );

    engine.applyRoundWeights();
    assert.ok(Math.abs((engine.getCluster(1)!.roundWeightBefore ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((engine.getCluster(1)!.roundWeightAfter ?? 0) - expectedAfter) < 1e-9);
  });

  it("rejects votes while voting is closed and requires a wager on scored questions", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    engine.joinCluster(1, undefined, "s1");
    const closed = engine.submitVote(1, "r0-q1", "c", 0.5);
    assert.equal(closed.ok, false);
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R0");
    const noWager = engine.submitVote(1, "r0-q1", "c", null);
    assert.equal(noWager.ok, false);
    if (!noWager.ok) assert.equal(noWager.error, "wager_required");
    const low = engine.submitVote(1, "r0-q1", "c", 0.2);
    assert.equal(low.ok, false);
    const high = engine.submitVote(1, "r0-q1", "c", 2);
    assert.equal(high.ok, false);
    const mid = engine.submitVote(1, "r0-q1", "c", 1.0);
    assert.equal(mid.ok, true);
    assert.equal(engine.getCluster(1)?.pendingVote?.wager, 1);
    const update = engine.submitVote(1, "r0-q1", "a", 0.5);
    assert.equal(update.ok, false);
    if (!update.ok) assert.equal(update.error, "already_locked");
    assert.equal(engine.getCluster(1)?.pendingVote?.optionId, "c");
    assert.equal(engine.getCluster(1)?.pendingVote?.wager, 1);
    assert.equal(engine.getCluster(1)?.pendingVote?.questionId, "r0-q1");
  });

  it("reveal shows this question's lock, not the previous question's", () => {
    const engine = new GameEngine({ clusterCount: 4 });
    engine.joinCluster(1, undefined, "s1");
    playQuestion(engine, [{ cluster: 1, option: "a", wager: 0.5 }], "a");
    const first = engine.getCluster(1)?.lastResult;
    assert.equal(first?.questionId, "r0-q1");
    assert.equal(first?.optionId, "a");
    assert.equal(first?.wager, 0.5);

    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R0" && s.questionIndex === 2);
    const q = engine.getCurrentQuestion();
    assert.equal(q?.id, "r0-q2");
    const locked = engine.submitVote(1, q!.id, "c", 1.5);
    assert.equal(locked.ok, true);
    assert.equal(engine.getCluster(1)?.pendingVote?.optionId, "c");
    assert.equal(engine.getCluster(1)?.pendingVote?.wager, 1.5);
    assert.equal(engine.getCluster(1)?.lastResult?.optionId, "a");

    engine.advance();
    engine.advance();
    const revealed = engine.reveal("d");
    assert.equal(revealed.ok, true);
    const result = engine.getCluster(1)?.lastResult;
    assert.equal(result?.questionId, "r0-q2");
    assert.equal(result?.optionId, "c");
    assert.equal(result?.wager, 1.5);
    assert.equal(result?.correct, false);
  });

  it("withholds the answer explanation until the host reveals", () => {
    const engine = new GameEngine({ clusterCount: 4 });
    engine.joinCluster(1, undefined, "s1");
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R1");
    assert.ok(engine.getCurrentQuestion()?.explanation);
    assert.equal(engine.snapshot().question?.explanation, undefined);

    engine.submitVote(1, "r1-q1", "b", 0.5);
    engine.advance();
    engine.advance();
    assert.equal(engine.snapshot().phase, "reveal");
    assert.equal(engine.snapshot().question?.explanation, undefined);

    const revealed = engine.reveal("b");
    assert.equal(revealed.ok, true);
    const text = engine.snapshot().question?.explanation;
    assert.equal(typeof text, "string");
    assert.ok(text && text.includes("gym membership and skincare"));
  });

  it("starts a 90s clock on scored questions and locks when it expires", () => {
    let now = 1_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.joinCluster(1, undefined, "s1");
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R1");
    const snap = engine.snapshot();
    assert.equal(snap.voteDeadlineAt, now + 90_000);
    assert.equal(engine.msUntilVoteDeadline(), 90_000);

    now += 90_000;
    const late = engine.submitVote(1, "r1-q1", "b", 0.5);
    assert.equal(late.ok, false);
    if (!late.ok) assert.equal(late.error, "voting_closed");

    assert.equal(engine.expireOpenVote(), true);
    assert.equal(engine.step.phase, "voting_locked");
    assert.equal(engine.snapshot().voteDeadlineAt, null);
  });

  it("scores silence as a max-risk miss and does not let Insurance save it", () => {
    const engine = new GameEngine({ clusterCount: 4 });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    goTo(engine, (s) => s.phase === "clue" && s.roundId === "R1");
    engine.grantPowers([{ clusterNumber: 2, power: "insurance" }]);

    playQuestion(engine, [{ cluster: 1, option: "b", wager: 0.5 }], "b");
    const silent = engine.getCluster(2)!.lastResult!;
    assert.equal(silent.optionId, "");
    assert.equal(silent.correct, false);
    assert.equal(silent.y, -1);
    assert.equal(silent.alpha, 1.5);

    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R1");
    assert.ok(Math.abs(engine.getCluster(1)!.weight - Math.exp(0.5)) < 1e-9);
    assert.ok(Math.abs(engine.getCluster(2)!.weight - Math.exp(-1.5)) < 1e-9);
    assert.equal(engine.getCluster(2)!.power?.used, false);
  });

  it("gives Foresight a short grace window when the main clock expires", () => {
    let now = 5_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    engine.joinCluster(3, undefined, "s3");
    engine.grantPowers([{ clusterNumber: 1, power: "foresight" }]);
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R4" && s.questionIndex === 1);
    const q = engine.getCurrentQuestion()!;
    engine.submitVote(2, q.id, "b", 0.5);

    now += 90_000;
    assert.equal(engine.expireOpenVote(), true);
    assert.equal(engine.step.phase, "voting_open");
    assert.equal(engine.snapshot().foresightGraceActive, true);
    assert.equal(engine.clusterView(1)?.foresightWaiting, false);
    assert.ok(engine.clusterView(1)?.crowdSplit);
    assert.equal(engine.msUntilVoteDeadline(), 15_000);

    const lateCrowd = engine.submitVote(3, q.id, "a", 0.5);
    assert.equal(lateCrowd.ok, false);
    if (!lateCrowd.ok) assert.equal(lateCrowd.error, "voting_closed");

    const lateForesight = engine.submitVote(1, q.id, "a", 0.5);
    assert.equal(lateForesight.ok, true);

    now += 15_000;
    assert.equal(engine.expireOpenVote(), true);
    assert.equal(engine.step.phase, "voting_locked");
  });
});

describe("clue look-up then 90s vote", () => {
  it("starts a 30s projector clock on clue and opens voting with 90s when it expires", () => {
    let now = 2_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    engine.joinCluster(1, undefined, "s1");
    goTo(engine, (s) => s.phase === "clue" && s.roundId === "R1");
    const clueSnap = engine.snapshot();
    assert.equal(clueSnap.question, null);
    assert.ok(clueSnap.clue);
    assert.equal(clueSnap.clueDeadlineAt, now + 30_000);
    assert.equal(engine.msUntilClueDeadline(), 30_000);

    now += 29_000;
    assert.equal(engine.expireClue(), false);
    now += 1_000;
    assert.equal(engine.expireClue(), true);
    assert.equal(engine.step.phase, "voting_open");
    assert.equal(engine.step.questionIndex, 1);
    const voteSnap = engine.snapshot();
    assert.ok(voteSnap.question);
    assert.equal(voteSnap.clue, null);
    assert.equal(voteSnap.clueDeadlineAt, null);
    assert.equal(voteSnap.voteDeadlineAt, now + 90_000);
  });

  it("exposes one clock pulse for clue then vote remaining", () => {
    let now = 2_100_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    engine.joinCluster(1, undefined, "s1");
    unlockPlayRound(engine, "R1");
    assert.equal(engine.playRound("R1").ok, true);
    const clueClock = engine.clock();
    assert.equal(clueClock.clueRemainingMs, 30_000);
    assert.equal(clueClock.voteRemainingMs, null);
    assert.equal(clueClock.clueDeadlineAt, now + 30_000);
    now += 5_000;
    assert.equal(engine.clock().clueRemainingMs, 25_000);

    now += 25_000;
    assert.equal(engine.expireClue(), true);
    const voteClock = engine.clock();
    assert.equal(voteClock.clueRemainingMs, null);
    assert.equal(engine.clock().voteRemainingMs, 90_000);
  });

  it("unlocks Play Round 0–5 in order and Final testing only after weights lock", () => {
    const engine = new GameEngine({ clusterCount: 0 });
    const blocked = engine.playRound("R1");
    assert.equal(blocked.ok, false);

    engine.setClusterCount(4);
    assert.deepEqual(engine.snapshot().unlockedPlayRoundIds, ["R0"]);
    const skip = engine.playRound("R1");
    assert.equal(skip.ok, false);
    if (!skip.ok) assert.match(skip.message, /Round 0/);

    const r0 = engine.playRound("R0");
    assert.equal(r0.ok, true);
    assert.equal(engine.step.phase, "clue");
    assert.equal(engine.step.roundId, "R0");
    assert.equal(engine.msUntilClueDeadline(), null);
    assert.equal(engine.playRound("R1").ok, false);

    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R0");
    assert.deepEqual(engine.snapshot().unlockedPlayRoundIds, ["R0", "R1"]);
    engine.back();
    assert.ok(engine.snapshot().unlockedPlayRoundIds.includes("R1"));
    const r1 = engine.playRound("R1");
    assert.equal(r1.ok, true);
    assert.equal(engine.step.roundId, "R1");
    assert.equal(engine.playRound("R0").ok, true);
    assert.ok(engine.snapshot().unlockedPlayRoundIds.includes("R1"));
    assert.equal(engine.playRound("R3").ok, false);

    const finEarly = engine.playRound("FINAL");
    assert.equal(finEarly.ok, false);
    if (!finEarly.ok) assert.match(finEarly.message, /Lock weights/);
    assert.equal(engine.snapshot().weightsFrozen, false);

    goTo(engine, (s) => s.phase === "freeze");
    assert.equal(engine.snapshot().weightsFrozen, true);
    assert.ok(engine.snapshot().unlockedPlayRoundIds.includes("FINAL"));

    const restored = new GameEngine({ clusterCount: 4 });
    restored.restore(engine.serialize());
    assert.ok(restored.snapshot().unlockedPlayRoundIds.includes("FINAL"));
    assert.equal(restored.snapshot().weightsFrozen, true);

    const fin = engine.playRound("FINAL");
    assert.equal(fin.ok, true);
    assert.equal(engine.step.phase, "final_inference_open");
    assert.equal(engine.step.roundId, "FINAL");
    const finalSnap = engine.snapshot();
    assert.ok(finalSnap.question);
    assert.equal(finalSnap.question?.wagerRequired, false);
    assert.equal(finalSnap.question?.media, undefined);
    assert.equal(finalSnap.clue, null);
    assert.equal(finalSnap.roundTitle, "Final testing");
    assert.equal(finalSnap.finalEnvironments?.length, 3);
    assert.ok(finalSnap.voteDeadlineAt);
  });

  it("runs a video-ended then 30s flow on Round 0 warm-up", () => {
    let now = 2_500_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    assert.equal(engine.playRound("R0").ok, true);
    assert.equal(engine.msUntilClueDeadline(), null);
    assert.equal(engine.snapshot().clueDeadlineAt, null);
    assert.equal(engine.snapshot().clue?.media?.autoplay, false);
    now += 14_000;
    assert.equal(engine.step.phase, "clue");
    assert.equal(engine.expireClue(), true);
    assert.equal(engine.step.phase, "voting_open");
    assert.equal(engine.msUntilVoteDeadline(), 30_000);
  });

  it("runs the 30s then 90s flow on timed scored rounds", () => {
    let now = 3_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    for (const roundId of ["R1", "R3", "R4"] as const) {
      unlockPlayRound(engine, roundId);
      const started = engine.playRound(roundId);
      assert.equal(started.ok, true, `play ${roundId}`);
      assert.equal(engine.step.phase, "clue");
      assert.equal(engine.snapshot().question, null);
      now += 30_000;
      assert.equal(engine.expireClue(), true);
      const after = engine.snapshot().phase;
      assert.equal(after, "voting_open", `${roundId} opened vote, got ${after}`);
      assert.ok(engine.snapshot().question);
      assert.equal(engine.snapshot().clue, null);
      assert.equal(engine.msUntilVoteDeadline(), 90_000);
    }
  });

  it("opens the final testing round with 90s on phones and A/B/C on the projector, then calculates", () => {
    let now = 3_500_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    unlockPlayRound(engine, "FINAL");
    const started = engine.playRound("FINAL");
    assert.equal(started.ok, true);
    assert.equal(engine.step.phase, "final_inference_open");
    const open = engine.snapshot();
    assert.ok(open.question);
    assert.equal(open.clue, null);
    assert.equal(open.question?.wagerRequired, false);
    assert.equal(open.finalEnvironments?.map((p) => p.optionId).join(""), "abc");
    assert.equal(engine.msUntilVoteDeadline(), 90_000);
    assert.equal(engine.msUntilClueDeadline(), null);

    engine.submitVote(1, "final", "b", null);
    now += 89_000;
    assert.equal(engine.expireOpenVote(), false);
    now += 1_000;
    assert.equal(engine.expireOpenVote(), true);
    assert.equal(engine.step.phase, "final_inference_locked");
    assert.equal(engine.msUntilCalculatingDeadline(), ENSEMBLE_CALCULATING_MS);
    assert.equal(engine.snapshot().ensemble, null);

    now += ENSEMBLE_CALCULATING_MS - 1;
    assert.equal(engine.expireCalculating(), false);
    now += 1;
    assert.equal(engine.expireCalculating(), true);
    assert.equal(engine.step.phase, "ensemble");
    const bars = engine.snapshot().ensemble;
    assert.ok(bars);
    const b = bars.find((x) => x.optionId === "b");
    assert.ok((b?.pct ?? 0) > 0);
  });

  it("opens Round 2 with no clue clock and starts the vote when the video ends", () => {
    let now = 4_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    unlockPlayRound(engine, "R2");
    assert.equal(engine.playRound("R2").ok, true);
    const clueSnap = engine.snapshot();
    assert.equal(clueSnap.phase, "clue");
    assert.equal(clueSnap.roundId, "R2");
    assert.equal(clueSnap.question, null);
    assert.equal(clueSnap.clue?.media?.autoplay, false);
    assert.equal(clueSnap.clueDeadlineAt, null);
    assert.equal(engine.msUntilClueDeadline(), null);
    assert.ok(clueSnap.clueStartedAt);

    now += 120_000;
    assert.equal(engine.step.phase, "clue");
    assert.equal(engine.expireClue(), true);
    assert.equal(engine.step.phase, "voting_open");
    const voteSnap = engine.snapshot();
    assert.ok(voteSnap.question);
    assert.equal(voteSnap.clue, null);
    assert.equal(voteSnap.voteDeadlineAt, now + 90_000);
    assert.equal(voteSnap.clueDeadlineAt, null);
  });

  it("opens Round 5 with no clue clock and starts the vote when the video ends", () => {
    let now = 4_500_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    unlockPlayRound(engine, "R5");
    assert.equal(engine.playRound("R5").ok, true);
    const clueSnap = engine.snapshot();
    assert.equal(clueSnap.phase, "clue");
    assert.equal(clueSnap.roundId, "R5");
    assert.equal(clueSnap.question, null);
    assert.equal(clueSnap.clue?.media?.type, "video");
    assert.equal(clueSnap.clue?.media?.autoplay, false);
    assert.equal(clueSnap.clueDeadlineAt, null);
    assert.equal(engine.msUntilClueDeadline(), null);
    assert.ok(clueSnap.clueStartedAt);

    now += 180_000;
    assert.equal(engine.step.phase, "clue");
    assert.equal(engine.expireClue(), true);
    assert.equal(engine.step.phase, "voting_open");
    const voteSnap = engine.snapshot();
    assert.ok(voteSnap.question);
    assert.equal(voteSnap.question?.id, "r5-q1");
    assert.equal(voteSnap.clue, null);
    assert.equal(voteSnap.voteDeadlineAt, now + 90_000);
    assert.equal(voteSnap.clueDeadlineAt, null);
  });
});

describe("power-ups", () => {
  it("lets only the top 3 claim during power_grant", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    engine.setWeight(1, 8);
    engine.setWeight(2, 5);
    engine.setWeight(3, 4);
    engine.setWeight(4, 1);
    goTo(engine, (s) => s.phase === "power_grant");
    const ok = engine.claimPower(1, "insurance");
    assert.equal(ok.ok, true);
    const denied = engine.claimPower(4, "amplify");
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.error, "not_top_three");
  });

  it("gives the top 3 a 30-second pick window after R3, then advances", () => {
    let now = 5_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    engine.joinCluster(3, undefined, "s3");
    engine.joinCluster(4, undefined, "s4");
    engine.setWeight(1, 8);
    engine.setWeight(2, 5);
    engine.setWeight(3, 4);
    engine.setWeight(4, 1);
    goTo(engine, (s) => s.phase === "power_grant");
    const snap = engine.snapshot();
    assert.equal(snap.powerGrantDeadlineAt, now + 30_000);
    assert.equal(engine.clock().powerGrantRemainingMs, 30_000);
    assert.equal(engine.clusterView(1)?.canClaimPower, true);
    assert.equal(engine.clusterView(4)?.canClaimPower, false);

    now += 29_999;
    assert.equal(engine.expirePowerGrant(), false);
    now += 1;
    assert.equal(engine.claimPower(2, "amplify").ok, false);
    assert.equal(engine.expirePowerGrant(), true);
    assert.equal(engine.step.phase, "clue");
    assert.equal(engine.step.roundId, "R4");
    assert.equal(engine.snapshot().powerGrantDeadlineAt, null);
  });

  it("Insurance zeroes a miss and Amplify locks alpha at 2.0 on Round 4 question 1", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R4" && s.questionIndex === 1);
    engine.setWeight(1, 2);
    engine.setWeight(2, 2);
    engine.setWeight(3, 2);
    engine.grantPowers([
      { clusterNumber: 1, power: "insurance" },
      { clusterNumber: 2, power: "amplify" },
      { clusterNumber: 3, power: "amplify" },
    ]);
    playQuestion(
      engine,
      [
        { cluster: 1, option: "a", wager: 1.5 },
        { cluster: 2, option: "b", wager: 0.5 },
        { cluster: 3, option: "a", wager: 1.5 },
      ],
      "b",
    );
    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R4");
    // cluster 1: wrong with insurance → no change
    assert.ok(Math.abs(engine.getCluster(1)!.weight - 2) < 1e-9);
    // cluster 2: correct with amplify α=2.0, y=+1 → 2 * exp(2)
    assert.ok(Math.abs(engine.getCluster(2)!.weight - 2 * Math.exp(2)) < 1e-9);
    // cluster 3: wrong with amplify α=2.0, y=-1 → 2 * exp(-2)
    assert.ok(Math.abs(engine.getCluster(3)!.weight - 2 * Math.exp(-2)) < 1e-9);
    assert.equal(engine.getCluster(1)!.power?.used, true);
    assert.equal(engine.getCluster(2)!.power?.used, true);
    assert.equal(engine.getCluster(3)!.power?.used, true);
  });

  it("Amplify overwrites any submitted wager to 2.0 on Round 4 question 1", () => {
    const engine = new GameEngine({ clusterCount: 4 });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R4" && s.questionIndex === 1);
    engine.grantPowers([{ clusterNumber: 1, power: "amplify" }]);
    const q = engine.getCurrentQuestion()!;
    const ignored = engine.submitVote(1, q.id, "a", null);
    assert.equal(ignored.ok, true);
    assert.equal(engine.getCluster(1)?.pendingVote?.wager, 2);
    const noWager = engine.submitVote(2, q.id, "b", 0.5);
    assert.equal(noWager.ok, true);
    assert.equal(engine.getCluster(2)?.pendingVote?.wager, 0.5);
  });

  it("does not let Insurance or Amplify apply on Round 4 question 2", () => {
    const engine = new GameEngine({ clusterCount: 4 });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R4" && s.questionIndex === 1);
    engine.setWeight(1, 2);
    engine.setWeight(2, 2);
    engine.grantPowers([
      { clusterNumber: 1, power: "insurance" },
      { clusterNumber: 2, power: "amplify" },
    ]);
    playQuestion(
      engine,
      [
        { cluster: 1, option: "b", wager: 1 },
        { cluster: 2, option: "a", wager: 0.5 },
      ],
      "b",
    );
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R4" && s.questionIndex === 2);
    const q2 = engine.getCurrentQuestion()!;
    engine.submitVote(1, q2.id, "a", 1);
    engine.submitVote(2, q2.id, "b", 0.5);
    engine.advance();
    engine.advance();
    engine.reveal("b");
    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R4");
    // Q1: cluster 1 hit (no insurance), cluster 2 miss with amplify α=2.0
    // Q2: cluster 1 miss α=1, cluster 2 hit α=0.5 — leftover powers already burned
    const c1After = 2 * Math.exp(1) * Math.exp(-1);
    const c2After = 2 * Math.exp(-2) * Math.exp(0.5);
    assert.ok(Math.abs(engine.getCluster(1)!.weight - c1After) < 1e-9);
    assert.ok(Math.abs(engine.getCluster(2)!.weight - c2After) < 1e-9);
    assert.ok(Math.abs((engine.getCluster(1)!.roundWeightBefore ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((engine.getCluster(1)!.roundWeightAfter ?? 0) - c1After) < 1e-9);
    assert.ok(Math.abs((engine.getCluster(2)!.roundWeightBefore ?? 0) - 2) < 1e-9);
    assert.ok(Math.abs((engine.getCluster(2)!.roundWeightAfter ?? 0) - c2After) < 1e-9);
  });

  it("Foresight sees the question but cannot vote until the room clock ends", () => {
    let now = 8_000_000;
    const engine = new GameEngine({ clusterCount: 6, now: () => now });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    engine.joinCluster(3, undefined, "s3");
    engine.grantPowers([{ clusterNumber: 1, power: "foresight" }]);
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R4" && s.questionIndex === 1);
    const q = engine.getCurrentQuestion()!;
    assert.equal(q.id, "r4-q1");
    const early = engine.submitVote(1, q.id, "a", 0.5);
    assert.equal(early.ok, false);
    if (!early.ok) assert.equal(early.error, "foresight_wait");
    assert.equal(engine.clusterView(1)?.foresightWaiting, true);
    assert.equal(engine.clusterView(1)?.crowdSplit, null);

    engine.submitVote(2, q.id, "c", 0.5);
    engine.submitVote(3, q.id, "c", 1.5);
    assert.equal(engine.clusterView(1)?.foresightWaiting, true);
    assert.equal(engine.clusterView(1)?.crowdSplit, null);

    now += 90_000;
    assert.equal(engine.expireOpenVote(), true);
    const view = engine.clusterView(1);
    assert.equal(view?.foresightWaiting, false);
    assert.equal(engine.getCluster(1)!.power?.used, true);
    const c = view?.crowdSplit?.find((s) => s.optionId === "c");
    assert.equal(c?.count, 2);
    assert.equal(c?.pct, 1);
    const later = engine.submitVote(1, q.id, "a", 0.5);
    assert.equal(later.ok, true);
  });

  it("host Next starts Foresight extra instead of skipping the extra window", () => {
    let now = 9_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    engine.grantPowers([{ clusterNumber: 1, power: "foresight" }]);
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R4" && s.questionIndex === 1);
    const q = engine.getCurrentQuestion()!;
    engine.submitVote(2, q.id, "c", 0.5);

    engine.advance();
    assert.equal(engine.step.phase, "voting_open");
    assert.equal(engine.snapshot().foresightGraceActive, true);
    assert.equal(engine.clusterView(1)?.foresightWaiting, false);
    assert.equal(engine.msUntilVoteDeadline(), 15_000);
    assert.equal(engine.submitVote(1, q.id, "c", 1).ok, true);

    engine.advance();
    assert.equal(engine.step.phase, "voting_locked");
  });

  it("resolves Insurance, Amplify, and Foresight together on Round 4 question 1", () => {
    let now = 10_000_000;
    const engine = new GameEngine({ clusterCount: 6, now: () => now });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    engine.joinCluster(3, undefined, "s3");
    engine.joinCluster(4, undefined, "s4");
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R4" && s.questionIndex === 1);
    engine.setWeight(1, 2);
    engine.setWeight(2, 2);
    engine.setWeight(3, 2);
    engine.setWeight(4, 2);
    engine.grantPowers([
      { clusterNumber: 1, power: "insurance" },
      { clusterNumber: 2, power: "amplify" },
      { clusterNumber: 3, power: "foresight" },
    ]);
    const q = engine.getCurrentQuestion()!;
    assert.equal(engine.submitVote(1, q.id, "a", 1.5).ok, true);
    assert.equal(engine.submitVote(2, q.id, "c", 0.5).ok, true);
    assert.equal(engine.submitVote(4, q.id, "c", 1).ok, true);
    assert.equal(engine.submitVote(3, q.id, "c", 0.5).ok, false);

    engine.advance();
    assert.equal(engine.snapshot().foresightGraceActive, true);
    const split = engine.clusterView(3)?.crowdSplit?.find((s) => s.optionId === "c");
    assert.equal(split?.count, 2);
    assert.equal(engine.submitVote(3, q.id, "c", 0.8).ok, true);

    engine.advance();
    engine.advance();
    assert.equal(engine.reveal("c").ok, true);
    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R4");

    assert.ok(Math.abs(engine.getCluster(1)!.weight - 2) < 1e-9);
    assert.ok(Math.abs(engine.getCluster(2)!.weight - 2 * Math.exp(2)) < 1e-9);
    assert.ok(Math.abs(engine.getCluster(3)!.weight - 2 * Math.exp(0.8)) < 1e-9);
    assert.ok(Math.abs(engine.getCluster(4)!.weight - 2 * Math.exp(1)) < 1e-9);
    assert.equal(engine.getCluster(1)!.power?.used, true);
    assert.equal(engine.getCluster(2)!.power?.used, true);
    assert.equal(engine.getCluster(3)!.power?.used, true);
    assert.equal(engine.getCluster(1)!.lastResult?.powerApplied, "insurance");
    assert.equal(engine.getCluster(2)!.lastResult?.powerApplied, "amplify");
  });
});

describe("freeze + ensemble", () => {
  it("locks weights and aggregates the final A/B/C vote by frozen weight", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    goTo(engine, (s) => s.phase === "active_query");
    engine.setWeight(1, 4);
    engine.setWeight(2, 1);
    goTo(engine, (s) => s.phase === "freeze");
    assert.equal(engine.getCluster(1)!.frozenWeight, 4);
    engine.setWeight(1, 99);
    goTo(engine, (s) => s.phase === "final_inference_open");
    const q = engine.getCurrentQuestion()!;
    assert.equal(q.id, "final");
    const wagered = engine.submitVote(1, "final", "b", 0.5);
    assert.equal(wagered.ok, false);
    engine.submitVote(1, "final", "b", null);
    engine.submitVote(2, "final", "a", null);
    goTo(engine, (s) => s.phase === "ensemble");
    const bars = engine.snapshot().ensemble!;
    const b = bars.find((x) => x.optionId === "b")!;
    const a = bars.find((x) => x.optionId === "a")!;
    assert.equal(b.score, 4);
    assert.equal(a.score, 1);
    assert.ok(b.pct > a.pct);
  });

  it("weighted prediction lands on the answer-key environment (B) even when a bigger, lighter bloc backs a decoy", () => {
    const engine = new GameEngine({ clusterCount: 6 });
    for (let n = 1; n <= 5; n++) engine.joinCluster(n, undefined, `s${n}`);
    goTo(engine, (s) => s.phase === "active_query");
    // Three light clusters back decoy A; two heavy clusters back the real setup B.
    engine.setWeight(1, 1);
    engine.setWeight(2, 1);
    engine.setWeight(3, 1);
    engine.setWeight(4, 3);
    engine.setWeight(5, 3);
    goTo(engine, (s) => s.phase === "freeze");
    goTo(engine, (s) => s.phase === "final_inference_open");
    assert.equal(engine.getCurrentQuestion()!.id, "final");
    engine.submitVote(1, "final", "a", null);
    engine.submitVote(2, "final", "a", null);
    engine.submitVote(3, "final", "a", null);
    engine.submitVote(4, "final", "b", null);
    engine.submitVote(5, "final", "b", null);
    goTo(engine, (s) => s.phase === "ensemble");

    const bars = engine.snapshot().ensemble!;
    const a = bars.find((x) => x.optionId === "a")!;
    const b = bars.find((x) => x.optionId === "b")!;
    // Raw headcount favors A (3 votes vs 2), but frozen weight favors B (6 vs 3).
    assert.equal(a.score, 3);
    assert.equal(b.score, 6);
    const winner = [...bars].sort((x, y) => y.pct - x.pct)[0];
    assert.equal(winner.optionId, "b");
    // The engine's weighted call matches the server answer key for the final round.
    assert.equal(winner.optionId, ANSWER_KEY.final);
  });

  it("can miss: a heavy decoy bloc makes the weighted engine pick the wrong environment", () => {
    const engine = new GameEngine({ clusterCount: 6 });
    for (let n = 1; n <= 4; n++) engine.joinCluster(n, undefined, `s${n}`);
    goTo(engine, (s) => s.phase === "active_query");
    // The heaviest, most confident clusters back decoy A — the crowd's learned bias.
    engine.setWeight(1, 5);
    engine.setWeight(2, 5);
    engine.setWeight(3, 1);
    engine.setWeight(4, 1);
    goTo(engine, (s) => s.phase === "freeze");
    goTo(engine, (s) => s.phase === "final_inference_open");
    engine.submitVote(1, "final", "a", null);
    engine.submitVote(2, "final", "a", null);
    engine.submitVote(3, "final", "b", null);
    engine.submitVote(4, "final", "b", null);
    goTo(engine, (s) => s.phase === "ensemble");

    const bars = engine.snapshot().ensemble!;
    const winner = [...bars].sort((x, y) => y.pct - x.pct)[0];
    // The engine confidently calls A (weight 10) over the real B (weight 2)...
    assert.equal(winner.optionId, "a");
    // ...which does NOT match the answer key — a wrong prediction the show must handle.
    assert.notEqual(winner.optionId, ANSWER_KEY.final);
  });
});

describe("phase sequence", () => {
  it("ends on debrief after R5, with no R6", () => {
    const rounds = PHASE_SEQUENCE.map((s) => s.roundId).filter(Boolean);
    assert.equal(rounds.includes("R6" as never), false);
    assert.equal(PHASE_SEQUENCE.at(-1)?.phase, "debrief");
    assert.equal(
      PHASE_SEQUENCE.some((s) => s.phase === "clue" && s.roundId === "FINAL"),
      false,
    );
    const engine = new GameEngine({ clusterCount: 20 });
    goTo(engine, (s) => s.phase === "debrief");
    engine.advance();
    assert.equal(engine.step.phase, "debrief");
  });

  it("R1 and R2 have one scored question; later rounds keep two", () => {
    const open = (roundId: string) =>
      PHASE_SEQUENCE.filter((s) => s.roundId === roundId && s.phase === "voting_open");
    assert.equal(open("R1").length, 1);
    assert.equal(open("R2").length, 1);
    assert.equal(open("R0").length, 2);
    assert.equal(open("R3").length, 2);
    assert.equal(open("R4").length, 2);
    assert.equal(open("R5").length, 2);
  });
});
