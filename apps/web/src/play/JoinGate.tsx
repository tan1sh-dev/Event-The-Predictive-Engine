import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MAX_TEAM_FIELD_LENGTH,
  MAX_TEAM_SIZE,
  MIN_TEAM_SIZE,
  clampTeamSize,
  emptyTeamDraft,
  hasDuplicatePersonNames,
  normalizeTeamDetails,
  resizeMembers,
  type GameSnapshot,
  type TeamDetails,
} from "@engine/shared";
import Pressable from "../components/Pressable.tsx";
import TypeLine from "../components/TypeLine.tsx";
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

const STATUS_PHRASES = [
  "Scanning cluster signals…",
  "Awaiting crew telemetry…",
  "One phone. Your whole crew on it.",
  "Signal stable · ready to lock a node",
];

type JoinStep = "size" | "team" | "cluster";

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  readOnly,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  readOnly?: boolean;
}) {
  return (
    <div className={`orig-field ${value ? "has-value" : ""}`}>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={MAX_TEAM_FIELD_LENGTH}
        autoComplete={autoComplete ?? "off"}
        autoCapitalize="words"
        enterKeyHint="next"
        placeholder=" "
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className="orig-input"
      />
      <label className="orig-float-label" htmlFor={id}>
        {label}
      </label>
    </div>
  );
}

function initialStep(saved: TeamDetails | null, startAtTeam: boolean): JoinStep {
  if (startAtTeam) return saved ? "team" : "size";
  if (saved) return "cluster";
  return "size";
}

