'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
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
        fill
        sizes="56px"
        className="object-cover"
        priority={false}
      />
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
            fill
            sizes="64px"
            className="object-cover"
            priority
          />
        )}
      </button>
    </div>
  );
}
