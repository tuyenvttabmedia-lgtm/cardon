'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Card, ErrorMessage, StatCard, statusTone } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { downloadTextExport } from '@/lib/download-export';
import { LatestRequestTracker } from '@/lib/latest-request';
import { formatDateTime, formatDisplayValue, formatVnd } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import { agentCenterApi, ApiClientError } from '@/services/api-client';

export function AgentInvoiceTabPanel({
  agentId,
  canWrite,
}: {
  agentId: string;
  canWrite: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const listRequestsRef = useRef(new LatestRequestTracker<'list'>());
  const detailRequestsRef = useRef(new LatestRequestTracker<'detail'>());

  const load = useCallback(async () => {
    const token = listRequestsRef.current.begin('list');
    setError(null);
    setLoading(true);
    try {
      const inv = await agentCenterApi.invoices(agentId, { skip: 0, take: 50 });
      if (!listRequestsRef.current.isLatest(token)) return;
      setItems((inv.items as Array<Record<string, unknown>>) ?? []);
    } catch (e) {
      if (!listRequestsRef.current.isLatest(token)) return;
      setError(e instanceof ApiClientError ? e.message : 'Không tải được hóa đơn');
    } finally {
      if (listRequestsRef.current.isLatest(token)) {
        setLoading(false);
      }
    }
  }, [agentId]);

  useEffect(() => {
    listRequestsRef.current.invalidateAll();
    detailRequestsRef.current.invalidateAll();
    setItems([]);
    setSelected(null);
    setError(null);
    setLoading(true);
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(invoiceId: string) {
    const token = detailRequestsRef.current.begin('detail');
    setSelected(null);
    try {
      const detail = await agentCenterApi.getInvoice(agentId, invoiceId);
      if (!detailRequestsRef.current.isLatest(token)) return;
      setSelected(detail);
    } catch (e) {
      if (!detailRequestsRef.current.isLatest(token)) return;
      toast.error(e instanceof ApiClientError ? e.message : 'Không tải chi tiết');
    }
  }

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
      if (selected?.invoice) {
        const inv = selected.invoice as Record<string, unknown>;
        const token = detailRequestsRef.current.begin('detail');
        const detail = await agentCenterApi.getInvoice(agentId, String(inv.id));
        if (detailRequestsRef.current.isLatest(token)) {
          setSelected(detail);
        }
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Thao tác thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function downloadInvoice(invoiceId: string, format: 'csv' | 'html') {
    try {
      const res = await agentCenterApi.exportAgentInvoice(agentId, invoiceId, format);
      if (downloadTextExport(res, `invoice.${format}`, format === 'html' ? 'text/html' : 'text/csv')) {
        toast.success(format === 'html' ? 'Đã tải HTML (in thành PDF)' : 'Đã tải CSV');
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Tải file thất bại');
    }
  }

  const invoice = selected?.invoice as Record<string, unknown> | undefined;
  const linkedStatement = selected?.statement as Record<string, unknown> | null | undefined;
  const summary = (linkedStatement?.summary ?? (invoice?.metadata as Record<string, unknown>)?.summary) as
    | Record<string, string>
    | undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Hóa đơn đại lý — liên kết sao kê, không thay VAT engine. Tạo HĐ từ tab Sao kê (dòng LOCKED).
      </p>
      {error && <ErrorMessage message={error} />}
      {loading && <p className="text-sm text-slate-500">Đang tải hóa đơn…</p>}

      <Card className="p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">{vi.finance.invoiceNumber}</th>
              <th className="px-4 py-3 text-left">Loại</th>
              <th className="px-4 py-3 text-left">{vi.finance.amount}</th>
              <th className="px-4 py-3 text-left">VAT</th>
              <th className="px-4 py-3 text-left">{vi.finance.status}</th>
              <th className="px-4 py-3 text-left">TT</th>
              <th className="px-4 py-3 text-left">Ngày PH</th>
              <th className="px-4 py-3 text-left" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-slate-500">
                  Chưa có hóa đơn — tạo từ sao kê LOCKED ở tab Sao kê.
                </td>
              </tr>
            ) : (
              items.map((inv) => (
                <tr key={String(inv.id)} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{formatDisplayValue(inv.invoiceNumber)}</td>
                  <td className="px-4 py-3">{formatDisplayValue(inv.type)}</td>
                  <td className="px-4 py-3">{formatVnd(formatDisplayValue(inv.totalAmount))}</td>
                  <td className="px-4 py-3">{formatVnd(String(inv.taxAmount ?? 0))}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={statusTone(formatDisplayValue(inv.status))}
                      status={formatDisplayValue(inv.status)}
                    />
                  </td>
                  <td className="px-4 py-3">{formatDisplayValue(inv.paymentStatus, 'UNPAID')}</td>
                  <td className="px-4 py-3">
                    {inv.issuedAt ? formatDateTime(String(inv.issuedAt)) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" onClick={() => void openDetail(String(inv.id))}>
                      Chi tiết
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {invoice && (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Hóa đơn {formatDisplayValue(invoice.invoiceNumber)}</h3>
              <p className="mt-1 text-sm text-slate-600">
                <Badge
                  tone={statusTone(formatDisplayValue(invoice.status))}
                  status={formatDisplayValue(invoice.status)}
                />{' '}
                · TT:{' '}
                {formatDisplayValue(invoice.paymentStatus)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void downloadInvoice(String(invoice.id), 'csv')}>
                Tải CSV
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void downloadInvoice(String(invoice.id), 'html')}>
                Tải HTML
              </Button>
              {canWrite && invoice.status === 'DRAFT' && (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => agentCenterApi.issueAgentInvoice(agentId, String(invoice.id)),
                        'Đã phát hành hóa đơn',
                      )
                    }
                  >
                    Phát hành
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt('Lý do hủy hóa đơn nháp:');
                      if (!reason?.trim()) return;
                      void run(
                        () => agentCenterApi.voidAgentInvoice(agentId, String(invoice.id), { reason: reason.trim() }),
                        'Đã hủy hóa đơn',
                      );
                    }}
                  >
                    Hủy HĐ
                  </Button>
                </>
              )}
            </div>
          </div>

          {linkedStatement && (
            <p className="text-sm text-slate-600">
              Sao kê kỳ <strong>{formatDisplayValue(linkedStatement.periodLabel)}</strong> ·{' '}
              {formatDisplayValue(linkedStatement.status)} ·{' '}
              {formatDisplayValue(linkedStatement.periodStart).slice(0, 10)} →{' '}
              {formatDisplayValue(linkedStatement.periodEnd).slice(0, 10)}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Tổng HĐ" value={formatVnd(String(invoice.totalAmount))} />
            <StatCard label="VAT" value={formatVnd(String(invoice.taxAmount ?? 0))} />
            {summary && (
              <>
                <StatCard label="Doanh thu gộp" value={formatVnd(String(summary.grossRevenue ?? 0))} />
                <StatCard label="Doanh thu ròng" value={formatVnd(String(summary.netRevenue ?? 0))} />
                <StatCard label="Giá vốn NCC" value={formatVnd(String(summary.providerCost ?? 0))} />
                <StatCard label="Lợi nhuận CardOn" value={formatVnd(String(summary.cardonProfit ?? 0))} />
                <StatCard label="Điều chỉnh" value={formatVnd(String(summary.manualAdjustment ?? 0))} />
                <StatCard label="Số đơn" value={String(summary.orders ?? 0)} />
              </>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Tạo lúc {formatDateTime(String(invoice.createdAt))}
            {invoice.issuedAt ? ` · Phát hành ${formatDateTime(String(invoice.issuedAt))}` : ''}
          </p>
          <p className="text-xs text-slate-500">
            File HTML có thể mở bằng trình duyệt và in thành PDF (Ctrl+P).
          </p>
        </Card>
      )}
    </div>
  );
}
