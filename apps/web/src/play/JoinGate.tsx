import { useMemo, useState } from "react";
import {
  MAX_TEAM_FIELD_LENGTH,
  TEAM_MEMBER_COUNT,
  emptyTeamDraft,
  normalizeTeamDetails,
  type TeamDetails,
} from "@engine/shared";
import Pressable from "../components/Pressable.tsx";
import { loadTeam, saveTeam } from "../lib/storage.ts";

function hue(n: number, total: number): string {
  const t = (n - 1) / Math.max(1, total - 1);
  const cyan = [92, 239, 255];
  const mint = [125, 255, 176];
  const r = Math.round(cyan[0] + (mint[0] - cyan[0]) * t);
  const g = Math.round(cyan[1] + (mint[1] - cyan[1]) * t);
  const b = Math.round(cyan[2] + (mint[2] - cyan[2]) * t);
  return `rgb(${r} ${g} ${b})`;
}

const inputClass =
  "w-full rounded-2xl bg-white/8 px-4 py-3.5 text-[16px] text-cream ring-1 ring-white/12 outline-none placeholder:text-cream/30 focus:ring-2 focus:ring-cyan/60";

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.22em] text-cream/45">
        {label}
      </span>
      <input
        type="text"
        value={value}
        maxLength={MAX_TEAM_FIELD_LENGTH}
        autoComplete={autoComplete ?? "off"}
        autoCapitalize="words"
        enterKeyHint="next"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function TeamForm({
  draft,
  onChange,
  onContinue,
  error,
}: {
  draft: ReturnType<typeof emptyTeamDraft>;
  onChange: (next: ReturnType<typeof emptyTeamDraft>) => void;
  onContinue: () => void;
  error: string | null;
}) {
  const ready = normalizeTeamDetails(draft) != null;
  return (
    <form
      className="mt-6 flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onContinue();
      }}
    >
      <Field
        label="Team name"
        value={draft.teamName}
        placeholder="e.g. Signal Breakers"
        autoComplete="organization"
        onChange={(teamName) => onChange({ ...draft, teamName })}
      />
      <Field
        label="Team leader"
        value={draft.leaderName}
        placeholder="Full name"
        autoComplete="name"
        onChange={(leaderName) => onChange({ ...draft, leaderName })}
      />
      {draft.members.map((name, i) => (
        <Field
          key={i}
          label={`Teammate ${i + 1}`}
          value={name}
          placeholder={`Member ${i + 2} of 5`}
          onChange={(value) => {
            const members = [...draft.members] as typeof draft.members;
            members[i] = value;
            onChange({ ...draft, members });
          }}
        />
      ))}
      <Pressable className="mt-2 w-full" variant="go" disabled={!ready} type="submit">
        Continue to choose cluster
      </Pressable>
      {error && (
        <p className="animate-pop rounded-2xl bg-magenta/15 px-4 py-3 text-center text-sm text-[#ffc1dd] ring-1 ring-magenta/30">
          {error}
        </p>
      )}
    </form>
  );
}

