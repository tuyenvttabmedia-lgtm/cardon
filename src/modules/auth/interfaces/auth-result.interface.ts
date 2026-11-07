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
  permissions?: string[];
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUserSummary;
}

/** Customer register never returns a session — email must be verified first (anti email-squat). */
export interface RegisterPendingResult {
  requiresEmailVerification: true;
  email: string;
  message: string;
}
