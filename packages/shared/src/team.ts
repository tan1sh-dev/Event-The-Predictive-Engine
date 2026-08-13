import type { TeamDetails } from "./types.ts";

export const TEAM_MEMBER_COUNT = 4;
export const MAX_TEAM_FIELD_LENGTH = 40;

export function emptyTeamDraft(): {
  teamName: string;
  leaderName: string;
  members: [string, string, string, string];
} {
  return { teamName: "", leaderName: "", members: ["", "", "", ""] };
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > MAX_TEAM_FIELD_LENGTH) return null;
  return trimmed;
}

export function normalizeTeamDetails(raw: unknown): TeamDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const teamName = cleanName(input.teamName);
  const leaderName = cleanName(input.leaderName);
  if (!teamName || !leaderName) return null;
  if (!Array.isArray(input.members) || input.members.length !== TEAM_MEMBER_COUNT) {
    return null;
  }
  const members: string[] = [];
  for (const member of input.members) {
    const name = cleanName(member);
    if (!name) return null;
    members.push(name);
  }
  return { teamName, leaderName, members };
}
