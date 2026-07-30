'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  clearPendingMegapayPayment,
  defaultMegapayResumeHref,
  isMegapayAwaitingTransferResult,
  isMegapaySuccessResult,
  storePendingMegapayPayment,
} from '@/lib/pending-megapay-payment';

/** Tên trường VA mà MegaPay có thể trả về; gom lại để chuyển tiếp sang trang chờ. */
const VA_RESULT_FIELDS = [
  'payType',
  'vaNumber',
  'vaAcc',
  'vaAccount',
  'vaName',
  'vaContent',
  'bankCode',
  'bankName',
  'amount',
  'merTrxId',
  'trxId',
  'invoiceNo',
] as const;

declare global {
  interface Window {
    openPayment?: (mode: number, domain: string, formId?: string) => void;
    jQuery?: unknown;
  }
}

function loadStylesheet(href: string): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>(`link[data-megapay-css="${href}"]`);
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.megapayCss = href;
  document.head.appendChild(link);
  return link;
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-megapay-js="${src}"]`);
  if (existing) {
    return existing.dataset.loaded === '1'
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () =>
            reject(new Error(`MegaPay script failed: ${src}`)),
          );
        });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.dataset.megapayJs = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`MegaPay script failed: ${src}`));
    document.head.appendChild(script);
  });
}

function isMobileViewport(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
}

function closeMegapayLayerDom(): void {
  const layer = document.getElementById('paymentLayer');
  if (layer) layer.remove();
  document.querySelectorAll('.payment_layer').forEach((el) => el.remove());
}

/**
 * MegaPay Payment Gateway V1.4.6 — form + openPayment(1, domain).
 *
 * paymentClient.js is jQuery-based and reads `windowType` unconditionally, so both must be
 * present before openPayment runs. The form is portalled to body so the fixed-position
 * payment layer it injects is not trapped by a transformed/hidden ancestor.
 */
export function MegapayPgCheckoutOpen({
  checkoutFormFields,
  checkoutClient,
  orderId,
  orderCode,
  email,
  paymentReference,
  resumeHref,
  amount,
}: {
  checkoutFormFields: Record<string, string>;
  checkoutClient: { domain: string; jsUrl: string; cssUrl: string };
  orderId?: string;
  orderCode?: string;
  email?: string;
  paymentReference?: string;
  /** Path to reopen product checkout after cancel (must include variant query if /checkout). */
  resumeHref?: string;
  amount?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const openedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const windowType = useMemo(() => (isMobileViewport() ? '1' : '0'), []);
  const resolvedResumeHref = resumeHref?.trim() || defaultMegapayResumeHref();
  const payType = checkoutFormFields.payType ?? '';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!orderId || !orderCode || !paymentReference) return;
    storePendingMegapayPayment({
      orderId,
      orderCode,
      email: email ?? '',
      paymentReference,
      resumeHref: resolvedResumeHref,
      amount,
      payType,
      savedAt: Date.now(),
    });
  }, [orderId, orderCode, email, paymentReference, resolvedResumeHref, amount, payType]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const close = (data as { closeLayer?: string }).closeLayer;
      if (close !== 'close' && close !== 'frame') return;

      const resultCd = String((data as { resultCd?: string }).resultCd ?? '');
      const resultMsg = String((data as { resultMsg?: string }).resultMsg ?? '');

      closeMegapayLayerDom();

      if (isMegapaySuccessResult(resultCd)) {
        const pendingRef = paymentReference;
        const q = new URLSearchParams();
        if (orderCode) q.set('orderCode', orderCode);
        if (email) q.set('email', email);
        clearPendingMegapayPayment();
        if (orderCode) {
          router.replace(`/checkout/success?${q.toString()}`);
        } else {
          router.replace(`/checkout/result?resultCd=${encodeURIComponent(resultCd)}`);
        }
        void pendingRef;
        return;
      }

      const q = new URLSearchParams();
      q.set('resultCd', resultCd || 'USER_CANCEL');
      if (resultMsg) q.set('resultMsg', resultMsg);

      // Mã nộp tiền đã cấp nhưng chưa có tiền về: giữ phiên để trang kết quả theo dõi đơn.
      if (isMegapayAwaitingTransferResult(resultCd)) {
        const payload = data as Record<string, unknown>;
        for (const field of VA_RESULT_FIELDS) {
          const value = payload[field];
          if (typeof value === 'string' && value.trim()) q.set(field, value.trim());
        }
      }

      router.replace(`/checkout/result?${q.toString()}`);
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [router, orderCode, email, paymentReference]);

  useEffect(() => {
    if (!mounted) return undefined;
    let cancelled = false;
    openedRef.current = false;

    async function openLayer() {
      try {
        loadStylesheet(checkoutClient.cssUrl);
        if (!window.jQuery) {
          await loadScript(`${checkoutClient.domain}/pg_was/js/jquery-1.11.1.min.js`);
        }
        await loadScript(checkoutClient.jsUrl);
        if (cancelled || openedRef.current) return;
        if (typeof window.openPayment !== 'function' || !window.jQuery) {
          setError('Không tải được cổng MegaPay. Vui lòng thử lại.');
          return;
        }
        openedRef.current = true;
        window.openPayment(1, checkoutClient.domain, 'megapayForm');
      } catch (err) {
        if (!cancelled) {
          console.error('MegaPay open failed', err);
          setError('Không mở được trang thanh toán MegaPay.');
        }
      }
    }

    void openLayer();
    return () => {
      cancelled = true;
    };
  }, [
    mounted,
    checkoutClient.cssUrl,
    checkoutClient.domain,
    checkoutClient.jsUrl,
    checkoutFormFields,
  ]);

  const form = (
    <form ref={formRef} id="megapayForm" name="megapayForm" method="POST">
      {Object.entries(checkoutFormFields).map(([field, value]) => (
        <input key={field} type="hidden" name={field} value={value} />
      ))}
      <input type="hidden" name="windowType" value={windowType} />
    </form>
  );

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-cardon-gray">Đang mở cổng thanh toán MegaPay…</p>
      {error && (
        <p className="text-sm text-red-600">
          {error}{' '}
          <Link href={resolvedResumeHref} className="font-semibold underline">
            Quay lại đặt đơn
          </Link>
        </p>
      )}
      {mounted && createPortal(form, document.body)}
    </div>
  );
}
