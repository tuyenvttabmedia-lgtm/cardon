'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime, formatVnd } from '@/lib/utils';
import { operationsApi, ApiClientError } from '@/services/api-client';
import type { Invoice } from '@/types/api';

export default function OperationsInvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const take = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await operationsApi.listInvoices(skip, take));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [skip]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Nền tảng tra cứu hóa đơn — không bao gồm logic kế toán. Dùng Finance để quản lý chi tiết.
      </p>

      {error && <ErrorMessage message={error} />}

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-zinc-100" />
            ))}
          </div>
        ) : !items.length ? (
          <p className="p-6 text-center text-sm text-zinc-500">{vi.operations.noItems}</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">{vi.operations.invoiceNumber}</th>
                <th className="px-4 py-3">{vi.operations.invoiceStatus}</th>
                <th className="px-4 py-3">{vi.operations.amount}</th>
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">{vi.operations.detectedAt}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr key={inv.id} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        inv.status === 'ISSUED'
                          ? 'bg-green-100 text-green-800'
                          : inv.status === 'VOID'
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-yellow-100 text-yellow-800',
                      )}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatVnd(inv.amount)}</td>
                  <td className="px-4 py-3 text-zinc-500">{inv.type ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDateTime(inv.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="flex justify-center gap-2">
        <Button variant="secondary" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - take))}>
          Trước
        </Button>
        <Button variant="secondary" onClick={() => setSkip(skip + take)}>
          Sau
        </Button>
        <Button variant="secondary" onClick={() => void load()}>
          {vi.app.refresh}
        </Button>
      </div>
    </div>
  );
}
