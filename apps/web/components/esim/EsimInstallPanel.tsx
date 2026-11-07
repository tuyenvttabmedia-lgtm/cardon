'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { EsimInstallGuide } from '@/components/esim/EsimInstallGuide';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { ACCOUNT_PATHS } from '@/lib/account-routes';
import {
  applyRevealForOrder,
  retainRevealAfterMetadataPoll,
  revealStateForOrder,
} from '@/lib/esim-reveal-state';
import { orderApi } from '@/services/api-client';
import type { EsimDelivery, EsimInstallReveal, EsimPackageSpec } from '@/types/api';

export function EsimInstallPanel({
  esim,
  compact = false,
  showAccountLink = true,
  guestEmail,
}: {
  esim: EsimDelivery;
  compact?: boolean;
  showAccountLink?: boolean;
  guestEmail?: string;
}) {
  const t = useT();
  if (esim.kind === 'none') return null;

  if (esim.kind === 'waiting') {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:p-6">
        <h2 className="text-base font-bold">{t('esim.fetching')}</h2>
        <p className="mt-2 leading-relaxed">{esim.notice}</p>
        {esim.orderCode ? (
          <p className="mt-2 text-xs text-amber-800">
            {t('esim.orderShort')} {esim.orderCode}
          </p>
        ) : null}
        <PackageSpecBlock spec={esim.packageSpec} />
      </section>
    );
  }

  if (esim.kind === 'stuck') {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 sm:p-6">
        <h2 className="text-base font-bold">{t('esim.noCode')}</h2>
        <p className="mt-2 leading-relaxed">{esim.notice}</p>
        {esim.orderCode ? (
          <p className="mt-2 font-semibold">
            {t('esim.orderCode')}: {esim.orderCode}
          </p>
        ) : null}
        <PackageSpecBlock spec={esim.packageSpec} />
        <Link href={ACCOUNT_PATHS.support} className="mt-3 inline-block font-semibold underline">
          {t('nav.help')}
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-cardon-navy">
            {t('esim.installTitle')} {esim.destination}
          </h2>
          {esim.packageName ? <p className="mt-1 text-sm text-cardon-gray">{esim.packageName}</p> : null}
        </div>
        {esim.testData ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            {t('esim.mockBadge')}
          </span>
        ) : esim.sandboxAccount ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            {t('esim.sandboxBadge')}
          </span>
        ) : null}
      </div>
      {esim.notice ? <p className="mt-2 text-sm text-cardon-gray">{esim.notice}</p> : null}
      <PackageSpecBlock spec={esim.packageSpec} />

      <ReadyActions esim={esim} guestEmail={guestEmail} />

      {compact || esim.testData ? null : (
        <div className="mt-6">
          <EsimInstallGuide country={esim.destination} />
        </div>
      )}

      {showAccountLink ? (
        <Link
          href={ACCOUNT_PATHS.esim}
          className="mt-4 inline-block text-sm font-semibold text-cardon-blue hover:underline"
        >
          {t('esim.viewAccount')}
        </Link>
      ) : null}
    </section>
  );
}

function PackageSpecBlock({ spec }: { spec?: EsimPackageSpec | null }) {
  const t = useT();
  if (!spec) return null;
  return (
    <div className="mt-3 rounded-xl bg-cardon-light p-3 text-sm text-cardon-navy">
      <p className="font-semibold">{spec.title ?? t('esim.package')}</p>
      <ul className="mt-1 space-y-0.5 text-cardon-gray">
        {spec.dataAllowanceLabel ? (
          <li>
            {t('esim.data')}: {spec.dataAllowanceLabel}
          </li>
        ) : null}
        {spec.validityLabel ? (
          <li>
            {t('esim.duration')}: {spec.validityLabel}
          </li>
        ) : null}
        {spec.activationLabel ? (
          <li>
            {t('esim.activate')}: {spec.activationLabel}
          </li>
        ) : null}
        {spec.fairUsagePolicy ? <li>{spec.fairUsagePolicy}</li> : null}
      </ul>
      <p className="mt-2 text-xs text-cardon-gray">{spec.notice}</p>
    </div>
  );
}

