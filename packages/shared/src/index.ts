import type { UserRole } from "./auth/roles";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthSuccessResponse {
  token: string;
  expiresInSeconds: number;
  user: AuthUser;
}

export interface AuthErrorResponse {
  error: string;
}

export * from "./auth/credentials";
export * from "./auth/roles";
export * from "./characters";
export * from "./combat/attacks";
export * from "./enemies";
export * from "./icons";
export * from "./items";
export * from "./protocol/ws";
export * from "./world/map";
export * from "./world/mapData";
export * from "./world/movement";
export * from "./world/mapValidation";
