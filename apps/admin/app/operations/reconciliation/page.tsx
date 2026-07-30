'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Card, ErrorMessage, StatCard } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import {
  mismatchDescription,
  mismatchTypeLabel,
  severityLabel,
} from '@/lib/operations-labels';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import {
  operationsApi,
  ApiClientError,
  type OperationsReconciliationList,
} from '@/services/api-client';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === 'CRITICAL'
      ? 'bg-red-100 text-red-800'
      : severity === 'HIGH'
        ? 'bg-orange-100 text-orange-800'
        : severity === 'MEDIUM'
          ? 'bg-yellow-100 text-yellow-800'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>
      {severityLabel(severity)}
    </span>
  );
}

export default function ReconciliationPage() {
  const [data, setData] = useState<OperationsReconciliationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const take = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await operationsApi.listReconciliation({
          skip,
          take,
          severity: severity || undefined,
          search: search || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [skip, severity, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Quét lệch dữ liệu giữa thanh toán → đơn → NCC → webhook (khoảng 7 ngày gần đây). Bấm mã đơn để mở
        chi tiết và xử lý. Đây không phải báo cáo kế toán.
      </p>
      {error && <ErrorMessage message={error} />}

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label={vi.operations.totalTransactions} value={String(summary.total)} />
          <StatCard label={vi.operations.reconciled} value={String(summary.reconciled)} />
          <StatCard label={vi.operations.unreconciled} value={String(summary.unreconciled)} />
          <StatCard label={vi.operations.discrepancy} value={String(summary.mismatch)} />
          <StatCard label={vi.operations.pending} value={String(summary.pending)} />
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{vi.operations.severity}</Label>
            <select
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={severity}
              onChange={(e) => {
                setSkip(0);
                setSeverity(e.target.value);
              }}
            >
              <option value="">{vi.app.all}</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {severityLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <Label className="text-xs">{vi.app.search}</Label>
            <Input
              className="mt-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={vi.operations.orderCode}
            />
          </div>
          <Button
            onClick={() => {
              setSkip(0);
              void load();
            }}
          >
            {vi.app.filter}
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <p className="p-6 text-center text-sm text-slate-500">{vi.operations.noItems}</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{vi.operations.severity}</th>
                <th className="px-4 py-3">{vi.operations.description}</th>
                <th className="px-4 py-3">{vi.operations.orderCode}</th>
                <th className="px-4 py-3">{vi.operations.paymentRef}</th>
                <th className="px-4 py-3">{vi.operations.detectedAt}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <SeverityBadge severity={row.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <p>{mismatchDescription(row.description, row.type)}</p>
                    <p className="text-xs text-slate-400">{mismatchTypeLabel(row.type)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {row.orderId ? (
                      <Link href={`/orders/${row.orderId}`} className="text-admin-700 hover:underline">
                        {row.orderCode ?? row.orderId.slice(0, 8)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.paymentReference ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(row.detectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {data && data.total > 0 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="secondary"
            disabled={skip === 0 || loading}
            onClick={() => setSkip(Math.max(0, skip - take))}
          >
            {vi.common.prev}
          </Button>
          <span className="self-center text-sm text-slate-500">
            {skip + 1}–{Math.min(skip + take, data.total)} / {data.total}
          </span>
          <Button
            variant="secondary"
            disabled={skip + take >= data.total || loading}
            onClick={() => setSkip(skip + take)}
          >
            {vi.common.next}
          </Button>
        </div>
      )}
    </div>
  );
}
