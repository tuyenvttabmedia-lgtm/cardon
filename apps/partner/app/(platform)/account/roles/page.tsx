'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { organizationApi } from '@/services/api-client';
import { AGENT_ROLE_LABELS } from '@/lib/agent-platform/rbac';
import type { AgentPermissionMatrix } from '@/types/platform';

export default function RolesPage() {
  const [matrix, setMatrix] = useState<AgentPermissionMatrix | null>(null);

  useEffect(() => {
    void organizationApi.getPermissionMatrix().then(setMatrix);
  }, []);

  if (!matrix) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />;
  }

  return (
    <PlatformSection title="Vai trò & quyền" description={`Vai trò hiện tại: ${AGENT_ROLE_LABELS[matrix.currentRole]}`}>
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase dark:bg-slate-900">
            <tr>
              <th className="px-3 py-3">Module</th>
              {matrix.roles.map((r) => (
                <th key={r.role} className="px-3 py-3">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.modules.map((m) => (
              <tr key={m.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-3 font-medium">{m.label}</td>
                {matrix.roles.map((r) => (
                  <td key={r.role} className="px-3 py-3 text-center">
                    {m.access[r.role] ? '✓' : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PlatformSection>
  );
}
