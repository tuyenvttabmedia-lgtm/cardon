const ACCESS_TOKEN_KEY = 'cardon_admin_access_token';
const REFRESH_TOKEN_KEY = 'cardon_admin_refresh_token';
const USER_KEY = 'cardon_admin_user';
const PERMISSIONS_KEY = 'cardon_admin_permissions';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthSession(params: {
  accessToken: string;
  refreshToken: string;
  user: unknown;
  permissions?: string[];
}): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(params.user));
  if (params.permissions) {
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(params.permissions));
  }
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PERMISSIONS_KEY);
  sessionStorage.removeItem('cardon_admin_kyc_credentials_once');
}

export function getStoredUser<T>(): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getStoredPermissions(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(PERMISSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function setSessionKycCredentials(creds: { apiKey: string; secretKey: string }) {
  sessionStorage.setItem('cardon_admin_kyc_credentials_once', JSON.stringify(creds));
}

export function getSessionKycCredentials(): { apiKey?: string; secretKey?: string } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem('cardon_admin_kyc_credentials_once');
    return raw ? (JSON.parse(raw) as { apiKey: string; secretKey: string }) : {};
  } catch {
    return {};
  }
}

export function clearSessionKycCredentials() {
  sessionStorage.removeItem('cardon_admin_kyc_credentials_once');
}
