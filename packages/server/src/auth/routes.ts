import type { Database } from "bun:sqlite";

import type { ServerConfig } from "../config";
import { issueAccessToken } from "./jwt";
import { hashPassword, verifyPassword } from "./password";
import { findUserByEmail, insertUser } from "./repository";
import { validateAuthCredentials } from "./validation";

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
const SIGNUP_FAILED_MESSAGE = "Unable to create account.";

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

async function parseJsonBody(request: Request): Promise<unknown | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE") || message.includes("constraint");
}

export async function handleSignup(
  request: Request,
  db: Database,
  config: ServerConfig,
): Promise<Response> {
  const body = await parseJsonBody(request);
  if (!body) {
    return json(415, { error: "Request must be valid application/json." });
  }

  const validation = validateAuthCredentials(body);
  if (!validation.ok) {
    return json(400, { error: validation.error });
  }

  const existingUser = findUserByEmail(db, validation.value.email);
  if (existingUser) {
    return json(409, { error: SIGNUP_FAILED_MESSAGE });
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(validation.value.password);

  try {
    insertUser(db, {
      id: userId,
      email: validation.value.email,
      passwordHash,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return json(409, { error: SIGNUP_FAILED_MESSAGE });
    }

    throw error;
  }

  const issuedToken = await issueAccessToken(
    { sub: userId },
    config,
  );

  return json(201, {
    token: issuedToken.token,
    expiresInSeconds: issuedToken.expiresInSeconds,
    user: {
      id: userId,
      email: validation.value.email,
    },
  });
}

export async function handleSignin(
  request: Request,
  db: Database,
  config: ServerConfig,
): Promise<Response> {
  const body = await parseJsonBody(request);
  if (!body) {
    return json(415, { error: "Request must be valid application/json." });
  }

  const validation = validateAuthCredentials(body);
  if (!validation.ok) {
    return json(400, { error: validation.error });
  }

  const user = findUserByEmail(db, validation.value.email);
  if (!user) {
    return json(401, { error: INVALID_CREDENTIALS_MESSAGE });
  }

  const passwordMatches = await verifyPassword(
    validation.value.password,
    user.passwordHash,
  );
  if (!passwordMatches) {
    return json(401, { error: INVALID_CREDENTIALS_MESSAGE });
  }

  const issuedToken = await issueAccessToken(
    { sub: user.id },
    config,
  );

  return json(200, {
    token: issuedToken.token,
    expiresInSeconds: issuedToken.expiresInSeconds,
    user: {
      id: user.id,
      email: user.email,
    },
  });
}
