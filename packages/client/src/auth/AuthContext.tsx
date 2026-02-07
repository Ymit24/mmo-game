import type { AuthCredentials, AuthSuccessResponse, AuthUser } from "@mmo/shared";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { signin as signinRequest, signup as signupRequest } from "../lib/api/authApi";
import {
  clearSession,
  loadSession,
  saveSession,
  type AuthSession,
} from "../lib/auth/sessionStorage";

type AuthStatus = "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  signin: (credentials: AuthCredentials) => Promise<void>;
  signup: (credentials: AuthCredentials) => Promise<void>;
  signout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function buildSession(response: AuthSuccessResponse): AuthSession {
  return {
    token: response.token,
    user: response.user,
    expiresAtEpochMs: Date.now() + response.expiresInSeconds * 1000,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());

  const setSessionFromResponse = useCallback((response: AuthSuccessResponse) => {
    const nextSession = buildSession(response);
    saveSession(nextSession);
    setSession(nextSession);
  }, []);

  const signup = useCallback(async (credentials: AuthCredentials) => {
    const response = await signupRequest(credentials);
    setSessionFromResponse(response);
  }, [setSessionFromResponse]);

  const signin = useCallback(async (credentials: AuthCredentials) => {
    const response = await signinRequest(credentials);
    setSessionFromResponse(response);
  }, [setSessionFromResponse]);

  const signout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: session ? "authenticated" : "unauthenticated",
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: !!session,
      signin,
      signup,
      signout,
    }),
    [session, signin, signup, signout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
