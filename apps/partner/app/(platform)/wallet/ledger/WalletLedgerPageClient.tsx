'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  LedgerDetailDrawer,
  LedgerFiltersBar,
  LedgerTable,
} from '@/components/wallet/LedgerCenter';
import { WalletPageShell } from '@/components/wallet/WalletSubNav';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { exportLedgerCsv, exportLedgerExcel, exportLedgerPdf } from '@/lib/wallet/constants';
import { walletApi } from '@/services/api-client';
import type { WalletLedgerEntry, WalletLedgerFilters } from '@/types/platform';

export default function WalletLedgerPageClient() {
  const { can } = useAgentPlatform();
  const canExport = can('wallet.export');
  const [filters, setFilters] = useState<WalletLedgerFilters>({ skip: 0, take: 25 });
  const [items, setItems] = useState<WalletLedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await walletApi.listLedger(filters);
      setItems(res.items);
      setTotal(res.total);
      void walletApi.audit('filter', { filters });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(entry: WalletLedgerEntry) {
    const detail = await walletApi.getLedgerDetail(entry.id);
    setSelected(detail);
    setDrawerOpen(true);
    void walletApi.audit('view_detail', { entryId: entry.id });
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const rows = items.map((e) => ({
      time: e.time,
      reference: e.referenceNo,
      orderId: e.orderId ?? '',
      type: e.type,
      description: e.description,
      amount: e.amount,
      balanceBefore: e.balanceBefore,
      balanceAfter: e.balanceAfter,
      operator: e.operator ?? '',
      status: e.status,
    }));
    if (format === 'csv') exportLedgerCsv(rows, 'wallet-ledger.csv');
    if (format === 'excel') exportLedgerExcel(rows, 'wallet-ledger.csv');
    if (format === 'pdf') exportLedgerPdf(rows, 'Wallet Ledger');
    void walletApi.audit(`export_${format}` as 'export_csv' | 'export_excel' | 'export_pdf', { count: rows.length });
  }

  const page = Math.floor((filters.skip ?? 0) / (filters.take ?? 25));

  return (
    <WalletPageShell title="Sổ quỹ" description="Nguồn dữ liệu duy nhất cho mọi biến động số dư.">
      <LedgerFiltersBar
        filters={filters}
        onChange={setFilters}
        onSearch={load}
        onExport={handleExport}
        canExport={canExport}
      />
      <LedgerTable items={items} loading={loading} onSelect={(e) => void openDetail(e)} />
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} entries · page {page + 1}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={(filters.skip ?? 0) <= 0}
            onClick={() => setFilters((f) => ({ ...f, skip: Math.max(0, (f.skip ?? 0) - (f.take ?? 25)) }))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={(filters.skip ?? 0) + (filters.take ?? 25) >= total}
            onClick={() => setFilters((f) => ({ ...f, skip: (f.skip ?? 0) + (f.take ?? 25) }))}
          >
            Next
          </Button>
        </div>
      </div>
      <LedgerDetailDrawer detail={selected} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </WalletPageShell>
  );
}
