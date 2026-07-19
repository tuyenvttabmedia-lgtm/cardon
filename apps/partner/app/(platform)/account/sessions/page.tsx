'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { formatDateTime } from '@/lib/utils';
import { organizationApi } from '@/services/api-client';
import type { AgentSessionEntry } from '@/types/platform';

export default function SessionsPage() {
  const { can } = useAgentPlatform();
  const [items, setItems] = useState<AgentSessionEntry[]>([]);

  useEffect(() => {
    void organizationApi.listSessions().then((r) => setItems(r.items));
  }, []);

  return (
    <PlatformSection title="Phiên đăng nhập" description="Quản lý phiên đang hoạt động trên tài khoản của bạn.">
      {can('sessions.manage') && (
        <Button variant="secondary" className="mb-4" onClick={() => void organizationApi.revokeOtherSessions().then(() => organizationApi.listSessions().then((r) => setItems(r.items)))}>
          Đăng xuất các phiên khác
        </Button>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase dark:bg-slate-900">
            <tr>
              <th className="px-3 py-3">Bắt đầu</th>
              <th className="px-3 py-3">Hết hạn</th>
              {can('sessions.manage') && <th className="px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-500">Không có phiên active</td></tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3">{formatDateTime(s.createdAt)}</td>
                  <td className="px-3 py-3">{formatDateTime(s.expiresAt)}</td>
                  {can('sessions.manage') && (
                    <td className="px-3 py-3">
                      <Button variant="secondary" size="sm" onClick={() => void organizationApi.revokeSession(s.id).then(() => organizationApi.listSessions().then((r) => setItems(r.items)))}>
                        Thu hồi
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </PlatformSection>
  );
}
