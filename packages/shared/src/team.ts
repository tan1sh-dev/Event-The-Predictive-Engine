import type { TeamDetails } from "./types.ts";

/** Total people on one phone, including the leader. */
export const MIN_TEAM_SIZE = 1;
export const MAX_TEAM_SIZE = 5;
/** Max teammates besides the leader (= MAX_TEAM_SIZE − 1). */
export const TEAM_MEMBER_COUNT = MAX_TEAM_SIZE - 1;
export const MAX_TEAM_FIELD_LENGTH = 40;

export function emptyTeamDraft(teamSize: number = MAX_TEAM_SIZE): {
  teamName: string;
  leaderName: string;
  members: string[];
} {
  const size = clampTeamSize(teamSize);
  return {
    teamName: "",
    leaderName: "",
    members: Array.from({ length: size - 1 }, () => ""),
  };
}

export function clampTeamSize(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n)) return MAX_TEAM_SIZE;
  return Math.min(MAX_TEAM_SIZE, Math.max(MIN_TEAM_SIZE, n));
}

export function resizeMembers(members: string[], teamSize: number): string[] {
  const count = clampTeamSize(teamSize) - 1;
  const next = members.slice(0, count).map((m) => m ?? "");
  while (next.length < count) next.push("");
  return next;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > MAX_TEAM_FIELD_LENGTH) return null;
  return trimmed;
}

function nameKey(name: string): string {
  return name.toLowerCase();
}

/** True if leader + teammate names collide (case-insensitive). */
export function hasDuplicatePersonNames(leaderName: string, members: string[]): boolean {
  const keys = [leaderName, ...members].map((n) => nameKey(n.trim().replace(/\s+/g, " ")));
  return new Set(keys).size !== keys.length;
}

/**
 * Team name + leader required. Teammates: 0–4 names (total group size 1–5).
 * Every listed teammate slot must be a non-empty name.
 * Leader and teammate names must all be unique (case-insensitive).
 */
export function normalizeTeamDetails(raw: unknown): TeamDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const teamName = cleanName(input.teamName);
  const leaderName = cleanName(input.leaderName);
  if (!teamName || !leaderName) return null;
  if (!Array.isArray(input.members)) return null;
  if (input.members.length < 0 || input.members.length > TEAM_MEMBER_COUNT) {
    return null;
  }
  const members: string[] = [];
  const seen = new Set<string>([nameKey(leaderName)]);
  for (const member of input.members) {
    const name = cleanName(member);
    if (!name) return null;
    const key = nameKey(name);
    if (seen.has(key)) return null;
    seen.add(key);
    members.push(name);
  }
  return { teamName, leaderName, members };
}
