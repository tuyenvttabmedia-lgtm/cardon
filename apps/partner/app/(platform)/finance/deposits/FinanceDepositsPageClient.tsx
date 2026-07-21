'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Input';
import { DepositCountdown, DepositStatusBadge, DepositTimeline } from '@/components/finance/DepositTimeline';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { exportLedgerCsv, exportLedgerExcel, exportLedgerPdf } from '@/lib/finance/constants';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { financeApi } from '@/services/api-client';
import type { FinanceDepositDetail, FinanceDepositGateway, FinanceDepositRow } from '@/types/platform';
import { WalletPageShell } from '@/components/wallet/WalletSubNav';

const TERMINAL = new Set(['CREDITED', 'EXPIRED', 'FAILED', 'CANCELLED']);
const POLL_MS = 30_000;

function newIdempotencyKey() {
  return crypto.randomUUID();
}

function DepositSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="h-4 w-1/3 rounded bg-slate-200" />
      <div className="h-32 rounded bg-slate-100" />
    </div>
  );
}

export default function FinanceDepositsPageClient() {
  const { role, can } = useAgentPlatform();
  const canCreate = role !== 'READONLY';
  const canExport = can('finance.export');

  const [items, setItems] = useState<FinanceDepositRow[]>([]);
  const [gateways, setGateways] = useState<FinanceDepositGateway[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState('');
  const [gateway, setGateway] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [active, setActive] = useState<FinanceDepositDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  const take = 25;
  const parsedAmount = parseInt(amount.replace(/\D/g, ''), 10) || 0;
  const fee = 0;
  const net = Math.max(0, parsedAmount - fee);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await financeApi.listDeposits({ skip, take });
      setItems(res.items);
      setTotal(res.total);
      if (res.gateways?.length) {
        setGateways(res.gateways);
        if (!gateway) setGateway(res.gateways[0].code);
      }
      void financeApi.audit('filter', { page: 'deposits', skip });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, [skip]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!active || TERMINAL.has(active.status)) return;
    const id = setInterval(() => {
      void financeApi.refreshDeposit(active.id).then(setActive).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active?.id, active?.status]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const detail = await financeApi.createDeposit(parsedAmount, gateway || undefined, newIdempotencyKey());
      setActive(detail);
      void loadList();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Không thể tạo yêu cầu nạp tiền');
    } finally {
      setCreating(false);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const detail = await financeApi.getDeposit(id);
      setActive(detail);
      void financeApi.audit('view_detail', { depositId: id });
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRefresh() {
    if (!active) return;
    setRefreshing(true);
    try {
      const detail = await financeApi.refreshDeposit(active.id);
      setActive(detail);
      void loadList();
    } finally {
      setRefreshing(false);
    }
  }

  function copyTransfer() {
    if (!active?.transferContent) return;
    void navigator.clipboard.writeText(active.transferContent);
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const rows = items.map((r) => ({
      ma: r.reference,
      gateway: r.gateway,
      soTien: r.amount,
      phi: r.feeAmount ?? '0',
      thucNhan: r.netAmount ?? r.amount,
      trangThai: r.statusLabel ?? r.status,
      thoiGian: r.time,
    }));
    if (format === 'csv') exportLedgerCsv(rows, 'nap-tien.csv');
    if (format === 'excel') exportLedgerExcel(rows, 'nap-tien.csv');
    if (format === 'pdf') exportLedgerPdf(rows, 'Lịch sử nạp hạn mức');
    void financeApi.audit(`export_${format}` as 'export_csv' | 'export_excel' | 'export_pdf', { count: rows.length });
  }

  void tick;

  return (
    <WalletPageShell
      title="Nạp hạn mức"
      description="Tạo yêu cầu nạp hạn mức qua chuyển khoản QR (SePay). Số dư cập nhật tự động sau khi ngân hàng báo có. Số dư chỉ dùng mua hàng — ngừng dịch vụ thì liên hệ CardOn bằng văn bản để xem xét hoàn số dư còn lại."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {canCreate && (
            <Card className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">Tạo yêu cầu nạp hạn mức</h2>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
                <div>
                  <Label htmlFor="amount">Số tiền (VND)</Label>
                  <Input
                    id="amount"
                    className="mt-1"
                    inputMode="numeric"
                    placeholder="100000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    min={10000}
                  />
                </div>
                <div>
                  <Label htmlFor="gateway">Cổng thanh toán</Label>
                  <select
                    id="gateway"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={gateway}
                    onChange={(e) => setGateway(e.target.value)}
                  >
                    {gateways.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
                  <div>
                    <span className="text-slate-500">Phí</span>
                    <p className="font-medium">{formatVnd(String(fee))}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Thực nhận</span>
                    <p className="font-semibold text-emerald-700">{formatVnd(String(net))}</p>
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={creating || parsedAmount < 10000}>
                      {creating ? 'Đang tạo...' : 'Sinh giao dịch'}
                    </Button>
                  </div>
                </div>
              </form>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {canExport && (
              <>
                <Button size="sm" variant="secondary" onClick={() => handleExport('csv')}>
                  Xuất CSV
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleExport('excel')}>
                  Xuất Excel
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleExport('pdf')}>
                  Xuất PDF
                </Button>
              </>
            )}
          </div>

          <Card className="overflow-x-auto p-0">
            {loading ? (
              <DepositSkeleton />
            ) : items.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Chưa có giao dịch nạp tiền.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Mã giao dịch</th>
                    <th className="px-4 py-3">Gateway</th>
                    <th className="px-4 py-3">Số tiền</th>
                    <th className="px-4 py-3">Phí</th>
                    <th className="px-4 py-3">Thực nhận</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => void openDetail(row.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{row.reference}</td>
                      <td className="px-4 py-3">{row.gateway}</td>
                      <td className="px-4 py-3">{formatVnd(row.amount)}</td>
                      <td className="px-4 py-3">{formatVnd(row.feeAmount ?? '0')}</td>
                      <td className="px-4 py-3">{formatVnd(row.netAmount ?? row.amount)}</td>
                      <td className="px-4 py-3">
                        <DepositStatusBadge label={row.statusLabel ?? row.status} tone={row.statusTone} />
                      </td>
                      <td className="px-4 py-3">{formatDateTime(row.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {total > take && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                Hiển thị {skip + 1}–{Math.min(skip + take, total)} / {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={skip === 0}
                  className="rounded border px-3 py-1 disabled:opacity-40"
                  onClick={() => setSkip(Math.max(0, skip - take))}
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={skip + take >= total}
                  className="rounded border px-3 py-1 disabled:opacity-40"
                  onClick={() => setSkip(skip + take)}
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {detailLoading && (
            <Card>
              <DepositSkeleton />
            </Card>
          )}
          {active && !detailLoading && (
            <Card className="space-y-4 border-indigo-100 shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Thanh toán</p>
                  <p className="font-mono text-sm font-semibold">{active.paymentReference}</p>
                </div>
                <DepositStatusBadge label={active.statusLabel} tone={active.statusTone} />
              </div>

              {!TERMINAL.has(active.status) && <DepositCountdown expiresAt={active.expiresAt} />}

              {(active.paymentUrl || active.qrInfo?.qrUrl) && (
                <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={active.paymentUrl ?? active.qrInfo?.qrUrl}
                    alt="QR thanh toán"
                    className="h-48 w-48 rounded-lg border border-slate-100 object-contain"
                  />
                  <p className="mt-3 text-center text-lg font-bold text-slate-900">{formatVnd(active.amount)}</p>
                </div>
              )}

              {active.qrInfo?.bankInfo && (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-slate-500">Ngân hàng</dt>
                    <dd>{active.qrInfo.bankInfo.bankCode}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Số tài khoản</dt>
                    <dd className="font-mono">{active.qrInfo.bankInfo.accountNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Chủ tài khoản</dt>
                    <dd>{active.qrInfo.bankInfo.accountName}</dd>
                  </div>
                </dl>
              )}

              {active.transferContent && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Nội dung chuyển khoản</p>
                  <p className="mt-1 break-all font-mono text-sm">{active.transferContent}</p>
                  <Button size="sm" variant="secondary" className="mt-2" onClick={copyTransfer}>
                    Sao chép nội dung
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
                  {refreshing ? 'Đang làm mới...' : 'Làm mới trạng thái'}
                </Button>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-slate-900">Timeline</p>
                <DepositTimeline timeline={active.timeline} />
              </div>

              <p className="text-xs text-slate-400">Tạo lúc {formatDateTime(active.createdAt)}</p>
            </Card>
          )}
        </div>
      </div>
    </WalletPageShell>
  );
}
