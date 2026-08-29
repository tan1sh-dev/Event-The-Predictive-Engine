import { useEffect, useState } from "react";
import {
  AMPLIFY_WAGER,
  FORESIGHT_GRACE_MS,
  MID_WAGER,
  POWER_GRANT_DURATION_MS,
  clueDurationForRound,
  isPowerQuestion,
  normalizeWager,
  voteDurationForRound,
  type ClusterView,
  type PowerUp,
  type PublicClusterState,
  type Question,
  type QuestionResult,
  type VoteSplitEntry,
  type Wager,
} from "@engine/shared";
import Pressable from "../components/Pressable.tsx";
import VoteTimer, { useVoteRemainingMs } from "../components/VoteTimer.tsx";
import WagerArc from "../components/WagerArc.tsx";
import WeightOrb from "../components/WeightOrb.tsx";
import { engineVerdict } from "../lib/labels.ts";

const LETTER: Record<string, string> = { a: "A", b: "B", c: "C", d: "D" };

function optionLetter(optionId: string | null | undefined): string {
  if (!optionId) return "—";
  return LETTER[optionId] ?? optionId.toUpperCase();
}

function optionLine(question: Question | null | undefined, optionId: string | null | undefined): string {
  if (!optionId) return "No lock";
  const letter = optionLetter(optionId);
  const label = question?.options.find((o) => o.id === optionId)?.label;
  return label ? `${letter} — ${label}` : letter;
}

const POWERS: { id: PowerUp; title: string; body: string; variant: "mint" | "gold" | "danger" }[] =
  [
    {
      id: "insurance",
      title: "Insurance",
      body: "On Round 4 Q1, a miss costs zero weight. You still vote with everyone else.",
      variant: "mint",
    },
    {
      id: "amplify",
      title: "Amplify",
      body: "On Round 4 Q1, α locks at 2.0 — you cannot change it. Hit is y = +1, miss is y = −1. You still vote with everyone else.",
      variant: "danger",
    },
    {
      id: "foresight",
      title: "Foresight",
      body: "See Round 4 Q1 with the room. After the clock hits zero, you get 15s with the crowd split.",
      variant: "gold",
    },
  ];

