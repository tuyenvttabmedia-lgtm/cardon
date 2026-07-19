'use client';

import { useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Card } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/utils';
import { securityApi, ApiClientError } from '@/services/api-client';
import type { AgentSecurityDashboard, AgentSecurityEvent } from '@/types/platform';

export default function SecurityOverviewPage() {
  const [dashboard, setDashboard] = useState<AgentSecurityDashboard | null>(null);
  const [events, setEvents] = useState<AgentSecurityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([securityApi.getDashboard(), securityApi.listEvents(30)])
      .then(([d, e]) => {
        setDashboard(d);
        setEvents(e.items);
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : 'Lỗi'));
  }, []);

  return (
    <ApiPageShell title="Bảo mật" description="Tổng quan sự kiện bảo mật và trạng thái tích hợp API.">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {dashboard && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><p className="text-sm text-slate-500">API</p><p className="text-xl font-bold">{dashboard.apiEnabled ? 'Bật' : 'Tắt'}</p></Card>
          <Card><p className="text-sm text-slate-500">IP Whitelist</p><p className="text-xl font-bold">{dashboard.ipWhitelistCount}</p></Card>
          <Card><p className="text-sm text-slate-500">Webhook</p><p className="text-xl font-bold">{dashboard.webhookConfigured ? 'OK' : '—'}</p></Card>
          <Card><p className="text-sm text-slate-500">Rate limit</p><p className="text-xl font-bold">{dashboard.rateLimit}/phút</p></Card>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <p className="border-b border-slate-100 px-4 py-3 font-medium">Sự kiện bảo mật</p>
        {!events.length ? (
          <p className="p-6 text-center text-sm text-slate-500">Chưa có sự kiện.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">Tiêu đề</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(ev.at)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{ev.type}</td>
                  <td className="px-4 py-3">{ev.title}</td>
                  <td className="px-4 py-3">{ev.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </ApiPageShell>
  );
}
