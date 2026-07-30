'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn, formatDateTime } from '@/lib/utils';
import { systemNotificationApi } from '@/services/api-client';
import type { SystemNotification } from '@/types/api';

type DrawerTab = 'all' | 'unread' | 'warnings' | 'critical';

const SEVERITY_ICON: Record<string, string> = {
  INFO: 'ℹ️',
  SUCCESS: '✅',
  WARNING: '⚠️',
  ERROR: '❌',
  CRITICAL: '🔴',
};

const SEVERITY_COLOR: Record<string, string> = {
  INFO: 'border-l-blue-400',
  SUCCESS: 'border-l-green-500',
  WARNING: 'border-l-yellow-500',
  ERROR: 'border-l-red-500',
  CRITICAL: 'border-l-red-700',
};

function badgeClass(items: SystemNotification[], unread: number): string {
  if (unread <= 0) return 'hidden';
  const hasCritical = items.some(
    (n) => !n.isRead && (n.severity === 'ERROR' || n.severity === 'CRITICAL'),
  );
  if (hasCritical) return 'bg-red-500';
  const hasWarning = items.some((n) => !n.isRead && n.severity === 'WARNING');
  if (hasWarning) return 'bg-yellow-500 text-slate-900';
  return 'bg-red-500';
}

export function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTab>('all');
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        systemNotificationApi.list({ limit: 50, tab, sort: 'newest' }),
        systemNotificationApi.unreadCount(),
      ]);
      setItems(list.items);
      setUnread(count.count);
    } catch {
      setItems([]);
      setUnread(0);
    }
  }, [tab]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  async function markRead(id: string) {
    await systemNotificationApi.markRead(id);
    await load();
  }

  async function markAllRead() {
    await systemNotificationApi.markAllRead();
    await load();
  }

  async function dismiss(id: string) {
    await systemNotificationApi.dismiss([id]);
    await load();
  }

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'unread', label: 'Chưa đọc' },
    { id: 'warnings', label: 'Cảnh báo' },
    { id: 'critical', label: 'Nghiêm trọng' },
  ];

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm shadow-sm transition-all hover:-translate-y-px hover:border-admin-200 hover:bg-admin-50 hover:shadow active:translate-y-0"
        aria-label="Thông báo"
        aria-expanded={open}
      >
        🔔
        {unread > 0 && (
          <span
            className={cn(
              'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs text-white',
              badgeClass(items, unread),
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 flex max-h-[32rem] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel-hover">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold text-slate-900">Thông báo</h3>
            <div className="flex gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  className="text-xs text-admin-600 hover:underline"
                  onClick={() => void markAllRead()}
                >
                  Đánh dấu tất cả
                </button>
              )}
              <Link
                href="/monitoring/notifications"
                className="text-xs text-admin-600 hover:underline"
                onClick={() => setOpen(false)}
              >
                Xem tất cả
              </Link>
            </div>
          </div>

          <div className="flex gap-1 border-b border-slate-100 px-2 py-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'bg-admin-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Không có thông báo</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'border-b border-slate-100 border-l-4 px-4 py-3 transition-colors hover:bg-slate-50',
                    SEVERITY_COLOR[n.severity] ?? 'border-l-slate-300',
                    n.isRead ? 'bg-white opacity-80' : 'bg-slate-50/80',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none">{SEVERITY_ICON[n.severity] ?? '•'}</span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm', n.isRead ? 'text-slate-600' : 'font-medium text-slate-900')}>
                        {n.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{n.message}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDateTime(n.createdAt)}
                        {n.source ? ` · ${n.source}` : ''}
                        {n.resourceDisplay ? ` · ${n.resourceDisplay}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {!n.isRead && (
                          <button
                            type="button"
                            className="text-xs text-admin-600 hover:underline"
                            onClick={() => void markRead(n.id)}
                          >
                            Đánh dấu đã đọc
                          </button>
                        )}
                        {n.resourceHref && (
                          <Link
                            href={n.resourceHref}
                            className="text-xs text-admin-600 hover:underline"
                            onClick={() => setOpen(false)}
                          >
                            Mở tài nguyên
                          </Link>
                        )}
                        <button
                          type="button"
                          className="text-xs text-slate-500 hover:underline"
                          onClick={() => void dismiss(n.id)}
                        >
                          Ẩn
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
