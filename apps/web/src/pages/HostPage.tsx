import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HOST_PLAY_ROUNDS,
  MAX_CLUSTER_COUNT,
  MIN_CLUSTER_COUNT,
  PHASE_SEQUENCE,
  clueDurationForRound,
  voteDurationForRound,
  type GameSnapshot,
  type HostPlayRoundId,
  type PowerUp,
} from "@engine/shared";
import Pressable from "../components/Pressable.tsx";
import SparkleCursor from "../components/SparkleCursor.tsx";
import { useEngineSocket } from "../hooks/useClusterSession.ts";
import { LETTER, PHASE_LABEL } from "../lib/labels.ts";
import VoteTimer, { useVoteRemainingMs } from "../components/VoteTimer.tsx";

const PASS_KEY = "engine.hostPassword";

function HostClockCard({
  label,
  remainingMs,
  totalMs,
  fallback,
}: {
  label: string;
  remainingMs: number | null;
  totalMs: number | null;
  fallback: string;
}) {
  const live = remainingMs != null && totalMs != null && totalMs > 0;
  return (
    <div className="rounded-2xl bg-black/25 px-4 py-3 ring-1 ring-white/10">
      {live ? (
        <VoteTimer remainingMs={remainingMs} totalMs={totalMs} kicker={label} />
      ) : (
        <>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cream/45">{label}</p>
          <p className="font-display mt-1 text-2xl">{fallback}</p>
        </>
      )}
    </div>
  );
}

