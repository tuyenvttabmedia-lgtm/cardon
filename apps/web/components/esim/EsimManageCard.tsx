'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EsimInstallPanel } from '@/components/esim/EsimInstallPanel';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import {
  esimCheckoutErrorMessage,
  fetchPublicPaymentMethods,
  preferEsimVnMethodCode,
  resolveEsimVnPayResult,
} from '@/lib/esim-vn-checkout';
import { orderedSepayCheckoutEntries } from '@/lib/sepay-checkout-form';
import { generateIdempotencyKey } from '@/lib/utils';
import { formatVnd } from '@/lib/utils';
import { accountApi, paymentApi } from '@/services/api-client';
import type { EsimDelivery, EsimTopupPackageOffer, EsimUsageSnapshot } from '@/types/api';

function formatMb(mb: number | null | undefined): string {
  if (mb == null || !Number.isFinite(mb)) return '—';
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatExpiry(value: string | null, locale: string): string {
  if (!value) return '—';
  const parsed = Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed));
}

export function EsimManageCard({ esim }: { esim: EsimDelivery }) {
  const t = useT();
  const { locale } = useLocale();
  const orderId = esim.orderId;
  const [usage, setUsage] = useState<EsimUsageSnapshot | null>(null);
  const [usageError, setUsageError] = useState('');
  const [usageLoading, setUsageLoading] = useState(false);
  const [showInstall, setShowInstall] = useState(esim.kind !== 'ready');
  const [showTopup, setShowTopup] = useState(false);
  const [packages, setPackages] = useState<EsimTopupPackageOffer[]>([]);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const installRef = useRef<HTMLDivElement>(null);
  const scrollInstallOnOpen = useRef(false);

  const loadUsage = useCallback(async () => {
    if (!orderId || !esim.hasIccid) return;
    setUsageLoading(true);
    setUsageError('');
    try {
      const payload = await accountApi.getEsimUsage(orderId);
      setUsage(payload.usage);
    } catch {
      setUsageError(t('esim.usageFail'));
    } finally {
      setUsageLoading(false);
    }
  }, [orderId, esim.hasIccid, t]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    if (!showInstall || !scrollInstallOnOpen.current) return;
    scrollInstallOnOpen.current = false;
    const node = installRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showInstall]);

  async function openTopup() {
    if (!orderId) return;
    setShowTopup(true);
    setTopupLoading(true);
    setTopupError('');
    try {
      const payload = await accountApi.listEsimTopups(orderId);
      setPackages(payload.packages);
    } catch (error) {
      setTopupError(esimCheckoutErrorMessage(error));
      setPackages([]);
    } finally {
      setTopupLoading(false);
    }
  }

  async function payTopup(pack: EsimTopupPackageOffer) {
    if (!orderId || payingId) return;
    setPayingId(pack.providerPackageId);
    setTopupError('');
    try {
      const methods = await fetchPublicPaymentMethods();
      const paymentMethodCode = preferEsimVnMethodCode(methods);
      if (!paymentMethodCode) {
        throw new Error('Thanh toán tạm thời chưa khả dụng.');
      }
      const order = await accountApi.createEsimTopup(orderId, {
        packageId: pack.providerPackageId,
        paymentMethodCode,
      });
      const method = methods.find((row) => row.methodCode === paymentMethodCode);
      const pay = await paymentApi.create(
        { orderId: order.id, gateway: method?.gatewayCode ?? 'SEPAY' },
        generateIdempotencyKey(),
      );
      const result = resolveEsimVnPayResult(pay, order);
      if (result.kind === 'qr') {
        window.location.assign(result.path);
        return;
      }
      // SePay rejects scrambled jsonb key order with "Yêu cầu không hợp lệ".
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = result.checkoutUrl;
      form.style.display = 'none';
      for (const [key, value] of orderedSepayCheckoutEntries(result.checkoutFormFields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      setTopupError(esimCheckoutErrorMessage(error));
    } finally {
      setPayingId(null);
    }
  }

  const statusLabel = usage
    ? locale === 'en'
      ? usage.statusLabelEn
      : usage.statusLabelVi
    : null;
  const remainingPct = usage?.remainingPercent;
  const showTopupCta = Boolean(esim.topupSupported || usage?.canTopupHint);

  return (
    <article className="overflow-hidden rounded-2xl border border-cardon-border bg-white shadow-card">
      <header className="border-b border-cardon-border/70 bg-gradient-to-br from-cardon-light/80 to-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-cardon-navy sm:text-lg">
              {esim.destination}
            </h2>
            <p className="mt-0.5 text-sm text-cardon-gray">
              {esim.packageName ?? esim.packageSpec?.title ?? t('esim.orderShort')}
              {esim.orderCode ? ` · ${esim.orderCode}` : null}
            </p>
          </div>
          {statusLabel ? (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                usage?.expiringSoon || usage?.status === 'EXPIRED' || usage?.status === 'FINISHED'
                  ? 'bg-red-50 text-red-700'
                  : usage?.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              {statusLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-4 space-y-3">
          {usageLoading && !usage ? (
            <p className="text-sm text-cardon-gray">{t('esim.usageLoading')}</p>
          ) : null}
          {usageError ? <p className="text-sm text-red-600">{usageError}</p> : null}

          {usage?.isUnlimited ? (
            <p className="text-sm font-medium text-cardon-navy">{t('esim.unlimitedData')}</p>
          ) : null}

          {remainingPct != null ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-cardon-gray">
                <span>
                  {t('esim.dataLeft')}:{' '}
                  <strong className="text-cardon-navy">
                    {formatMb(usage?.remainingMb)} ({remainingPct}%)
                  </strong>
                </span>
                <span>
                  {t('esim.dataUsed')}: {formatMb(usage?.usedMb)} ({usage?.usedPercent ?? 0}%)
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-cardon-blue transition-[width] duration-500"
                  style={{ width: `${Math.max(2, remainingPct)}%` }}
                />
              </div>
            </div>
          ) : null}

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-cardon-border/60">
              <dt className="text-[11px] uppercase tracking-wide text-cardon-gray">
                {t('esim.expiresOn')}
              </dt>
              <dd className="mt-0.5 font-medium text-cardon-navy">
                {formatExpiry(usage?.expiredAt ?? null, locale)}
              </dd>
            </div>
            <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-cardon-border/60">
              <dt className="text-[11px] uppercase tracking-wide text-cardon-gray">
                {t('esim.iccid')}
              </dt>
              <dd className="mt-0.5 font-mono text-[13px] font-medium text-cardon-navy">
                {esim.iccidMasked ?? '—'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadUsage()}
            disabled={usageLoading || !esim.hasIccid}
            className="rounded-lg border border-cardon-border px-3 py-2 text-sm font-semibold text-cardon-navy disabled:opacity-50"
          >
            {t('esim.refreshUsage')}
          </button>
          {showTopupCta ? (
            <button
              type="button"
              onClick={() => void openTopup()}
              className="rounded-lg bg-cardon-navy px-3 py-2 text-sm font-semibold text-white"
            >
              {t('esim.topup')}
            </button>
          ) : null}
          {esim.kind === 'ready' ? (
            <button
              type="button"
              onClick={() => {
                setShowInstall((open) => {
                  if (open) return false;
                  scrollInstallOnOpen.current = true;
                  return true;
                });
              }}
              className="rounded-lg border border-cardon-border px-3 py-2 text-sm font-semibold text-cardon-navy"
            >
              {t('esim.installToggle')}
            </button>
          ) : null}
        </div>
      </header>

      {showTopup ? (
        <div className="border-b border-cardon-border px-4 py-4 sm:px-5">
          <h3 className="text-sm font-bold text-cardon-navy">{t('esim.topup')}</h3>
          <p className="mt-1 text-xs text-cardon-gray">{t('esim.topupLead')}</p>
          {topupLoading ? <p className="mt-3 text-sm text-cardon-gray">{t('esim.usageLoading')}</p> : null}
          {topupError ? <p className="mt-3 text-sm text-red-600">{topupError}</p> : null}
          {!topupLoading && packages.length === 0 ? (
            <p className="mt-3 text-sm text-cardon-gray">{t('esim.topupEmpty')}</p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {packages.map((pack) => (
              <li
                key={pack.providerPackageId}
                className="flex flex-col gap-2 rounded-xl border border-cardon-border/80 bg-cardon-light/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-cardon-navy">{pack.title}</p>
                  <p className="text-xs text-cardon-gray">
                    {[pack.dataLabel, pack.validityLabel].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 text-sm font-bold text-cardon-navy">
                    {formatVnd(pack.sellPriceVnd)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={payingId != null}
                  onClick={() => void payTopup(pack)}
                  className="shrink-0 rounded-lg bg-cardon-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {payingId === pack.providerPackageId ? t('esim.topupBusy') : t('esim.topupPay')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showInstall || esim.kind !== 'ready' ? (
        <div ref={installRef} id={`esim-install-${orderId}`} className="scroll-mt-20 px-2 pb-2 sm:px-3 sm:pb-3">
          <EsimInstallPanel esim={esim} showAccountLink={false} compact />
        </div>
      ) : null}
    </article>
  );
}
