'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Traps focus inside `ref`, closes on Escape, restores focus to the opener and
 * locks background scroll while `open`.
 */
export function useDismissableLayer<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement as HTMLElement | null;
    const container = ref.current;
    const preferred = container?.querySelector<HTMLElement>('[data-autofocus]');
    const firstFocusable = container ? focusableWithin(container)[0] : null;
    (preferred ?? firstFocusable ?? container)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;

      const focusables = focusableWithin(ref.current);
      if (focusables.length === 0) {
        event.preventDefault();
        ref.current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === ref.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

const DIALOG_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  className,
  panelClassName,
  closeOnOverlayClick = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: keyof typeof DIALOG_SIZES;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  closeOnOverlayClick?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useDismissableLayer<HTMLDivElement>(open, onClose);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm',
        className,
      )}
      onMouseDown={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel-hover focus:outline-none',
          DIALOG_SIZES[size],
          panelClassName,
        )}
      >
        <div className="flex items-start gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-slate-950">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            )}
          </div>
          <DialogCloseButton onClose={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  side = 'left',
  children,
  panelClassName,
  withHeader = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  side?: 'left' | 'right';
  children: ReactNode;
  panelClassName?: string;
  /** Renders the standard title bar with a close button. */
  withHeader?: boolean;
}) {
  const titleId = useId();
  const ref = useDismissableLayer<HTMLDivElement>(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex w-72 max-w-[85vw] flex-col shadow-2xl focus:outline-none',
          side === 'left' ? 'left-0' : 'right-0',
          panelClassName,
        )}
      >
        {withHeader ? (
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h2 id={titleId} className="text-base font-semibold text-slate-950">
              {title}
            </h2>
            <DialogCloseButton onClose={onClose} />
          </div>
        ) : (
          <span id={titleId} className="sr-only">
            {title}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

/** Right-hand detail panel used by audit/activity/statement views. */
export function DetailDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      side="right"
      withHeader
      panelClassName="w-full max-w-lg border-l border-slate-200 bg-white"
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
    </Drawer>
  );
}

export function DialogCloseButton({
  onClose,
  label = 'Đóng',
  className,
}: {
  onClose: () => void;
  label?: string;
  className?: string;
}) {
  const handleClose = useCallback(() => onClose(), [onClose]);
  return (
    <button
      type="button"
      onClick={handleClose}
      aria-label={label}
      className={cn(
        'shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700',
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="h-4 w-4"
      >
        <path d="M5 5l10 10M15 5L5 15" />
      </svg>
    </button>
  );
}
