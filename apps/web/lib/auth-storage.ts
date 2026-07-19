const ACCESS_TOKEN_KEY = 'cardon_access_token';
const REFRESH_TOKEN_KEY = 'cardon_refresh_token';
const USER_KEY = 'cardon_user';

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
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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

/** True when the browser still has tokens for authenticated API calls. */
export function hasAuthSession(): boolean {
  return Boolean(getAccessToken() || getRefreshToken());
}
