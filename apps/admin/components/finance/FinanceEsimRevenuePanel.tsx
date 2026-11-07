'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFinanceDates } from '@/components/finance/FinanceDateContext';
import { formatEsimMoney } from '@/components/esim-ops/esim-ops-ui';
import { Card, ErrorMessage, StatCard } from '@/components/ui/Display';
import { Button, Select } from '@/components/ui/Form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { financeApi, ApiClientError } from '@/services/api-client';
import type { EsimFinanceRevenueReport } from '@/types/api';

function pickCurrency(
  rows: Array<{ currency: string; amount: string; payments: number }>,
  currency: string,
) {
  return rows.find((row) => row.currency.toUpperCase() === currency) ?? null;
}

export function FinanceEsimRevenuePanel() {
  const { dateFrom, dateTo } = useFinanceDates();
  const [currency, setCurrency] = useState('');
  const [gateway, setGateway] = useState('');
  const [market, setMarket] = useState('');
  const [data, setData] = useState<EsimFinanceRevenueReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(
    () => ({
      dateFrom,
      dateTo,
      currency: (currency || undefined) as 'VND' | 'USD' | undefined,
      gateway: (gateway || undefined) as 'SEPAY' | 'PAYPAL' | undefined,
      market: (market || undefined) as 'VN' | 'INTL' | undefined,
    }),
    [dateFrom, dateTo, currency, gateway, market],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const report = await financeApi.getEsimRevenue(query);
      setData(report);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Không tải được doanh thu eSIM');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [query]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const csv = await financeApi.exportEsimRevenue(query);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `esim-finance-revenue-${dateFrom}_${dateTo}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Xuất CSV thất bại');
    } finally {
      setExporting(false);
    }
  }

  const commerceVnd = pickCurrency(data?.commerce.byCurrency ?? [], 'VND');
  const commerceUsd = pickCurrency(data?.commerce.byCurrency ?? [], 'USD');
  const dayRows = [...(data?.commerce.byDay ?? [])].sort((a, b) =>
    a.date === b.date
      ? a.currency.localeCompare(b.currency) || a.gateway.localeCompare(b.gateway)
      : b.date.localeCompare(a.date),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Currency</span>
          <Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="">Mọi currency</option>
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Cổng</span>
          <Select value={gateway} onChange={(event) => setGateway(event.target.value)}>
            <option value="">Mọi cổng</option>
            <option value="SEPAY">SePay</option>
            <option value="PAYPAL">PayPal</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Thị trường</span>
          <Select value={market} onChange={(event) => setMarket(event.target.value)}>
            <option value="">Mọi thị trường</option>
            <option value="VN">VN</option>
            <option value="INTL">INTL</option>
          </Select>
        </label>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Đang tải…' : 'Tải lại'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void exportCsv()} disabled={exporting || loading}>
          {exporting ? 'Đang xuất…' : 'Xuất CSV'}
        </Button>
        <Link href="/esim-ops" className="text-sm font-medium text-admin-700 hover:underline">
          Mở Ops eSIM
        </Link>
      </div>

      {error ? <ErrorMessage message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Doanh thu VND (thương mại)"
          value={commerceVnd ? formatEsimMoney(commerceVnd.amount, 'VND') : '₫0'}
        />
        <StatCard
          label="Doanh thu USD (thương mại)"
          value={commerceUsd ? formatEsimMoney(commerceUsd.amount, 'USD') : '$0.00'}
        />
        <StatCard
          label="Payment SUCCESS thương mại"
          value={String(data?.commerce.paymentCount ?? 0)}
        />
        <StatCard
          label="Sandbox / admin-test (tách)"
          value={String(data?.sandbox.paymentCount ?? 0)}
        />
      </div>

      <Card className="space-y-2 border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
        <p className="font-semibold">Phí cổng</p>
        <p>
          Phí ước tính (`paymentFeeAmount`):{' '}
          {(data?.commerce.estimatedFeeByCurrency ?? []).length === 0
            ? '—'
            : data!.commerce.estimatedFeeByCurrency
                .map((row) => `${row.currency} ${formatEsimMoney(row.amount, row.currency)}`)
                .join(' · ')}
        </p>
        <p>
          Phí gateway thực: <strong>{data?.gatewayActualFees.status ?? 'UNAVAILABLE'}</strong>
          {' — '}
          {data?.gatewayActualFees.note ?? 'Chưa có dữ liệu trong F1.'}
        </p>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          Theo cổng (thương mại)
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Currency</TH>
              <TH>Gateway</TH>
              <TH align="right">Payments</TH>
              <TH align="right">Tổng</TH>
            </TR>
          </THead>
          <TBody>
            {(data?.commerce.byGateway ?? []).length === 0 ? (
              <TR>
                <TD colSpan={4}>Chưa có payment SUCCESS thương mại trong khoảng.</TD>
              </TR>
            ) : (
              data!.commerce.byGateway.map((row) => (
                <TR key={`${row.currency}-${row.gateway}`}>
                  <TD>{row.currency}</TD>
                  <TD>{row.gateway}</TD>
                  <TD align="right">{row.payments}</TD>
                  <TD align="right">{formatEsimMoney(row.amount, row.currency)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          Theo ngày (paidAt · thương mại)
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Ngày</TH>
              <TH>Currency</TH>
              <TH>Gateway</TH>
              <TH align="right">Payments</TH>
              <TH align="right">Tổng</TH>
            </TR>
          </THead>
          <TBody>
            {dayRows.length === 0 ? (
              <TR>
                <TD colSpan={5}>Chưa có dòng theo ngày.</TD>
              </TR>
            ) : (
              dayRows.map((row) => (
                <TR key={`${row.date}-${row.currency}-${row.gateway}`}>
                  <TD>{row.date}</TD>
                  <TD>{row.currency}</TD>
                  <TD>{row.gateway}</TD>
                  <TD align="right">{row.payments}</TD>
                  <TD align="right">{formatEsimMoney(row.amount, row.currency)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {(data?.sandbox.byCurrency.length ?? 0) > 0 ? (
        <Card className="space-y-2 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Sandbox / admin-test — không cộng thương mại</p>
          <ul className="list-disc pl-5">
            {data!.sandbox.byCurrency.map((row) => (
              <li key={row.currency}>
                {row.currency} {formatEsimMoney(row.amount, row.currency)} · {row.payments} payment
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data ? (
        <Card className="space-y-1 p-4 text-xs text-slate-500">
          <p>{data.definitions.revenue}</p>
          <p>{data.definitions.estimatedFee}</p>
          <p>{data.definitions.gatewayActualFee}</p>
          <p>{data.definitions.noFx}</p>
          <p>
            Khoảng API: {data.range.from} → {data.range.to} ({data.range.preset})
          </p>
        </Card>
      ) : null}
    </div>
  );
}
