export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
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
export * from "./protocol/ws";
export * from "./world/map";
export * from "./world/mapData";
export * from "./world/movement";
export * from "./world/mapValidation";
