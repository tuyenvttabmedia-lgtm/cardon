'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CustomerEmptyState, CustomerPageHeader, CustomerSkeleton } from '@/components/customer/CustomerUi';
import { customerCenterApi, type CustomerNotificationRow } from '@/lib/customer-portal/api';
import { notificationApi } from '@/services/api-client';
import { cn } from '@/lib/utils';

const GROUPS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'order', label: 'Đơn hàng' },
  { id: 'pin', label: 'PIN' },
  { id: 'promo', label: 'Khuyến mãi' },
  { id: 'system', label: 'Hệ thống' },
] as const;

const GROUP_LABEL: Record<string, string> = {
  order: 'Đơn hàng',
  pin: 'PIN',
  promo: 'Khuyến mãi',
  system: 'Hệ thống',
};

export default function CustomerNotificationsClient() {
  const [group, setGroup] = useState<(typeof GROUPS)[number]['id']>('all');
  const [items, setItems] = useState<CustomerNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void customerCenterApi
      .listNotifications({ group, skip: 0, take: 50 })
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [group]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    await notificationApi.markRead(id);
    load();
  }

  async function markAllRead() {
    await notificationApi.markAllRead();
    load();
  }

  async function remove(id: string) {
    await customerCenterApi.deleteNotification(id);
    load();
  }

  return (
    <div>
      <CustomerPageHeader title="Thông báo" description="Theo dõi đơn hàng, PIN và khuyến mãi." />

      <div className="mb-4 flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium',
              group === g.id ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            {g.label}
          </button>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => void markAllRead()}>
          Đánh dấu tất cả đã đọc
        </Button>
      </div>

      {loading ? (
        <CustomerSkeleton rows={4} />
      ) : items.length === 0 ? (
        <CustomerEmptyState message="Không có thông báo." />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn('px-4 py-3', !n.readAt && 'bg-sky-50/50 dark:bg-sky-950/20')}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-sky-600">{GROUP_LABEL[n.group] ?? 'Hệ thống'}</p>
                  <p className="font-medium text-slate-900 dark:text-white">{n.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('vi-VN')}</p>
                </div>
                <div className="flex gap-2">
                  {!n.readAt && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void markRead(n.id)}>
                      Đã đọc
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => void remove(n.id)}>
                    Xóa
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
