'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
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

const ACTION_ICON_SRC: Record<SpeedDialActionId, string> = {
  hotline: '/images/speed-dial/phone.png',
  zalo: '/images/speed-dial/zalo.png',
  messenger: '/images/speed-dial/facebook.png',
};

const MAIN_DIAL_SRC = '/images/speed-dial/dial.png';

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
        'relative block h-14 w-14 overflow-hidden rounded-full shadow-card transition duration-200 ease-out',
        'hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardon-blue',
        open
          ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-3 scale-90 opacity-0',
      )}
      style={{ transitionDelay: open ? `${index * 45}ms` : '0ms' }}
    >
      <Image
        src={ACTION_ICON_SRC[action.id]}
        alt=""
        width={56}
        height={56}
        quality={60}
        className="h-14 w-14 object-cover"
      />
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
        'fixed right-4 z-[60] flex flex-col items-end gap-3 md:right-8',
        esimDetail
          ? 'bottom-[calc(9.25rem+env(safe-area-inset-bottom))] md:bottom-8'
          : pathname === '/esim'
            ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 lg:bottom-8'
          : purchaseSurface
            ? 'bottom-[calc(12rem+env(safe-area-inset-bottom))] lg:bottom-8'
            : pathname === '/'
              ? 'bottom-[calc(6.75rem+env(safe-area-inset-bottom))] md:bottom-8'
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
        aria-label={open ? t('support.close') : t('support.open')}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative h-16 w-16 overflow-hidden rounded-full shadow-card-hover transition',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cardon-blue',
          open ? 'scale-95' : 'speed-dial-nudge hover:scale-105',
        )}
      >
        {open ? (
          <span className="absolute inset-0 flex items-center justify-center bg-cardon-navy text-white">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
        ) : (
          <Image
            src={MAIN_DIAL_SRC}
            alt=""
            width={64}
            height={64}
            quality={60}
            className="h-16 w-16 object-cover"
          />
        )}
      </button>
    </div>
  );
}
