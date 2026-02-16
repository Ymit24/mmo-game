import { describe, expect, test } from "vitest";

import {
  AUTH_SESSION_STORAGE_KEY,
  type AuthSession,
  clearSession,
  isExpired,
  loadSession,
  saveSession,
} from "./sessionStorage";

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    token: "token-123",
    user: { id: "user-1", email: "player@example.com", role: "user" },
    expiresAtEpochMs: Date.now() + 10_000,
    ...overrides,
  };
}

describe("sessionStorage", () => {
  test("saves and loads a valid session", () => {
    const session = makeSession();

    saveSession(session);

    expect(loadSession()).toEqual(session);
  });

  test("returns null and clears expired session", () => {
    const expiredSession = makeSession({ expiresAtEpochMs: Date.now() - 1 });
    localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify(expiredSession),
    );

    expect(loadSession()).toBeNull();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  test("returns null and clears malformed payload", () => {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, "{not-json");

    expect(loadSession()).toBeNull();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  test("isExpired reflects current timestamp", () => {
    expect(isExpired(Date.now() - 100)).toBe(true);
    expect(isExpired(Date.now() + 100)).toBe(false);
  });

  test("clearSession removes the stored value", () => {
    saveSession(makeSession());
    clearSession();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });
});
