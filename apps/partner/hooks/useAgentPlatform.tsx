'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { agentPlatformApi } from '@/services/api-client';
import type { AgentPlatformPermission, AgentPlatformRole, AgentPlatformSession } from '@/types/platform';
import { AGENT_ROLE_PERMISSIONS, canAccess } from '@/lib/agent-platform/rbac';

interface AgentPlatformContextValue {
  role: AgentPlatformRole;
  permissions: AgentPlatformPermission[];
  loading: boolean;
  can: (permission: AgentPlatformPermission) => boolean;
  refresh: () => Promise<void>;
}

const AgentPlatformContext = createContext<AgentPlatformContextValue | null>(null);

export function AgentPlatformProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AgentPlatformSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await agentPlatformApi.getSession();
      setSession(data);
    } catch {
      setSession({
        userId: '',
        platformRole: 'OWNER',
        permissions: AGENT_ROLE_PERMISSIONS.OWNER,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const role = session?.platformRole ?? 'OWNER';
  const permissions = session?.permissions ?? AGENT_ROLE_PERMISSIONS.OWNER;

  const value = useMemo<AgentPlatformContextValue>(
    () => ({
      role,
      permissions,
      loading,
      can: (permission) => canAccess(role, permission) || permissions.includes(permission),
      refresh,
    }),
    [role, permissions, loading, refresh],
  );

  return <AgentPlatformContext.Provider value={value}>{children}</AgentPlatformContext.Provider>;
}

export function useAgentPlatform() {
  const ctx = useContext(AgentPlatformContext);
  if (!ctx) throw new Error('useAgentPlatform must be used within AgentPlatformProvider');
  return ctx;
}
