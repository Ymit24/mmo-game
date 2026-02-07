import {
  MIN_PASSWORD_LENGTH,
  isEmailFormatValid,
  normalizeEmail,
} from "@mmo/shared";

export { normalizeEmail };

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface ValidationSuccess {
  ok: true;
  value: AuthCredentials;
}

export interface ValidationFailure {
  ok: false;
  error: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export function validateAuthCredentials(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const rawEmail = (input as Record<string, unknown>).email;
  const rawPassword = (input as Record<string, unknown>).password;

  if (typeof rawEmail !== "string" || typeof rawPassword !== "string") {
    return { ok: false, error: "Email and password are required." };
  }

  const email = normalizeEmail(rawEmail);
  if (!isEmailFormatValid(email)) {
    return { ok: false, error: "Email is invalid." };
  }

  if (rawPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  return {
    ok: true,
    value: {
      email,
      password: rawPassword,
    },
  };
}