export default function HostPage() {
  const socket = useEngineSocket();
  const [password, setPassword] = useState(() => sessionStorage.getItem(PASS_KEY) ?? "rvce_host");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [weightEdits, setWeightEdits] = useState<Record<number, string>>({});
  const [clusterDraft, setClusterDraft] = useState("");

  const joinHost = useCallback(() => {
    setError(null);
    socket.emit("join", { role: "host", hostPassword: password }, (ack) => {
      if (!ack.ok) {
        setAuthed(false);
        setError(ack.message);
        return;
      }
      sessionStorage.setItem(PASS_KEY, password);
      setAuthed(true);
      setSnap(ack.snapshot);
      setClusterDraft(String(ack.snapshot.clusterCount));
    });
  }, [socket, password]);

  useEffect(() => {
    const onSnap = (state: GameSnapshot) => {
      setSnap(state);
      setClusterDraft((prev) => (prev.trim() === "" ? String(state.clusterCount) : prev));
    };
    socket.on("snapshot", onSnap);
    if (socket.connected && sessionStorage.getItem(PASS_KEY)) joinHost();
    socket.on("connect", () => {
      if (sessionStorage.getItem(PASS_KEY)) joinHost();
    });
    return () => {
      socket.off("snapshot", onSnap);
      socket.off("connect");
    };
  }, [socket, joinHost]);

  const advance = () => socket.emit("hostAdvance", (ack) => !ack.ok && setError(ack.message));
  const back = () => socket.emit("hostBack", (ack) => !ack.ok && setError(ack.message));
  const playRound = (roundId: HostPlayRoundId) =>
    socket.emit("hostPlayRound", { roundId }, (ack) => !ack.ok && setError(ack.message));
  const reveal = (optionId: string) =>
    socket.emit("hostReveal", { correctOptionId: optionId }, (ack) => !ack.ok && setError(ack.message));
  const reset = () => {
    if (
      !confirm(
        "Reset the whole game? Phones go back to team details and cluster pick, cluster count returns to default, and weights/votes/powers clear.",
      )
    ) {
      return;
    }
    socket.emit("hostReset", (ack) => {
      if (!ack.ok) {
        setError(ack.message);
        return;
      }
      setClusterDraft("");
      setWeightEdits({});
      setError(null);
    });
  };
  const kick = (n: number) =>
    socket.emit("hostKick", { clusterNumber: n }, (ack) => !ack.ok && setError(ack.message));
  const setWeight = (n: number) => {
    const w = Number(weightEdits[n]);
    if (!Number.isFinite(w) || w <= 0) return;
    socket.emit("hostSetWeight", { clusterNumber: n, weight: w }, (ack) => !ack.ok && setError(ack.message));
  };
  const applyClusterCount = () => {
    const n = Number(clusterDraft);
    if (!Number.isInteger(n)) {
      setError(`Enter an integer from ${MIN_CLUSTER_COUNT} to ${MAX_CLUSTER_COUNT}.`);
      return;
    }
    socket.emit("hostSetClusterCount", { clusterCount: n }, (ack) => {
      if (!ack.ok) {
        setError(ack.message);
        return;
      }
      setError(null);
    });
  };

  const grant = (clusterNumber: number, power: PowerUp) => {
    socket.emit("hostGrantPowers", { grants: [{ clusterNumber, power }] }, (ack) => {
      if (!ack.ok) setError(ack.message);
    });
  };

  const next = useMemo(() => {
    if (!snap) return null;
    return PHASE_SEQUENCE[snap.stepIndex + 1] ?? null;
  }, [snap]);

  const remainingMs = useVoteRemainingMs(snap?.voteDeadlineAt, snap?.serverTime, "vote");
  const clueRemainingMs = useVoteRemainingMs(snap?.clueDeadlineAt, snap?.serverTime, "clue");

  const nextLabel = (() => {
    if (!snap) return "Next";
    if (snap.phase === "lobby" && snap.clusterCount < MIN_CLUSTER_COUNT) return "Set clusters first";
    if (
      (snap.phase === "reveal" || snap.phase === "final_inference_locked") &&
      !snap.correctOptionId
    ) {
      return "Mark answer first";
    }
    if (snap.phase === "clue") return "Skip to question";
    if (next?.phase === "voting_open") return `Reveal question · Q${next.questionIndex}`;
    if (next) return `Next · ${PHASE_LABEL[next.phase]}`;
    return "End";
  })();

  useEffect(() => {
    if (!authed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space" || e.key === "n") {
        e.preventDefault();
        if (snap?.phase === "lobby" && snap.clusterCount < MIN_CLUSTER_COUNT) return;
        advance();
      }
      if (e.key === "b") back();
      if (e.key === "r" && snap?.phase === "reveal") reveal("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authed, snap?.phase]);

  if (!authed) {
    return (
      <>
        <SparkleCursor theme="teal" />
        <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-mint">Host</p>
        <h1 className="font-display text-4xl">Control the engine</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && joinHost()}
          className="rounded-2xl bg-white/8 px-4 py-3 ring-1 ring-white/15 outline-none"
          placeholder="Host password"
        />
        <Pressable variant="go" onClick={joinHost}>
          Unlock panel
        </Pressable>
        {error && <p className="text-sm text-magenta">{error}</p>}
        <p className="text-xs text-cream/40">Default password is rvce_host unless you changed HOST_PASSWORD.</p>
        </div>
      </>
    );
  }

  if (!snap) {
    return (
      <>
        <SparkleCursor theme="teal" />
        <p className="grid min-h-dvh place-items-center">Connecting…</p>
      </>
    );
  }

  const needsReveal =
    (snap.phase === "reveal" || snap.phase === "final_inference_locked") && !snap.correctOptionId;
  const question = snap.question;

  return (
    <>
      <SparkleCursor theme="teal" />
      <div className="mx-auto min-h-dvh max-w-6xl px-4 py-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-mint">Host · live</p>
          <h1 className="font-display text-3xl">
            {PHASE_LABEL[snap.phase]}
            {snap.roundId === "FINAL"
              ? " · Final testing"
              : snap.roundId
                ? ` · ${snap.roundId}`
                : ""}
            {snap.questionIndex ? ` Q${snap.questionIndex}` : ""}
          </h1>
        </div>
        <div className="text-right text-sm">
          <p>
            {snap.connectedCount}/{snap.clusterCount} phones
          </p>
          <p>
            {snap.foresightWaitingCount > 0
              ? `${snap.crowdLockedCount} crowd locked · ${snap.foresightWaitingCount} foresight waiting`
              : `${snap.lockedCount} locked`}
            {snap.weightsFrozen ? " · FROZEN" : ""}
          </p>
          {clueRemainingMs != null && clueDurationForRound(snap.roundId) != null && (
            <div className="mt-2 flex justify-end">
              <VoteTimer
                remainingMs={clueRemainingMs}
                totalMs={clueDurationForRound(snap.roundId) ?? 0}
                compact
                kicker="Clue"
              />
            </div>
          )}
          {remainingMs != null && (
            <div className="mt-2 flex justify-end">
              <VoteTimer
                remainingMs={remainingMs}
                totalMs={voteDurationForRound(snap.roundId)}
                compact
                kicker="Question"
              />
            </div>
          )}
        </div>
      </header>

      {error && (
        <p className="mt-3 rounded-xl bg-magenta/15 px-3 py-2 text-sm text-[#ffc1dd]">{error}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Pressable variant="ghost" onClick={back}>
          Back
        </Pressable>
        <Pressable
          variant="ghost"
          className="min-w-40"
          disabled={needsReveal || (snap.phase === "lobby" && snap.clusterCount < MIN_CLUSTER_COUNT)}
          onClick={advance}
        >
          {nextLabel}
        </Pressable>
        <Pressable variant="danger" onClick={reset}>
          Reset game
        </Pressable>
      </div>
      <p className="mt-2 text-[11px] text-cream/40">
        Keys: N / Space next (skip look-up) · B back · R reveal from key
      </p>

      <section className="mt-6 rounded-3xl bg-white/6 p-5 ring-1 ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">
          Start a round
        </p>
        <h2 className="font-display mt-1 text-2xl">Play round</h2>
        <p className="mt-2 text-sm text-cream/60">
          Projector plays the clue first, then takes it down the moment the question starts.
          Phones stay on “Look up the clue” until it ends — 30s look-up on scored rounds, 15s
          on Round 0, or the full SIP video on Round 2. Then the vote clock starts.
        </p>
        {(snap.phase === "clue" ||
          snap.phase === "voting_open" ||
          snap.phase === "final_inference_open") && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <HostClockCard
              label="Clue"
              remainingMs={clueRemainingMs}
              totalMs={clueDurationForRound(snap.roundId)}
              fallback={
                snap.phase === "clue"
                  ? clueDurationForRound(snap.roundId) == null
                    ? "Until video ends"
                    : "Look-up"
                  : "Done"
              }
            />
            <HostClockCard
              label="Question"
              remainingMs={remainingMs}
              totalMs={voteDurationForRound(snap.roundId)}
              fallback={
                snap.phase === "clue"
                  ? `Starts after clue · ${Math.round(voteDurationForRound(snap.roundId) / 1000)}s`
                  : "—"
              }
            />
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HOST_PLAY_ROUNDS.map((round) => {
            const active = snap.roundId === round.id && snap.phase !== "lobby";
            const blocked = snap.clusterCount < MIN_CLUSTER_COUNT;
            return (
              <Pressable
                key={round.id}
                variant={active ? "go" : "mint"}
                className="w-full !rounded-3xl !py-4"
                disabled={blocked}
                onClick={() => playRound(round.id)}
              >
                <span className="block">{round.label}</span>
                <span className="mt-1 block text-[12px] font-semibold opacity-75">{round.title}</span>
              </Pressable>
            );
          })}
        </div>
        {snap.clusterCount < MIN_CLUSTER_COUNT && (
          <p className="mt-3 text-sm text-magenta">Set how many clusters before playing a round.</p>
        )}
      </section>

      {snap.phase === "lobby" && (
        <section className="mt-6 rounded-3xl bg-white/6 p-5 ring-1 ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">
            Before the first round
          </p>
          <h2 className="font-display mt-1 text-2xl">How many clusters?</h2>
          <p className="mt-2 text-sm text-cream/60">
            One phone per cluster. Phones and the projector update as soon as you set this.
            Locked once you leave the lobby.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={MIN_CLUSTER_COUNT}
              max={MAX_CLUSTER_COUNT}
              value={clusterDraft === "0" ? "" : clusterDraft}
              placeholder="0"
              onChange={(e) => setClusterDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyClusterCount()}
              className="w-28 rounded-2xl bg-black/30 px-4 py-3 text-lg tabular-nums ring-1 ring-white/15 outline-none"
            />
            <Pressable variant="go" onClick={applyClusterCount}>
              {clusterDraft && clusterDraft !== "0"
                ? `Set ${clusterDraft} clusters`
                : "Set clusters"}
            </Pressable>
            <span className="text-xs text-cream/40">
              {MIN_CLUSTER_COUNT}–{MAX_CLUSTER_COUNT}
            </span>
          </div>
        </section>
      )}

      {snap.clue && snap.phase === "clue" && (
        <section className="mt-6 rounded-3xl bg-white/6 p-5 ring-1 ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">On projector</p>
          <h2 className="font-display mt-1 text-2xl">{snap.clue.title}</h2>
          <p className="mt-2 whitespace-pre-wrap text-cream/70">{snap.clue.body}</p>
        </section>
      )}

      {question && (
        <section className="mt-6 rounded-3xl bg-white/6 p-5 ring-1 ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">
            {question.id}
          </p>
          <h2 className="font-display mt-1 text-2xl">{question.prompt}</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {question.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => reveal(opt.id)}
                className={`rounded-2xl px-4 py-3 text-left ring-1 transition ${
                  snap.correctOptionId === opt.id
                    ? "bg-mint/20 ring-mint"
                    : "bg-black/20 ring-white/10 hover:ring-cyan/50"
                }`}
              >
                <span className="font-extrabold text-cyan">{LETTER[opt.id] ?? opt.id}</span>
                <span className="ml-2">{opt.label}</span>
              </button>
            ))}
          </div>
          {(snap.phase === "reveal" ||
            snap.phase === "voting_locked" ||
            snap.phase === "final_inference_locked") && (
            <Pressable className="mt-4" variant="gold" onClick={() => reveal("")}>
              Reveal using answer key
            </Pressable>
          )}
        </section>
      )}

      {snap.phase === "power_grant" && (
        <section className="mt-6 rounded-3xl bg-white/6 p-5 ring-1 ring-white/10">
          <h2 className="font-display text-2xl">Grant powers to top 3</h2>
          <div className="mt-3 flex flex-col gap-3">
            {snap.topClusterNumbers.map((n) => {
              const c = snap.clusters.find((x) => x.number === n);
              return (
                <div key={n} className="flex flex-wrap items-center gap-2">
                  <span className="w-36 font-bold">
                    {c?.team?.teamName ?? `Cluster ${n}`}
                  </span>
                  <span className="text-sm text-cream/50">w {c?.weight.toFixed(2)}</span>
                  {(["insurance", "amplify", "foresight"] as PowerUp[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => grant(n, p)}
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ${
                        c?.power?.type === p ? "bg-gold/25 ring-gold" : "ring-white/15"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-3xl ring-1 ring-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/6 text-[11px] uppercase tracking-widest text-cream/45">
            <tr>
              <th className="px-3 py-2">C</th>
              <th>Team</th>
              <th>Link</th>
              <th>Weight</th>
              <th>Vote</th>
              <th>Power</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {snap.clusters.map((c) => (
              <tr key={c.number} className="border-t border-white/8">
                <td className="px-3 py-2 font-bold">{c.number}</td>
                <td className="max-w-[14rem] py-2">
                  {c.team ? (
                    <div>
                      <p className="font-semibold">{c.team.teamName}</p>
                      <p className="text-[11px] text-cream/50">Lead · {c.team.leaderName}</p>
                      <p className="text-[11px] text-cream/35">{c.team.members.join(" · ")}</p>
                    </div>
                  ) : (
                    <span className="text-cream/30">—</span>
                  )}
                </td>
                <td className={c.connected ? "text-mint" : "text-cream/30"}>
                  {c.connected ? "live" : "off"}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <input
                      className="w-20 rounded-lg bg-black/30 px-2 py-1 tabular-nums ring-1 ring-white/10"
                      value={weightEdits[c.number] ?? c.weight.toFixed(2)}
                      onChange={(e) =>
                        setWeightEdits((prev) => ({ ...prev, [c.number]: e.target.value }))
                      }
                    />
                    <button type="button" className="text-xs text-cyan" onClick={() => setWeight(c.number)}>
                      set
                    </button>
                  </div>
                </td>
                <td>{c.hasVoted ? "yes" : "—"}</td>
                <td className="capitalize">{c.power?.type ?? "—"}</td>
                <td>
                  <button type="button" className="text-xs text-magenta" onClick={() => kick(c.number)}>
                    kick
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      </div>
    </>
  );
}
