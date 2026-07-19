'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import {
  operationsApi,
  ApiClientError,
  type OperationsExceptionItem,
  type OperationsExceptionList,
} from '@/services/api-client';

const STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED'] as const;

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'OPEN'
      ? 'bg-red-100 text-red-800'
      : status === 'INVESTIGATING'
        ? 'bg-yellow-100 text-yellow-800'
        : status === 'RESOLVED'
          ? 'bg-green-100 text-green-800'
          : 'bg-zinc-100 text-zinc-600';
  const label =
    status === 'OPEN'
      ? vi.operations.statusOpen
      : status === 'INVESTIGATING'
        ? vi.operations.statusInvestigating
        : status === 'RESOLVED'
          ? vi.operations.statusResolved
          : vi.operations.statusIgnored;
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{label}</span>;
}

export default function ExceptionsPage() {
  const { can } = useAuth();
  const canManage = can('reconciliation.manage') || can('finance.manage');
  const [data, setData] = useState<OperationsExceptionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<OperationsExceptionItem | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await operationsApi.listExceptions({ take: 50, status: statusFilter || undefined }));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(status: string) {
    if (!selected || !canManage) return;
    setSaving(true);
    try {
      const updated = await operationsApi.updateException(selected.id, { status, note: note || undefined });
      setSelected({ ...selected, ...updated });
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{vi.operations.status}</Label>
            <select
              className="mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{vi.app.all}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
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
                <div key={i} className="h-12 animate-pulse rounded bg-zinc-100" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <p className="p-6 text-center text-sm text-zinc-500">{vi.operations.noItems}</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
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
                      'cursor-pointer border-b border-zinc-50 hover:bg-zinc-50/50',
                      selected?.id === row.id && 'bg-admin-50',
                    )}
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <p>{row.description}</p>
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
                    <td className="px-4 py-3 text-xs text-zinc-500">
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
            <p className="text-sm text-zinc-500">Chọn một ngoại lệ để xem chi tiết.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <StatusBadge status={selected.status} />
                <p className="mt-2 font-medium">{selected.description}</p>
                <p className="text-xs text-zinc-400">{selected.type}</p>
              </div>
              <p className="text-xs text-zinc-500">
                {vi.operations.detectedAt}: {formatDateTime(selected.detectedAt)}
              </p>
              {selected.notes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500">{vi.operations.note}</p>
                  <ul className="mt-1 max-h-40 space-y-2 overflow-y-auto text-xs">
                    {selected.notes.map((n, i) => (
                      <li key={i} className="rounded bg-zinc-50 p-2">
                        <span className="text-zinc-400">{formatDateTime(n.at)} — {n.by}</span>
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
                    <Button size="sm" disabled={saving} onClick={() => void updateStatus('INVESTIGATING')}>
                      {vi.operations.statusInvestigating}
                    </Button>
                    <Button size="sm" disabled={saving} onClick={() => void updateStatus('RESOLVED')}>
                      {vi.operations.resolve}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={saving} onClick={() => void updateStatus('IGNORED')}>
                      {vi.operations.ignore}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
