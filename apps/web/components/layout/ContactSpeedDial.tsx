'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import {
  buildSpeedDialActions,
  type SpeedDialAction,
  type SpeedDialActionId,
} from '@/lib/contact-channels';
import { cn } from '@/lib/utils';

function shouldHideSpeedDial(pathname: string): boolean {
  if (pathname.startsWith('/checkout')) return true;
  if (pathname.startsWith('/bao-tri')) return true;
  return false;
}

/** Purchase surfaces may show a sticky pay bar above the mobile bottom nav. */
function isPurchaseSurface(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/nap-cuoc') ||
    pathname.startsWith('/nap-data')
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.6 3.2c.5-.5 1.3-.6 1.9-.2l2.3 1.5c.5.3.7.9.5 1.5l-.8 2.3c-.1.4 0 .8.3 1.1l2.4 2.4c.3.3.7.4 1.1.3l2.3-.8c.5-.2 1.1 0 1.5.5l1.5 2.3c.4.6.3 1.4-.2 1.9l-1.3 1.3c-.6.6-1.4.9-2.2.8-2-.3-4.5-1.7-7-4.2s-3.9-5-4.2-7c-.1-.8.2-1.6.8-2.2L6.6 3.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ZaloIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8 15.5V8.5h2.2c1.5 0 2.4.8 2.4 2.1 0 1.2-.8 2-2.1 2.1H9.5v2.8H8Zm1.5-4.2h.6c.6 0 1-.3 1-.9s-.4-.9-1-.9h-.6v1.8ZM14.2 15.5l2.6-7h1.7l-2.6 7h-1.7Zm-1.1 0V8.5h1.5v7h-1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5c-4.6 0-8.3 3.4-8.3 7.6 0 2.4 1.2 4.5 3.1 5.9v2.5l2.3-1.3c.9.3 1.9.4 2.9.4 4.6 0 8.3-3.4 8.3-7.5S16.6 3.5 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="m8.2 12.4 2.6-2.8 2.1 2.1 3-2.1-2.6 2.8-2.1-2.1-3 2.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-3.8 2.7c-.5.3-1.2-.1-1.2-.7V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 7l10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ACTION_ICON: Record<SpeedDialActionId, (props: { className?: string }) => ReactNode> = {
  hotline: PhoneIcon,
  zalo: ZaloIcon,
  messenger: MessengerIcon,
};

const ACTION_TONE: Record<SpeedDialActionId, string> = {
  hotline: 'bg-cardon-blue text-white',
  zalo: 'bg-[#0068FF] text-white',
  messenger: 'bg-[#0084FF] text-white',
};

function SpeedDialActionButton({
  action,
  open,
  index,
  onNavigate,
}: {
  action: SpeedDialAction;
  open: boolean;
  index: number;
  onNavigate: () => void;
}) {
  const Icon = ACTION_ICON[action.id];
  return (
    <a
      href={action.href}
      target={action.external ? '_blank' : undefined}
      rel={action.external ? 'noopener noreferrer' : undefined}
      tabIndex={open ? 0 : -1}
      onClick={onNavigate}
      className={cn(
        'group flex items-center justify-end gap-2 transition duration-200 ease-out',
        open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
      )}
      style={{ transitionDelay: open ? `${index * 40}ms` : '0ms' }}
    >
      <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-cardon-navy shadow-card ring-1 ring-cardon-border">
        {action.label}
      </span>
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full shadow-card transition group-hover:scale-105',
          ACTION_TONE[action.id],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
    </a>
  );
}

export function ContactSpeedDial() {
  const pathname = usePathname();
  const { contactChannels } = useThemeSettings();
  const actions = buildSpeedDialActions(contactChannels);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  if (shouldHideSpeedDial(pathname) || actions.length === 0) {
    return null;
  }

  const purchaseSurface = isPurchaseSurface(pathname);

  return (
    <div
      ref={rootRef}
      className={cn(
        'fixed right-4 z-[60] flex flex-col items-end gap-3 md:right-8',
        purchaseSurface
          ? 'bottom-[calc(9.75rem+env(safe-area-inset-bottom))] md:bottom-8'
          : 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-8',
      )}
    >
      <div
        id={listId}
        className="flex flex-col items-end gap-3"
        aria-hidden={!open}
      >
        {actions.map((action, index) => (
          <SpeedDialActionButton
            key={action.id}
            action={action}
            open={open}
            index={index}
            onNavigate={() => setOpen(false)}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label={open ? 'Đóng hỗ trợ nhanh' : 'Mở hỗ trợ nhanh'}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full bg-cardon-blue text-white shadow-card-hover transition',
          'hover:bg-cardon-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardon-blue',
          open && 'rotate-90 bg-cardon-navy',
        )}
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <ChatIcon className="h-6 w-6" />}
      </button>
    </div>
  );
}
