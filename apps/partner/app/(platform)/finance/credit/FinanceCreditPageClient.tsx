'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/Card';
import { FinancePageShell } from '@/components/finance/FinanceSubNav';
import { EnterpriseModuleBanner } from '@/components/platform/EnterpriseModuleBanner';
import { financeApi } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { FinanceCreditInfo } from '@/types/platform';

export default function FinanceCreditPageClient() {
  const [credit, setCredit] = useState<FinanceCreditInfo | null>(null);

  useEffect(() => {
    void financeApi.getCredit().then(setCredit);
  }, []);

  return (
    <FinancePageShell title="Công nợ & Hạn mức" description="Thông tin hạn mức tín dụng — chỉ xem.">
      <EnterpriseModuleBanner />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Hạn mức tín dụng" value={formatVnd(credit?.creditLimit ?? '0')} />
        <StatCard label="Đã sử dụng" value={formatVnd(credit?.creditUsed ?? '0')} />
        <StatCard label="Còn lại" value={formatVnd(credit?.creditRemaining ?? '0')} />
        <StatCard label="Ngày cấp" value={credit?.issuedAt ? formatDateTime(credit.issuedAt) : '—'} />
        <StatCard label="Ngày hết hạn" value={credit?.expiresAt ? formatDateTime(credit.expiresAt) : '—'} />
        <StatCard label="Người phê duyệt" value={credit?.approvedBy ?? '—'} />
        <StatCard label="Trạng thái" value={credit?.status ?? 'ACTIVE'} />
      </div>
    </FinancePageShell>
  );
}
