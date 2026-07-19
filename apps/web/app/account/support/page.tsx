'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { accountApi, supportApi, ApiClientError } from '@/services/api-client';
import type { AccountOrder, SupportTicket } from '@/types/api';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Mới',
  PROCESSING: 'Đang xử lý',
  RESOLVED: 'Đã đóng',
};

export default function AccountSupportPage() {
  const searchParams = useSearchParams();
  const prefillOrderId = searchParams.get('orderId') ?? '';
  const prefillOrderCode = searchParams.get('orderCode') ?? '';
  const prefillPayment = searchParams.get('paymentStatus') ?? '';
  const prefillFulfillment = searchParams.get('fulfillmentStatus') ?? '';
  const ticketParam = searchParams.get('ticket');

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(ticketParam);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reply, setReply] = useState('');
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    subject: prefillOrderCode ? `Hỗ trợ đơn ${prefillOrderCode}` : '',
    message: prefillOrderCode
      ? `Mã đơn: ${prefillOrderCode}\nThanh toán: ${prefillPayment || '—'}\nGiao hàng: ${prefillFulfillment || '—'}\n\nMô tả sự cố:\n`
      : '',
    orderId: prefillOrderId,
  });

  const defaultMessage = useMemo(
    () => form.message,
    [prefillOrderCode, prefillPayment, prefillFulfillment],
  );

  useEffect(() => {
    if (prefillOrderCode && !form.message) {
      setForm((f) => ({
        ...f,
        subject: `Hỗ trợ đơn ${prefillOrderCode}`,
        message: defaultMessage,
        orderId: prefillOrderId,
      }));
    }
  }, [prefillOrderCode, prefillOrderId, defaultMessage, form.message]);

  async function loadTickets() {
    setLoading(true);
    try {
      const [ticketRows, orderRows] = await Promise.all([
        supportApi.listTickets(),
        accountApi.listOrders('all', undefined, 0, 100),
      ]);
      setTickets(ticketRows);
      setOrders(orderRows.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    supportApi
      .getTicket(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selectedId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const ticket = await supportApi.createTicket({
        subject: form.subject.trim(),
        message: form.message.trim(),
        orderId: form.orderId || undefined,
      });
      setForm({ subject: '', message: '', orderId: '' });
      await loadTickets();
      setSelectedId(ticket.id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không tạo được ticket');
    } finally {
      setCreating(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    try {
      const updated = await supportApi.addMessage(selectedId, { message: reply.trim() });
      setDetail(updated);
      setReply('');
      await loadTickets();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không gửi được tin nhắn');
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setUploading(true);
    try {
      const { url } = await supportApi.uploadScreenshot(file);
      const updated = await supportApi.addMessage(selectedId, {
        message: 'Đính kèm ảnh chụp màn hình',
        attachmentUrl: url,
      });
      setDetail(updated);
      await loadTickets();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Upload thất bại');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-cardon-navy">Hỗ trợ & khiếu nại</h2>
        <p className="mt-1 text-sm text-cardon-gray">
          Gửi yêu cầu hỗ trợ, chọn đơn hàng liên quan và theo dõi phản hồi từ bộ phận CSKH.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-cardon-gray">Ticket của bạn</p>
          {loading ? (
            <p className="text-sm text-cardon-gray">Đang tải...</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-cardon-gray">Chưa có ticket nào.</p>
          ) : (
            <ul className="space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2.5 text-left text-sm transition',
                      selectedId === t.id
                        ? 'border-cardon-blue bg-cardon-blue/5'
                        : 'border-cardon-border hover:bg-cardon-light',
                    )}
                  >
                    <p className="font-semibold text-cardon-navy">{t.ticketCode}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-cardon-gray">{t.subject}</p>
                    <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium">
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          {detail ? (
            <div className="rounded-2xl border border-cardon-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-cardon-navy">{detail.subject}</h3>
                  <p className="text-xs text-cardon-gray">
                    {detail.ticketCode}
                    {detail.order?.orderCode ? ` · Đơn ${detail.order.orderCode}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
              </div>

              <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
                {(detail.messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-xl px-3 py-2 text-sm',
                      m.authorType === 'STAFF'
                        ? 'ml-4 bg-cardon-light text-cardon-navy'
                        : 'mr-4 bg-blue-50 text-blue-900',
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase opacity-70">
                      {m.authorType === 'STAFF' ? 'Nhân viên hỗ trợ' : 'Bạn'}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                    {m.attachmentUrl && (
                      <a
                        href={m.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-xs font-medium text-cardon-blue hover:underline"
                      >
                        Xem ảnh đính kèm
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {detail.status !== 'RESOLVED' && (
                <form onSubmit={handleReply} className="mt-4 space-y-2 border-t pt-4">
                  <textarea
                    className="w-full rounded-xl border border-cardon-border px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Nhập phản hồi..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={!reply.trim()}>
                      Gửi
                    </Button>
                    <label className="inline-flex cursor-pointer items-center rounded-lg border border-cardon-border px-3 py-1.5 text-xs font-medium hover:bg-cardon-light">
                      {uploading ? 'Đang tải...' : 'Ảnh chụp màn hình'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUpload}
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <p className="text-sm text-cardon-gray">Chọn ticket để xem hội thoại hoặc tạo ticket mới bên dưới.</p>
          )}

          <form onSubmit={handleCreate} className="rounded-2xl border border-cardon-border bg-cardon-light/30 p-4">
            <h3 className="font-semibold text-cardon-navy">Tạo ticket mới</h3>
            <div className="mt-3 space-y-3">
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Chủ đề"
                required
              />
              <div>
                <label className="text-xs font-medium text-cardon-gray">Đơn hàng liên quan (tuỳ chọn)</label>
                <select
                  className="mt-1 w-full rounded-xl border border-cardon-border bg-white px-3 py-2 text-sm"
                  value={form.orderId}
                  onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
                >
                  <option value="">— Không chọn —</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderCode} · {o.paymentStatus}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                className="w-full rounded-xl border border-cardon-border px-3 py-2 text-sm"
                rows={5}
                placeholder="Mô tả chi tiết sự cố..."
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                required
              />
              <Button type="submit" disabled={creating}>
                {creating ? 'Đang gửi...' : 'Gửi yêu cầu hỗ trợ'}
              </Button>
            </div>
          </form>

          <p className="text-xs text-cardon-gray">
            Hoặc email{' '}
            <Link href="mailto:support@cardon.vn" className="text-cardon-blue hover:underline">
              support@cardon.vn
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
