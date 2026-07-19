'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { agentPlatformApi } from '@/services/api-client';
import { formatDateTime } from '@/lib/utils';

const GROUPS = [
  { id: 'wallet', label: 'Ví' },
  { id: 'api', label: 'API' },
  { id: 'webhook', label: 'Webhook' },
  { id: 'provider', label: 'Provider' },
  { id: 'system', label: 'Hệ thống' },
] as const;

function inferGroup(title?: string): (typeof GROUPS)[number]['id'] {
  const t = (title ?? '').toLowerCase();
  if (t.includes('webhook')) return 'webhook';
  if (t.includes('api') || t.includes('key')) return 'api';
  if (t.includes('provider')) return 'provider';
  if (t.includes('nạp') || t.includes('ví') || t.includes('wallet')) return 'wallet';
  return 'system';
}

export default function NotificationsPageClient() {
  const [items, setItems] = useState<Array<{ id?: string; title?: string; body?: string; createdAt?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<string>('all');

  useEffect(() => {
    void agentPlatformApi
      .listNotifications()
      .then((res) => {
        const list = Array.isArray(res.items) ? res.items : [];
        setItems(list as typeof items);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    activeGroup === 'all'
      ? items
      : items.filter((item) => inferGroup(item.title) === activeGroup);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Thông báo</h1>
        <p className="mt-1 text-sm text-slate-600">Nhóm theo Ví, API, Webhook, Provider và Hệ thống.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveGroup('all')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${activeGroup === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Tất cả
        </button>
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveGroup(g.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${activeGroup === g.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <Card className="divide-y divide-slate-100 p-0">
        {loading && <p className="p-4 text-sm text-slate-500">Đang tải…</p>}
        {!loading && filtered.length === 0 && (
          <p className="p-4 text-sm text-slate-500">Không có thông báo trong nhóm này.</p>
        )}
        {filtered.map((item, i) => (
          <div key={item.id ?? i} className="px-4 py-3">
            <p className="text-xs font-medium uppercase text-indigo-600">
              {GROUPS.find((g) => g.id === inferGroup(item.title))?.label ?? 'Hệ thống'}
            </p>
            <p className="font-medium text-slate-900">{item.title ?? 'Thông báo'}</p>
            {item.body && <p className="mt-1 text-sm text-slate-600">{item.body}</p>}
            {item.createdAt && (
              <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
