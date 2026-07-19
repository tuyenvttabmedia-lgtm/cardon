'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { organizationApi, ApiClientError } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { AgentOrganizationOverview } from '@/types/platform';

export default function OrganizationPageClient() {
  const [org, setOrg] = useState<AgentOrganizationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void organizationApi.getOrganization().then(setOrg).catch((e) => {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được thông tin tổ chức');
    });
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!org) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <PlatformSection title="Tổ chức" description="Thông tin công ty đại lý và trạng thái hệ thống.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-slate-500">Tên công ty</p>
          <p className="mt-1 text-lg font-semibold">{org.companyName}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Mã đại lý</p>
          <p className="mt-1 font-mono text-lg">{org.agentCode}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Trạng thái</p>
          <p className="mt-1"><Badge tone="info">{org.status}</Badge></p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Chủ sở hữu</p>
          <p className="mt-1">{org.owner.name ?? org.owner.email}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Số thành viên</p>
          <p className="mt-1 text-lg font-semibold">{org.userCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Số dư ví</p>
          <p className="mt-1 text-lg font-semibold">{formatVnd(org.walletBalance)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">API Key</p>
          <p className="mt-1">{org.apiKeyConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">Webhook</p>
          <p className="mt-1">{org.webhookStatus === 'ACTIVE' ? 'Đang bật' : 'Chưa bật'}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-slate-500">KYC</p>
          <p className="mt-1">{org.kycStatus}</p>
        </Card>
      </div>
      <Card className="mt-4 text-sm text-slate-600">
        Ngày tạo: {formatDateTime(org.createdAt)}
      </Card>
    </PlatformSection>
  );
}
