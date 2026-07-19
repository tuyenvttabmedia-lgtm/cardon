'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, ErrorMessage, StatCard, statusTone } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { formatVnd } from '@/lib/utils';
import { financeApi, ApiClientError } from '@/services/api-client';
import type { Invoice, ProfitReport } from '@/types/api';
import { useFinanceDates } from '@/components/finance/FinanceDateContext';

export function FinanceDashboardPanel() {
  const { can } = useAuth();
  const { dateFrom, dateTo } = useFinanceDates();
  const [error, setError] = useState<string | null>(null);
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setProfit(await financeApi.getProfit(dateFrom, dateTo));
      financeApi.listInvoices().then(setInvoices).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.finance.profitError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <Card>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? vi.app.loading : vi.finance.calcProfit}
            </Button>
            {can('finance.manage') && profit && (
              <Button variant="secondary" onClick={() => void financeApi.exportProfitCsv(dateFrom, dateTo)}>
                {vi.app.exportCsv}
              </Button>
            )}
          </div>
          {profit && (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard label="Doanh thu hôm nay / kỳ" value={formatVnd(profit.revenue)} />
                <StatCard label="Giá vốn NCC" value={formatVnd(profit.providerCost)} />
                <StatCard label="Lợi nhuận thực" value={formatVnd(profit.grossProfit)} />
                <StatCard label="Số đơn thành công" value={String(profit.orderCount)} />
              </div>
              <dl className="mt-6 grid gap-3 border-t border-zinc-100 pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">{vi.finance.revenue}</dt>
                  <dd className="text-lg font-bold">{formatVnd(profit.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">{vi.finance.providerCost}</dt>
                  <dd>{formatVnd(profit.providerCost)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">{vi.finance.grossProfit}</dt>
                  <dd className="font-bold text-emerald-600">{formatVnd(profit.grossProfit)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">{vi.dashboard.orders}</dt>
                  <dd>{profit.orderCount}</dd>
                </div>
              </dl>
            </>
          )}
        </Card>
      {invoices.length > 0 && (
        <Card>
          <h2 className="font-semibold">{vi.finance.invoices}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-2 pr-4">{vi.finance.invoiceNumber}</th>
                  <th className="py-2 pr-4">{vi.finance.type}</th>
                  <th className="py-2 pr-4">{vi.finance.amount}</th>
                  <th className="py-2">{vi.finance.status}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-zinc-50">
                    <td className="py-3 pr-4 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="py-3 pr-4">{inv.type}</td>
                    <td className="py-3 pr-4">{formatVnd(inv.amount)}</td>
                    <td className="py-3">
                      <Badge tone={statusTone(inv.status)} status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
