'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Label } from '@/components/ui/Input';
import { OrdersPageShell } from '@/components/orders/OrdersSubNav';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { exportLedgerCsv } from '@/lib/finance/constants';
import { orderOperationsApi } from '@/services/api-client';

const FORMATS = [
  { id: 'csv' as const, label: 'CSV' },
  { id: 'excel' as const, label: 'Excel' },
  { id: 'pdf' as const, label: 'PDF' },
  { id: 'json' as const, label: 'JSON' },
];

export default function OrdersExportPageClient() {
  const { can, role } = useAgentPlatform();
  const canExport = can('orders.export');
  const [format, setFormat] = useState<'csv' | 'excel' | 'pdf' | 'json'>('csv');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (!canExport) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await orderOperationsApi.export(format);
      if (res.mode === 'background' && res.jobId) {
        setStatus(`Đang xử lý ${res.rowCount ?? 0} dòng — job ${res.jobId.slice(0, 8)}…`);
        const poll = async () => {
          const job = await orderOperationsApi.getExportJob(res.jobId!);
          if (job.status === 'ready' && job.data) {
            exportLedgerCsv(job.data as Record<string, unknown>[], `don-hang-api.${format === 'json' ? 'json' : 'csv'}`);
            setStatus(`Xuất sẵn sàng — ${job.rowCount ?? 0} dòng`);
            return;
          }
          if (job.status === 'failed') {
            setStatus('Xuất thất bại');
            return;
          }
          setTimeout(poll, 1500);
        };
        setTimeout(poll, 1500);
      } else if (res.mode === 'immediate' && res.rows) {
        if (format === 'json') {
          const blob = new Blob([JSON.stringify(res.rows, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'don-hang-api.json';
          a.click();
          URL.revokeObjectURL(url);
        } else {
          exportLedgerCsv(res.rows as Record<string, unknown>[], `don-hang-api.${format === 'excel' ? 'xls' : format === 'pdf' ? 'pdf' : 'csv'}`);
        }
        setStatus(`Đã xuất ${res.rowCount ?? res.rows.length} dòng`);
      }
      void orderOperationsApi.audit('export', { format, page: 'export' });
    } catch {
      setStatus('Không thể xuất dữ liệu');
    } finally {
      setBusy(false);
    }
  }

  if (!canExport) {
    return (
      <OrdersPageShell title="Xuất dữ liệu" description="Vai trò chỉ xem (Readonly) không được phép xuất.">
        <Card className="p-6 text-sm text-slate-600">Bạn không có quyền xuất dữ liệu đơn hàng.</Card>
      </OrdersPageShell>
    );
  }

  return (
    <OrdersPageShell
      title="Xuất dữ liệu"
      description="CSV, Excel, PDF, JSON — export lớn chạy nền và thông báo khi sẵn sàng."
    >
      <Card className="max-w-lg space-y-4">
        <div>
          <Label>Định dạng</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  format === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">Vai trò hiện tại: {role}. Export lớn (&gt;5000 dòng) chạy background job.</p>
        <Button onClick={handleExport} disabled={busy}>
          {busy ? 'Đang xuất…' : 'Bắt đầu xuất'}
        </Button>
        {status && <p className="text-sm text-slate-600">{status}</p>}
      </Card>
    </OrdersPageShell>
  );
}
