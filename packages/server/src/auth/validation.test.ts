import { describe, expect, test } from "bun:test";

import { normalizeEmail, validateAuthCredentials } from "./validation";

describe("validation", () => {
  test("normalizes email", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  test("rejects invalid email", () => {
    const result = validateAuthCredentials({
      email: "not-an-email",
      password: "password123",
    });

    expect(result.ok).toBe(false);
  });

  test("rejects short password", () => {
    const result = validateAuthCredentials({
      email: "user@example.com",
      password: "short",
    });

    expect(result.ok).toBe(false);
  });

  test("accepts valid credentials", () => {
    const result = validateAuthCredentials({
      email: "USER@Example.com",
      password: "password123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("user@example.com");
    }
  });
});
