import type { ClusterView } from "@engine/shared";

const PHASE_LABEL: Record<string, string> = {
  lobby: "Lobby",
  clue: "Clue",
  voting_open: "Vote",
  voting_locked: "Locked",
  reveal: "Reveal",
  weight_update: "Learn",
  mic_moment: "Mic",
  power_grant: "Power",
  active_query: "Query",
  freeze: "Freeze",
  final_inference_open: "Final",
  final_inference_locked: "Locked",
  ensemble: "Ensemble",
  final_reveal: "Reveal",
  debrief: "Debrief",
};

export default function Hud({
  view,
  connected,
}: {
  view: ClusterView;
  connected: boolean;
}) {
  const { snapshot } = view;
  const me = snapshot.clusters.find((c) => c.number === view.clusterNumber);
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
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
            connected ? "bg-mint/15 text-mint" : "bg-magenta/20 text-magenta"
          }`}
        >
          {connected ? "Live" : "Offline"}
        </span>
        <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cream/80 ring-1 ring-white/10">
          {PHASE_LABEL[snapshot.phase] ?? snapshot.phase}
        </span>
        <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-extrabold text-gold">
          w {(me?.weight ?? 1).toFixed(2)}
        </span>
      </div>
    </header>
  );
}
