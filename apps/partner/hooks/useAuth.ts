'use client';

import { useCallback, useEffect, useState } from 'react';
import { authApi, agentApi } from '@/services/api-client';
import {
  clearAuthSession,
  clearSessionCredentials,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  setAuthSession,
  syncPartnerSessionCookie,
} from '@/lib/auth-storage';
import type { AuthUser } from '@/types/api';

function readSession(): { user: AuthUser | null; authenticated: boolean } {
  const user = getStoredUser<AuthUser>();
  const token = getAccessToken();
  const authenticated = Boolean(user && token);
  syncPartnerSessionCookie();
  return { user: authenticated ? user : null, authenticated };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session: { user: AuthUser | null; authenticated: boolean }) => {
    setUser(session.user);
    setIsAuthenticated(session.authenticated);
  }, []);

  useEffect(() => {
    applySession(readSession());
    setLoading(false);
  }, [applySession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    setAuthSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    const session = readSession();
    applySession(session);
    return result;
  }, [applySession]);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    clearAuthSession();
    clearSessionCredentials();
    applySession({ user: null, authenticated: false });
    if (refreshToken) {
      void authApi.logout(refreshToken).catch(() => {});
    }
    window.location.href = '/login';
  }, [applySession]);

  return { user, loading, login, logout, isAuthenticated };
}

export function useAgentProfile() {
  const [profile, setProfile] = useState<Awaited<
    ReturnType<typeof agentApi.getMe>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await agentApi.getMe();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được hồ sơ agent');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, loading, error, refresh };
}
