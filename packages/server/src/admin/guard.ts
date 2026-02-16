/**
 * Dev-only admin API guard.
 *
 * Admin routes are **never** registered in production (see app.ts).
 * This module provides an additional runtime check as a defense-in-depth
 * measure: even if someone accidentally wires admin routes in prod,
 * every request is rejected with a generic 404.
 */

const IS_PRODUCTION =
  process.env.NODE_ENV === "production" || process.env.BUN_ENV === "production";

export function isAdminApiEnabled(): boolean {
  return !IS_PRODUCTION;
}

/**
 * Middleware-style guard. Returns a 404 response if admin API is disabled,
 * or `null` if the request should proceed.
 */
export function guardAdminRequest(): Response | null {
  if (IS_PRODUCTION) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return null;
}
