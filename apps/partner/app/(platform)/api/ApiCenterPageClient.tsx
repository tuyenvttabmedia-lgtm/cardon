'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import ApiKeysPanel from '@/components/platform/panels/ApiKeysPanel';
import { agentPlatformApi } from '@/services/api-client';
import { formatDateTime } from '@/lib/utils';
import type { AgentPlatformApiCenter } from '@/types/platform';

export default function ApiCenterPageClient() {
  const [api, setApi] = useState<AgentPlatformApiCenter | null>(null);

  useEffect(() => {
    void agentPlatformApi.getApiCenter().then(setApi).catch(() => setApi(null));
  }, []);

  return (
    <ApiPageShell
      title="Khóa API"
      description="Quản lý khóa API, giới hạn tốc độ, IP whitelist và trạng thái tích hợp."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Giới hạn tốc độ</p>
          <p className="mt-1 text-2xl font-bold">{api?.rateLimit ?? '—'} req/phút</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Gọi API hôm nay</p>
          <p className="mt-1 text-2xl font-bold">{api?.usageToday ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Tỷ lệ thành công</p>
          <p className="mt-1 text-2xl font-bold">{api?.statistics.successRate ?? 100}%</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">Khóa API</p>
            <p className="text-sm text-slate-600">Xoay khóa sau khi KYC được duyệt</p>
          </div>
          <Badge tone={api?.apiEnabled ? 'success' : 'warning'}>{api?.status ?? 'INACTIVE'}</Badge>
        </div>
        {api?.lastUsedAt && (
          <p className="text-xs text-slate-500">Lần cuối sử dụng: {formatDateTime(api.lastUsedAt)}</p>
        )}
        <ApiKeysPanel embedded />
      </Card>

      <Card>
        <p className="font-semibold text-slate-900">IP Whitelist</p>
        <p className="mt-2 text-sm text-slate-500">Cấu hình danh sách IP cho phép — sắp ra mắt.</p>
      </Card>

      <Card>
        <p className="font-semibold text-slate-900">Sandbox & SDK</p>
        <p className="mt-2 text-sm text-slate-500">Môi trường thử nghiệm và tải SDK — sắp ra mắt.</p>
      </Card>
    </ApiPageShell>
  );
}