function ReadyActions({
  esim,
  guestEmail,
}: {
  esim: EsimDelivery;
  guestEmail?: string;
}) {
  const [revealed, setRevealed] = useState<EsimInstallReveal | null>(null);
  const [boundOrderId, setBoundOrderId] = useState(esim.orderId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();
  const { locale } = useLocale();
  const orderId = esim.orderId;
  const orderIdRef = useRef(orderId);
  orderIdRef.current = orderId;
  const aligned = revealStateForOrder(boundOrderId, orderId, revealed, null);
  if (aligned.boundOrderId !== boundOrderId) {
    setBoundOrderId(aligned.boundOrderId);
    setRevealed(aligned.value);
    setBusy(false);
    setError(null);
    setCopied(false);
  }
  const visibleReveal = retainRevealAfterMetadataPoll(aligned.value, {
    installSecret: esim.installSecret,
    qrSvg: esim.qrSvg,
    appleSetupUrl: esim.appleSetupUrl,
  });

  useEffect(() => {
    return () => {
      setRevealed(null);
    };
  }, []);

  async function reveal() {
    const requested = orderId;
    if (!requested || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await orderApi.revealEsim(requested, guestEmail);
      const next = applyRevealForOrder(requested, orderIdRef.current, payload);
      if (next) setRevealed(next);
    } catch (err) {
      if (orderIdRef.current !== requested) return;
      setError(customerFacingError(locale, err instanceof Error ? err : new Error(t('esim.openFail'))));
    } finally {
      if (orderIdRef.current === requested) setBusy(false);
    }
  }

  function hide() {
    setRevealed(null);
    setCopied(false);
    setError(null);
  }

  async function copy() {
    if (!visibleReveal?.installSecret) return;
    try {
      await navigator.clipboard.writeText(visibleReveal.installSecret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const secret = visibleReveal?.installSecret ?? '';

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-[192px_1fr]">
      {visibleReveal?.qrSvg ? (
        <div
          className="mx-auto h-48 w-48 max-w-full overflow-hidden rounded-xl bg-white p-2 text-cardon-navy [&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg]:max-w-full [&_svg]:fill-current"
          dangerouslySetInnerHTML={{ __html: visibleReveal.qrSvg }}
        />
      ) : (
        <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-cardon-light text-sm text-cardon-gray">
          {t('esim.qrAfter')}
        </div>
      )}
      <div>
        <p className="break-all rounded-lg bg-cardon-light p-3 font-mono text-sm text-cardon-navy">
          {secret || '•••• •••• ••••'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleReveal ? (
            <>
              <button
                type="button"
                onClick={hide}
                className="rounded-lg border border-cardon-border px-3 py-2 text-sm font-semibold text-cardon-navy"
              >
                {t('esim.hideCode')}
              </button>
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded-lg bg-cardon-navy px-3 py-2 text-sm font-semibold text-white"
              >
                {copied ? t('esim.copied') : t('esim.copyLpa')}
              </button>
              {visibleReveal.appleSetupUrl ? (
                <a
                  href={visibleReveal.appleSetupUrl}
                  className="rounded-lg border border-cardon-border px-3 py-2 text-sm font-semibold text-cardon-navy"
                >
                  {t('esim.addIphone')}
                </a>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={() => void reveal()}
              disabled={!esim.canRevealInstallSecret || !orderId || busy}
              className="rounded-lg bg-cardon-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? t('esim.opening') : t('esim.showCode')}
            </button>
          )}
        </div>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <p className="mt-2 text-xs text-cardon-gray">
          {esim.testData
            ? t('esim.mockOnly')
            : esim.sandboxAccount
              ? t('esim.sandboxWarn')
              : t('esim.installHint')}
        </p>
      </div>
    </div>
  );
}
