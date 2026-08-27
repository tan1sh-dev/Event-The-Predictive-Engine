import type { ClusterView } from "@engine/shared";

type Tone = "wait" | "live" | "open" | "locked" | "gold" | "cyan" | "danger";

function lockStatus(
  phase: string,
  hasVoted: boolean,
  canClaimPower: boolean,
  foresightWaiting: boolean,
  foresightGrace: boolean,
): { label: string; tone: Tone } {
  const voting =
    phase === "voting_open" ||
    phase === "voting_locked" ||
    phase === "final_inference_open" ||
    phase === "final_inference_locked";

  if (phase === "clue") return { label: "Look up", tone: "cyan" };
  if (phase === "power_grant" && canClaimPower) return { label: "Pick", tone: "gold" };
  if (!voting) return { label: "Wait", tone: "wait" };
  if (hasVoted) return { label: "Locked", tone: "locked" };
  if (foresightWaiting) return { label: "Hold", tone: "gold" };
  if (foresightGrace) return { label: "Extra", tone: "gold" };
  if (phase === "final_inference_locked") {
    return { label: "Calc", tone: "cyan" };
  }
  if (phase === "voting_locked") {
    return { label: "Missed", tone: "danger" };
  }
  return { label: "Open", tone: "open" };
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
  const lock = lockStatus(
    snapshot.phase,
    Boolean(me?.hasVoted),
    view.canClaimPower,
    view.foresightWaiting,
    Boolean(snapshot.foresightGraceActive && view.power?.type === "foresight"),
  );
  const q =
    snapshot.questionIndex != null
      ? ` · Q${snapshot.questionIndex}`
      : snapshot.phase.startsWith("final")
        ? " · FINAL"
        : "";

  return (
    <header className="play-hud">
      <div className="play-hud-identity">
        <span className="play-hud-node" aria-hidden>
          <span className="play-hud-node-glow" />
          <svg className="play-hud-node-ring" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(92,239,255,0.4)" strokeWidth="1" strokeDasharray="2.5 4.5" />
          </svg>
          <span className="play-hud-node-core">{view.clusterNumber}</span>
        </span>
        <div className="play-hud-meta">
          <p className="play-hud-team">{me?.team?.teamName ?? `Cluster ${view.clusterNumber}`}</p>
          <p className="play-hud-round">
            <span className="play-hud-round-id">
              {snapshot.roundId ?? "Engine"}
              {q}
            </span>
            <span className="play-hud-rule" aria-hidden />
            <span className="play-hud-weight">w {(me?.weight ?? 1).toFixed(2)}</span>
          </p>
        </div>
      </div>
      <div className="play-hud-flags">
        <span className={`play-hud-flag is-${connected ? "live" : "danger"}`}>
          <span className="play-hud-flag-dot" />
          {connected ? "Live" : "Offline"}
        </span>
        <span className={`play-hud-flag is-${lock.tone}`}>{lock.label}</span>
      </div>
    </header>
  );
}
