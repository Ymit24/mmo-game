import { describe, expect, test } from "bun:test";

import type { ServerConfig } from "../config";
import { issueAccessToken, verifyAccessToken } from "./jwt";

const baseConfig: ServerConfig = {
  jwtSecret: "test-jwt-secret-at-least-32-characters-long",
  jwtExpiresInSeconds: 1,
  dbPath: ":memory:",
};

describe("jwt", () => {
  test("issues and verifies access token", async () => {
    const issued = await issueAccessToken(
      { sub: "user-1", email: "user@example.com" },
      baseConfig,
    );
    const verified = await verifyAccessToken(issued.token, baseConfig);

    expect(issued.expiresInSeconds).toBe(1);
    expect(verified.payload.sub).toBe("user-1");
    expect(verified.payload.email).toBe("user@example.com");
  });

  test("rejects tampered token", async () => {
    const issued = await issueAccessToken(
      { sub: "user-1", email: "user@example.com" },
      baseConfig,
    );
    const tampered = `${issued.token}x`;

    let threw = false;
    try {
      await verifyAccessToken(tampered, baseConfig);
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
  });

  test("rejects expired token", async () => {
    const issued = await issueAccessToken(
      { sub: "user-1", email: "user@example.com" },
      baseConfig,
    );

    await Bun.sleep(1_200);

    let threw = false;
    try {
      await verifyAccessToken(issued.token, baseConfig);
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
  });
});
