'use client';

import Image from 'next/image';
import { useState } from 'react';
import { VietQrImage, canBuildVietQrImage } from '@/components/checkout/VietQrImage';
import { useT } from '@/components/i18n/LocaleProvider';
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
  const t = useT();

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
          <p className="mt-1 text-xs leading-snug text-emerald-700">{t('pay.free')}</p>
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
  const t = useT();
  const enabled = methods.filter((m) => m.enabled);

  if (!enabled.length) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t('checkout.noMethods')}
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
  transferContent,
  amount,
}: {
  paymentUrl?: string | null;
  bankInfo?: {
    bankCode?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
  } | null;
  transferContent?: string | null;
  /** Order amount — required to generate NAPAS VietQR when MegaPay has no image URL. */
  amount?: string | number | null;
}) {
  const [error, setError] = useState(false);
  const t = useT();
  const hasQrImage = Boolean(paymentUrl?.trim());
  const hasBank = Boolean(bankInfo?.accountNumber);
  const vietQrInput =
    !hasQrImage && bankInfo?.accountNumber && amount != null && transferContent
      ? {
          accountNumber: bankInfo.accountNumber,
          bankCode: bankInfo.bankCode,
          bankName: bankInfo.bankName,
          amount,
          addInfo: transferContent,
        }
      : null;
  const canGenerateVietQr = Boolean(vietQrInput && canBuildVietQrImage(vietQrInput));
  const showQrPanel = hasQrImage || canGenerateVietQr;

  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-cardon-border bg-white p-4 text-center shadow-card sm:p-6 lg:p-8">
      <p className="text-base font-semibold text-cardon-navy sm:text-lg">
        {showQrPanel ? t('pay.scanTitle') : t('pay.transferTitle')}
      </p>
      <p className="mt-1 text-xs text-cardon-gray sm:text-sm">
        {showQrPanel ? t('pay.scanHint') : t('pay.transferHint')}
      </p>
      {hasQrImage ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-4 sm:py-5">
          <div className="relative aspect-square w-full max-w-[240px] sm:max-w-[300px] lg:max-w-[360px]">
            {!error ? (
              <Image
                src={paymentUrl!}
                alt={t('pay.scanTitle')}
                fill
                className="object-contain"
                unoptimized
                onError={() => setError(true)}
              />
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-red-600">
                {t('pay.qrMissing')}
              </p>
            )}
          </div>
        </div>
      ) : canGenerateVietQr && vietQrInput ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-4 sm:py-5">
          <VietQrImage {...vietQrInput} />
          <p className="mt-2 px-2 text-xs text-cardon-gray">{t('pay.vietQrGenerated')}</p>
        </div>
      ) : (
        <div className="flex min-h-[8rem] flex-1 items-center justify-center px-2 py-6">
          <p className="text-sm text-cardon-gray">{t('pay.transferOnly')}</p>
        </div>
      )}
      {hasBank ? (
        <div className="mt-auto space-y-1.5 rounded-xl bg-cardon-light px-3.5 py-3 text-left text-sm sm:px-5 sm:py-4">
          {bankInfo?.bankName || bankInfo?.bankCode ? (
            <p>
              <span className="text-cardon-gray">{t('result.bank')}: </span>
              <span className="font-semibold text-cardon-navy">
                {bankInfo?.bankName || bankInfo?.bankCode}
              </span>
            </p>
          ) : null}
          <p>
            <span className="text-cardon-gray">{t('pay.va')}: </span>
            <span className="break-all font-semibold text-cardon-navy">
              {bankInfo?.accountNumber}
            </span>
          </p>
          {bankInfo?.accountName ? (
            <p>
              <span className="text-cardon-gray">{t('result.holder')}: </span>
              <span className="font-semibold text-cardon-navy">{bankInfo.accountName}</span>
            </p>
          ) : null}
          {transferContent ? (
            <p>
              <span className="text-cardon-gray">{t('result.note')}: </span>
              <span className="break-all font-semibold text-cardon-navy">{transferContent}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PaymentMethodsEmpty() {
  const t = useT();
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {t('checkout.noMethods')}
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
