import { VOTE_DURATION_MS } from "@engine/shared";
import { useEffect, useRef, useState } from "react";
import {
  remainingMsFromClock,
  subscribeGameClock,
  type ClockKind,
} from "../lib/game-clock.ts";

export function formatVoteClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function useVoteRemainingMs(
  deadlineAt: number | null | undefined,
  serverTime: number | null | undefined,
  kind: ClockKind = "vote",
): number | null {
  const [ms, setMs] = useState<number | null>(null);
  const serverTimeRef = useRef(serverTime);
  serverTimeRef.current = serverTime;

  useEffect(() => {
    if (deadlineAt == null) {
      setMs(null);
      return;
    }
    const originClient = Date.now();
    const originServer = serverTimeRef.current;
    const tick = () => {
      const fromClock = remainingMsFromClock(kind, deadlineAt);
      if (fromClock != null) {
        setMs(fromClock);
        return;
      }
      if (originServer == null) {
        setMs(null);
        return;
      }
      setMs(Math.max(0, deadlineAt - originServer - (Date.now() - originClient)));
    };
    tick();
    const id = window.setInterval(tick, 100);
    const unsub = subscribeGameClock(tick);
    return () => {
      window.clearInterval(id);
      unsub();
    };
  }, [deadlineAt, kind]);

  return ms;
}

export default function VoteTimer({
  remainingMs,
  totalMs = VOTE_DURATION_MS,
  compact = false,
  kicker,
}: {
  remainingMs: number;
  totalMs?: number;
  compact?: boolean;
  kicker?: string;
}) {
  const urgent = remainingMs <= 15_000;
  const warn = remainingMs <= 40_000 && !urgent;
  const label = remainingMs <= 0 ? "0:00" : formatVoteClock(remainingMs);
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const caption = kicker ?? (remainingMs <= 0 ? "Time’s up" : "Lock before");

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold tabular-nums ${
          urgent ? "bg-magenta/20 text-magenta" : "bg-cyan/15 text-cyan"
        }`}
      >
        {kicker ? (
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">{kicker}</span>
        ) : null}
        {label}
      </span>
    );
  }

  return (
    <div
      className={`mx-auto mb-4 w-full max-w-xs rounded-[22px] px-4 py-3 text-center ring-1 ${
        urgent ? "animate-pulseGlow bg-magenta/15 ring-magenta/40" : "bg-white/6 ring-white/10"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cream/45">
        {caption}
      </p>
      <p
        className={`font-display mt-1 text-4xl font-bold tabular-nums ${
          urgent ? "text-magenta" : "text-cream"
        }`}
      >
        {label}
      </p>
      <div className="orig-timer-bar mt-3">
        <div
          className={`orig-timer-fill ${urgent ? "danger" : warn ? "warn" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
