'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { notificationApi, ApiClientError } from '@/services/api-client';
import type { UserNotification } from '@/types/api';
import { cn } from '@/lib/utils';

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function notificationLink(n: UserNotification): string | null {
  if (n.type === 'SUPPORT_REPLY' && n.metadata?.ticketId) {
    return `/account/support?ticket=${n.metadata.ticketId}`;
  }
  const orderId = typeof n.metadata?.orderId === 'string' ? n.metadata.orderId : null;
  if (orderId) {
    return `/orders/${orderId}?from=orders`;
  }
  if (typeof n.metadata?.orderCode === 'string') {
    return `/order/${n.metadata.orderCode}`;
  }
  return null;
}

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const [list, countRes] = await Promise.all([
        notificationApi.list(),
        notificationApi.unreadCount(),
      ]);
      setItems(list);
      setUnread(countRes.count);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function markRead(id: string) {
    try {
      await notificationApi.markRead(id);
      setItems((rows) =>
        rows.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnread((c) => Math.max(0, c - 1));
    } catch (err) {
      if (err instanceof ApiClientError) return;
    }
  }

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-cardon-border text-lg hover:bg-cardon-light"
        aria-label="Thông báo"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-cardon-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold text-cardon-navy">Thông báo</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-cardon-blue hover:underline"
                onClick={() => {
                  void notificationApi.markAllRead().then(() => load());
                }}
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-cardon-gray">Chưa có thông báo</li>
            )}
            {items.map((n) => {
              const href = notificationLink(n);
              const content = (
                <>
                  <p className="font-medium text-cardon-navy">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-cardon-gray">{n.body}</p>
                  <p className="mt-1 text-[10px] text-cardon-gray">{formatTime(n.createdAt)}</p>
                </>
              );
              return (
                <li
                  key={n.id}
                  className={cn(
                    'border-b px-4 py-3 text-sm last:border-b-0',
                    !n.readAt && 'bg-blue-50/50',
                  )}
                >
                  {href ? (
                    <Link
                      href={href}
                      className="block hover:opacity-80"
                      onClick={() => {
                        void markRead(n.id);
                        setOpen(false);
                      }}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => void markRead(n.id)}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
