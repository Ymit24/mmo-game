import { type AuthUser, isUserRole } from "@mmo/shared";

export const AUTH_SESSION_STORAGE_KEY = "mmo.auth.session.v1";

interface StoredAuthSession {
  token: string;
  user: AuthUser;
  expiresAtEpochMs: number;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expiresAtEpochMs: number;
}

function isValidSession(value: unknown): value is StoredAuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredAuthSession>;
  return (
    typeof candidate.token === "string" &&
    !!candidate.token &&
    typeof candidate.user?.id === "string" &&
    typeof candidate.user?.email === "string" &&
    isUserRole(candidate.user?.role) &&
    typeof candidate.expiresAtEpochMs === "number"
  );
}

export function isExpired(expiresAtEpochMs: number): boolean {
  return Date.now() >= expiresAtEpochMs;
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSession(parsed) || isExpired(parsed.expiresAtEpochMs)) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}
