import { useEffect, useState } from "react";
import {
  MID_WAGER,
  clueDurationForRound,
  normalizeWager,
  voteDurationForRound,
  type ClusterView,
  type PowerUp,
  type Question,
  type VoteSplitEntry,
  type Wager,
} from "@engine/shared";
import Pressable from "../components/Pressable.tsx";
import VoteTimer, { useVoteRemainingMs } from "../components/VoteTimer.tsx";
import WagerArc from "../components/WagerArc.tsx";
import WeightOrb from "../components/WeightOrb.tsx";

const LETTER: Record<string, string> = { a: "A", b: "B", c: "C", d: "D" };

const POWERS: { id: PowerUp; title: string; body: string; variant: "mint" | "gold" | "danger" }[] =
  [
    {
      id: "insurance",
      title: "Insurance",
      body: "Next miss costs zero weight. You still vote with everyone else.",
      variant: "mint",
    },
    {
      id: "amplify",
      title: "Amplify",
      body: "Next hit doubles α. You still vote with everyone else.",
      variant: "danger",
    },
    {
      id: "foresight",
      title: "Foresight",
      body: "Wait for the crowd to lock, see their %, then vote last.",
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
  onVote,
}: {
  question: Question;
  wagerRequired: boolean;
  pendingOption: string | null;
  pendingWager: Wager | null;
  split: VoteSplitEntry[] | null;
  expired: boolean;
  onVote: (optionId: string, wager: Wager | null) => void;
}) {
  const [option, setOption] = useState<string | null>(pendingOption);
  const [wager, setWager] = useState<Wager>(pendingWager ?? MID_WAGER);

  useEffect(() => {
    setOption(pendingOption);
    setWager(pendingWager ?? MID_WAGER);
  }, [pendingOption, pendingWager, question.id]);

  const ready = Boolean(option) && (!wagerRequired || normalizeWager(wager) != null);
  const lockedIn =
    Boolean(pendingOption) &&
    pendingOption === option &&
    (!wagerRequired || pendingWager === wager);

  const lockIn = () => {
    if (expired) return;
    if (!option) return;
    if (wagerRequired && wager == null) return;
    onVote(option, wagerRequired ? (normalizeWager(wager) ?? wager) : null);
  };

  return (
    <div className="flex flex-col gap-4 pb-8">
      {question.media && (
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
              onClick={() => {
                if (expired) return;
                setOption(opt.id);
                if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
              }}
              className={`orig-option flex items-center gap-3 rounded-2xl px-3 py-3 text-left ${
                on ? "is-on" : ""
              }`}
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
            α {wager.toFixed(1)}
          </p>
          <p className="mt-1 text-center text-[11px] font-bold uppercase tracking-widest text-cream/50">
            {wager <= 0.7 ? "Low risk" : wager >= 1.3 ? "High risk" : "Mid risk"}
          </p>
          <WagerArc value={wager} onChange={setWager} disabled={expired} />
        </div>
      )}

      <Pressable
        variant="go"
        className="w-full"
        disabled={!ready || expired}
        onClick={lockIn}
      >
        {lockedIn
          ? "Locked in"
          : pendingOption
            ? "Update lock"
            : "Lock in"}
      </Pressable>
      {!ready && (
        <p className="text-center text-[11px] text-cream/40">
          {wagerRequired
            ? "Pick an option, set α from 0.5 to 1.5, then lock in."
            : "Pick an option, then lock in."}
        </p>
      )}
      {lockedIn && (
        <div className="animate-stamp mx-auto rounded-full border-2 border-mint px-4 py-1 text-[11px] font-extrabold tracking-[0.2em] text-mint uppercase">
          Signal sent
        </div>
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
  onVote: (optionId: string, wager: Wager | null) => void;
  onClaim: (power: PowerUp) => void;
}) {
  const { snapshot } = view;
  const me = snapshot.clusters.find((c) => c.number === view.clusterNumber);
  const question = snapshot.question;
  const remainingMs = useVoteRemainingMs(snapshot.voteDeadlineAt, snapshot.serverTime, "vote");
  const clueRemainingMs = useVoteRemainingMs(snapshot.clueDeadlineAt, snapshot.serverTime, "clue");

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
              ? `The voice note is on the projector. The question and a ${voteSecs}-second clock land here the moment it ends.`
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
    if (view.foresightWaiting) {
      return (
        <div className="mt-5">
          {remainingMs != null && (
            <VoteTimer remainingMs={remainingMs} totalMs={voteDurationForRound(snapshot.roundId)} />
          )}
          <WaitCard
            kicker="Foresight"
            title="Hold. The crowd is voting."
            body={`${snapshot.crowdLockedCount} of the other nodes have locked in. When they all have, you’ll see their percentages — then you vote last.`}
          />
        </div>
      );
    }
    const armed =
      view.power &&
      !view.power.used &&
      (view.power.type === "insurance" || view.power.type === "amplify")
        ? view.power.type
        : null;
    return (
      <div className="mt-5">
        {remainingMs != null && (
          <VoteTimer remainingMs={remainingMs} totalMs={voteDurationForRound(snapshot.roundId)} />
        )}
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-cream/45">
          {snapshot.lockedCount} / {snapshot.clusterCount} locked in
        </p>
        {armed && (
          <p className="mb-3 rounded-2xl bg-white/6 px-4 py-2 text-center text-sm text-cream/70 ring-1 ring-white/10">
            {armed === "insurance"
              ? "Insurance is armed — a miss won’t cut your weight."
              : "Amplify is armed — a hit doubles α."}
          </p>
        )}
        <VoteForm
          question={question}
          wagerRequired={snapshot.phase === "voting_open" && question.wagerRequired}
          pendingOption={view.pendingVote?.optionId ?? null}
          pendingWager={view.pendingVote?.wager ?? null}
          split={view.crowdSplit}
          expired={expired}
          onVote={onVote}
        />
      </div>
    );
  }

  if (snapshot.phase === "voting_locked" || snapshot.phase === "final_inference_locked") {
    if (!view.pendingVote) {
      return (
        <WaitCard
          kicker="No signal"
          title="You didn’t lock in."
          body="Silence is scored as a high-risk miss (α = 1.5) when weights update at the end of the round."
        />
      );
    }
    const letter = LETTER[view.pendingVote.optionId] ?? view.pendingVote.optionId;
    return (
      <WaitCard
        kicker="Locked"
        title={`${letter} is in the engine.`}
        body={
          view.pendingVote.wager
            ? `Wager α = ${view.pendingVote.wager}. Hold the phone. The host is about to reveal.`
            : "No wager on the final inference. The room is frozen. Watch the projector."
        }
      />
    );
  }

  if (snapshot.phase === "reveal") {
    const result = view.lastResult;
    const correct = snapshot.correctOptionId
      ? (LETTER[snapshot.correctOptionId] ?? snapshot.correctOptionId)
      : "?";
    const hit = result?.correct;
    return (
      <div className={`mt-8 rounded-[28px] p-6 text-center ring-1 ${hit ? "animate-pop bg-mint/12 ring-mint/40" : "animate-shake bg-magenta/12 ring-magenta/40"}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.28em]">
          {hit ? "Hit" : "Miss"}
        </p>
        <h2 className="font-display mt-2 text-4xl font-bold">Answer {correct}</h2>
        {result && (
          <p className="mt-3 text-sm text-cream/70">
            You sent {result.optionId ? LETTER[result.optionId] ?? result.optionId : "nothing"} · α{" "}
            {result.alpha}
            {result.powerApplied ? ` · ${result.powerApplied} armed` : ""}
          </p>
        )}
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-cream/40">
          Weights update at the end of the round
        </p>
      </div>
    );
  }

  if (snapshot.phase === "weight_update") {
    return (
      <div className="mt-10 flex flex-col items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">
          {snapshot.roundId === "R0" ? "Calibration · discarded" : "AdaBoost update"}
        </p>
        <WeightOrb
          visual={me?.visualWeight ?? 0.5}
          weight={me?.weight ?? 1}
          pulse
        />
        {view.lastResult && snapshot.roundId !== "R0" && (
          <p className="text-sm text-cream/60">
            {view.lastResult.weightBefore.toFixed(2)} → {view.lastResult.weightAfter.toFixed(2)}
          </p>
        )}
        {snapshot.roundId === "R0" && (
          <p className="max-w-xs text-center text-sm text-cream/60">
            Practice round. Every node snaps back to 1. The real learning starts next.
          </p>
        )}
      </div>
    );
  }

  if (snapshot.phase === "mic_moment") {
    return (
      <WaitCard
        kicker="Mic moment"
        title="Two clusters, one archetype."
        body='No scoring. Host asks: "Which archetype is your cluster leaning toward right now — and why?" If they call your cluster, send one of you up — the rest hold the phone.'
      />
    );
  }

  if (snapshot.phase === "power_grant") {
    if (view.canClaimPower) {
      return (
        <div className="mt-6 flex flex-col gap-3">
          <h2 className="font-display text-center text-3xl font-bold">You made top 3.</h2>
          <p className="mb-2 text-center text-sm text-cream/65">
            Pick one boost. Insurance and Amplify change your weight. Foresight lets you vote last
            after you see the crowd.
          </p>
          {POWERS.map((p) => (
            <Pressable key={p.id} variant={p.variant} className="w-full !rounded-3xl !py-5" onClick={() => onClaim(p.id)}>
              <span className="block">{p.title}</span>
              <span className="mt-1 block text-[12px] font-semibold opacity-80">{p.body}</span>
            </Pressable>
          ))}
        </div>
      );
    }
    return (
      <WaitCard
        kicker="Weight power"
        title={view.power ? `${view.power.type} is yours.` : "Top 3 are picking."}
        body={
          view.power
            ? view.power.type === "foresight"
              ? "Next vote, you wait for the crowd, see their %, then lock in last."
              : "You’ll vote with everyone else. This only changes how your weight moves."
            : "You’ll vote as usual on the next question — no boost. Top 3 are choosing theirs."
        }
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
        body="The engine stops learning. One last A / B / C from the latent space."
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
    const pick = snapshot.ensemble
      ? [...snapshot.ensemble].sort((a, b) => b.pct - a.pct)[0]
      : null;
    return (
      <WaitCard
        kicker="Reveal"
        title={
          snapshot.correctOptionId
            ? `Truth was ${LETTER[snapshot.correctOptionId] ?? snapshot.correctOptionId}.`
            : "The volunteer reads the prompt."
        }
        body={
          pick
            ? `The ensemble called ${LETTER[pick.optionId] ?? pick.optionId}. Highest-weight cluster wins the night.`
            : "Watch the stage."
        }
      />
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
