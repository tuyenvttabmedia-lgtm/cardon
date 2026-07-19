export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUserSummary {
  id: string;
  username?: string | null;
  fullName?: string | null;
  email: string;
  role: string;
  emailVerified: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUserSummary;
}
