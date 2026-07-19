'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { authApi, refreshSession } from '@/services/api-client';
import {
  clearAuthSession,
  clearSessionKycCredentials,
  getAccessToken,
  getRefreshToken,
  getStoredPermissions,
  getStoredUser,
  setAuthSession,
} from '@/lib/auth-storage';
import { hasPermission } from '@/lib/permissions';
import type { AuthResult, AuthUser } from '@/types/api';

interface AuthContextValue {
  user: AuthUser | null;
  permissions: string[];
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const syncSession = useCallback(async () => {
    const stored = getStoredUser<AuthUser>();
    const token = getAccessToken();

    if (!stored && !token) {
      setUser(null);
      setPermissions([]);
      return;
    }

    if (stored) {
      setUser(stored);
      setPermissions(getStoredPermissions());
    }

    try {
      const me = await authApi.me();
      setAuthSession({
        accessToken: getAccessToken() ?? '',
        refreshToken: getRefreshToken() ?? '',
        user: me,
        permissions: me.permissions,
      });
      setUser(me);
      setPermissions(me.permissions ?? []);
    } catch {
      const refreshed = await refreshSession();
      if (refreshed) {
        try {
          const me = await authApi.me();
          setAuthSession({
            accessToken: getAccessToken() ?? '',
            refreshToken: getRefreshToken() ?? '',
            user: me,
            permissions: me.permissions,
          });
          setUser(me);
          setPermissions(me.permissions ?? []);
          return;
        } catch {
          // fall through to clear
        }
      }
      clearAuthSession();
      setUser(null);
      setPermissions([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await syncSession();
      setLoading(false);
    })();
  }, [syncSession]);

  useEffect(() => {
    if (!getRefreshToken()) return;
    const intervalMs = 12 * 60 * 1000;
    const id = window.setInterval(() => {
      void refreshSession();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshSession();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login(email.trim(), password);

      setAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        permissions: result.user.permissions,
      });
      setUser(result.user);
      setPermissions(result.user.permissions ?? []);

      const me = await authApi.me();
      setAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: me,
        permissions: me.permissions,
      });
      setUser(me);
      setPermissions(me.permissions ?? []);

      router.refresh();
      return result;
    },
    [router],
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // ignore
    }
    clearAuthSession();
    clearSessionKycCredentials();
    setUser(null);
    setPermissions([]);
    router.replace('/login');
    router.refresh();
  }, [router]);

  const can = useCallback(
    (permission: string) => hasPermission(permissions, permission),
    [permissions],
  );

  const value = useMemo(
    () => ({
      user,
      permissions,
      loading,
      isAuthenticated: !!user,
      login,
      logout,
      can,
    }),
    [user, permissions, loading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return ctx;
}