export default function JoinGate({
  busy,
  error,
  lastCluster,
  connected,
  clusterCount,
  onJoin,
}: {
  busy: boolean;
  error: string | null;
  lastCluster: number | null;
  connected: boolean;
  clusterCount: number;
  onJoin: (n: number, team: TeamDetails) => void;
}) {
  const saved = useMemo(() => loadTeam(), []);
  const [draft, setDraft] = useState(() => {
    const blank = emptyTeamDraft();
    if (!saved) return blank;
    return {
      teamName: saved.teamName,
      leaderName: saved.leaderName,
      members: [
        saved.members[0] ?? "",
        saved.members[1] ?? "",
        saved.members[2] ?? "",
        saved.members[3] ?? "",
      ] as [string, string, string, string],
    };
  });
  const [step, setStep] = useState<"team" | "cluster">(saved ? "cluster" : "team");
  const [formError, setFormError] = useState<string | null>(null);

  const team = normalizeTeamDetails(draft);
  const resume = lastCluster != null && lastCluster <= clusterCount ? lastCluster : null;

  const continueToCluster = () => {
    const next = normalizeTeamDetails(draft);
    if (!next) {
      setFormError("Fill team name, leader, and all four teammates.");
      return;
    }
    saveTeam(next);
    setFormError(null);
    setStep("cluster");
  };

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <p className="text-center text-[11px] font-bold uppercase tracking-[0.38em] text-cyan-200/80">
        Coding Club · RVCE
      </p>
      <h1 className="font-display mt-3 text-center text-[2.35rem] leading-[1.05] font-bold">
        The Predictive
        <br />
        Engine
      </h1>
      <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-relaxed text-cream/65">
        {step === "team"
          ? "Five of you. One phone. Name the squad first — then lock a node on the network."
          : "Pick your node. Debate, then lock a single signal into the network."}
      </p>

      <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest">
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-mint shadow-[0_0_10px_#7dffb0]" : "bg-magenta"}`}
        />
        {connected ? "Engine online" : "Connecting…"}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cream/40">
        <span className={step === "team" ? "text-cyan" : "text-mint"}>1 · Team</span>
        <span className="h-px w-8 bg-white/15" />
        <span className={step === "cluster" ? "text-cyan" : ""}>2 · Cluster</span>
      </div>

      {step === "team" ? (
        <TeamForm
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setFormError(null);
          }}
          onContinue={continueToCluster}
          error={formError}
        />
      ) : (
        <>
          {team && (
            <button
              type="button"
              onClick={() => setStep("team")}
              className="mt-6 rounded-3xl bg-white/6 px-4 py-3 text-left ring-1 ring-white/10"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">
                Your team · tap to edit
              </p>
              <p className="mt-1 font-display text-xl font-bold">{team.teamName}</p>
              <p className="mt-1 text-sm text-cream/60">
                Lead · {team.leaderName}
                <span className="text-cream/35">
                  {" "}
                  · {team.members.join(" · ")}
                </span>
              </p>
            </button>
          )}

          <p className="mt-6 mb-3 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-cream/45">
            {clusterCount < 1 ? "Waiting on host" : "Choose cluster"}
          </p>
          {clusterCount < 1 ? (
            <div className="rounded-3xl bg-white/6 px-5 py-8 text-center ring-1 ring-white/10">
              <p className="font-display text-2xl font-bold">No clusters yet.</p>
              <p className="mt-2 text-sm leading-relaxed text-cream/60">
                The host is setting the room size. This grid unlocks when they lock the count.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2.5">
              {Array.from({ length: clusterCount }, (_, i) => i + 1).map((n) => {
                const selected = resume === n;
                const color = hue(n, clusterCount);
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={!team}
                    onClick={() => team && onJoin(n, team)}
                    className={`aspect-square rounded-2xl text-sm font-extrabold transition duration-150 active:scale-90 ${
                      selected ? "ring-2 ring-gold" : "ring-1 ring-white/10"
                    } ${busy ? "opacity-80" : ""}`}
                    style={{
                      background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), transparent 32%), radial-gradient(circle at 50% 60%, ${color}, #14102a)`,
                      boxShadow: selected
                        ? `0 0 18px ${color}`
                        : `inset 0 0 12px rgba(0,0,0,0.25)`,
                      color: "#071018",
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          )}

          {resume != null && team && (
            <Pressable
              className="mt-6 w-full"
              variant="go"
              disabled={busy}
              onClick={() => onJoin(resume, team)}
            >
              {busy ? "Joining…" : `Resume cluster ${resume}`}
            </Pressable>
          )}

          {error && (
            <p className="animate-pop mt-4 rounded-2xl bg-magenta/15 px-4 py-3 text-center text-sm text-[#ffc1dd] ring-1 ring-magenta/30">
              {error}
            </p>
          )}
        </>
      )}

      <p className="mt-auto pt-6 text-center text-[11px] leading-relaxed text-cream/40">
        {step === "team"
          ? `${TEAM_MEMBER_COUNT + 1} names. One phone. The leader holds the device.`
          : "If this cluster is already live, rejoining with this phone will take over the session."}
      </p>
    </div>
  );
}
