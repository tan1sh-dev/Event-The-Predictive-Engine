import { MAX_CLUSTER_COUNT, normalizeTeamDetails, type TeamDetails } from "@engine/shared";

export const TOKEN_PREFIX = "engine.token.";
export const LAST_CLUSTER_KEY = "engine.lastCluster";
export const TEAM_KEY = "engine.team";
/** sessionStorage: after a host reset/kick, always reopen the team-details form. */
export const JOIN_SCREEN_KEY = "engine.joinScreen";

export function tokenKey(clusterNumber: number): string {
  return `${TOKEN_PREFIX}${clusterNumber}`;
}

export function loadToken(clusterNumber: number): string | undefined {
  try {
    return localStorage.getItem(tokenKey(clusterNumber)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveToken(clusterNumber: number, token: string): void {
  try {
    localStorage.setItem(tokenKey(clusterNumber), token);
    localStorage.setItem(LAST_CLUSTER_KEY, String(clusterNumber));
  } catch {
    /* private mode */
  }
}

export function loadLastCluster(): number | null {
  try {
    const raw = localStorage.getItem(LAST_CLUSTER_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= MAX_CLUSTER_COUNT ? n : null;
  } catch {
    return null;
  }
}

export function loadTeam(): TeamDetails | null {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    return raw ? normalizeTeamDetails(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveTeam(team: TeamDetails): void {
  try {
    localStorage.setItem(TEAM_KEY, JSON.stringify(team));
  } catch {
    /* private mode */
  }
}

export function hasSavedSession(): boolean {
  const n = loadLastCluster();
  return n != null && Boolean(loadToken(n)) && Boolean(loadTeam());
}

export function clearSession(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key === LAST_CLUSTER_KEY || key.startsWith(TOKEN_PREFIX))) {
        keys.push(key);
      }
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

export function markTeamScreen(): void {
  try {
    sessionStorage.setItem(JOIN_SCREEN_KEY, "team");
  } catch {
    /* private mode */
  }
}

export function loadJoinScreen(): "team" | null {
  try {
    return sessionStorage.getItem(JOIN_SCREEN_KEY) === "team" ? "team" : null;
  } catch {
    return null;
  }
}

export function clearJoinScreen(): void {
  try {
    sessionStorage.removeItem(JOIN_SCREEN_KEY);
  } catch {
    /* private mode */
  }
}
