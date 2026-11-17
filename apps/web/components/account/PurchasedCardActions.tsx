'use client';

import { CopyButton } from '@/components/ui/CopyButton';
import { Button } from '@/components/ui/Button';

/** Compact credential rows: value + action on one line so mobile lists stay short. */
export function PurchasedCardActions({
  serial,
  pin,
  pinMasked = '************',
  revealLoading,
  onReveal,
  viewCountLabel,
  error,
}: {
  serial: string;
  pin?: string;
  pinMasked?: string;
  revealLoading?: boolean;
  onReveal: () => void;
  viewCountLabel?: string | null;
  error?: string | null;
}) {
  return (
    <div className="mt-2.5 space-y-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-cardon-gray">Serial</p>
          <p className="truncate font-mono text-xs font-semibold text-cardon-navy">{serial}</p>
        </div>
        <CopyButton value={serial} label="Copy" className="shrink-0 px-2.5 py-1 text-xs" />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-cardon-gray">Mã thẻ</p>
          <p className="truncate font-mono text-xs font-semibold text-cardon-navy">
            {pin ?? pinMasked}
          </p>
        </div>
        {!pin ? (
          <Button
            type="button"
            size="sm"
            onClick={onReveal}
            disabled={revealLoading}
            className="shrink-0 px-2.5 py-1 text-xs"
          >
            {revealLoading ? '…' : 'Xem mã'}
          </Button>
        ) : (
          <CopyButton value={pin} label="Copy" className="shrink-0 px-2.5 py-1 text-xs" />
        )}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {viewCountLabel ? <p className="text-[11px] text-cardon-gray">{viewCountLabel}</p> : null}
    </div>
  );
}
