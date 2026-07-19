'use client';

import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { AGENT_ROLE_LABELS } from '@/lib/agent-platform/rbac';
import { agentPlatformApi } from '@/services/api-client';
import { useEffect, useState } from 'react';

export function ImpersonationBanner() {
  const { role } = useAgentPlatform();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    void agentPlatformApi.getSession().then((s) => {
      if (s.impersonation?.readOnly) {
        setImpersonating(true);
      }
    });
  }, []);

  if (!impersonating) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p className="font-semibold">
        Đang đăng nhập với tư cách {companyName ?? 'Đại lý'} — {AGENT_ROLE_LABELS[role]} (chỉ xem)
      </p>
      <p className="mt-1 text-xs opacity-80">
        Không thể xoay khóa API, xóa user, đổi mật khẩu hoặc thao tác quản trị.
      </p>
    </div>
  );
}
