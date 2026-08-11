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
import { authApi, refreshSession, ApiClientError } from '@/services/api-client';
import {
  clearAuthSession,
  clearSessionKycCredentials,
  getAccessToken,
  getRefreshToken,
  getStoredPermissions,
  getStoredUser,
  setAuthSession,
} from '@/lib/auth-storage';
import { hasPermission, isAdminStaffRole } from '@/lib/permissions';
import type { AuthResult, AuthUser } from '@/types/api';

type AuthUserWithPermissions = AuthUser & { permissions?: string[] };

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

function normalizePermissions(me: AuthUserWithPermissions): string[] {
  return Array.isArray(me.permissions) ? me.permissions : [];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const applyMe = useCallback((me: AuthUserWithPermissions, accessToken: string, refreshToken: string) => {
    const nextPermissions = normalizePermissions(me);
    setAuthSession({
      accessToken,
      refreshToken,
      user: me,
      permissions: nextPermissions,
    });
    setUser(me);
    setPermissions(nextPermissions);
    return nextPermissions;
  }, []);

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
      if (!isAdminStaffRole(me.role)) {
        clearAuthSession();
        setUser(null);
        setPermissions([]);
        return;
      }
      applyMe(me, getAccessToken() ?? '', getRefreshToken() ?? '');
    } catch {
      const refreshed = await refreshSession();
      if (refreshed) {
        try {
          const me = await authApi.me();
          if (!isAdminStaffRole(me.role)) {
            clearAuthSession();
            setUser(null);
            setPermissions([]);
            return;
          }
          applyMe(me, getAccessToken() ?? '', getRefreshToken() ?? '');
          return;
        } catch {
          // fall through to clear
        }
      }
      clearAuthSession();
      setUser(null);
      setPermissions([]);
    }
  }, [applyMe]);

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

      if (!isAdminStaffRole(result.user.role)) {
        clearAuthSession();
        setUser(null);
        setPermissions([]);
        throw new ApiClientError(
          'Tài khoản này không có quyền truy cập Admin Panel. Dùng tài khoản SUPER_ADMIN / nhân sự.',
          403,
          'WRONG_PORTAL_ROLE',
        );
      }

      // Persist tokens first so /auth/me is authenticated.
      setAuthSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        permissions: normalizePermissions(result.user),
      });
      setUser(result.user);
      setPermissions(normalizePermissions(result.user));

      const me = await authApi.me();
      if (!isAdminStaffRole(me.role)) {
        clearAuthSession();
        setUser(null);
        setPermissions([]);
        throw new ApiClientError(
          'Tài khoản này không có quyền truy cập Admin Panel. Dùng tài khoản SUPER_ADMIN / nhân sự.',
          403,
          'WRONG_PORTAL_ROLE',
        );
      }
      const nextPermissions = applyMe(me, result.accessToken, result.refreshToken);

      router.refresh();
      return {
        ...result,
        user: {
          ...me,
          permissions: nextPermissions,
        },
      };
    },
    [applyMe, router],
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
    (permission: string) => hasPermission(permissions, permission, user?.role),
    [permissions, user?.role],
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
