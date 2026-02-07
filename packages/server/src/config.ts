export interface ServerConfig {
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  dbPath: string;
  jwtIssuer?: string;
  jwtAudience?: string;
}

const DEFAULT_JWT_EXPIRY_SECONDS = 86_400;
const DEFAULT_DB_PATH = "./data/auth.sqlite";
const MIN_JWT_SECRET_LENGTH = 32;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function createServerConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<ServerConfig> = {},
): ServerConfig {
  const jwtSecret = overrides.jwtSecret ?? env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT secret must be at least ${MIN_JWT_SECRET_LENGTH} characters.`,
    );
  }

  const jwtExpiresInSeconds =
    overrides.jwtExpiresInSeconds ??
    parsePositiveInt(env.JWT_EXPIRES_IN_SECONDS, DEFAULT_JWT_EXPIRY_SECONDS);

  return {
    jwtSecret,
    jwtExpiresInSeconds,
    dbPath: overrides.dbPath ?? env.AUTH_DB_PATH ?? DEFAULT_DB_PATH,
    jwtIssuer: overrides.jwtIssuer ?? env.JWT_ISSUER,
    jwtAudience: overrides.jwtAudience ?? env.JWT_AUDIENCE,
  };
}
