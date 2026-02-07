import type {
  AuthCredentials,
  AuthErrorResponse,
  AuthSuccessResponse,
} from "@mmo/shared";

import { API_BASE_URL } from "../../config/env";

const JSON_HEADERS = {
  "content-type": "application/json",
} as const;

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<AuthErrorResponse>;
    if (typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Ignore JSON parsing errors and fall through to default error.
  }

  return "Request failed. Please try again.";
}

async function requestAuth(
  endpoint: "/auth/signup" | "/auth/signin",
  credentials: AuthCredentials,
): Promise<AuthSuccessResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new Error("Unable to reach the server. Please try again.");
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as AuthSuccessResponse;
}

export function signup(credentials: AuthCredentials) {
  return requestAuth("/auth/signup", credentials);
}

export function signin(credentials: AuthCredentials) {
  return requestAuth("/auth/signin", credentials);
}
