'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import {
  exceptionStatusLabel,
  mismatchDescription,
  mismatchTypeLabel,
} from '@/lib/operations-labels';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import {
  operationsApi,
  ApiClientError,
  type OperationsExceptionItem,
  type OperationsExceptionList,
} from '@/services/api-client';

const STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED'] as const;
const PAGE_SIZE = 25;

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'OPEN'
      ? 'bg-red-100 text-red-800'
      : status === 'INVESTIGATING'
        ? 'bg-yellow-100 text-yellow-800'
        : status === 'RESOLVED'
          ? 'bg-green-100 text-green-800'
          : 'bg-slate-100 text-slate-600';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>
      {exceptionStatusLabel(status)}
    </span>
  );
}

export default function ExceptionsPage() {
  const { can } = useAuth();
  const canManage = can('reconciliation.manage') || can('finance.manage');
  const [data, setData] = useState<OperationsExceptionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<OperationsExceptionItem | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await operationsApi.listExceptions({
          skip,
          take: PAGE_SIZE,
          status: statusFilter || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, skip]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(status: string) {
    if (!selected || !canManage) return;
    setSaving(true);
    try {
      const updated = await operationsApi.updateException(selected.id, {
        status,
        note: note || undefined,
      });
      setSelected({ ...selected, ...updated });
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Danh sách sự cố vận hành cần xử lý. Chọn một dòng để xem chi tiết, ghi chú và cập nhật trạng thái
        (Mới → Đang xử lý → Đã xử lý / Bỏ qua).
      </p>
      {error && <ErrorMessage message={error} />}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{vi.operations.status}</Label>
            <select
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setSkip(0);
                setStatusFilter(e.target.value);
              }}
            >
              <option value="">{vi.app.all}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {exceptionStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={() => void load()}>
            {vi.app.refresh}
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-x-auto p-0 lg:col-span-2">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <p className="p-6 text-center text-sm text-slate-500">{vi.operations.noItems}</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{vi.operations.status}</th>
                  <th className="px-4 py-3">{vi.operations.description}</th>
                  <th className="px-4 py-3">{vi.operations.assignedTo}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'cursor-pointer border-b border-slate-50 hover:bg-slate-50/50',
                      selected?.id === row.id && 'bg-admin-50',
                    )}
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <p>{mismatchDescription(row.description, row.type)}</p>
                      <p className="text-xs text-slate-400">{mismatchTypeLabel(row.type)}</p>
                      {row.orderId && (
                        <Link
                          href={`/orders/${row.orderId}`}
                          className="text-xs text-admin-700 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.orderCode}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {row.assignedEmail ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-4">
          {!selected ? (
            <p className="text-sm text-slate-500">Chọn một ngoại lệ để xem chi tiết.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <StatusBadge status={selected.status} />
                <p className="mt-2 font-medium">
                  {mismatchDescription(selected.description, selected.type)}
                </p>
                <p className="text-xs text-slate-500">
                  {vi.operations.typeLabel}: {mismatchTypeLabel(selected.type)}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                {vi.operations.detectedAt}: {formatDateTime(selected.detectedAt)}
              </p>
              {selected.notes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500">{vi.operations.note}</p>
                  <ul className="mt-1 max-h-40 space-y-2 overflow-y-auto text-xs">
                    {selected.notes.map((n, i) => (
                      <li key={i} className="rounded bg-slate-50 p-2">
                        <span className="text-slate-400">
                          {formatDateTime(n.at)} — {n.by}
                        </span>
                        <p>{n.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {canManage && (
                <>
                  <div>
                    <Label className="text-xs">{vi.operations.note}</Label>
                    <Input
                      className="mt-1"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Ghi chú xử lý…"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() => void updateStatus('INVESTIGATING')}
                    >
                      {exceptionStatusLabel('INVESTIGATING')}
                    </Button>
                    <Button size="sm" disabled={saving} onClick={() => void updateStatus('RESOLVED')}>
                      {vi.operations.resolve}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void updateStatus('IGNORED')}
                    >
                      {vi.operations.ignore}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {data && total > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="secondary"
            disabled={skip === 0 || loading}
            onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
          >
            {vi.common.prev}
          </Button>
          <span className="self-center text-sm text-slate-500">
            {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} / {total}
          </span>
          <Button
            variant="secondary"
            disabled={skip + PAGE_SIZE >= total || loading}
            onClick={() => setSkip(skip + PAGE_SIZE)}
          >
            {vi.common.next}
          </Button>
        </div>
      )}
    </div>
  );
}
