import { timingSafeEqual } from "node:crypto";

const ADMIN_API_ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const IS_PRODUCTION_ENV_VALUES = new Set(["production"]);

function normalizeEnvValue(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isProduction(): boolean {
  return (
    IS_PRODUCTION_ENV_VALUES.has(normalizeEnvValue(process.env.NODE_ENV)) ||
    IS_PRODUCTION_ENV_VALUES.has(normalizeEnvValue(process.env.BUN_ENV))
  );
}

function tokenEquals(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function getBearerTokenFromRequest(request: Request): string | null {
  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, ...rest] = authorizationHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

export function isAdminApiEnabled(): boolean {
  if (isProduction()) {
    return false;
  }

  return ADMIN_API_ENABLED_VALUES.has(
    normalizeEnvValue(process.env.ADMIN_API_ENABLED),
  );
}

/**
 * Middleware-style guard. Returns an error response if admin API is disabled
 * or unauthorized, and `null` if the request should proceed.
 */
export function guardAdminRequest(request: Request): Response | null {
  if (!isAdminApiEnabled()) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (request.method === "OPTIONS") {
    return null;
  }

  const configuredToken = (process.env.ADMIN_API_BEARER_TOKEN ?? "").trim();
  if (configuredToken.length === 0) {
    return Response.json({ error: "Admin API unavailable." }, { status: 503 });
  }

  const providedToken = getBearerTokenFromRequest(request);
  if (!providedToken || !tokenEquals(providedToken, configuredToken)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}
