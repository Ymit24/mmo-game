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
