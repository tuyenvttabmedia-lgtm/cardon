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
import { authApi, refreshAccessToken } from '@/services/api-client';
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  hasAuthSession,
  setAuthSession,
} from '@/lib/auth-storage';
import type { AuthResult, AuthUser, RegisterPayload } from '@/types/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<AuthResult>;
  register: (payload: RegisterPayload) => Promise<AuthResult>;
  logout: () => void;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const stored = getStoredUser<AuthUser>();
    if (!getAccessToken() && !getRefreshToken()) {
      if (stored) clearAuthSession();
      setUser(null);
      return null;
    }
    try {
      const me = await authApi.me();
      setAuthSession({
        accessToken: getAccessToken() ?? '',
        refreshToken: getRefreshToken() ?? '',
        user: me,
      });
      setUser(me);
      return me;
    } catch {
      if (getRefreshToken()) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          try {
            const me = await authApi.me();
            setAuthSession({
              accessToken: newToken,
              refreshToken: getRefreshToken() ?? '',
              user: me,
            });
            setUser(me);
            return me;
          } catch {
            /* fall through */
          }
        }
      }
      clearAuthSession();
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setUser(getStoredUser<AuthUser>());
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const result = await authApi.login(identifier, password);
      setAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
      const me = await authApi.me();
      setAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: me,
      });
      setUser(me);
      router.refresh();
      return result;
    },
    [router],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const result = await authApi.register(payload);
      setAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
      const me = await authApi.me();
      setAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: me,
      });
      setUser(me);
      router.refresh();
      return result;
    },
    [router],
  );

  const logout = useCallback(() => {
    clearAuthSession();
    setUser(null);
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user && hasAuthSession()),
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, register, logout, refreshUser],
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
