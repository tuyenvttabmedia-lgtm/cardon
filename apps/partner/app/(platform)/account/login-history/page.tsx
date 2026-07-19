'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { formatDateTime } from '@/lib/utils';
import { organizationApi } from '@/services/api-client';
import type { AgentLoginHistoryEntry } from '@/types/platform';

export default function LoginHistoryPage() {
  const [items, setItems] = useState<AgentLoginHistoryEntry[]>([]);

  useEffect(() => {
    void organizationApi.listLoginHistory(1).then((r) => setItems(r.items));
  }, []);

  return (
    <PlatformSection title="Lịch sử đăng nhập" description="Theo dõi IP, thiết bị và kết quả đăng nhập.">
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase dark:bg-slate-900">
            <tr>
              <th className="px-3 py-3">Thời gian</th>
              <th className="px-3 py-3">IP</th>
              <th className="px-3 py-3">Trình duyệt</th>
              <th className="px-3 py-3">Thiết bị</th>
              <th className="px-3 py-3">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Chưa có lịch sử</td></tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-3">{r.ip ?? '—'}</td>
                  <td className="px-3 py-3">{r.browser ?? '—'}</td>
                  <td className="px-3 py-3">{r.device ?? '—'}</td>
                  <td className="px-3 py-3">
                    <Badge tone={r.result === 'SUCCESS' ? 'success' : 'danger'}>{r.result}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </PlatformSection>
  );
}
