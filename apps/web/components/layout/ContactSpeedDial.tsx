'use client';

import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { useBarePath, useT } from '@/components/i18n/LocaleProvider';
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

/** Checkout hubs with the sticky mobile pay bar above the bottom nav. */
function isPurchaseSurface(pathname: string): boolean {
  return (
    pathname.startsWith('/the-game') ||
    pathname.startsWith('/the-dien-thoai') ||
    pathname.startsWith('/nap-cuoc') ||
    pathname.startsWith('/nap-data')
  );
}

/** eSIM product detail has its own bottom bar above the mobile nav. */
function isEsimDetailSurface(pathname: string): boolean {
  return /^\/esim\/esim-/.test(pathname);
}

function IconHeadset() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3a8 8 0 0 0-8 8v3a3 3 0 0 0 3 3h1v-6H6.1A5.9 5.9 0 0 1 12 5a5.9 5.9 0 0 1 5.9 6H16v6h1a3 3 0 0 0 3-3v-3a8 8 0 0 0-8-8zm-3 16h6v2H9v-2z"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"
      />
    </svg>
  );
}

function IconZalo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.5 5.5 3.8 7.2V22l3.5-1.9c.9.2 1.8.4 2.7.4 5.5 0 10-4.1 10-9.3S17.5 2 12 2zm4.4 11.8-1.4 1.4c-1.7 1.2-3.9-.3-5.3-1.7s-2.9-3.6-1.7-5.3l1.4-1.4c.3-.3.7-.3 1 0l1.5 1.5c.3.3.3.7 0 1l-.7.7c-.2.2-.2.4 0 .7.8 1.2 1.8 2.2 3 3 .2.2.5.2.7 0l.7-.7c.3-.3.7-.3 1 0l1.5 1.5c.2.3.2.7-.2 1z"
      />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .7-.2 1L6.6 10.8z"
      />
    </svg>
  );
}

function IconMessenger() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.5 2 2 6.2 2 11.4c0 2.9 1.4 5.5 3.7 7.2V22l3.4-1.9c.9.3 1.9.4 2.9.4 5.5 0 10-4.2 10-9.4S17.5 2 12 2zm1.1 12.6-2.5-2.7-4.9 2.7 5.4-5.7 2.6 2.7 4.8-2.7-5.4 5.7z"
      />
    </svg>
  );
}

const ACTION_ICON: Record<SpeedDialActionId, () => ReactElement> = {
  hotline: IconPhone,
  zalo: IconZalo,
  messenger: IconMessenger,
};

const ACTION_TONE: Record<SpeedDialActionId, string> = {
  hotline: 'text-cardon-orange',
  zalo: 'text-[#0068ff]',
  messenger: 'text-[#1877f2]',
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
  const t = useT();
  const label = action.id === 'hotline' ? t('contact.callNow') : action.label;
  const Icon = ACTION_ICON[action.id];
  return (
    <a
      href={action.href}
      target={action.external ? '_blank' : undefined}
      rel={action.external ? 'noopener noreferrer' : undefined}
      tabIndex={open ? 0 : -1}
      aria-label={label}
      title={label}
      onClick={onNavigate}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-full border border-cardon-border bg-white py-2 pl-2.5 pr-3 text-[13px] font-semibold text-cardon-navy shadow-card transition duration-200 ease-out',
        'hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardon-blue',
        open
          ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-2 scale-95 opacity-0',
        ACTION_TONE[action.id],
      )}
      style={{ transitionDelay: open ? `${index * 45}ms` : '0ms' }}
    >
      <Icon />
      <span className="text-cardon-navy">{label}</span>
    </a>
  );
}

export function ContactSpeedDial() {
  const pathname = useBarePath();
  const t = useT();
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
  const esimDetail = isEsimDetailSurface(pathname);

  return (
    <div
      ref={rootRef}
      className={cn(
        'fixed right-4 z-[60] flex flex-col items-end gap-2.5 md:right-8',
        esimDetail
          ? 'bottom-[calc(9.25rem+env(safe-area-inset-bottom))] md:bottom-8'
          : pathname === '/esim'
            ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 lg:bottom-8'
            : purchaseSurface
              ? /* Sit just above sticky pay bar (bottom 4.25rem + ~3.25rem bar + gap). */
                'bottom-[calc(8.25rem+env(safe-area-inset-bottom))] lg:bottom-8'
              : pathname === '/'
                ? 'bottom-[calc(6.75rem+env(safe-area-inset-bottom))] md:bottom-8'
                : 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-8',
      )}
    >
      <div id={listId} className="flex flex-col items-end gap-2" aria-hidden={!open}>
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
        aria-label={open ? t('support.close') : t('support.open')}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'grid h-[52px] w-[52px] place-items-center rounded-full bg-cardon-orange text-white shadow-[0_12px_28px_rgba(234,88,12,0.35)] transition',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardon-blue',
          open ? 'scale-95' : 'speed-dial-nudge hover:scale-105',
        )}
      >
        {open ? <IconClose /> : <IconHeadset />}
      </button>
    </div>
  );
}
