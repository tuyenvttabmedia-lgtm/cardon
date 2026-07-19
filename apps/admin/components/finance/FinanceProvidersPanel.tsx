'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { formatVnd } from '@/lib/utils';
import { adminApi, financeApi, ApiClientError } from '@/services/api-client';
import type {
  ProviderFinanceDashboard,
  ProviderReconciliationReport,
  ProviderStatus,
  ProviderTransactionSearchItem,
} from '@/types/api';
import { useFinanceDates } from '@/components/finance/FinanceDateContext';

type ProvidersTab = 'reconciliation' | 'transactions' | 'costHistory';

const TABS: { id: ProvidersTab; label: string }[] = [
  { id: 'reconciliation', label: 'Đối soát NCC' },
  { id: 'transactions', label: 'Giao dịch NCC' },
  { id: 'costHistory', label: 'Biến động giá vốn' },
];

export function FinanceProvidersPanel() {
  const { can } = useAuth();
  const { dateFrom, dateTo } = useFinanceDates();
  const [tab, setTab] = useState<ProvidersTab>('reconciliation');
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providerFilter, setProviderFilter] = useState('');
  const [txnStatusFilter, setTxnStatusFilter] = useState('');
  const [orderIdFilter, setOrderIdFilter] = useState('');
  const [providerTxnIdFilter, setProviderTxnIdFilter] = useState('');
  const [providerDashboard, setProviderDashboard] = useState<ProviderFinanceDashboard | null>(null);
  const [providerRecon, setProviderRecon] = useState<ProviderReconciliationReport[]>([]);
  const [providerTxns, setProviderTxns] = useState<ProviderTransactionSearchItem[]>([]);
  const [providerTxTotal, setProviderTxTotal] = useState(0);

  useEffect(() => {
    adminApi.getProvidersStatus().then(setProviders).catch(() => undefined);
  }, []);

  async function load() {
    setError(null);
    try {
      const [dashboard, recon, txns] = await Promise.all([
        financeApi.getProviderFinanceDashboard(dateFrom, dateTo, providerFilter || undefined),
        financeApi.listProviderReconciliation({
          dateFrom,
          dateTo,
          providerId: providerFilter || undefined,
        }),
        financeApi.searchProviderTransactions({
          dateFrom,
          dateTo,
          providerId: providerFilter || undefined,
          status: txnStatusFilter || undefined,
          orderId: orderIdFilter || undefined,
          providerTransactionId: providerTxnIdFilter || undefined,
          take: 50,
        }),
      ]);
      setProviderDashboard(dashboard);
      setProviderRecon(recon);
      setProviderTxns(txns.items);
      setProviderTxTotal(txns.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.finance.profitError);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {error && <ErrorMessage message={error} />}
      {(tab === 'reconciliation' || tab === 'transactions') && (
        <Card>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Nhà cung cấp</Label>
              <select
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
              >
                <option value="">Tất cả</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
            {tab === 'transactions' && (
              <>
                <div>
                  <Label>Trạng thái</Label>
                  <Input
                    className="mt-1"
                    placeholder="SUCCESS / FAILED / TIMEOUT"
                    value={txnStatusFilter}
                    onChange={(e) => setTxnStatusFilter(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Mã đơn hàng</Label>
                  <Input
                    className="mt-1 font-mono text-xs"
                    value={orderIdFilter}
                    onChange={(e) => setOrderIdFilter(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Mã GD NCC</Label>
                  <Input
                    className="mt-1 font-mono text-xs"
                    value={providerTxnIdFilter}
                    onChange={(e) => setProviderTxnIdFilter(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void load()}>{vi.app.load}</Button>
            {can('finance.manage') && tab === 'transactions' && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void financeApi.exportProviderTransactionsCsv({
                      dateFrom,
                      dateTo,
                      providerId: providerFilter || undefined,
                      status: txnStatusFilter || undefined,
                      orderId: orderIdFilter || undefined,
                      providerTransactionId: providerTxnIdFilter || undefined,
                    })
                  }
                >
                  {vi.app.exportCsv}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void financeApi
                      .runProviderReconciliation(providerFilter || undefined, dateFrom)
                      .then(() => load())
                  }
                >
                  Chạy đối soát
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {tab === 'reconciliation' && providerDashboard && (
        <Card>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <dt className="text-zinc-500">Doanh thu kỳ</dt>
              <dd className="text-xl font-bold">{formatVnd(providerDashboard.today.revenue)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Chi phí NCC</dt>
              <dd>{formatVnd(providerDashboard.today.providerCost)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Phí thanh toán</dt>
              <dd>{formatVnd(providerDashboard.today.gatewayFee)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Lợi nhuận gộp</dt>
              <dd className="font-bold text-emerald-600">{formatVnd(providerDashboard.today.grossProfit)}</dd>
            </div>
          </dl>
        </Card>
      )}

      {tab === 'reconciliation' && (
        <Card>
          <h2 className="font-semibold">Đối soát số dư nhà cung cấp</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-2 pr-4">Nhà cung cấp</th>
                  <th className="py-2 pr-4">Số dư đầu kỳ</th>
                  <th className="py-2 pr-4">Chi phí sử dụng</th>
                  <th className="py-2 pr-4">Số dư cuối kỳ</th>
                  <th className="py-2 pr-4">Chênh lệch</th>
                  <th className="py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {providerRecon.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-50">
                    <td className="py-3 pr-4">{r.provider?.name ?? r.provider?.code ?? r.providerId.slice(0, 8)}</td>
                    <td className="py-3 pr-4">{formatVnd(r.openingBalance)}</td>
                    <td className="py-3 pr-4">{formatVnd(r.expectedBalance)}</td>
                    <td className="py-3 pr-4">{r.closingBalance ? formatVnd(r.closingBalance) : '—'}</td>
                    <td className="py-3 pr-4">{formatVnd(r.differenceAmount)}</td>
                    <td className="py-3">
                      <Badge tone={statusTone(r.status)} status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'transactions' && (
        <Card>
          <h2 className="font-semibold">Giao dịch NCC ({providerTxTotal})</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-2 pr-4">Mã đơn</th>
                  <th className="py-2 pr-4">NCC</th>
                  <th className="py-2 pr-4">Khách trả</th>
                  <th className="py-2 pr-4">Chi phí</th>
                  <th className="py-2 pr-4">Lợi nhuận</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2">Phản hồi</th>
                </tr>
              </thead>
              <tbody>
                {providerTxns.map((tx) => (
                  <tr key={tx.id} className="border-b border-zinc-50 align-top">
                    <td className="py-3 pr-4 font-mono text-xs">{tx.orderCode}</td>
                    <td className="py-3 pr-4">{tx.providerCode}</td>
                    <td className="py-3 pr-4">{formatVnd(tx.customerPaid)}</td>
                    <td className="py-3 pr-4">{tx.providerCost ? formatVnd(tx.providerCost) : '—'}</td>
                    <td className="py-3 pr-4">{tx.profit ? formatVnd(tx.profit) : '—'}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={statusTone(tx.status)} status={tx.status} />
                    </td>
                    <td className="py-3 max-w-xs truncate text-xs text-zinc-500">
                      {tx.errorMessage ??
                        (typeof tx.responsePayload === 'string'
                          ? tx.responsePayload
                          : JSON.stringify(tx.responsePayload))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'costHistory' && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Biến động giá vốn</h2>
          <p className="text-sm text-zinc-600">
            Lịch sử thay đổi giá vốn được ghi khi đồng bộ sản phẩm từ nhà cung cấp. API báo cáo chi tiết sẽ bổ sung
            trong Phase tiếp theo — hiện xem giá mapping tại{' '}
            <Link href="/products" className="text-admin-600 hover:underline">
              Sản phẩm → Mapping NCC
            </Link>
            .
          </p>
          <div className="overflow-x-auto rounded-lg border border-zinc-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50 text-left text-zinc-500">
                  <th className="py-2 px-4">Sản phẩm</th>
                  <th className="py-2 px-4">Giá vốn cũ</th>
                  <th className="py-2 px-4">Giá vốn mới</th>
                  <th className="py-2 px-4">Ngày thay đổi</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4} className="py-8 text-center text-zinc-400">
                    Chưa có dữ liệu — đồng bộ sản phẩm NCC để ghi nhận biến động giá vốn.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
