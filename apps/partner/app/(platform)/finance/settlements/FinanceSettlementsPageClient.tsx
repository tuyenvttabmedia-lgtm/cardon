'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FinancePageShell } from '@/components/finance/FinanceSubNav';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import {
  SETTLEMENT_PAYMENT_LABELS,
  SETTLEMENT_STATUS_LABELS,
  exportLedgerCsv,
  exportLedgerExcel,
} from '@/lib/finance/constants';
import { financeApi } from '@/services/api-client';
import { cn, formatDateTime, formatVnd } from '@/lib/utils';
import type { FinanceSettlementDetail, FinanceSettlementRow } from '@/types/platform';

function statusTone(status: string): 'default' | 'success' | 'warning' | 'info' {
  if (status === 'PAID') return 'success';
  if (status === 'INVOICED') return 'info';
  if (status === 'LOCKED') return 'warning';
  return 'default';
}

function paymentTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'PAID') return 'success';
  if (status === 'OVERDUE') return 'danger';
  if (status === 'PARTIAL') return 'warning';
  return 'default';
}

function summaryField(summary: Record<string, unknown>, key: string): string {
  const value = summary[key];
  return typeof value === 'string' ? value : '0';
}

export default function FinanceSettlementsPageClient() {
  const { can } = useAgentPlatform();
  const canExport = can('finance.export');
  const [items, setItems] = useState<FinanceSettlementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<FinanceSettlementDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const take = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.listSettlements({ skip, take });
      setItems(res.items);
      setTotal(res.total);
      void financeApi.audit('filter', { page: 'settlements', skip });
    } finally {
      setLoading(false);
    }
  }, [skip]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const row = await financeApi.getSettlement(id);
      setDetail(row);
      void financeApi.audit('view_detail', { page: 'settlements', statementId: id });
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetail(null);
  }

  function handleExport(format: 'csv' | 'excel') {
    const rows = items.map((r) => ({
      chuKy: r.cycle,
      tuNgay: r.periodStart.slice(0, 10),
      denNgay: r.periodEnd.slice(0, 10),
      trangThai: SETTLEMENT_STATUS_LABELS[r.status] ?? r.status,
      thanhToan: SETTLEMENT_PAYMENT_LABELS[r.paymentStatus] ?? r.paymentStatus,
      soDon: r.orderCount,
      doanhThu: r.revenue,
      dieuChinh: r.discount,
      phaiTra: r.netRevenue,
      soHoaDon: r.invoiceNumber ?? '',
      daThanhToan: r.paidAt ?? '',
    }));
    if (format === 'csv') exportLedgerCsv(rows, 'doi-soat.csv');
    else exportLedgerExcel(rows, 'doi-soat.csv');
    void financeApi.audit(format === 'csv' ? 'export_csv' : 'export_excel', { count: rows.length });
  }

  return (
    <FinancePageShell
      title="Đối soát"
      description="Sao kê chu kỳ do CardOn khóa — chỉ xem, đồng bộ từ hệ thống sao kê đại lý."
    >
      <div className="flex flex-wrap gap-2">
        {canExport && items.length > 0 && (
          <>
            <Button size="sm" variant="secondary" onClick={() => handleExport('csv')}>
              Xuất CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleExport('excel')}>
              Xuất Excel
            </Button>
          </>
        )}
      </div>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Đang tải...</p>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            <p>Chưa có chu kỳ đối soát.</p>
            <p className="mt-2 text-xs text-slate-400">
              Sao kê sẽ hiển thị sau khi CardOn khóa chu kỳ trên hệ thống quản trị.
            </p>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Chu kỳ</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thanh toán</th>
                <th className="px-4 py-3">Số đơn</th>
                <th className="px-4 py-3">Doanh thu</th>
                <th className="px-4 py-3">Phải trả</th>
                <th className="px-4 py-3">Hóa đơn</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.cycle}</div>
                    <div className="text-xs text-slate-500">
                      {row.periodStart.slice(0, 10)} → {row.periodEnd.slice(0, 10)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(row.status)}>
                      {SETTLEMENT_STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={paymentTone(row.paymentStatus)}>
                      {SETTLEMENT_PAYMENT_LABELS[row.paymentStatus] ?? row.paymentStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{row.orderCount}</td>
                  <td className="px-4 py-3">{formatVnd(row.revenue)}</td>
                  <td className="px-4 py-3 font-medium">{formatVnd(row.netRevenue)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.invoiceNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => void openDetail(row.id)}>
                      Chi tiết
                    </Button>
                  </td>
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
            <Button size="sm" variant="secondary" disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - take))}>
              Trước
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={skip + take >= total}
              onClick={() => setSkip((s) => s + take)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}

      {detailOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={closeDetail}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Chi tiết đối soát</h2>
                {detail && <p className="text-sm text-slate-500">{detail.cycle}</p>}
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={closeDetail}>
                ✕
              </button>
            </div>

            <div className="space-y-4 p-5">
              {detailLoading || !detail ? (
                <p className="text-sm text-slate-500">Đang tải...</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={statusTone(detail.status)}>
                      {SETTLEMENT_STATUS_LABELS[detail.status] ?? detail.status}
                    </Badge>
                    <Badge tone={paymentTone(detail.paymentStatus)}>
                      {SETTLEMENT_PAYMENT_LABELS[detail.paymentStatus] ?? detail.paymentStatus}
                    </Badge>
                  </div>

                  <Card className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500">Doanh thu gộp</p>
                      <p className="font-semibold">{formatVnd(summaryField(detail.summary, 'grossRevenue'))}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Phải trả</p>
                      <p className="font-semibold text-indigo-700">{formatVnd(detail.netRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Đơn thành công</p>
                      <p className="font-semibold">{summaryField(detail.summary, 'successOrders')}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Điều chỉnh</p>
                      <p className="font-semibold">{formatVnd(summaryField(detail.summary, 'manualAdjustment'))}</p>
                    </div>
                    {detail.invoiceNumber && (
                      <>
                        <div>
                          <p className="text-slate-500">Số hóa đơn</p>
                          <p className="font-mono text-xs">{detail.invoiceNumber}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Giá trị HĐ</p>
                          <p className="font-semibold">{detail.invoiceAmount ? formatVnd(detail.invoiceAmount) : '—'}</p>
                        </div>
                      </>
                    )}
                    {detail.paidAt && (
                      <div className="col-span-2">
                        <p className="text-slate-500">Đã thanh toán lúc</p>
                        <p className="font-semibold">{formatDateTime(detail.paidAt)}</p>
                      </div>
                    )}
                  </Card>

                  {detail.adjustments.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-900">Điều chỉnh trong kỳ</p>
                      <ul className="space-y-2 text-sm">
                        {detail.adjustments.map((adj) => (
                          <li key={adj.id} className="rounded-lg border border-slate-100 px-3 py-2">
                            <div className="flex justify-between">
                              <span>{adj.reason}</span>
                              <span className={cn(Number(adj.amount) >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                                {formatVnd(adj.amount)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">{formatDateTime(adj.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-900">Lịch sử</p>
                    <ul className="space-y-2 border-l-2 border-slate-200 pl-4 text-sm">
                      {detail.timeline.map((ev, i) => (
                        <li key={`${ev.at}-${i}`}>
                          <p className="font-medium text-slate-800">{ev.label}</p>
                          <p className="text-xs text-slate-400">{formatDateTime(ev.at)}</p>
                          {ev.detail && <p className="text-xs text-slate-500">{ev.detail}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </FinancePageShell>
  );
}
