'use client';

import { useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { contactAdminApi, ApiClientError } from '@/services/api-client';
import type { ContactMessage } from '@/types/api';

export default function ContactMessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'NEW' | 'PROCESSED'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const status = filter === 'ALL' ? undefined : filter;
      setMessages(await contactAdminApi.list(status));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filter]);

  async function markProcessed(id: string) {
    try {
      const updated = await contactAdminApi.markProcessed(id);
      setMessages((rows) => rows.map((m) => (m.id === id ? updated : m)));
      setSelected(updated);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  async function remove(id: string) {
    if (!confirm('Xóa tin nhắn liên hệ này?')) return;
    try {
      await contactAdminApi.remove(id);
      setMessages((rows) => rows.filter((m) => m.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Liên hệ khách hàng</h1>
        <MarketingNav />
        {error && <ErrorMessage message={error} />}

        <div className="flex gap-2">
          {(['ALL', 'NEW', 'PROCESSED'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? 'primary' : 'secondary'}
              onClick={() => setFilter(s)}
            >
              {s === 'ALL' ? 'Tất cả' : s === 'NEW' ? 'Mới' : 'Đã xử lý'}
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-zinc-500">{vi.app.loading}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <Card className="overflow-x-auto p-0">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Người gửi</th>
                    <th className="px-4 py-3">Chủ đề</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                        Chưa có tin nhắn
                      </td>
                    </tr>
                  )}
                  {messages.map((m) => (
                    <tr
                      key={m.id}
                      className="cursor-pointer border-b hover:bg-zinc-50"
                      onClick={() => setSelected(m)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-zinc-500">{m.email}</p>
                      </td>
                      <td className="px-4 py-3">{m.subject}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            m.status === 'NEW'
                              ? 'rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700'
                              : 'rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600'
                          }
                        >
                          {m.status === 'NEW' ? 'Mới' : 'Đã xử lý'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">
                        {new Date(m.createdAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="space-y-4">
              {selected ? (
                <>
                  <h2 className="font-semibold">{selected.subject}</h2>
                  <div className="text-sm text-zinc-600">
                    <p>
                      <strong>{selected.name}</strong> — {selected.email}
                    </p>
                    {selected.phone && <p>SĐT: {selected.phone}</p>}
                    <p className="mt-1 text-xs text-zinc-400">
                      {new Date(selected.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{selected.message}</p>
                  <div className="flex gap-2">
                    {selected.status === 'NEW' && (
                      <Button size="sm" onClick={() => void markProcessed(selected.id)}>
                        Đánh dấu đã xử lý
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => void remove(selected.id)}>
                      Xóa
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Chọn tin nhắn để xem chi tiết</p>
              )}
            </Card>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
