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
  const sizeClass = compact ? 'h-9 w-9' : 'h-10 w-10';

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
          width={compact ? 36 : 40}
          height={compact ? 36 : 40}
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
        'relative flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-200',
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
      <span className="min-w-0 flex-1 pr-5">
        <p className="text-sm font-semibold leading-snug text-cardon-navy">
          {method.displayName}
        </p>
        {feeHint ? (
          <p className="mt-1 text-xs leading-snug text-cardon-gray">{feeHint}</p>
        ) : (
          <p className="mt-1 text-xs leading-snug text-emerald-700">Miễn phí giao dịch</p>
        )}
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
    <div className="flex flex-col gap-2">
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

export function SepayQrDisplay({
  paymentUrl,
  bankInfo,
}: {
  paymentUrl: string;
  bankInfo?: {
    bankCode?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
  } | null;
}) {
  const [error, setError] = useState(false);

  return (
    <div className="rounded-2xl border border-cardon-border bg-white p-5 text-center sm:p-8">
      <p className="text-base font-semibold text-cardon-navy sm:text-lg">Quét mã QR để thanh toán</p>
      <p className="mt-1 text-sm text-cardon-gray">
        Chuyển đúng số tiền. Nội dung / tài khoản VA đã gắn với đơn hàng.
      </p>
      <div className="relative mx-auto mt-5 aspect-square w-full max-w-[280px] sm:max-w-[320px]">
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
          <p className="flex h-full items-center justify-center text-sm text-red-600">
            Không tải được QR.
          </p>
        )}
      </div>
      {bankInfo?.accountNumber ? (
        <div className="mt-5 space-y-1.5 rounded-xl bg-cardon-light px-4 py-3 text-left text-sm sm:px-5 sm:py-4">
          {bankInfo.bankName || bankInfo.bankCode ? (
            <p>
              <span className="text-cardon-gray">Ngân hàng: </span>
              <span className="font-semibold text-cardon-navy">
                {bankInfo.bankName || bankInfo.bankCode}
              </span>
            </p>
          ) : null}
          <p>
            <span className="text-cardon-gray">Số TK VA: </span>
            <span className="font-semibold text-cardon-navy">{bankInfo.accountNumber}</span>
          </p>
          {bankInfo.accountName ? (
            <p>
              <span className="text-cardon-gray">Chủ TK: </span>
              <span className="font-semibold text-cardon-navy">{bankInfo.accountName}</span>
            </p>
          ) : null}
        </div>
      ) : null}
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
