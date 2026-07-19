'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { agentPlatformApi } from '@/services/api-client';
import { formatDateTime } from '@/lib/utils';
import type { AgentPlatformWebhookCenter } from '@/types/platform';

export default function WebhooksPageClient() {
  const [data, setData] = useState<AgentPlatformWebhookCenter | null>(null);

  useEffect(() => {
    void agentPlatformApi.getWebhooks().then(setData).catch(() => setData(null));
  }, []);

  return (
    <ApiPageShell
      title="Webhook"
      description="Cấu hình URL callback, chính sách thử lại và nhật ký giao hàng."
    >
      <Card className="space-y-3">
        <p className="font-semibold text-slate-900">URL Webhook</p>
        <p className="font-mono text-sm text-slate-700">{data?.callbackUrl ?? 'Chưa cấu hình'}</p>
        <p className="text-sm text-slate-500">
          Trạng thái: {data?.enabled ? 'Đang bật' : 'Đang tắt'}
          {data?.updatedAt ? ` · Cập nhật ${formatDateTime(data.updatedAt)}` : ''}
        </p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="font-semibold text-slate-900">Chính sách thử lại</p>
          <p className="mt-2 text-sm text-slate-600">
            Chính sách hiện tại: {data?.retryPolicy ?? 'mặc định hệ thống'}
          </p>
        </Card>
        <Card>
          <p className="font-semibold text-slate-900">Nhật ký giao hàng</p>
          <p className="mt-2 text-sm text-slate-600">
            Lịch sử giao webhook sẽ có trong mốc quan sát tiếp theo.
          </p>
        </Card>
      </div>
    </ApiPageShell>
  );
}
