'use client';

import { CopyButton } from '@/components/ui/CopyButton';
import { Button } from '@/components/ui/Button';

/** Mobile-first credential block: value always wraps; actions stay on-screen. */
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
    <div className="mt-3 space-y-3 text-sm">
      <div className="min-w-0 rounded-lg bg-cardon-light/50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-cardon-gray">Serial</p>
        <p className="mt-1 break-all font-mono text-xs font-semibold text-cardon-navy md:text-sm">
          {serial}
        </p>
        <div className="mt-2">
          <CopyButton value={serial} label="Copy serial" className="w-full sm:w-auto" />
        </div>
      </div>

      <div className="min-w-0 rounded-lg bg-cardon-light/50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-cardon-gray">Mã thẻ</p>
        <p className="mt-1 break-all font-mono text-xs font-semibold text-cardon-navy md:text-sm">
          {pin ?? pinMasked}
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          {!pin ? (
            <Button
              type="button"
              size="sm"
              onClick={onReveal}
              disabled={revealLoading}
              className="w-full sm:w-auto"
            >
              {revealLoading ? 'Đang tải...' : 'Xem mã'}
            </Button>
          ) : (
            <CopyButton value={pin} label="Copy PIN" className="w-full sm:w-auto" />
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {viewCountLabel ? <p className="text-xs text-cardon-gray">{viewCountLabel}</p> : null}
    </div>
  );
}
