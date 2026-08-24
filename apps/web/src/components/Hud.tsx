import type { ClusterView } from "@engine/shared";

function lockStatus(phase: string, hasVoted: boolean): {
  label: string;
  className: string;
} {
  const voting =
    phase === "voting_open" ||
    phase === "voting_locked" ||
    phase === "final_inference_open" ||
    phase === "final_inference_locked";

  if (phase === "clue") {
    return {
      label: "Look up",
      className: "bg-cyan/15 text-cyan ring-1 ring-cyan/30",
    };
  }
  if (!voting) {
    return {
      label: "Wait",
      className: "bg-white/8 text-cream/70 ring-1 ring-white/10",
    };
  }
  if (hasVoted) {
    return {
      label: "Locked",
      className: "bg-mint/15 text-mint ring-1 ring-mint/30",
    };
  }
  if (phase === "voting_locked" || phase === "final_inference_locked") {
    return {
      label: "Missed",
      className: "bg-magenta/15 text-magenta ring-1 ring-magenta/30",
    };
  }
  return {
    label: "Open",
    className: "bg-gold/15 text-gold ring-1 ring-gold/30",
  };
}

export default function Hud({
  view,
  connected,
}: {
  view: ClusterView;
  connected: boolean;
}) {
  const { snapshot } = view;
  const me = snapshot.clusters.find((c) => c.number === view.clusterNumber);
  const lock = lockStatus(snapshot.phase, Boolean(me?.hasVoted));
  const q =
    snapshot.questionIndex != null
      ? ` · Q${snapshot.questionIndex}`
      : snapshot.phase.startsWith("final")
        ? " · FINAL"
        : "";

  return (
    <header className="flex items-center justify-between gap-2 px-1 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-400 text-sm font-extrabold text-[#071018] shadow-[0_0_18px_rgba(92,239,255,0.45)]">
          {view.clusterNumber}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">
            {me?.team?.teamName ?? `Cluster ${view.clusterNumber}`}
          </p>
          <p className="text-sm font-semibold">
            {snapshot.roundId ?? "Engine"}
            {q}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
            connected ? "bg-mint/15 text-mint" : "bg-magenta/20 text-magenta"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "orig-live-dot bg-mint" : "bg-magenta"}`} />
          {connected ? "Live" : "Offline"}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${lock.className} ${
            lock.label === "Open" ? "orig-open-pulse" : ""
          }`}
        >
          {lock.label}
        </span>
        <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-extrabold text-gold">
          w {(me?.weight ?? 1).toFixed(2)}
        </span>
      </div>
    </header>
  );
}
