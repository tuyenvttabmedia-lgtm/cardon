'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { agentPlatformApi } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { AgentPlatformInvoice } from '@/types/platform';

export default function InvoicesPageClient() {
  const [invoices, setInvoices] = useState<AgentPlatformInvoice[]>([]);

  useEffect(() => {
    void agentPlatformApi.listInvoices().then(setInvoices).catch(() => setInvoices([]));
  }, []);

  return (
    <PlatformSection
      title="Hóa đơn"
      description="Hóa đơn VAT, lịch sử, yêu cầu xuất PDF và sao kê đại lý."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {['Hóa đơn VAT', 'Lịch sử', 'Yêu cầu xuất'].map((label) => (
          <Card key={label} className="text-center">
            <p className="font-medium text-slate-900">{label}</p>
            <p className="mt-1 text-xs text-slate-500">Sắp phát triển</p>
          </Card>
        ))}
      </div>
      <Card>
        <p className="mb-4 font-semibold text-slate-900">Danh sách hóa đơn</p>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có hóa đơn.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2 pr-4">Số HĐ</th>
                  <th className="py-2 pr-4">Loại</th>
                  <th className="py-2 pr-4">Số tiền</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2">Ngày xuất</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="py-3 pr-4">{inv.type}</td>
                    <td className="py-3 pr-4">{formatVnd(inv.totalAmount)}</td>
                    <td className="py-3 pr-4">{inv.status}</td>
                    <td className="py-3">{inv.issuedAt ? formatDateTime(inv.issuedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PlatformSection>
  );
}