export default function JoinGate({
  busy,
  error,
  lastCluster,
  connected,
  clusterCount,
  startAtTeam = false,
  onJoin,
}: {
  busy: boolean;
  error: string | null;
  lastCluster: number | null;
  connected: boolean;
  clusterCount: number;
  startAtTeam?: boolean;
  onJoin: (n: number, team: TeamDetails) => void;
}) {
  const saved = useMemo(() => loadTeam(), []);
  const [teamSize, setTeamSize] = useState(() =>
    saved ? clampTeamSize(1 + saved.members.length) : MAX_TEAM_SIZE,
  );
  const [draft, setDraft] = useState(() => {
    if (!saved) return emptyTeamDraft(MAX_TEAM_SIZE);
    return {
      teamName: saved.teamName,
      leaderName: saved.leaderName,
      members: [...saved.members],
    };
  });
  const [step, setStep] = useState<JoinStep>(() => initialStep(saved, startAtTeam));
  const [formError, setFormError] = useState<string | null>(null);
  const [occupied, setOccupied] = useState<Record<number, string>>({});
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const team = normalizeTeamDetails(draft);
  const resume = lastCluster != null && lastCluster <= clusterCount ? lastCluster : null;
  const teammateSlots = teamSize - 1;

  useEffect(() => {
    if (startAtTeam) setStep(saved ? "team" : "size");
  }, [startAtTeam, saved]);

  useEffect(() => {
    if (step === "cluster" && !team) {
      setStep(draft.members.length === 0 && !draft.teamName && !draft.leaderName ? "size" : "team");
    }
  }, [step, team, draft.members.length, draft.teamName, draft.leaderName]);

  useEffect(() => {
    if (step !== "cluster") return;
    let cancelled = false;
    const load = () => {
      fetch("/api/snapshot")
        .then((res) => (res.ok ? res.json() : null))
        .then((snap: GameSnapshot | null) => {
          if (cancelled || !snap) return;
          const next: Record<number, string> = {};
          for (const c of snap.clusters) {
            if (c.connected || c.team) next[c.number] = c.team?.teamName ?? "Locked";
          }
          setOccupied(next);
        })
        .catch(() => {
          /* engine not up yet */
        });
    };
    load();
    const id = window.setInterval(load, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step]);

  const applyTeamSize = (size: number) => {
    const nextSize = clampTeamSize(size);
    setTeamSize(nextSize);
    setDraft((prev) => ({
      ...prev,
      members: resizeMembers(prev.members, nextSize),
    }));
    setFormError(null);
  };

  const filledMembersCount = draft.members.filter((m) => m.trim().length > 0).length;
  const totalFields = 2 + teammateSlots;
  const filledCount =
    (draft.teamName.trim() ? 1 : 0) + (draft.leaderName.trim() ? 1 : 0) + filledMembersCount;
  const fieldsComplete =
    Boolean(draft.teamName.trim()) &&
    Boolean(draft.leaderName.trim()) &&
    filledMembersCount === teammateSlots;
  const hasDuplicates =
    fieldsComplete && hasDuplicatePersonNames(draft.leaderName, draft.members);
  const allFilled = team != null;
  const progressPercent = totalFields === 0 ? 0 : Math.round((filledCount / totalFields) * 100);
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const continueFromSize = () => {
    applyTeamSize(teamSize);
    setStep("team");
  };

  const continueToCluster = (e?: FormEvent) => {
    e?.preventDefault();
    const next = normalizeTeamDetails(draftRef.current);
    if (!next) {
      const d = draftRef.current;
      if (
        d.leaderName.trim() &&
        d.members.every((m) => m.trim()) &&
        hasDuplicatePersonNames(d.leaderName, d.members)
      ) {
        setFormError("Each person needs a unique name — no duplicates.");
      } else {
        setFormError(
          teammateSlots === 0
            ? "Fill team name and leader."
            : `Fill team name, leader, and all ${teammateSlots} teammate${teammateSlots === 1 ? "" : "s"}.`,
        );
      }
      return;
    }
    setFormError(null);
    saveTeam(next);
    setStep("cluster");
  };

  const stepIndex = step === "size" ? 0 : step === "team" ? 1 : 2;

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 pt-[env(safe-area-inset-top)]">
      <div className="orig-club-logo orig-fade-up">
        <span className="orig-club-logo-glow" aria-hidden />
        <img
          src="/cc-new-logo.png"
          alt="Coding Club 10 years"
          className="orig-club-logo-img"
        />
      </div>
      <div className="orig-fade-up orig-club-lockup">
        <p className="orig-club-lockup-label">
          <span>Coding Club</span>
          <span>RVCE</span>
        </p>
      </div>
      <h1 className="font-display orig-fade-up orig-delay-1 mt-3 text-center text-[2.35rem] leading-[1.05] font-bold">
        The Predictive
        <br />
        Engine
      </h1>
      <p className="orig-fade-up orig-delay-2 mx-auto mt-3 max-w-xs text-center text-sm leading-relaxed text-cream/65">
        {step === "size"
          ? "How many people share this phone? Solo is fine — max is five."
          : step === "team"
            ? `${teamSize} of you. One phone. Name the squad — then lock a node.`
            : "Pick your node. Debate, then lock a single signal into the network."}
      </p>

      <div className="orig-fade-up orig-delay-3 mt-5 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest">
        <span className={`h-2 w-2 rounded-full ${connected ? "orig-live-dot bg-mint" : "bg-magenta"}`} />
        {connected ? "Engine online" : "Connecting…"}
      </div>

      <div className="mt-3 min-h-[1.25rem] text-center text-[11px] tracking-wide text-cream/45">
        <TypeLine phrases={STATUS_PHRASES} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cream/40">
        <span className={step === "size" ? "text-cyan" : stepIndex > 0 ? "text-mint" : ""}>
          1 · Size
        </span>
        <span className="h-px w-6 overflow-hidden bg-white/15">
          <span
            className={`block h-full bg-cyan transition-all duration-500 ${
              stepIndex >= 1 ? "w-full" : "w-1/3"
            }`}
          />
        </span>
        <span className={step === "team" ? "text-cyan" : stepIndex > 1 ? "text-mint" : ""}>
          2 · Team
        </span>
        <span className="h-px w-6 overflow-hidden bg-white/15">
          <span
            className={`block h-full bg-cyan transition-all duration-500 ${
              stepIndex >= 2 ? "w-full" : stepIndex === 1 ? "w-1/3" : "w-0"
            }`}
          />
        </span>
        <span className={step === "cluster" ? "text-cyan" : ""}>3 · Cluster</span>
      </div>

      <AnimatePresence mode="wait">
        {step === "size" ? (
          <motion.div
            key="size"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            className="orig-panel mt-6"
          >
            <div className="orig-scanline" aria-hidden />
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">
              Crew size
            </p>
            <h2 className="font-display mt-2 text-2xl font-bold">How many on this phone?</h2>
            <p className="mt-2 text-sm text-cream/60">
              Include the leader. Short teams are fine — you don’t need five.
            </p>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {Array.from({ length: MAX_TEAM_SIZE - MIN_TEAM_SIZE + 1 }, (_, i) => MIN_TEAM_SIZE + i).map(
                (n) => {
                  const on = teamSize === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => applyTeamSize(n)}
                      className={`aspect-square rounded-2xl text-lg font-extrabold ring-1 transition ${
                        on
                          ? "bg-cyan/20 text-cyan ring-cyan/50"
                          : "bg-white/6 text-cream/70 ring-white/10 active:scale-95"
                      }`}
                    >
                      {n}
                    </button>
                  );
                },
              )}
            </div>
            <p className="mt-3 text-center text-xs text-cream/45">
              {teamSize === 1
                ? "Solo node — just the leader."
                : `${teamSize} people · 1 leader + ${teamSize - 1} teammate${teamSize - 1 === 1 ? "" : "s"}`}
            </p>
            <Pressable className="mt-5 w-full" variant="go" onClick={continueFromSize}>
              Continue to crew details
            </Pressable>
          </motion.div>
        ) : step === "team" ? (
          <motion.div
            key="team"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            className="orig-panel mt-6"
          >
            <div className="orig-scanline" aria-hidden />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">
                  Crew sync
                </p>
                <p className="mt-1 text-xs text-cream/45">
                  {filledCount}/{totalFields} fields locked
                </p>
                <button
                  type="button"
                  onClick={() => setStep("size")}
                  className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold/80"
                >
                  {teamSize} people · change
                </button>
              </div>
              <div className="orig-gauge" title={`Form sync ${progressPercent}%`}>
                <svg viewBox="0 0 54 54">
                  <circle className="orig-gauge-bg" cx="27" cy="27" r={radius} />
                  <circle
                    className={`orig-gauge-progress ${allFilled ? "complete" : ""}`}
                    cx="27"
                    cy="27"
                    r={radius}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>
                <div className="orig-gauge-label">
                  <span>{progressPercent}%</span>
                </div>
              </div>
            </div>

            <form className="flex flex-col gap-3.5" onSubmit={continueToCluster}>
              <Field
                id="team-name"
                label="Team name"
                value={draft.teamName}
                autoComplete="organization"
                onChange={(teamName) => {
                  setDraft({ ...draft, teamName });
                  setFormError(null);
                }}
              />
              <Field
                id="team-leader"
                label="Team leader"
                value={draft.leaderName}
                autoComplete="name"
                onChange={(leaderName) => {
                  setDraft({ ...draft, leaderName });
                  setFormError(null);
                }}
              />
              {teammateSlots > 0 && (
                <>
                  <div className="mt-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-cream/40">
                    <span>Teammates</span>
                    <span className={filledMembersCount === teammateSlots ? "text-gold" : ""}>
                      {filledMembersCount}/{teammateSlots} logged
                    </span>
                  </div>
                  {draft.members.map((name, i) => (
                    <div key={i} className={`orig-crew ${name.trim() ? "is-logged" : ""}`}>
                      <span className="orig-crew-tag">0{i + 1}</span>
                      <input
                        className="orig-crew-input"
                        value={name}
                        maxLength={MAX_TEAM_FIELD_LENGTH}
                        autoComplete="off"
                        autoCapitalize="words"
                        placeholder={`Teammate ${i + 1}`}
                        onChange={(e) => {
                          const members = [...draft.members];
                          members[i] = e.target.value;
                          setDraft({ ...draft, members });
                          setFormError(null);
                        }}
                      />
                    </div>
                  ))}
                </>
              )}

              {(formError || error || hasDuplicates) && (
                <p className="orig-alert animate-pop rounded-2xl bg-magenta/15 px-4 py-3 text-center text-sm text-[#ffc1dd] ring-1 ring-magenta/30">
                  {formError ??
                    error ??
                    (hasDuplicates ? "Each person needs a unique name — no duplicates." : null)}
                </p>
              )}

              <Pressable
                className="mt-1 w-full"
                variant={allFilled ? "go" : "ghost"}
                disabled={!allFilled}
                type="submit"
              >
                {allFilled
                  ? "Continue to choose cluster"
                  : hasDuplicates
                    ? "Fix duplicate names"
                    : `Fill all fields · ${filledCount}/${totalFields}`}
              </Pressable>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="cluster"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            className="w-full"
          >
            {team && (
              <button
                type="button"
                onClick={() => setStep("team")}
                className="orig-panel mt-6 block w-full px-4 py-3 text-left transition duration-200 active:scale-[0.98]"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">
                  Your team · tap to edit
                </p>
                <p className="mt-1 font-display text-xl font-bold">{team.teamName}</p>
                <p className="mt-1 text-sm text-cream/60">
                  Lead · {team.leaderName}
                  {team.members.length > 0 && (
                    <span className="text-cream/35"> · {team.members.join(" · ")}</span>
                  )}
                </p>
              </button>
            )}

            <div className="orig-panel mt-4 w-full">
              <div className="orig-scanline" aria-hidden />
              <div className="mb-3 flex items-end justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cream/45">
                  {clusterCount < 1 ? "Waiting on host" : "Choose cluster"}
                </p>
                {clusterCount > 0 && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold">
                    {Object.keys(occupied).length}/{clusterCount} held
                  </p>
                )}
              </div>
              {clusterCount < 1 ? (
                <div className="px-2 py-6 text-center">
                  <div className="orig-radar mx-auto mb-3" aria-hidden />
                  <p className="font-display text-2xl font-bold">No clusters yet.</p>
                  <p className="mt-2 text-sm leading-relaxed text-cream/60">
                    The host is setting the room size. This grid unlocks when they lock the count.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-2.5">
                  {Array.from({ length: clusterCount }, (_, i) => i + 1).map((n) => {
                    const selected = resume === n;
                    const taken = Boolean(occupied[n]) && resume !== n;
                    const color = hue(n, clusterCount);
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={!team || busy}
                        onClick={() => team && onJoin(n, team)}
                        className={`orig-node aspect-square rounded-2xl text-sm font-extrabold ${
                          selected ? "is-mine" : ""
                        } ${taken ? "is-taken" : ""} ${busy ? "opacity-80" : ""}`}
                        style={{
                          background: taken
                            ? "radial-gradient(circle at 50% 60%, rgba(255,90,168,0.35), #14102a)"
                            : `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), transparent 32%), radial-gradient(circle at 50% 60%, ${color}, #14102a)`,
                          boxShadow: selected ? `0 0 18px ${color}` : "inset 0 0 12px rgba(0,0,0,0.25)",
                          color: taken ? "#ffc1dd" : "#071018",
                          animationDelay: `${n * 0.03}s`,
                        }}
                      >
                        {busy && selected ? "…" : n}
                        {taken && <span className="orig-node-tag">held</span>}
                        {selected && <span className="orig-node-tag mint">you</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {resume != null && team && (
              <Pressable className="mt-6 w-full" variant="go" disabled={busy} onClick={() => onJoin(resume, team)}>
                {busy ? "Joining…" : `Resume cluster ${resume}`}
              </Pressable>
            )}

            {error && (
              <p className="orig-alert animate-pop mt-4 rounded-2xl bg-magenta/15 px-4 py-3 text-center text-sm text-[#ffc1dd] ring-1 ring-magenta/30">
                {error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-auto pt-6 text-center text-[11px] leading-relaxed text-cream/40">
        {step === "size"
          ? "Count everyone sharing this phone, including the leader."
          : step === "team"
            ? `${teamSize} name${teamSize === 1 ? "" : "s"}. One phone. The leader holds the device.`
            : "If this cluster is already live, rejoining with this phone will take over the session."}
      </p>
    </div>
  );
}
