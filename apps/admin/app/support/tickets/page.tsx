'use client';

import { useEffect, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { supportAdminApi, ApiClientError } from '@/services/api-client';
import type { SupportTicket } from '@/types/api';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Mới',
  PROCESSING: 'Đang xử lý',
  RESOLVED: 'Đã đóng',
};

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [ticketCode, setTicketCode] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const rows = await supportAdminApi.list({
        status: filterStatus === 'ALL' ? undefined : filterStatus,
        ticketCode: ticketCode.trim() || undefined,
      });
      setTickets(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filterStatus]);

  async function openTicket(id: string) {
    try {
      setSelected(await supportAdminApi.get(id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    try {
      const updated = await supportAdminApi.reply(selected.id, reply.trim());
      setSelected(updated);
      setReply('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function closeTicket() {
    if (!selected) return;
    try {
      const updated = await supportAdminApi.close(selected.id);
      setSelected(updated);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  return (
    <RequirePermission permission="support.manage">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Hỗ trợ — Tickets</h1>
        {error && <ErrorMessage message={error} />}

        <div className="flex flex-wrap items-end gap-2">
          {(['ALL', 'OPEN', 'PROCESSING', 'RESOLVED'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filterStatus === s ? 'primary' : 'secondary'}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'ALL' ? 'Tất cả' : STATUS_LABEL[s]}
            </Button>
          ))}
          <input
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
            placeholder="Mã ticket..."
            value={ticketCode}
            onChange={(e) => setTicketCode(e.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Lọc
          </Button>
        </div>

        {loading ? (
          <p className="text-zinc-500">{vi.app.loading}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
            <Card className="overflow-x-auto p-0">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Mã</th>
                    <th className="px-4 py-3">Khách hàng</th>
                    <th className="px-4 py-3">Chủ đề</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        Chưa có ticket
                      </td>
                    </tr>
                  )}
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer border-b hover:bg-zinc-50"
                      onClick={() => void openTicket(t.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{t.ticketCode}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.customer?.fullName ?? '—'}</p>
                        <p className="text-xs text-zinc-500">{t.customer?.email}</p>
                      </td>
                      <td className="px-4 py-3">{t.subject}</td>
                      <td className="px-4 py-3">{STATUS_LABEL[t.status] ?? t.status}</td>
                      <td className="px-4 py-3 text-zinc-500">
                        {new Date(t.createdAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-4">
              {!selected ? (
                <p className="text-sm text-zinc-500">Chọn ticket để xem hội thoại</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h2 className="font-bold">{selected.subject}</h2>
                    <p className="text-xs text-zinc-500">{selected.ticketCode}</p>
                    {selected.order && (
                      <p className="mt-1 text-xs text-zinc-600">
                        Đơn {selected.order.orderCode} · TT: {selected.order.paymentStatus} · GH:{' '}
                        {selected.order.fulfillmentStatus}
                      </p>
                    )}
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg bg-zinc-50 p-3 text-sm">
                    {(selected.messages ?? []).map((m) => (
                      <div
                        key={m.id}
                        className={
                          m.authorType === 'STAFF'
                            ? 'rounded-lg bg-white p-2 shadow-sm'
                            : 'rounded-lg bg-blue-50 p-2'
                        }
                      >
                        <p className="text-[10px] font-semibold uppercase text-zinc-500">
                          {m.authorType === 'STAFF' ? 'Nhân viên' : 'Khách hàng'}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                        {m.attachmentUrl && (
                          <a
                            href={m.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-xs text-blue-600"
                          >
                            Ảnh đính kèm
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {selected.status !== 'RESOLVED' && (
                    <>
                      <textarea
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Phản hồi khách hàng..."
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void sendReply()} disabled={!reply.trim()}>
                          Gửi phản hồi
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void closeTicket()}>
                          Đóng ticket
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
