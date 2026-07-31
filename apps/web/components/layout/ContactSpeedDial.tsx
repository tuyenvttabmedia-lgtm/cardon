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

/** Filled phone — sized to dominate the circle. */
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.05 3.4c.42-.42 1.1-.5 1.62-.2l2.05 1.2a1.35 1.35 0 0 1 .62 1.55l-.72 2.35a1.1 1.1 0 0 0 .25.98l2.55 2.55c.27.27.7.35.98.25l2.35-.72a1.35 1.35 0 0 1 1.55.62l1.2 2.05c.3.52.22 1.2-.2 1.62l-1.2 1.2c-.7.7-1.68 1.05-2.65.9-2.35-.35-5.2-2-8.05-4.85S3.75 9.3 3.4 6.95c-.15-.97.2-1.95.9-2.65l1.75-1.9Z" />
    </svg>
  );
}

/**
 * Zalo brand mark: blue speech bubble + white wordmark.
 * (Official-looking mark used by chat widgets — not a generic "Z" glyph.)
 */
function ZaloIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#0068FF"
        d="M24.1 4C13.55 4 5 11.85 5 21.55c0 5.95 3.35 11.2 8.5 14.45-.25 1.55-1.05 4.55-1.2 5.3-.2.95.35 1.25 1.1.75.6-.4 3.85-2.55 5.5-3.65 1.6.35 3.3.55 5.05.55 10.55 0 19.1-7.85 19.1-17.4C43.05 11.85 34.55 4 24.1 4Z"
      />
      <path
        fill="#fff"
        d="M14.2 29.2V16.4h4.15c2.85 0 4.55 1.45 4.55 3.85 0 2.25-1.5 3.7-3.95 3.85h-2.2v5.1H14.2Zm2.55-7.45h1.25c1.2 0 1.9-.6 1.9-1.65s-.7-1.65-1.9-1.65h-1.25v3.3Zm8.35 7.45V16.4h2.55l3.55 8.35h.1l-.1-8.35h2.5V29.2h-2.55l-3.55-8.4h-.1l.1 8.4h-2.5Z"
      />
    </svg>
  );
}

/** Facebook "f" mark on brand blue. */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14.5 8.5V6.85c0-.7.15-1.1 1.15-1.1H17V3h-2.35C11.9 3 11 4.55 11 6.7V8.5H9v2.7h2V21h3.5V11.2h2.35l.35-2.7H14.5Z" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5.5 4.25A2.75 2.75 0 0 1 8.25 1.5h7.5A2.75 2.75 0 0 1 18.5 4.25v7a2.75 2.75 0 0 1-2.75 2.75h-3.35l-3.55 2.85a.9.9 0 0 1-1.45-.72v-2.13H8.25A2.75 2.75 0 0 1 5.5 11.25v-7Z" />
      <circle cx="9.2" cy="7.75" r="1.05" fill="#005BEA" />
      <circle cx="12" cy="7.75" r="1.05" fill="#005BEA" />
      <circle cx="14.8" cy="7.75" r="1.05" fill="#005BEA" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ACTION_ICON: Record<SpeedDialActionId, (props: { className?: string }) => ReactNode> = {
  hotline: PhoneIcon,
  zalo: ZaloIcon,
  messenger: FacebookIcon,
};

const ACTION_TONE: Record<SpeedDialActionId, string> = {
  hotline: 'bg-cardon-blue text-white',
  zalo: 'bg-white text-[#0068FF] ring-1 ring-[#0068FF]/20',
  messenger: 'bg-[#1877F2] text-white',
};

/** Zalo logo already includes its blue bubble — render nearly full-bleed. */
const ACTION_ICON_SIZE: Record<SpeedDialActionId, string> = {
  hotline: 'h-7 w-7',
  zalo: 'h-11 w-11',
  messenger: 'h-7 w-7',
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
      aria-label={action.label}
      title={action.label}
      onClick={onNavigate}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full shadow-card transition duration-200 ease-out',
        'hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardon-blue',
        ACTION_TONE[action.id],
        open
          ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-3 scale-90 opacity-0',
      )}
      style={{ transitionDelay: open ? `${index * 45}ms` : '0ms' }}
    >
      <Icon className={ACTION_ICON_SIZE[action.id]} />
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
      <div id={listId} className="flex flex-col items-end gap-3" aria-hidden={!open}>
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
          open ? 'rotate-90 bg-cardon-navy' : 'speed-dial-nudge',
        )}
      >
        {open ? <CloseIcon className="h-7 w-7" /> : <ChatIcon className="h-8 w-8" />}
      </button>
    </div>
  );
}
