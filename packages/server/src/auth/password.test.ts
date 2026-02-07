import { describe, expect, test } from "bun:test";

import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  test("hashes and verifies a password", async () => {
    const password = "StrongPass123";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("WrongPass123", hash)).toBe(false);
  });
});
