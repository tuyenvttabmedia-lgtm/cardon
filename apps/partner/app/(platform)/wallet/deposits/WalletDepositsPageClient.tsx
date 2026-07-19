'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { WalletPageShell } from '@/components/wallet/WalletSubNav';
import { walletApi } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { WalletDepositRow } from '@/types/platform';

export default function WalletDepositsPageClient() {
  const [items, setItems] = useState<WalletDepositRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void walletApi
      .listDeposits({ take: 50 })
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <WalletPageShell title="Deposit History" description="Read-only deposit records from ledger top-ups.">
      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No deposit records yet.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Gateway</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Approved By</th>
                <th className="px-4 py-3">Completed</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{formatDateTime(row.time)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.reference}</td>
                  <td className="px-4 py-3">{formatVnd(row.amount)}</td>
                  <td className="px-4 py-3">{row.gateway}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">{row.approvedBy ?? '—'}</td>
                  <td className="px-4 py-3">{formatDateTime(row.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </WalletPageShell>
  );
}
