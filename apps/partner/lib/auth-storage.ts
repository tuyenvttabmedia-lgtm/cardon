import {
  clearPartnerSessionCookie,
  setPartnerSessionCookie,
} from './partner-session';

const ACCESS_TOKEN_KEY = 'cardon_partner_access_token';
const REFRESH_TOKEN_KEY = 'cardon_partner_refresh_token';
const USER_KEY = 'cardon_partner_user';

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
}): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(params.user));
  setPartnerSessionCookie();
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearPartnerSessionCookie();
}

/** Sync middleware cookie with localStorage session (both directions). */
export function syncPartnerSessionCookie(): void {
  if (typeof window === 'undefined') return;
  const hasToken = Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));
  const hasUser = Boolean(localStorage.getItem(USER_KEY));
  if (hasToken && hasUser) {
    setPartnerSessionCookie();
  } else {
    clearPartnerSessionCookie();
  }
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

/** One-time credentials from admin approval — session only, never persisted long-term */
export function getSessionCredentials(): { apiKey?: string; secretKey?: string } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem('cardon_partner_credentials_once');
    if (!raw) return {};
    return JSON.parse(raw) as { apiKey?: string; secretKey?: string };
  } catch {
    return {};
  }
}

export function setSessionCredentials(creds: {
  apiKey: string;
  secretKey: string;
}): void {
  sessionStorage.setItem('cardon_partner_credentials_once', JSON.stringify(creds));
}

export function clearSessionCredentials(): void {
  sessionStorage.removeItem('cardon_partner_credentials_once');
}
