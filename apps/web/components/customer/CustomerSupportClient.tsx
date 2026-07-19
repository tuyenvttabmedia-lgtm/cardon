'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CustomerPageHeader, CustomerSkeleton } from '@/components/customer/CustomerUi';
import { customerCenterApi } from '@/lib/customer-portal/api';
import { accountApi, supportApi, ApiClientError } from '@/services/api-client';
import type { AccountOrder, SupportTicket } from '@/types/api';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Mới',
  PROCESSING: 'Đang xử lý',
  RESOLVED: 'Đã đóng',
};

export default function CustomerSupportClient() {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(ticketParam);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reply, setReply] = useState('');
  const [form, setForm] = useState({ subject: '', message: '', orderId: '' });

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
    void supportApi.getTicket(selectedId).then(setDetail).catch(() => setDetail(null));
  }, [selectedId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
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
      setError(err instanceof ApiClientError ? err.message : 'Không tạo được phiếu');
    } finally {
      setCreating(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    const updated = await supportApi.addMessage(selectedId, { message: reply.trim() });
    setDetail(updated);
    setReply('');
    await loadTickets();
  }

  async function closeTicket() {
    if (!selectedId) return;
    await customerCenterApi.closeTicket(selectedId);
    await loadTickets();
    const updated = await supportApi.getTicket(selectedId);
    setDetail(updated);
  }

  return (
    <div className="space-y-6">
      <CustomerPageHeader title="Hỗ trợ" description="Tạo phiếu hỗ trợ và theo dõi phản hồi." />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div>
          {loading ? (
            <CustomerSkeleton rows={2} />
          ) : tickets.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có phiếu hỗ trợ.</p>
          ) : (
            <ul className="space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2 text-left text-sm',
                      selectedId === t.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <p className="font-semibold">{t.ticketCode}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{t.subject}</p>
                    <span className="text-[10px]">{STATUS_LABEL[t.status] ?? t.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          {detail ? (
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex justify-between gap-2">
                <h3 className="font-bold">{detail.subject}</h3>
                {detail.status !== 'RESOLVED' && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void closeTicket()}>
                    Đóng phiếu
                  </Button>
                )}
              </div>
              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                {(detail.messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      m.authorType === 'STAFF' ? 'bg-slate-100' : 'bg-sky-50',
                    )}
                  >
                    <p className="text-[10px] uppercase opacity-70">
                      {m.authorType === 'STAFF' ? 'Nhân viên' : 'Bạn'}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
              {detail.status !== 'RESOLVED' && (
                <form onSubmit={(e) => void handleReply(e)} className="mt-4 space-y-2 border-t pt-4">
                  <textarea
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Nhập phản hồi…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={!reply.trim()}>
                    Gửi
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Chọn phiếu hoặc tạo mới bên dưới.</p>
          )}

          <form onSubmit={(e) => void handleCreate(e)} className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">Tạo phiếu mới</h3>
            <div className="mt-3 space-y-3">
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Chủ đề"
                required
              />
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={form.orderId}
                onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
              >
                <option value="">— Đơn hàng (tuỳ chọn) —</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderCode}
                  </option>
                ))}
              </select>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm"
                rows={4}
                placeholder="Mô tả sự cố…"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                required
              />
              <Button type="submit" disabled={creating}>
                {creating ? 'Đang gửi…' : 'Gửi yêu cầu'}
              </Button>
            </div>
          </form>

          <p className="text-xs text-slate-500">
            Email:{' '}
            <Link href="mailto:support@cardon.vn" className="text-sky-600 hover:underline">
              support@cardon.vn
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
