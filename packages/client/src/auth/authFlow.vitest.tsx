import type { AuthSuccessResponse } from "@mmo/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";

import { AppRoutes } from "../AppRoutes";
import { AUTH_SESSION_STORAGE_KEY } from "../lib/auth/sessionStorage";
import { AuthProvider } from "./AuthContext";

vi.mock("../game/phaser/runtime", () => ({
  mountGameRuntime: () => () => {},
}));

function renderApp(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

function makeSuccessResponse(
  overrides: Partial<AuthSuccessResponse> = {},
): AuthSuccessResponse {
  return {
    token: "jwt-token",
    expiresInSeconds: 60,
    user: {
      id: "user-1",
      email: "player@example.com",
    },
    ...overrides,
  };
}

describe("auth flow", () => {
  test("redirects unauthenticated users from /play to /signin", async () => {
    renderApp("/play");

    expect(
      await screen.findByRole("heading", { name: "Reconnect to the world" }),
    ).toBeInTheDocument();
  });

  test("signin validates fields and redirects to /play on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/signin")) {
        return {
          ok: true,
          json: async () => makeSuccessResponse(),
        };
      }
      if (url.endsWith("/characters")) {
        return {
          ok: true,
          json: async () => ({
            characters: [
              {
                id: "char-1",
                nickname: "Alpha",
                class: "knight",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isLastUsed: true,
              },
            ],
            maxCharacters: 6,
            lastUsedCharacterId: "char-1",
          }),
        };
      }
      return {
        ok: false,
        json: async () => ({ error: "Unexpected request" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/signin");

    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(
      await screen.findByText("Password is required."),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "  PLAYER@Example.com  ");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/signin",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "player@example.com",
          password: "password123",
        }),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Choose Character" }),
    ).toBeInTheDocument();

    const storedSession = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    expect(storedSession).toContain("player@example.com");
  });

  test("shows API error message for failed signup", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Email already registered." }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/signup");

    await user.type(screen.getByLabelText("Email"), "player@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email already registered.",
    );
  });

  test("expired stored session is discarded and user is redirected to signin", async () => {
    localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "expired-token",
        user: { id: "user-1", email: "player@example.com" },
        expiresAtEpochMs: Date.now() - 5_000,
      }),
    );

    renderApp("/play");

    expect(
      await screen.findByRole("heading", { name: "Reconnect to the world" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });
});
