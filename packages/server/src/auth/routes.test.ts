import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { type AppInstance, createApp } from "../app";
import { verifyAccessToken } from "./jwt";

const TEST_SECRET = "test-jwt-secret-at-least-32-characters-long";

function createJsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("auth routes", () => {
  let app: AppInstance;

  beforeEach(() => {
    app = createApp({
      config: {
        dbPath: ":memory:",
        jwtSecret: TEST_SECRET,
        jwtExpiresInSeconds: 86_400,
      },
    });
  });

  afterEach(() => {
    app.close();
  });

  test("signup succeeds and returns token plus safe user payload", async () => {
    const response = await app.fetch(
      createJsonRequest("/auth/signup", {
        email: " USER@Example.com ",
        password: "password123",
      }),
    );

    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      token: string;
      expiresInSeconds: number;
      user: { id: string; email: string };
    };

    expect(typeof body.token).toBe("string");
    expect(body.expiresInSeconds).toBe(86_400);
    expect(body.user.email).toBe("user@example.com");
    expect(typeof body.user.id).toBe("string");
    expect(
      Object.prototype.hasOwnProperty.call(body.user, "passwordHash"),
    ).toBe(false);

    const verified = await verifyAccessToken(body.token, app.config);
    expect(verified.payload.sub).toBe(body.user.id);
    expect(verified.payload.email).toBe("user@example.com");
  });

  test("signup rejects duplicate email", async () => {
    const first = await app.fetch(
      createJsonRequest("/auth/signup", {
        email: "user@example.com",
        password: "password123",
      }),
    );

    expect(first.status).toBe(201);

    const second = await app.fetch(
      createJsonRequest("/auth/signup", {
        email: "USER@example.com",
        password: "password123",
      }),
    );

    expect(second.status).toBe(409);
  });

  test("signin succeeds for existing user", async () => {
    await app.fetch(
      createJsonRequest("/auth/signup", {
        email: "user@example.com",
        password: "password123",
      }),
    );

    const response = await app.fetch(
      createJsonRequest("/auth/signin", {
        email: "USER@example.com",
        password: "password123",
      }),
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      token: string;
      user: { id: string; email: string };
    };

    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe("user@example.com");
  });

  test("signin returns same message for wrong password and unknown email", async () => {
    await app.fetch(
      createJsonRequest("/auth/signup", {
        email: "user@example.com",
        password: "password123",
      }),
    );

    const wrongPasswordResponse = await app.fetch(
      createJsonRequest("/auth/signin", {
        email: "user@example.com",
        password: "password999",
      }),
    );

    const unknownEmailResponse = await app.fetch(
      createJsonRequest("/auth/signin", {
        email: "missing@example.com",
        password: "password999",
      }),
    );

    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownEmailResponse.status).toBe(401);

    const wrongBody = await wrongPasswordResponse.json();
    const unknownBody = await unknownEmailResponse.json();
    expect(wrongBody).toEqual(unknownBody);
  });

  test("returns validation errors for malformed payload", async () => {
    const invalidEmailResponse = await app.fetch(
      createJsonRequest("/auth/signup", {
        email: "not-an-email",
        password: "password123",
      }),
    );

    const shortPasswordResponse = await app.fetch(
      createJsonRequest("/auth/signin", {
        email: "user@example.com",
        password: "short",
      }),
    );

    expect(invalidEmailResponse.status).toBe(400);
    expect(shortPasswordResponse.status).toBe(400);
  });

  test("rejects non-json requests", async () => {
    const response = await app.fetch(
      new Request("http://localhost/auth/signup", {
        method: "POST",
        body: "email=user@example.com&password=password123",
      }),
    );

    expect(response.status).toBe(415);
  });
});
