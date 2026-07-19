'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Card, ErrorMessage, StatCard } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import {
  operationsApi,
  ApiClientError,
  type OperationsDashboard,
  type OperationsSearchResult,
} from '@/services/api-client';

const HUB_CARDS = [
  {
    href: '/operations/reconciliation',
    icon: '⚖️',
    title: vi.operations.hubReconciliation,
    description: vi.operations.hubReconciliationDesc,
  },
  {
    href: '/operations/exceptions',
    icon: '⚠️',
    title: vi.operations.hubExceptions,
    description: vi.operations.hubExceptionsDesc,
  },
  {
    href: '/operations/manual',
    icon: '🔧',
    title: vi.operations.hubManual,
    description: vi.operations.hubManualDesc,
  },
  {
    href: '/operations/invoices',
    icon: '🧾',
    title: vi.operations.hubInvoices,
    description: vi.operations.hubInvoicesDesc,
  },
];

function formatDuration(ms: number) {
  if (!ms) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} phút`;
  return `${Math.round(mins / 60)} giờ`;
}

export default function OperationsHubPage() {
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchResult, setSearchResult] = useState<OperationsSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await operationsApi.getDashboard());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      setSearchResult(await operationsApi.search(searchQ.trim()));
    } catch {
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  }

  const cards = dashboard?.cards;

  return (
    <div className="space-y-6">
      {error && <ErrorMessage message={error} />}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      ) : cards ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={vi.operations.transactionsToday} value={String(cards.transactionsToday)} />
            <StatCard label={vi.operations.exceptionsOpen} value={String(cards.exceptions)} />
            <StatCard label={vi.operations.needManualReview} value={String(cards.needManualReview)} />
            <StatCard label={vi.operations.webhookPending} value={String(cards.webhookPending)} />
            <StatCard label={vi.operations.providerTimeout} value={String(cards.providerTimeout)} />
            <StatCard label={vi.operations.mismatch} value={String(cards.mismatch)} />
            <StatCard label={vi.operations.invoicesPending} value={String(cards.invoicesPending)} />
            <StatCard label={vi.operations.avgResolution} value={formatDuration(cards.avgResolutionMs)} />
          </div>
          {dashboard.asOf && (
            <p className="text-xs text-zinc-400">Cập nhật: {formatDateTime(dashboard.asOf)}</p>
          )}
        </>
      ) : null}

      <Card className="p-4">
        <p className="text-sm font-medium text-zinc-700">{vi.app.search}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            className="min-w-[240px] flex-1"
            placeholder={vi.operations.searchPlaceholder}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
          />
          <Button onClick={() => void runSearch()} disabled={searching}>
            {searching ? vi.app.loading : vi.app.search}
          </Button>
          <Button variant="secondary" onClick={() => void load()}>
            {vi.app.refresh}
          </Button>
        </div>
        {searchResult && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              { key: 'orders', label: 'Đơn hàng', items: searchResult.orders, href: (id: string) => `/orders/${id}` },
              { key: 'payments', label: 'Thanh toán', items: searchResult.payments, href: () => '/payments' },
              { key: 'invoices', label: vi.operations.navInvoices, items: searchResult.invoices, href: () => '/operations/invoices' },
              { key: 'agents', label: 'Đại lý', items: searchResult.agents, href: (id: string) => `/agents/${id}?tab=overview` },
            ].map((group) =>
              group.items.length > 0 ? (
                <div key={group.key}>
                  <p className="text-xs font-semibold uppercase text-zinc-500">{group.label}</p>
                  <ul className="mt-1 space-y-1">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={group.href(item.id)}
                          className="text-sm text-admin-700 hover:underline"
                        >
                          {item.label}
                        </Link>
                        {'status' in item && (
                          <span className="ml-2 text-xs text-zinc-400">{item.status}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {HUB_CARDS.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="h-full transition hover:border-admin-200 hover:shadow-sm">
              <div className="text-2xl">{card.icon}</div>
              <h2 className="mt-2 text-lg font-semibold">{card.title}</h2>
              <p className="mt-1 text-sm text-zinc-500">{card.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
