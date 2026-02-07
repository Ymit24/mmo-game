import { jwtVerify, SignJWT } from "jose";

import type { ServerConfig } from "../config";

export interface AccessTokenClaims {
  sub: string;
  email: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresInSeconds: number;
}

function getJwtSecretKey(config: ServerConfig): Uint8Array {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function issueAccessToken(
  claims: AccessTokenClaims,
  config: ServerConfig,
): Promise<IssuedAccessToken> {
  const signer = new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.jwtExpiresInSeconds}s`);

  if (config.jwtIssuer) {
    signer.setIssuer(config.jwtIssuer);
  }

  if (config.jwtAudience) {
    signer.setAudience(config.jwtAudience);
  }

  const token = await signer.sign(getJwtSecretKey(config));

  return {
    token,
    expiresInSeconds: config.jwtExpiresInSeconds,
  };
}

export async function verifyAccessToken(token: string, config: ServerConfig) {
  return jwtVerify(token, getJwtSecretKey(config), {
    algorithms: ["HS256"],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
}
