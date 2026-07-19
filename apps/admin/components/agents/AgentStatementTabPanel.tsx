'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorMessage, StatCard, statusTone } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { downloadTextExport } from '@/lib/download-export';
import { cn, formatDateTime, formatVnd } from '@/lib/utils';
import { agentCenterApi, ApiClientError } from '@/services/api-client';

type Preset = 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'this_month', label: 'Tháng này' },
  { id: 'last_month', label: 'Tháng trước' },
  { id: 'last_7_days', label: '7 ngày' },
  { id: 'today', label: 'Hôm nay' },
];

function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetDates(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const to = formatDateInput(now);
  if (preset === 'today') return { from: to, to };
  if (preset === 'last_7_days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: formatDateInput(start), to };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: formatDateInput(start), to: formatDateInput(end) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: formatDateInput(start), to };
}

function summaryNet(s: Record<string, unknown>): string {
  if (typeof s.netRevenue === 'string') return s.netRevenue;
  const summary = s.summary as Record<string, string> | undefined;
  return summary?.netRevenue ?? '0';
}

export function AgentStatementTabPanel({
  agentId,
  canWrite,
  isSuperAdmin,
}: {
  agentId: string;
  canWrite: boolean;
  isSuperAdmin?: boolean;
}) {
  const toast = useToast();
  const initial = presetDates('this_month');
  const [preset, setPreset] = useState<Preset>('this_month');
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [adjustments, setAdjustments] = useState<Array<Record<string, unknown>>>([]);
  const [statements, setStatements] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const periodParams = useMemo(
    () => ({
      preset: preset === 'custom' ? 'custom' : preset,
      dateFrom,
      dateTo,
    }),
    [preset, dateFrom, dateTo],
  );

  const selectedStatement = useMemo(
    () => statements.find((s) => String(s.id) === selectedId) ?? null,
    [statements, selectedId],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dash, ord, stmts] = await Promise.all([
        agentCenterApi.statementDashboard(agentId, periodParams),
        agentCenterApi.statementOrders(agentId, { ...periodParams, skip: 0, take: 50, q: search || undefined }),
        agentCenterApi.listStatements(agentId),
      ]);
      setDashboard(dash);
      setOrders((ord.items as Array<Record<string, unknown>>) ?? []);
      setStatements(stmts.items ?? []);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được sao kê');
    }
  }, [agentId, periodParams, search]);

  const loadAdjustments = useCallback(async (statementId?: string | null) => {
    try {
      const adj = await agentCenterApi.listStatementAdjustments(agentId, {
        skip: 0,
        take: 20,
        ...(statementId ? { statementId } : {}),
      });
      setAdjustments((adj.items as Array<Record<string, unknown>>) ?? []);
    } catch {
      setAdjustments([]);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAdjustments(selectedId);
  }, [loadAdjustments, selectedId]);

  async function openDetail(statementId: string) {
    setSelectedId(statementId);
    setDetailOpen(true);
    try {
      const data = await agentCenterApi.getStatement(agentId, statementId);
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Không tải chi tiết');
    }
  }

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
      if (selectedId && detailOpen) {
        const data = await agentCenterApi.getStatement(agentId, selectedId);
        setDetail(data);
      }
      await loadAdjustments(selectedId);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Thao tác thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function exportStatementFile(statementId?: string) {
    const res = await agentCenterApi.exportStatement(
      agentId,
      statementId ? { statementId, format: 'csv' } : { ...periodParams, format: 'csv' },
    );
    if (downloadTextExport(res, 'statement.csv', 'text/csv')) {
      toast.success('Đã xuất CSV');
    } else if (res.async) {
      toast.success(String(res.message ?? 'Export đang xử lý'));
    }
  }

  function applyPreset(next: Preset) {
    setPreset(next);
    const range = presetDates(next);
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  function confirmNetAmount(label: string, amount: string): boolean {
    return window.confirm(`${label}\n\nDoanh thu ròng: ${formatVnd(amount)}\n\nXác nhận tiếp tục?`);
  }

  const cards = (dashboard?.cards ?? {}) as Record<string, string | number>;
  const detailSummary = (detail?.summary ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-zinc-600">
          Đối soát B2B theo đại lý — không trộn với Finance công ty.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Từ ngày</Label>
            <Input
              type="date"
              className="mt-1 w-[140px]"
              value={dateFrom}
              onChange={(e) => {
                setPreset('custom');
                setDateFrom(e.target.value);
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Đến ngày</Label>
            <Input
              type="date"
              className="mt-1 w-[140px]"
              value={dateTo}
              onChange={(e) => {
                setPreset('custom');
                setDateTo(e.target.value);
              }}
            />
          </div>
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={preset === p.id ? 'primary' : 'secondary'}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Đơn hàng" value={String(cards.orders ?? 0)} />
        <StatCard label="Thành công" value={String(cards.successOrders ?? 0)} />
        <StatCard label="Thất bại" value={String(cards.failedOrders ?? 0)} />
        <StatCard label="Hoàn tiền" value={String(cards.refundOrders ?? 0)} />
        <StatCard label="Doanh thu gộp" value={formatVnd(String(cards.grossRevenue ?? 0))} />
        <StatCard label="Giá vốn NCC" value={formatVnd(String(cards.providerCost ?? 0))} />
        <StatCard label="Lợi nhuận CardOn" value={formatVnd(String(cards.cardonProfit ?? 0))} />
        <StatCard label="Điều chỉnh" value={formatVnd(String(cards.manualAdjustment ?? 0))} />
        <StatCard label="Doanh thu ròng" value={formatVnd(String(cards.netRevenue ?? 0))} />
        <StatCard label="HĐ chờ TT" value={String(cards.pendingInvoice ?? 0)} />
        <StatCard label="HĐ đã TT" value={String(cards.paidInvoice ?? 0)} />
      </div>

      {canWrite && (
        <Card className="flex flex-wrap gap-2 p-4">
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                () => agentCenterApi.generateStatement(agentId, periodParams),
                'Đã tạo / cập nhật sao kê nháp',
              )
            }
          >
            Tạo sao kê kỳ đang xem
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void exportStatementFile()}>
            Xuất CSV kỳ đang xem
          </Button>
          <Link href={`/orders?agentId=${agentId}`} className="inline-flex">
            <Button variant="ghost" size="sm">
              Xem đơn hàng
            </Button>
          </Link>
          <Link href={`/agents/${agentId}?tab=wallet`} className="inline-flex">
            <Button variant="ghost" size="sm">
              Ví đại lý
            </Button>
          </Link>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-semibold text-zinc-900">Chu kỳ sao kê</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Chọn dòng để thêm điều chỉnh. Mọi thao tác khóa / hóa đơn thực hiện trên từng kỳ.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="py-2 pr-4">Kỳ</th>
                <th className="py-2 pr-4">Từ – Đến</th>
                <th className="py-2 pr-4">Doanh thu ròng</th>
                <th className="py-2 pr-4">Trạng thái</th>
                <th className="py-2 pr-4">Hóa đơn</th>
                <th className="py-2 pr-4">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {statements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-zinc-500">
                    Chưa có sao kê — chọn kỳ và nhấn Tạo sao kê.
                  </td>
                </tr>
              ) : (
                statements.map((s) => {
                  const id = String(s.id);
                  const isSelected = selectedId === id;
                  const net = summaryNet(s);
                  return (
                    <tr
                      key={id}
                      className={cn('border-b border-zinc-50', isSelected && 'bg-admin-50/40')}
                    >
                      <td className="py-2 pr-4 font-medium">{String(s.periodLabel)}</td>
                      <td className="py-2 pr-4 text-xs text-zinc-600">
                        {String(s.periodStart).slice(0, 10)} → {String(s.periodEnd).slice(0, 10)}
                      </td>
                      <td className="py-2 pr-4 font-medium">{formatVnd(net)}</td>
                      <td className="py-2 pr-4">
                        <Badge status={String(s.status)} tone={statusTone(String(s.status))} />
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {s.invoiceNumber ? String(s.invoiceNumber) : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" onClick={() => void openDetail(id)}>
                            Xem
                          </Button>
                          <Button
                            size="sm"
                            variant={isSelected ? 'primary' : 'ghost'}
                            onClick={() => setSelectedId(id)}
                          >
                            Chọn
                          </Button>
                          {canWrite && s.status === 'DRAFT' && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => {
                                  if (!confirmNetAmount('Khóa sao kê', net)) return;
                                  void run(
                                    () => agentCenterApi.lockStatement(agentId, id),
                                    'Đã khóa sao kê',
                                  );
                                }}
                              >
                                Khóa
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                onClick={() => {
                                  if (!window.confirm('Hủy sao kê nháp này?')) return;
                                  void run(() => agentCenterApi.cancelStatement(agentId, id), 'Đã hủy sao kê');
                                }}
                              >
                                Hủy
                              </Button>
                            </>
                          )}
                          {canWrite && s.status === 'LOCKED' && !s.invoiceId && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                if (!confirmNetAmount('Tạo hóa đơn', net)) return;
                                void run(
                                  () => agentCenterApi.createStatementInvoice(agentId, id),
                                  'Đã tạo hóa đơn — xem tab Hóa đơn',
                                );
                              }}
                            >
                              Tạo HĐ
                            </Button>
                          )}
                          {canWrite && isSuperAdmin && s.status === 'LOCKED' && !s.invoiceId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt('Lý do mở khóa:');
                                if (!reason?.trim()) return;
                                void run(
                                  () => agentCenterApi.unlockStatement(agentId, id, { reason: reason.trim() }),
                                  'Đã mở khóa sao kê',
                                );
                              }}
                            >
                              Mở khóa
                            </Button>
                          )}
                          {canWrite && (s.status === 'INVOICED' || s.status === 'LOCKED') && s.paymentStatus !== 'PAID' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => agentCenterApi.markStatementPaid(agentId, id),
                                  'Đã đánh dấu thanh toán',
                                )
                              }
                            >
                              Đã TT
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void exportStatementFile(id)}>
                            CSV
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {canWrite && (
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold text-zinc-900">Điều chỉnh thủ công</h3>
          {selectedStatement ? (
            <p className="text-sm text-zinc-600">
              Gắn với kỳ <strong>{String(selectedStatement.periodLabel)}</strong>
              {selectedStatement.status !== 'DRAFT' && (
                <span className="text-amber-700"> — sao kê đã khóa, điều chỉnh sẽ không đổi HĐ đã tạo</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-amber-700">Chọn một dòng sao kê trước khi thêm điều chỉnh.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Số tiền (+/-)</Label>
              <Input className="mt-1" type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Lý do</Label>
              <Input className="mt-1" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
            </div>
          </div>
          <Button
            disabled={busy || !adjAmount || !adjReason.trim() || !selectedId}
            onClick={() => {
              void run(async () => {
                await agentCenterApi.createStatementAdjustment(agentId, {
                  amount: Number(adjAmount),
                  reason: adjReason.trim(),
                  statementId: selectedId,
                });
                setAdjAmount('');
                setAdjReason('');
              }, 'Đã ghi điều chỉnh');
            }}
          >
            Thêm điều chỉnh
          </Button>
          <ul className="space-y-2 text-sm">
            {adjustments.map((a) => (
              <li key={String(a.id)} className="flex justify-between border-b border-zinc-50 py-2">
                <span>{String(a.reason)}</span>
                <span className="font-medium">{formatVnd(String(a.amount))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">Chi tiết đơn trong kỳ đang xem</h3>
          <Input
            className="max-w-xs"
            placeholder="Tìm mã đơn, partner ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
          />
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left">Mã đơn</th>
              <th className="px-3 py-2 text-left">Partner</th>
              <th className="px-3 py-2 text-left">Sản phẩm</th>
              <th className="px-3 py-2 text-left">Giá vốn</th>
              <th className="px-3 py-2 text-left">Giá đại lý</th>
              <th className="px-3 py-2 text-left">Lợi nhuận</th>
              <th className="px-3 py-2 text-left">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-zinc-500">
                  Không có đơn trong kỳ.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={String(o.orderId)} className="border-b border-zinc-50">
                  <td className="px-3 py-2 font-mono text-xs">{String(o.orderCode)}</td>
                  <td className="px-3 py-2">{String(o.partnerOrder ?? '—')}</td>
                  <td className="px-3 py-2">{String(o.product)}</td>
                  <td className="px-3 py-2">{formatVnd(String(o.providerCost))}</td>
                  <td className="px-3 py-2">{formatVnd(String(o.agentPrice))}</td>
                  <td className="px-3 py-2">{formatVnd(String(o.profit))}</td>
                  <td className="px-3 py-2">{String(o.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {detailOpen && detail && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30"
            aria-label="Đóng"
            onClick={() => setDetailOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold">Sao kê {String(detail.periodLabel)}</h3>
              <Button size="sm" variant="ghost" onClick={() => setDetailOpen(false)}>
                Đóng
              </Button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-zinc-500">Trạng thái</p>
                  <Badge status={String(detail.status)} tone={statusTone(String(detail.status))} />
                </div>
                <div>
                  <p className="text-zinc-500">Thanh toán</p>
                  <p>{String(detail.paymentStatus)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Tạo lúc</p>
                  <p>{formatDateTime(String(detail.generatedAt))}</p>
                </div>
                {detail.lockedAt ? (
                  <div>
                    <p className="text-zinc-500">Khóa lúc</p>
                    <p>{formatDateTime(String(detail.lockedAt))}</p>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="Doanh thu ròng" value={formatVnd(String(detailSummary.netRevenue ?? 0))} />
                <StatCard label="Điều chỉnh" value={formatVnd(String(detailSummary.manualAdjustment ?? 0))} />
                <StatCard label="Lợi nhuận" value={formatVnd(String(detailSummary.cardonProfit ?? 0))} />
                <StatCard label="Đơn hàng" value={String(detailSummary.orders ?? 0)} />
              </div>
              {Array.isArray(detail.adjustments) && detail.adjustments.length > 0 && (
                <div>
                  <h4 className="font-medium">Điều chỉnh</h4>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(detail.adjustments as Array<Record<string, unknown>>).map((a) => (
                      <li key={String(a.id)} className="flex justify-between">
                        <span>{String(a.reason)}</span>
                        <span>{formatVnd(String(a.amount))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(detail.timeline) && (
                <div>
                  <h4 className="font-medium">Lịch sử</h4>
                  <ul className="mt-2 space-y-2 border-l border-zinc-200 pl-3 text-sm">
                    {(detail.timeline as Array<{ at: string; label: string; detail?: string }>).map((t, i) => (
                      <li key={i}>
                        <p className="font-medium">{t.label}</p>
                        <p className="text-xs text-zinc-500">
                          {formatDateTime(t.at)}
                          {t.detail ? ` · ${t.detail}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