function Media({ src, type, caption }: { src: string; type: string; caption?: string }) {
  return (
    <figure className="overflow-hidden rounded-3xl ring-1 ring-white/10">
      {type === "audio" ? (
        <audio className="w-full p-3" controls src={src} />
      ) : type === "video" ? (
        <video className="max-h-56 w-full bg-black object-contain" controls playsInline preload="metadata" src={src} />
      ) : (
        <img src={src} alt={caption ?? ""} className="max-h-48 w-full object-cover" />
      )}
      {caption && (
        <figcaption className="px-3 py-2 text-center text-[11px] tracking-wide text-cream/55">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function WaitCard({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="animate-pop orig-panel mt-8 p-6 text-center">
      <div className="orig-scanline" aria-hidden />
      <div className="orig-radar mx-auto mb-4" aria-hidden />
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">{kicker}</p>
      <h2 className="font-display mt-3 text-3xl font-bold">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-cream/65">{body}</p>
    </div>
  );
}

function CrowdSplit({ split }: { split: VoteSplitEntry[] }) {
  return (
    <div className="animate-pop orig-panel bg-[#071018]/80 p-4 ring-1 ring-gold/40">
      <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-gold">
        Crowd split
      </p>
      {split.map((s) => (
        <div key={s.optionId} className="mb-2">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>
              {LETTER[s.optionId] ?? s.optionId} · {s.label}
            </span>
            <span className="font-extrabold text-gold">{Math.round(s.pct * 100)}%</span>
          </div>
          <div className="orig-timer-bar">
            <div className="orig-timer-fill warn" style={{ width: `${Math.max(4, s.pct * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function VoteForm({
  question,
  wagerRequired,
  pendingOption,
  pendingWager,
  split,
  expired,
  canLock = true,
  fixedWager = null,
  onVote,
}: {
  question: Question;
  wagerRequired: boolean;
  pendingOption: string | null;
  pendingWager: Wager | null;
  split: VoteSplitEntry[] | null;
  expired: boolean;
  canLock?: boolean;
  fixedWager?: Wager | null;
  onVote: (optionId: string, wager: Wager | null, onAck?: (ok: boolean) => void) => void;
}) {
  const [option, setOption] = useState<string | null>(pendingOption);
  const [wager, setWager] = useState<Wager>(pendingWager ?? fixedWager ?? MID_WAGER);
  const [lockedIn, setLockedIn] = useState(Boolean(pendingOption));

  useEffect(() => {
    setOption(pendingOption);
    setWager(pendingWager ?? fixedWager ?? MID_WAGER);
    setLockedIn(Boolean(pendingOption));
  }, [question.id, fixedWager]);

  useEffect(() => {
    if (!pendingOption) return;
    setOption(pendingOption);
    setWager(pendingWager ?? fixedWager ?? MID_WAGER);
    setLockedIn(true);
  }, [pendingOption, pendingWager, fixedWager]);

  const displayWager = fixedWager ?? wager;
  const ready =
    Boolean(option) && (!wagerRequired || fixedWager != null || normalizeWager(wager) != null);
  const frozen = lockedIn || expired;

  const lockIn = () => {
    if (frozen || !canLock) return;
    if (!option) return;
    if (wagerRequired && fixedWager == null && wager == null) return;
    setLockedIn(true);
    onVote(
      option,
      wagerRequired ? (fixedWager ?? normalizeWager(wager) ?? wager) : null,
      (ok) => {
        if (!ok) setLockedIn(false);
      },
    );
  };

  return (
    <div className="flex flex-col gap-4 pb-8">
      {question.media && question.roundId !== "FINAL" && (
        <Media src={question.media.src} type={question.media.type} caption={question.media.caption} />
      )}
      <h2 className="font-display text-[1.65rem] leading-tight font-bold">{question.prompt}</h2>

      {split && <CrowdSplit split={split} />}

      <div className="flex flex-col gap-2.5">
        {question.options.map((opt, i) => {
          const on = option === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={frozen}
              onClick={() => {
                if (frozen) return;
                setOption(opt.id);
                if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
              }}
              className={`orig-option flex items-center gap-3 rounded-2xl px-3 py-3 text-left ${
                on ? "is-on" : ""
              } ${frozen ? "pointer-events-none" : ""} ${frozen && !on ? "opacity-50" : ""}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="orig-option-letter grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#071018] font-extrabold text-cyan">
                {LETTER[opt.id] ?? opt.id.toUpperCase()}
              </span>
              <span className="text-[15px] font-semibold leading-snug">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {wagerRequired && (
        <div className="orig-panel orig-wager-panel px-4 py-4">
          <div className="orig-scanline" aria-hidden />
          <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-cream/45">
            Confidence wager
          </p>
          <p className="font-display text-center text-4xl font-bold tabular-nums">
            α {displayWager.toFixed(1)}
          </p>
          <p className="mt-1 text-center text-[11px] font-bold uppercase tracking-widest text-cream/50">
            {fixedWager != null
              ? "Locked by Amplify"
              : wager <= 0.7
                ? "Low risk"
                : wager >= 1.3
                  ? "High risk"
                  : "Mid risk"}
          </p>
          {fixedWager == null ? (
            <WagerArc value={wager} onChange={setWager} disabled={frozen} />
          ) : (
            <p className="mt-3 text-center text-sm text-cream/55">
              Amplify fixed this at {fixedWager.toFixed(1)}. Pick an answer — that’s the only
              lever you have.
            </p>
          )}
        </div>
      )}

      {canLock && (
        <Pressable
          variant="go"
          className={`w-full ${lockedIn ? "disabled:!opacity-100" : ""}`}
          disabled={!ready || frozen}
          onClick={lockIn}
        >
          {lockedIn ? "Locked in" : "Lock in"}
        </Pressable>
      )}
      {canLock && !ready && (
        <p className="text-center text-[11px] text-cream/40">
          {wagerRequired && fixedWager == null
            ? "Pick an option, set α from 0.5 to 1.5, then lock in."
            : "Pick an option, then lock in."}
        </p>
      )}
      {canLock && lockedIn && (
        <div className="animate-stamp mx-auto rounded-full border-2 border-mint px-4 py-1 text-[11px] font-extrabold tracking-[0.2em] text-mint uppercase">
          Signal sent
        </div>
      )}

    </div>
  );
}

function WeightUpdateScreen({
  snapshot,
  me,
  roundWeightBefore,
  roundWeightAfter,
}: {
  snapshot: ClusterView["snapshot"];
  me: PublicClusterState | undefined;
  roundWeightBefore: number | null;
  roundWeightAfter: number | null;
}) {
  const before = me?.roundWeightBefore ?? roundWeightBefore;
  const after = me?.roundWeightAfter ?? roundWeightAfter;
  const showRoundDelta =
    snapshot.roundId !== "R0" && before != null && after != null;
  return (
    <div className="weight-update">
      <p className="weight-update-kicker">
        {snapshot.roundId === "R0" ? "Calibration · discarded" : "AdaBoost update"}
      </p>
      <WeightOrb
        visual={me?.visualWeight ?? 0.5}
        weight={showRoundDelta ? after : (me?.weight ?? 1)}
        fromWeight={showRoundDelta ? before : null}
        pulse
      />
      {snapshot.roundId === "R0" && (
        <p className="weight-update-note">
          Practice round. Every node snaps back to 1. The real learning starts next.
        </p>
      )}
    </div>
  );
}

export default function PhaseView({
  view,
  onVote,
  onClaim,
}: {
  view: ClusterView;
  onVote: (optionId: string, wager: Wager | null, onAck?: (ok: boolean) => void) => void;
  onClaim: (power: PowerUp) => void;
}) {
  const { snapshot } = view;
  const me = snapshot.clusters.find((c) => c.number === view.clusterNumber);
  const question = snapshot.question;
  const remainingMs = useVoteRemainingMs(snapshot.voteDeadlineAt, snapshot.serverTime, "vote");
  const clueRemainingMs = useVoteRemainingMs(snapshot.clueDeadlineAt, snapshot.serverTime, "clue");
  const powerGrantRemainingMs = useVoteRemainingMs(
    snapshot.powerGrantDeadlineAt,
    snapshot.serverTime,
    "power",
  );

  if (snapshot.phase === "lobby") {
    return (
      <WaitCard
        kicker="Node online"
        title={me?.team ? `${me.team.teamName} is in.` : `Cluster ${view.clusterNumber} is in.`}
        body={`${snapshot.connectedCount} / ${snapshot.clusterCount} phones on the network. Eyes on the projector — the host will feed the first signal.`}
      />
    );
  }

  if (snapshot.phase === "clue") {
    const voteSecs = Math.round(voteDurationForRound(snapshot.roundId) / 1000);
    const clueMs = clueDurationForRound(snapshot.roundId);
    const waitingOnVideo = clueMs == null;
    return (
      <div className="mt-5">
        {clueRemainingMs != null && clueMs != null && (
          <VoteTimer
            remainingMs={clueRemainingMs}
            totalMs={clueMs}
            kicker={clueRemainingMs <= 0 ? "Questions live" : "Look-up"}
          />
        )}
        <WaitCard
          kicker="Projector"
          title="Look up the clue"
          body={
            waitingOnVideo
              ? `The clip is on the projector. The question and a ${voteSecs}-second clock land here the moment it ends.`
              : `Eyes on the projector. The question starts on this phone the moment the clue ends, with a ${voteSecs}-second clock.`
          }
        />
      </div>
    );
  }

  if (
    (snapshot.phase === "voting_open" || snapshot.phase === "final_inference_open") &&
    question
  ) {
    const expired = remainingMs === 0;
    const grace = snapshot.foresightGraceActive;
    const waiting = view.foresightWaiting;
    const powerQuestion = isPowerQuestion(snapshot.roundId, snapshot.questionIndex);
    const armed =
      view.power &&
      !view.power.used &&
      powerQuestion &&
      (view.power.type === "insurance" || view.power.type === "amplify")
        ? view.power.type
        : null;
    const voteTotalMs = grace ? FORESIGHT_GRACE_MS : voteDurationForRound(snapshot.roundId);
    return (
      <div className="mt-5">
        {remainingMs != null && (
          <VoteTimer
            remainingMs={remainingMs}
            totalMs={voteTotalMs}
            kicker={
              waiting ? "Room clock" : grace && view.power?.type === "foresight" ? "Your extra 15s" : undefined
            }
          />
        )}
        {!waiting && (
          <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-cream/45">
            {snapshot.lockedCount} / {snapshot.clusterCount} locked in
          </p>
        )}
        {waiting && (
          <p className="mb-3 rounded-2xl bg-gold/12 px-4 py-2 text-center text-sm text-gold ring-1 ring-gold/30">
            Foresight is on. You see the question now. Lock-in and the crowd split open only after
            the room clock hits zero.
          </p>
        )}
        {armed && (
          <p className="mb-3 rounded-2xl bg-white/6 px-4 py-2 text-center text-sm text-cream/70 ring-1 ring-white/10">
            {armed === "insurance"
              ? "Insurance is armed — a miss on this question won’t cut your weight."
              : `Amplify is armed — your α is locked at ${AMPLIFY_WAGER.toFixed(1)}. Hit: y = +1. Miss: y = −1.`}
          </p>
        )}
        <VoteForm
          question={question}
          wagerRequired={
            !waiting && snapshot.phase === "voting_open" && question.wagerRequired
          }
          pendingOption={
            view.pendingVote &&
            (!view.pendingVote.questionId || view.pendingVote.questionId === question.id)
              ? view.pendingVote.optionId
              : null
          }
          pendingWager={
            view.pendingVote &&
            (!view.pendingVote.questionId || view.pendingVote.questionId === question.id)
              ? view.pendingVote.wager
              : null
          }
          split={grace ? view.crowdSplit : null}
          expired={expired}
          canLock={!waiting}
          fixedWager={armed === "amplify" ? AMPLIFY_WAGER : null}
          onVote={onVote}
        />
      </div>
    );
  }

  if (snapshot.phase === "voting_locked" || snapshot.phase === "final_inference_locked") {
    const pending =
      view.pendingVote &&
      (!view.pendingVote.questionId || view.pendingVote.questionId === question?.id)
        ? view.pendingVote
        : null;
    if (snapshot.phase === "final_inference_locked") {
      return (
        <WaitCard
          kicker="Engine"
          title="Engine calculating."
          body={
            pending
              ? `${optionLine(question, pending.optionId)} is in. Weights are frozen. Watch the projector for the prediction.`
              : "You didn’t lock in. The engine is still aggregating the weighted vote. Watch the projector."
          }
        />
      );
    }
    if (!pending) {
      return (
        <WaitCard
          kicker="No signal"
          title="You didn’t lock in."
          body="Silence is scored as a high-risk miss (α = 1.5) when weights update at the end of the round."
        />
      );
    }
    return (
      <WaitCard
        kicker="Locked"
        title={`${optionLetter(pending.optionId)} is in the engine.`}
        body={
          pending.wager != null
            ? `${optionLine(question, pending.optionId)}. Wager α = ${pending.wager.toFixed(1)}. Hold the phone — the host is about to reveal.`
            : `${optionLine(question, pending.optionId)}. Hold the phone — the host is about to reveal.`
        }
      />
    );
  }

  if (snapshot.phase === "reveal") {
    const scored =
      snapshot.correctOptionId &&
      view.lastResult &&
      view.lastResult.questionId === question?.id
        ? view.lastResult
        : null;
    const pending =
      view.pendingVote &&
      (!view.pendingVote.questionId || view.pendingVote.questionId === question?.id)
        ? view.pendingVote
        : null;

    if (!scored) {
      if (!pending) {
        return (
          <WaitCard
            kicker="Reveal"
            title="Waiting on the host."
            body="You didn’t lock a signal this question. When the host reveals, you’ll see the correct answer."
          />
        );
      }
      return (
        <WaitCard
          kicker="Locked · waiting"
          title={`${optionLetter(pending.optionId)} is locked in.`}
          body={
            pending.wager != null
              ? `Your pick: ${optionLine(question, pending.optionId)}. Wager α = ${pending.wager.toFixed(1)}. The host has not revealed yet.`
              : `Your pick: ${optionLine(question, pending.optionId)}. The host has not revealed yet.`
          }
        />
      );
    }

    const hit = scored.correct;
    const lockedId = scored.optionId || null;
    return (
      <div
        className={`mt-8 rounded-[28px] p-6 text-center ring-1 ${
          hit ? "animate-pop bg-mint/12 ring-mint/40" : "animate-shake bg-magenta/12 ring-magenta/40"
        }`}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.28em]">
          {lockedId ? (hit ? "Hit" : "Miss") : "Missed"}
        </p>
        <h2 className="font-display mt-2 text-4xl font-bold">
          {hit ? "You got it." : "Not this one."}
        </h2>
        <div className="mt-5 space-y-3 text-sm leading-relaxed text-cream/80">
          <p>
            <span className="block text-[11px] font-bold uppercase tracking-[0.22em] text-cream/40">
              Your lock
            </span>
            {lockedId
              ? `${optionLine(question, lockedId)}${
                  scored.wager != null ? ` · α ${scored.wager.toFixed(1)}` : ""
                }`
              : "You didn’t lock in"}
          </p>
          <p>
            <span className="block text-[11px] font-bold uppercase tracking-[0.22em] text-cream/40">
              Correct answer
            </span>
            {optionLine(question, snapshot.correctOptionId)}
          </p>
          {question?.explanation ? (
            <p className="rounded-2xl bg-black/25 px-4 py-3 text-left text-[15px] leading-relaxed text-cream/80 ring-1 ring-white/10">
              <span className="mb-1.5 block text-center text-[11px] font-bold uppercase tracking-[0.22em] text-cream/40">
                Why
              </span>
              {question.explanation}
            </p>
          ) : null}
        </div>
        {scored.powerApplied ? (
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-cream/50">
            {scored.powerApplied} armed
          </p>
        ) : null}
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-cream/40">
          Weights update at the end of the round
        </p>
      </div>
    );
  }

  if (snapshot.phase === "weight_update") {
    return (
      <WeightUpdateScreen
        snapshot={snapshot}
        me={me}
        roundWeightBefore={view.roundWeightBefore}
        roundWeightAfter={view.roundWeightAfter}
      />
    );
  }

  if (snapshot.phase === "mic_moment") {
    return (
      <WaitCard
        kicker="Mic moment"
        title="Two clusters, one archetype."
        body="No scoring. Teams answer why they chose what they chose in Round 2. If they call your cluster, send one of you up — the rest hold the phone."
      />
    );
  }

  if (snapshot.phase === "power_grant") {
    const expired = powerGrantRemainingMs === 0;
    if (view.canClaimPower) {
      return (
        <div className="mt-6 flex flex-col gap-3">
          {powerGrantRemainingMs != null && (
            <VoteTimer
              remainingMs={powerGrantRemainingMs}
              totalMs={POWER_GRANT_DURATION_MS}
              kicker="Pick a boost"
            />
          )}
          <h2 className="font-display text-center text-3xl font-bold">You made it to top 3.</h2>
          <p className="mb-2 text-center text-sm text-cream/65">
            Pick one boost for Round 4 question 1. Insurance can zero a miss. Amplify locks α at
            2.0. Foresight lets you see the question with everyone, then vote after the clock with
            the crowd split.
          </p>
          {POWERS.map((p) => (
            <Pressable
              key={p.id}
              variant={p.variant}
              className="w-full !rounded-3xl !py-5"
              disabled={expired}
              onClick={() => onClaim(p.id)}
            >
              <span className="block">{p.title}</span>
              <span className="mt-1 block text-[12px] font-semibold opacity-80">{p.body}</span>
            </Pressable>
          ))}
        </div>
      );
    }
    if (view.power) {
      return (
        <WaitCard
          kicker="Weight power"
          title={`${view.power.type} is yours.`}
          body={
            view.power.type === "foresight"
              ? "On Round 4 Q1 you’ll see the question with everyone, then get 15 extra seconds with the crowd’s vote split after the clock hits zero."
              : "You’ll vote with everyone else on Round 4 Q1. This only changes how your weight moves."
          }
        />
      );
    }
    return (
      <WeightUpdateScreen
        snapshot={snapshot}
        me={me}
        roundWeightBefore={view.roundWeightBefore}
        roundWeightAfter={view.roundWeightAfter}
      />
    );
  }

  if (snapshot.phase === "active_query") {
    return (
      <WaitCard
        kicker="Active query"
        title={view.isTopThree ? "You’re on stage." : "Highest weights go up."}
        body={
          view.isTopThree
            ? "Ask the volunteer one yes/no. The room hears the answer. No weight change — you earned the mic."
            : "Three clusters earned a question. Listen. The freeze comes next."
        }
      />
    );
  }

  if (snapshot.phase === "freeze") {
    return (
      <WaitCard
        kicker="Freeze"
        title="Weights locked."
        body="The engine stops learning. Next: three environments on the projector, question on this phone. No wager — weights stay frozen."
      />
    );
  }

  if (snapshot.phase === "ensemble" && snapshot.ensemble) {
    const winner = [...snapshot.ensemble].sort((a, b) => b.pct - a.pct)[0];
    return (
      <div className="mt-8">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.28em] text-gold">
          Ensemble
        </p>
        <h2 className="font-display mt-2 text-center text-3xl font-bold">
          The engine picks {winner ? LETTER[winner.optionId] ?? winner.optionId : "—"}
        </h2>
        <div className="mt-6 flex flex-col gap-3">
          {snapshot.ensemble.map((bar) => (
            <div key={bar.optionId}>
              <div className="mb-1 flex justify-between text-sm">
                <span>
                  {LETTER[bar.optionId] ?? bar.optionId} · {bar.label}
                </span>
                <span className="font-bold text-cyan">{Math.round(bar.pct * 100)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan to-magenta transition-all duration-700"
                  style={{ width: `${Math.max(4, bar.pct * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (snapshot.phase === "final_reveal") {
    const verdict = engineVerdict(snapshot.ensemble, snapshot.correctOptionId);
    const pickLetter = verdict.pick ? LETTER[verdict.pick.optionId] ?? verdict.pick.optionId : "—";
    const truthLetter = snapshot.correctOptionId
      ? LETTER[snapshot.correctOptionId] ?? snapshot.correctOptionId
      : "—";

    if (verdict.status === "pending") {
      return (
        <WaitCard
          kicker="Reveal"
          title={verdict.pick ? `The engine called ${pickLetter}.` : "The volunteer reads the prompt."}
          body={
            verdict.pick
              ? "Weighted votes are in. Watch the stage — the volunteer reveals which environment is real."
              : "No signals were locked into the engine. Watch the stage for the truth."
          }
        />
      );
    }

    const hit = verdict.status === "hit";
    return (
      <div
        className={`mt-8 rounded-[28px] p-6 text-center ring-1 ${
          hit ? "animate-pop bg-mint/12 ring-mint/40" : "animate-shake bg-magenta/12 ring-magenta/40"
        }`}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.28em]">
          {hit ? "Engine hit" : "Engine miss"}
        </p>
        <h2 className="font-display mt-2 text-4xl font-bold">
          {hit ? "The engine was right." : "The engine got it wrong."}
        </h2>
        <div className="mt-5 space-y-3 text-sm leading-relaxed text-cream/80">
          <p>
            <span className="block text-[11px] font-bold uppercase tracking-[0.22em] text-cream/40">
              Engine’s call
            </span>
            {pickLetter}
            {verdict.pick ? ` · ${Math.round(verdict.pick.pct * 100)}% of the weight` : ""}
            {verdict.tie ? " · won a tie-break" : ""}
          </p>
          <p>
            <span className="block text-[11px] font-bold uppercase tracking-[0.22em] text-cream/40">
              The truth
            </span>
            {truthLetter}
          </p>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-cream/70">
          {hit
            ? "The weighted crowd converged on the real environment. That’s the ensemble working."
            : "A confident weighted majority still missed. Even a boosted crowd can overfit its training — that’s exactly why we hold out a test."}
        </p>
      </div>
    );
  }

  if (snapshot.phase === "debrief") {
    return (
      <WaitCard
        kicker="Debrief"
        title="You just were AdaBoost."
        body="Weighted votes. Weak learners. Overfitting. That’s the club. That’s the field. Come find us."
      />
    );
  }

  return (
    <WaitCard
      kicker={snapshot.phase}
      title="Hold."
      body="The engine is moving. Keep this screen awake."
    />
  );
}
