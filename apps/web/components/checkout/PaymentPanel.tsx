'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  formatPaymentFeeHint,
  methodIcon,
  type PublicPaymentMethod,
} from '@/lib/payment-methods';

function PaymentMethodLogo({ method, compact }: { method: PublicPaymentMethod; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = method.logoUrl ?? method.iconUrl;
  const sizeClass = compact ? 'h-8 w-8' : 'h-10 w-10';

  if (src && !failed) {
    return (
      <span
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white',
          sizeClass,
        )}
      >
        <Image
          src={src}
          alt=""
          width={compact ? 32 : 40}
          height={compact ? 32 : 40}
          className="object-contain"
          unoptimized
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-cardon-light text-lg',
        sizeClass,
      )}
    >
      {methodIcon(method.methodCode)}
    </span>
  );
}

function CompactPaymentMethodCard({
  method,
  selected,
  onSelect,
}: {
  method: PublicPaymentMethod;
  selected: boolean;
  onSelect: () => void;
}) {
  const feeHint = formatPaymentFeeHint(method.percentageFee, method.fixedFee);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex h-[54px] items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 sm:h-[58px]',
        selected
          ? 'border-cardon-blue bg-blue-50'
          : 'border-gray-200 bg-white hover:border-cardon-blue/40 hover:bg-blue-50/40',
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-cardon-blue text-[9px] text-white">
          ✓
        </span>
      )}
      <PaymentMethodLogo method={method} compact />
      <span className="min-w-0 flex-1 pr-3">
        <p className="truncate text-sm font-semibold leading-tight text-cardon-navy">
          {method.displayName}
        </p>
        {feeHint ? (
          <p className="mt-0.5 truncate text-xs leading-tight text-cardon-gray">{feeHint}</p>
        ) : null}
      </span>
    </button>
  );
}

export function PaymentMethodPicker({
  methods,
  value,
  onChange,
}: {
  methods: PublicPaymentMethod[];
  value: string | null;
  onChange: (methodCode: string) => void;
}) {
  const enabled = methods.filter((m) => m.enabled);

  if (!enabled.length) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Hiện chưa có phương thức thanh toán khả dụng
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-2">
      {enabled.map((method) => (
        <CompactPaymentMethodCard
          key={method.methodCode}
          method={method}
          selected={value === method.methodCode}
          onSelect={() => onChange(method.methodCode)}
        />
      ))}
    </div>
  );
}

export function SepayQrDisplay({ paymentUrl }: { paymentUrl: string }) {
  const [error, setError] = useState(false);

  return (
    <div className="rounded-2xl border border-cardon-border bg-white p-6 text-center">
      <p className="font-semibold text-cardon-navy">Quét mã QR để thanh toán</p>
      <p className="mt-1 text-sm text-cardon-gray">Nội dung chuyển khoản đã bao gồm mã đơn</p>
      <div className="relative mx-auto mt-4 h-64 w-64">
        {!error ? (
          <Image
            src={paymentUrl}
            alt="Mã QR chuyển khoản"
            fill
            className="object-contain"
            unoptimized
            onError={() => setError(true)}
          />
        ) : (
          <p className="text-sm text-red-600">Không tải được QR. Mở link bên dưới.</p>
        )}
      </div>
      <a
        href={paymentUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex rounded-xl border border-cardon-border px-4 py-2 text-sm font-semibold text-cardon-navy hover:bg-cardon-light"
      >
        Mở trang thanh toán
      </a>
    </div>
  );
}

export function PaymentMethodsEmpty() {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Hiện chưa có phương thức thanh toán khả dụng
    </p>
  );
}

export function MobilePaymentMethodButton({
  method,
  selected,
  onSelect,
}: {
  method: PublicPaymentMethod;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <CompactPaymentMethodCard method={method} selected={selected} onSelect={onSelect} />
  );
}
