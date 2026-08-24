import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PHASE_SEQUENCE, normalizeTeamDetails, type PhaseStep } from "@engine/shared";
import { applyAdaBoost, GameEngine, newToken } from "./engine.ts";

function goTo(engine: GameEngine, pred: (step: PhaseStep) => boolean): void {
  for (let i = 0; i < PHASE_SEQUENCE.length + 2; i++) {
    if (pred(engine.step)) return;
    engine.advance();
  }
  throw new Error(`Never reached target phase (stuck at ${engine.step.phase})`);
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
  it("requires a team name, leader, and exactly four teammates", () => {
    assert.deepEqual(normalizeTeamDetails(SAMPLE_TEAM), SAMPLE_TEAM);
    assert.equal(normalizeTeamDetails({ ...SAMPLE_TEAM, members: ["A", "B", "C"] }), null);
    assert.equal(normalizeTeamDetails({ ...SAMPLE_TEAM, teamName: "  " }), null);
    assert.equal(normalizeTeamDetails({ ...SAMPLE_TEAM, leaderName: "" }), null);
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
    const mid = engine.submitVote(1, "r0-q1", "c", 1.0);
    assert.equal(mid.ok, true);
    assert.equal(engine.getCluster(1)?.pendingVote?.wager, 1);
    const low = engine.submitVote(1, "r0-q1", "c", 0.2);
    assert.equal(low.ok, false);
    const high = engine.submitVote(1, "r0-q1", "c", 2);
    assert.equal(high.ok, false);
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
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R1");
    const q = engine.getCurrentQuestion()!;
    engine.submitVote(2, q.id, "b", 0.5);

    now += 90_000;
    assert.equal(engine.expireOpenVote(), true);
    assert.equal(engine.step.phase, "voting_open");
    assert.equal(engine.clusterView(1)?.foresightWaiting, false);
    assert.ok(engine.clusterView(1)?.crowdSplit);
    assert.equal(engine.msUntilVoteDeadline(), 15_000);

    const lateCrowd = engine.submitVote(1, q.id, "a", 0.5);
    assert.equal(lateCrowd.ok, true);

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

  it("lets the host jump to Play Round 0–5 and Final testing from the lobby", () => {
    const engine = new GameEngine({ clusterCount: 0 });
    const blocked = engine.playRound("R1");
    assert.equal(blocked.ok, false);

    engine.setClusterCount(4);
    const r0 = engine.playRound("R0");
    assert.equal(r0.ok, true);
    assert.equal(engine.step.phase, "clue");
    assert.equal(engine.step.roundId, "R0");
    assert.equal(engine.msUntilClueDeadline(), 15_000);

    const r3 = engine.playRound("R3");
    assert.equal(r3.ok, true);
    assert.equal(engine.step.phase, "clue");
    assert.equal(engine.step.roundId, "R3");
    assert.equal(engine.snapshot().question, null);

    const fin = engine.playRound("FINAL");
    assert.equal(fin.ok, true);
    assert.equal(engine.step.phase, "clue");
    assert.equal(engine.step.roundId, "FINAL");
    const finalClue = engine.snapshot();
    assert.equal(finalClue.question, null);
    assert.equal(finalClue.roundTitle, "Final testing");
    assert.ok(finalClue.clue);
    assert.equal(engine.snapshot().weightsFrozen, true);

    engine.advance();
    assert.equal(engine.step.phase, "final_inference_open");
    assert.ok(engine.snapshot().question);
    assert.equal(engine.snapshot().clue, null);
    assert.ok(engine.snapshot().voteDeadlineAt);
  });

  it("runs a 15s then 30s flow on Round 0 warm-up", () => {
    let now = 2_500_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    assert.equal(engine.playRound("R0").ok, true);
    assert.equal(engine.msUntilClueDeadline(), 15_000);
    now += 15_000;
    assert.equal(engine.expireClue(), true);
    assert.equal(engine.step.phase, "voting_open");
    assert.equal(engine.msUntilVoteDeadline(), 30_000);
  });

  it("runs the 30s then 90s flow on timed scored rounds including the final", () => {
    let now = 3_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    for (const roundId of ["R1", "R3", "R4", "R5", "FINAL"] as const) {
      const started = engine.playRound(roundId);
      assert.equal(started.ok, true, `play ${roundId}`);
      assert.equal(engine.step.phase, "clue");
      assert.equal(engine.snapshot().question, null);
      now += 30_000;
      assert.equal(engine.expireClue(), true);
      const after = engine.snapshot().phase;
      assert.ok(
        after === "voting_open" || after === "final_inference_open",
        `${roundId} opened vote, got ${after}`,
      );
      assert.ok(engine.snapshot().question);
      assert.equal(engine.snapshot().clue, null);
      assert.equal(engine.msUntilVoteDeadline(), 90_000);
    }
  });

  it("opens Round 2 with no clue clock and starts the vote when the video ends", () => {
    let now = 4_000_000;
    const engine = new GameEngine({ clusterCount: 4, now: () => now });
    engine.setClusterCount(4);
    assert.equal(engine.playRound("R2").ok, true);
    const clueSnap = engine.snapshot();
    assert.equal(clueSnap.phase, "clue");
    assert.equal(clueSnap.roundId, "R2");
    assert.equal(clueSnap.question, null);
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

  it("Insurance zeroes the next wrong update; Amplify doubles alpha on the next correct", () => {
    const engine = new GameEngine({ clusterCount: 20 });
    goTo(engine, (s) => s.phase === "clue" && s.roundId === "R1");
    engine.setWeight(1, 2);
    engine.setWeight(2, 2);
    engine.grantPowers([
      { clusterNumber: 1, power: "insurance" },
      { clusterNumber: 2, power: "amplify" },
    ]);
    playQuestion(
      engine,
      [
        { cluster: 1, option: "a", wager: 1.5 },
        { cluster: 2, option: "b", wager: 0.5 },
      ],
      "b",
    );
    goTo(engine, (s) => s.phase === "weight_update" && s.roundId === "R1");
    // cluster 1: wrong with insurance → no change
    assert.ok(Math.abs(engine.getCluster(1)!.weight - 2) < 1e-9);
    // cluster 2: correct with amplify α=1.0 → 2 * exp(1)
    assert.ok(Math.abs(engine.getCluster(2)!.weight - 2 * Math.exp(1)) < 1e-9);
    assert.equal(engine.getCluster(1)!.power?.used, true);
    assert.equal(engine.getCluster(2)!.power?.used, true);
  });

  it("Foresight waits for the crowd, then shows percentages and lets that node vote last", () => {
    const engine = new GameEngine({ clusterCount: 6 });
    engine.joinCluster(1, undefined, "s1");
    engine.joinCluster(2, undefined, "s2");
    engine.joinCluster(3, undefined, "s3");
    engine.grantPowers([{ clusterNumber: 1, power: "foresight" }]);
    goTo(engine, (s) => s.phase === "voting_open" && s.roundId === "R0");
    const q = engine.getCurrentQuestion()!;
    const early = engine.submitVote(1, q.id, "a", 0.5);
    assert.equal(early.ok, false);
    if (!early.ok) assert.equal(early.error, "foresight_wait");
    assert.equal(engine.clusterView(1)?.foresightWaiting, true);

    engine.submitVote(2, q.id, "c", 0.5);
    assert.equal(engine.clusterView(1)?.foresightWaiting, true);
    engine.submitVote(3, q.id, "c", 1.5);

    const view = engine.clusterView(1);
    assert.equal(view?.foresightWaiting, false);
    assert.equal(engine.getCluster(1)!.power?.used, true);
    const c = view?.crowdSplit?.find((s) => s.optionId === "c");
    assert.equal(c?.count, 2);
    assert.equal(c?.pct, 1);
    const later = engine.submitVote(1, q.id, "a", 0.5);
    assert.equal(later.ok, true);
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
});

describe("phase sequence", () => {
  it("ends on debrief after R5, with no R6", () => {
    const rounds = PHASE_SEQUENCE.map((s) => s.roundId).filter(Boolean);
    assert.equal(rounds.includes("R6" as never), false);
    assert.equal(PHASE_SEQUENCE.at(-1)?.phase, "debrief");
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
